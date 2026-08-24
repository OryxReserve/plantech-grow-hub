import type { AiVisionErrorCategory } from "./vision-provider";

export const AI_FEATURE_PLANT_IDENTIFICATION = "plant_identification";
export const AI_FEATURE_SPECIES_CARE_GUIDE = "species_care_guide";
export const AI_FEATURE_PRODUCT_LABEL = "product_label";

export type AiFeature =
  | typeof AI_FEATURE_PLANT_IDENTIFICATION
  | typeof AI_FEATURE_SPECIES_CARE_GUIDE
  | typeof AI_FEATURE_PRODUCT_LABEL;

/** Trigger `validate_ai_usage_payload` rejects payloads above 4096 bytes. */
const MAX_PAYLOAD_BYTES = 3500;

export type AiUsageLogEntry = {
  /** Defaults to plant identification for existing callers. */
  feature?: AiFeature;
  accountId: string;
  userId: string;
  provider: string;
  model: string | null;
  status: "success" | "error";
  tokensIn: number;
  tokensOut: number;
  latencyMs: number | null;
  costUsd: number | null;
  /** Provider credits consumed by this attempt. 0 when nothing was billed. */
  creditsUsed: number | null;
  /** Set when the attempt was made against an existing plant. */
  plantId: string | null;
  payload: {
    request_id?: string | null;
    candidate_count?: number;
    is_plant?: boolean;
    usage_reported?: boolean;
    error_category?: AiVisionErrorCategory;
    plant_context?: "new" | "existing";
    /** How many images were sent in the single AI request. */
    image_count?: number;
    /** Whether a normalized hint was sent. The hint text is never stored. */
    hint_provided?: boolean;
    /** Species care guide: only written on a real generation (cache miss). */
    species_key?: string;
    language?: string;
    scientific_name?: string;
    cache_miss?: boolean;
    /** Product label reading. Never stores label text. */
    is_label?: boolean;
    unreadable?: boolean;
    fields_extracted?: number;
  };
};

function clampPayload(payload: AiUsageLogEntry["payload"]) {
  const serialized = JSON.stringify(payload);
  if (new TextEncoder().encode(serialized).length <= MAX_PAYLOAD_BYTES) return payload;
  return { truncated: true } as Record<string, unknown>;
}

/**
 * Writes one row per real identification attempt. `ai_usage_log` denies INSERT
 * to `authenticated`, so this uses the service role and never runs client-side.
 *
 * Returns false instead of throwing: a telemetry failure must not destroy a
 * successful AI result the user already paid for. Callers surface the flag.
 */
export async function logAiUsage(entry: AiUsageLogEntry): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("ai_usage_log").insert({
      account_id: entry.accountId,
      user_id: entry.userId,
      feature: entry.feature ?? AI_FEATURE_PLANT_IDENTIFICATION,
      provider: entry.provider,
      model: entry.model,
      status: entry.status,
      tokens_in: entry.tokensIn,
      tokens_out: entry.tokensOut,
      latency_ms: entry.latencyMs,
      cost_usd: entry.costUsd,
      credits_used: entry.creditsUsed ?? 0,
      plant_id: entry.plantId,
      summarized_payload: clampPayload(entry.payload) as never,
    });
    if (error) {
      console.error("[ai-usage-log] insert failed", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[ai-usage-log] insert threw", error);
    return false;
  }
}
