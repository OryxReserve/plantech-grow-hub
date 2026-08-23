import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AiVisionErrorCategory, PlantIdentificationCandidate } from "@/lib/ai/vision-provider";

const UUID = z.string().uuid();

const IdentifyInput = z.object({
  accountId: UUID,
  storagePath: z.string().min(1).max(512),
  plantId: UUID.nullable().optional(),
  language: z.enum(["pt", "en", "es"]),
});

const CreateInput = z.object({
  accountId: UUID,
  stagingPath: z.string().min(1).max(512),
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
 * Identifies a plant from a photo already stored in the private bucket.
 *
 * Tenant safety: the account is resolved from the caller's active memberships
 * server-side; a client-supplied accountId is only honoured when it is part of
 * that set. A plantId, when present, must belong to the resolved account before
 * any photo bytes are read.
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
    if (!data.storagePath.startsWith(`${accountId}/`)) throw new Error("Forbidden");

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
    const { data: blob, error: downloadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(data.storagePath);
    if (downloadError || !blob) throw new Error("Photo not available");

    const bytes = Buffer.from(await blob.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error("Photo is empty");
    const mimeType = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";

    const { getVisionProvider } = await import("@/lib/ai/provider-registry.server");
    const { logAiUsage } = await import("@/lib/ai/usage-log.server");
    const { AiVisionError } = await import("@/lib/ai/vision-provider");
    const provider = getVisionProvider();
    const startedAt = Date.now();

    try {
      const result = await provider.identifyPlant({
        imageBase64: bytes.toString("base64"),
        mimeType,
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
        payload: { error_category: category, plant_context: plantContext },
      });

      return { ok: false, errorCategory: category, retryable, usageLogged };
    }
  });

export type CreatePlantFromIdentificationResult = {
  plantId: string;
  photoAttached: boolean;
};

/**
 * Creates the plant, then promotes the staging photo to the plant folder.
 * The `plant_photos` row is only written after the plant exists, and a failed
 * promotion never leaves a copied object behind.
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
    if (!data.stagingPath.startsWith(`${accountId}/_staging/`)) throw new Error("Forbidden");

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

    const fileName = data.stagingPath.split("/").pop()!;
    const finalPath = `${accountId}/${plant.id}/${fileName}`;

    const { error: copyError } = await supabase.storage
      .from(BUCKET)
      .copy(data.stagingPath, finalPath);
    if (copyError) {
      console.error("[identify] photo copy failed", copyError.message);
      return { plantId: plant.id, photoAttached: false };
    }

    const { error: photoError } = await supabase.from("plant_photos").insert({
      account_id: accountId,
      plant_id: plant.id,
      storage_path: finalPath,
      is_primary: true,
      uploaded_by: userId,
    });

    if (photoError) {
      // Roll the copy back so the bucket keeps no orphan object.
      await supabase.storage.from(BUCKET).remove([finalPath]);
      console.error("[identify] photo metadata insert failed", photoError.message);
      return { plantId: plant.id, photoAttached: false };
    }

    await supabase.storage.from(BUCKET).remove([data.stagingPath]);
    return { plantId: plant.id, photoAttached: true };
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
