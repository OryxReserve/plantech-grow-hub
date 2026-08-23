import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isUsableScientificName,
  normalizeSpeciesKey,
  type SpeciesCareGuideResult,
} from "@/lib/species-care";

const Input = z.object({
  accountId: z.string().uuid(),
  scientificName: z.string().trim().min(1).max(160),
  language: z.enum(["pt", "en", "es"]),
});

/**
 * Returns the cached species care guide, generating it once per
 * (species_key, language) on a cache miss.
 *
 * The cache is global botanical knowledge, not tenant data: the account is
 * only used to authorize the caller and to attribute the AI usage row. A cache
 * hit never writes to `ai_usage_log`.
 */
export const getSpeciesCareGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<SpeciesCareGuideResult> => {
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

    if (!isUsableScientificName(data.scientificName)) {
      return { ok: false, reason: "unavailable" };
    }
    const speciesKey = normalizeSpeciesKey(data.scientificName);
    const language = data.language;

    const select = "species_key, scientific_name, language, water, light, fertilizing, notes";

    const { data: cached, error: cacheError } = await supabase
      .from("species_care_guide")
      .select(select)
      .eq("species_key", speciesKey)
      .eq("language", language)
      .maybeSingle();
    if (cacheError) throw new Error("Could not read species care cache");

    if (cached) {
      return {
        ok: true,
        cacheHit: true,
        guide: {
          speciesKey: cached.species_key,
          scientificName: cached.scientific_name,
          language: cached.language,
          water: cached.water,
          light: cached.light,
          fertilizing: cached.fertilizing,
          notes: cached.notes,
        },
      };
    }

    const { generateSpeciesCare } = await import("@/lib/ai/species-care.server");
    const { logAiUsage, AI_FEATURE_SPECIES_CARE_GUIDE } = await import(
      "@/lib/ai/usage-log.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const startedAt = Date.now();
    let generated;
    try {
      generated = await generateSpeciesCare(data.scientificName.trim(), language);
    } catch (error) {
      console.error("[species-care] generation failed", error);
      await logAiUsage({
        feature: AI_FEATURE_SPECIES_CARE_GUIDE,
        accountId: data.accountId,
        userId,
        provider: "lovable",
        model: null,
        status: "error",
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: Date.now() - startedAt,
        costUsd: null,
        creditsUsed: 0,
        plantId: null,
        payload: {
          species_key: speciesKey,
          language,
          scientific_name: data.scientificName.trim(),
          cache_miss: true,
        },
      });
      return { ok: false, reason: "unavailable" };
    }

    await logAiUsage({
      feature: AI_FEATURE_SPECIES_CARE_GUIDE,
      accountId: data.accountId,
      userId,
      provider: "lovable",
      model: generated.model,
      status: "success",
      tokensIn: generated.tokensIn,
      tokensOut: generated.tokensOut,
      latencyMs: generated.latencyMs,
      costUsd: null,
      creditsUsed: null,
      plantId: null,
      payload: {
        request_id: generated.requestId,
        usage_reported: generated.usageReported,
        species_key: speciesKey,
        language,
        scientific_name: data.scientificName.trim(),
        cache_miss: true,
      },
    });

    // A concurrent request may have persisted the same species meanwhile; the
    // unique (species_key, language) index makes that a no-op merge, and the
    // returning row is whichever text won.
    const { data: saved, error: saveError } = await supabaseAdmin
      .from("species_care_guide")
      .upsert(
        {
          species_key: speciesKey,
          language,
          scientific_name: data.scientificName.trim(),
          water: generated.water,
          light: generated.light,
          fertilizing: generated.fertilizing,
          notes: generated.notes,
          source: "ai",
          model: generated.model,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "species_key,language", ignoreDuplicates: false },
      )
      .select(select)
      .maybeSingle();

    if (saveError) {
      // Persisting is best-effort: the user still gets the guide they paid for.
      console.error("[species-care] persist failed", saveError.message);
    }

    return {
      ok: true,
      cacheHit: false,
      guide: {
        speciesKey,
        scientificName: saved?.scientific_name ?? data.scientificName.trim(),
        language,
        water: saved?.water ?? generated.water,
        light: saved?.light ?? generated.light,
        fertilizing: saved?.fertilizing ?? generated.fertilizing,
        notes: saved?.notes ?? generated.notes,
      },
    };
  });
