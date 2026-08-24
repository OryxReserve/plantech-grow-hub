import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AiVisionErrorCategory } from "@/lib/ai/vision-provider";
import {
  MAX_LABEL_BYTES,
  PRODUCT_LABELS_BUCKET,
  type ProductLabelDraft,
} from "@/lib/product-label";

const UUID = z.string().uuid();

const ReadLabelInput = z.object({
  accountId: UUID,
  storagePaths: z.array(z.string().min(1).max(512)).min(1).max(2),
  language: z.enum(["pt", "en", "es"]),
});

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp"];

export type ReadProductLabelResult =
  | {
      ok: true;
      isLabel: boolean;
      unreadable: boolean;
      draft: ProductLabelDraft;
      extractedFields: (keyof ProductLabelDraft)[];
      model: string;
      provider: string;
      usageLogged: boolean;
    }
  | {
      ok: false;
      errorCategory: AiVisionErrorCategory;
      retryable: boolean;
      usageLogged: boolean;
    };

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * Reads a product label from 1..2 staged photos and returns a DRAFT only.
 * Nothing is ever written to `products`: persistence is an explicit user action.
 *
 * Tenant safety mirrors plant identification: the account must be an active
 * membership of the caller, and every object path must live under that account
 * prefix. Staged images are always deleted in `finally`.
 */
