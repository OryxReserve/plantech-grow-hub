import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AiVisionErrorCategory, PlantIdentificationCandidate } from "@/lib/ai/vision-provider";

const UUID = z.string().uuid();
const STORAGE_PATH = z.string().min(1).max(512);

const IdentifyInput = z.object({
  accountId: UUID,
  storagePaths: z.array(STORAGE_PATH).min(1).max(3),
  hint: z.string().max(2000).nullable().optional(),
  plantId: UUID.nullable().optional(),
  language: z.enum(["pt", "en", "es"]),
});

const CreateInput = z.object({
  accountId: UUID,
  stagingPaths: z.array(STORAGE_PATH).min(1).max(3),
  primaryIndex: z.number().int().min(0).max(2),
  nickname: z.string().trim().min(1).max(120),
  speciesName: z.string().trim().max(160).nullable(),
  scientificName: z.string().trim().max(160).nullable(),
});

const ApplyInput = z.object({
  accountId: UUID,
  plantId: UUID,
  speciesName: z.string().trim().max(160).nullable(),
  scientificName: z.string().trim().max(160).nullable(),
});

const BUCKET = "plant-photos";

export type IdentifyPlantPhotoResult =
  | {
      ok: true;
      candidates: PlantIdentificationCandidate[];
      isPlant: boolean;
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

/**
 * Identifies a plant from 1..3 photos already stored in the private bucket,
 * in a single AI request (and therefore a single `ai_usage_log` row).
 *
 * Tenant safety: the account is resolved from the caller's active memberships
 * server-side; a client-supplied accountId is only honoured when it is part of
 * that set. Every storage path must live under that account prefix, and a
 * plantId, when present, must belong to the resolved account before any photo
 * bytes are read.
 */
export const identifyPlantPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdentifyInput.parse(input))
  .handler(async ({ data, context }): Promise<IdentifyPlantPhotoResult> => {
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

    // The storage policy scopes objects by their first path segment.
    for (const path of data.storagePaths) {
      if (!path.startsWith(`${accountId}/`)) throw new Error("Forbidden");
    }

    let plantContext: "new" | "existing" = "new";
    if (data.plantId) {
      const { data: plant, error: plantError } = await supabase
        .from("plants")
        .select("id")
        .eq("account_id", accountId)
        .eq("id", data.plantId)
        .maybeSingle();
      if (plantError) throw new Error("Could not verify plant");
      if (!plant) throw new Error("Forbidden");
      plantContext = "existing";
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const downloads = await Promise.all(
      data.storagePaths.map((path) => supabaseAdmin.storage.from(BUCKET).download(path)),
    );

    const images: { imageBase64: string; mimeType: string }[] = [];
    for (const download of downloads) {
      if (download.error || !download.data) throw new Error("Photo not available");
      const bytes = Buffer.from(await download.data.arrayBuffer());
      if (bytes.byteLength === 0) throw new Error("Photo is empty");
      const blobType = download.data.type;
      images.push({
        imageBase64: bytes.toString("base64"),
        mimeType: blobType && blobType.startsWith("image/") ? blobType : "image/jpeg",
      });
    }

    const { getVisionProvider } = await import("@/lib/ai/provider-registry.server");
    const { logAiUsage } = await import("@/lib/ai/usage-log.server");
    const { AiVisionError, normalizeHint } = await import("@/lib/ai/vision-provider");
    const provider = getVisionProvider();
    const hint = normalizeHint(data.hint ?? null);
    const startedAt = Date.now();

    try {
      const result = await provider.identifyPlant({
        images,
        hint,
        language: data.language,
      });

      const usageLogged = await logAiUsage({
        accountId,
        userId,
        provider: result.provider,
        model: result.model,
        status: "success",
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        latencyMs: result.latencyMs,
        costUsd: result.usage.costUsd,
        payload: {
          request_id: result.requestId,
          candidate_count: result.candidates.length,
          is_plant: result.isPlant,
          usage_reported: result.usage.usageReported,
          plant_context: plantContext,
          image_count: images.length,
          hint_provided: hint !== null,
        },
      });

      return {
        ok: true,
        candidates: result.candidates,
        isPlant: result.isPlant,
        model: result.model,
        provider: result.provider,
        usageLogged,
      };
    } catch (error) {
      const category: AiVisionErrorCategory =
        error instanceof AiVisionError ? error.category : "unknown";
      const retryable = error instanceof AiVisionError ? error.retryable : false;

      const usageLogged = await logAiUsage({
        accountId,
        userId,
        provider: provider.name,
        model: null,
        status: "error",
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: Date.now() - startedAt,
        costUsd: null,
        payload: {
          error_category: category,
          plant_context: plantContext,
          image_count: images.length,
          hint_provided: hint !== null,
        },
      });

      return { ok: false, errorCategory: category, retryable, usageLogged };
    }
  });

export type CreatePlantFromIdentificationResult = {
  plantId: string;
  photosAttached: number;
  failedPhotoCount: number;
  failedPhotoIndexes: number[];
};

/**
 * Creates the plant, then promotes every staged photo to the plant folder.
 *
 * Each photo is promoted independently: a failure only drops that photo, never
 * the plant. A copied object whose metadata insert fails is removed again, so
 * the bucket keeps no orphans. Exactly one attached photo ends as primary — the
 * user's choice when it survived, otherwise the first photo that did.
 */
export const createPlantFromIdentification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateInput.parse(input))
  .handler(async ({ data, context }): Promise<CreatePlantFromIdentificationResult> => {
    const { supabase, userId } = context;

    const { data: memberships, error: membershipError } = await supabase
      .from("account_members")
      .select("account_id")
      .eq("user_id", userId)
      .eq("status", "active");
    if (membershipError) throw new Error("Could not resolve account context");
    if (!new Set((memberships ?? []).map((r) => r.account_id)).has(data.accountId)) {
      throw new Error("Forbidden");
    }
    const accountId = data.accountId;
    for (const path of data.stagingPaths) {
      if (!path.startsWith(`${accountId}/_staging/`)) throw new Error("Forbidden");
    }
    const primaryIndex =
      data.primaryIndex < data.stagingPaths.length ? data.primaryIndex : 0;

    const { data: plant, error: plantError } = await supabase
      .from("plants")
      .insert({
        account_id: accountId,
        created_by: userId,
        nickname: data.nickname,
        species_name: data.speciesName,
        scientific_name: data.scientificName,
      })
      .select("id")
      .single();
    if (plantError || !plant) throw new Error("Could not create plant");

    // Promote the user's primary first so it keeps the flag whenever it works.
    const order = [
      primaryIndex,
      ...data.stagingPaths.map((_, index) => index).filter((i) => i !== primaryIndex),
    ];

    const failedPhotoIndexes: number[] = [];
    const promotedPaths: string[] = [];
    let attached = 0;

    for (const index of order) {
      const stagingPath = data.stagingPaths[index]!;
      const fileName = stagingPath.split("/").pop()!;
      const finalPath = `${accountId}/${plant.id}/${fileName}`;

      const { error: copyError } = await supabase.storage
        .from(BUCKET)
        .copy(stagingPath, finalPath);
      if (copyError) {
        console.error("[identify] photo copy failed", index, copyError.message);
        failedPhotoIndexes.push(index);
        continue;
      }

      const { error: photoError } = await supabase.from("plant_photos").insert({
        account_id: accountId,
        plant_id: plant.id,
        storage_path: finalPath,
        // The first successful insert owns the primary flag.
        is_primary: attached === 0,
        uploaded_by: userId,
      });

      if (photoError) {
        // Roll the copy back so the bucket keeps no orphan object.
        await supabase.storage.from(BUCKET).remove([finalPath]);
        console.error("[identify] photo metadata insert failed", index, photoError.message);
        failedPhotoIndexes.push(index);
        continue;
      }

      attached += 1;
      promotedPaths.push(stagingPath);
    }

    if (promotedPaths.length > 0) {
      await supabase.storage.from(BUCKET).remove(promotedPaths);
    }

    return {
      plantId: plant.id,
      photosAttached: attached,
      failedPhotoCount: failedPhotoIndexes.length,
      failedPhotoIndexes: failedPhotoIndexes.sort((a, b) => a - b),
    };
  });

/** Applies a confirmed identification to an existing plant of the same account. */
export const applyIdentificationToPlant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ApplyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: memberships, error: membershipError } = await supabase
      .from("account_members")
      .select("account_id")
      .eq("user_id", userId)
      .eq("status", "active");
    if (membershipError) throw new Error("Could not resolve account context");
    if (!new Set((memberships ?? []).map((r) => r.account_id)).has(data.accountId)) {
      throw new Error("Forbidden");
    }

    const { data: updated, error } = await supabase
      .from("plants")
      .update({
        species_name: data.speciesName,
        scientific_name: data.scientificName,
      })
      .eq("account_id", data.accountId)
      .eq("id", data.plantId)
      .select("id")
      .maybeSingle();

    if (error) throw new Error("Could not update plant");
    if (!updated) throw new Error("Forbidden");
    return { plantId: updated.id };
  });