export const readProductLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReadLabelInput.parse(input))
  .handler(async ({ data, context }): Promise<ReadProductLabelResult> => {
    const { supabase, userId } = context;

    const { data: memberships, error: membershipError } = await supabase
      .from("account_members")
      .select("account_id")
      .eq("user_id", userId)
      .eq("status", "active");
    if (membershipError) throw new Error("Could not resolve account context");

    const allowed = new Set((memberships ?? []).map((row) => row.account_id));
    if (!allowed.has(data.accountId)) throw new Error("Forbidden");
    const accountId = data.accountId;

    const paths = data.storagePaths;
    if (paths.length === 0 || paths.length > 2) throw new Error("Invalid image count");
    if (new Set(paths).size !== paths.length) throw new Error("Duplicate image path");

    for (const path of paths) {
      if (!path.startsWith(`${accountId}/`)) throw new Error("Forbidden");
      const rest = path.slice(accountId.length + 1);
      if (!rest || rest.includes("/")) throw new Error("Invalid image path");
      const ext = rest.split(".").pop()?.toLowerCase() ?? "";
      if (!ALLOWED_EXT.includes(ext)) throw new Error("Unsupported image type");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const storage = supabaseAdmin.storage.from(PRODUCT_LABELS_BUCKET);

    async function cleanup() {
      try {
        const { error } = await storage.remove(paths);
        if (error) console.error("[product-label] cleanup failed", error.message);
      } catch (error) {
        console.error("[product-label] cleanup threw", error);
      }
    }

    try {
      // Metadata check happens BEFORE any bytes are downloaded.
      const images: { imageBase64: string; mimeType: string }[] = [];
      for (const path of paths) {
        const fileName = path.slice(accountId.length + 1);
        const { data: listed, error: listError } = await storage.list(accountId, {
          search: fileName,
          limit: 1,
        });
        if (listError) throw new Error("Photo not available");
        const entry = (listed ?? []).find((item) => item.name === fileName);
        if (!entry) throw new Error("Photo not available");
        const meta = (entry.metadata ?? {}) as { size?: number; mimetype?: string };
        if (typeof meta.size === "number" && meta.size > MAX_LABEL_BYTES) {
          throw new Error("Photo too large");
        }
        if (meta.mimetype && !ALLOWED_MIME.includes(meta.mimetype)) {
          throw new Error("Unsupported image type");
        }

        const download = await storage.download(path);
        if (download.error || !download.data) throw new Error("Photo not available");
        const bytes = Buffer.from(await download.data.arrayBuffer());
        if (bytes.byteLength === 0) throw new Error("Photo is empty");
        if (bytes.byteLength > MAX_LABEL_BYTES) throw new Error("Photo too large");
        images.push({
          imageBase64: bytes.toString("base64"),
          mimeType: meta.mimetype ?? "image/jpeg",
        });
      }

      const { readProductLabelWithAi } = await import("@/lib/ai/product-label.server");
      const { logAiUsage, AI_FEATURE_PRODUCT_LABEL } = await import(
        "@/lib/ai/usage-log.server"
      );
      const { AiVisionError } = await import("@/lib/ai/vision-provider");
      const { PRODUCT_LABEL_MODEL } = await import("@/lib/ai/product-label.server");
      const { NPK_PATTERN, PRODUCT_CATEGORIES, PRODUCT_UNITS } = await import(
        "@/lib/products"
      );
      const startedAt = Date.now();

      try {
        const result = await readProductLabelWithAi({
          images,
          language: data.language,
        });
        const raw = result.fields;

        // The model is never trusted: every value is re-validated server-side.
        const npkRaw = text(raw.npk, 20);
        const unitRaw = text(raw.unit, 8);
        const categoryRaw = text(raw.category, 32)?.toLowerCase() ?? null;
        const expiresRaw = text(raw.expires_at, 10);
        const quantity =
          typeof raw.quantity === "number" &&
          Number.isFinite(raw.quantity) &&
          raw.quantity >= 0
            ? Math.round(raw.quantity * 1000) / 1000
            : null;

        const draft: ProductLabelDraft = {
          name: text(raw.name, 120),
          brand: text(raw.brand, 120),
          category:
            categoryRaw && (PRODUCT_CATEGORIES as readonly string[]).includes(categoryRaw)
              ? categoryRaw
              : null,
          npk: npkRaw && NPK_PATTERN.test(npkRaw) ? npkRaw : null,
          quantity,
          unit: unitRaw && (PRODUCT_UNITS as readonly string[]).includes(unitRaw) ? unitRaw : null,
          expires_at:
            expiresRaw && /^\d{4}-\d{2}-\d{2}$/.test(expiresRaw) &&
            !Number.isNaN(Date.parse(expiresRaw))
              ? expiresRaw
              : null,
          description: text(raw.description, 600),
          dosage_instructions: text(raw.dosage_instructions, 600),
        };

        const extractedFields = (Object.keys(draft) as (keyof ProductLabelDraft)[]).filter(
          (key) => draft[key] !== null,
        );

        const usageLogged = await logAiUsage({
          feature: AI_FEATURE_PRODUCT_LABEL,
          accountId,
          userId,
          provider: result.provider,
          model: result.model,
          status: "success",
          tokensIn: result.usage.tokensIn,
          tokensOut: result.usage.tokensOut,
          latencyMs: result.latencyMs,
          costUsd: result.usage.costUsd,
          creditsUsed: result.usage.creditsUsed,
          plantId: null,
          payload: {
            request_id: result.requestId,
            usage_reported: result.usage.usageReported,
            image_count: images.length,
            is_label: raw.isLabel !== false,
            unreadable: raw.unreadable === true,
            fields_extracted: extractedFields.length,
          },
        });

        return {
          ok: true,
          isLabel: raw.isLabel !== false,
          unreadable: raw.unreadable === true,
          draft,
          extractedFields,
          model: result.model,
          provider: result.provider,
          usageLogged,
        };
      } catch (error) {
        const category: AiVisionErrorCategory =
          error instanceof AiVisionError ? error.category : "unknown";
        const retryable = error instanceof AiVisionError ? error.retryable : false;

        const usageLogged = await logAiUsage({
          feature: AI_FEATURE_PRODUCT_LABEL,
          accountId,
          userId,
          provider: "lovable",
          model: PRODUCT_LABEL_MODEL,
          status: "error",
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: Date.now() - startedAt,
          costUsd: null,
          creditsUsed: 0,
          plantId: null,
          payload: {
            error_category: category,
            image_count: images.length,
          },
        });

        return { ok: false, errorCategory: category, retryable, usageLogged };
      }
    } finally {
      // Label photos are temporary: always removed, whatever happened above.
      await cleanup();
    }
  });
