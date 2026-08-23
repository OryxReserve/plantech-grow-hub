import {
  AiVisionError,
  MAX_CANDIDATES,
  type AiVisionErrorCategory,
  type AiVisionProvider,
  type IdentificationRank,
  type IdentifyPlantInput,
  type PlantIdentificationCandidate,
  type PlantIdentificationResult,
} from "./vision-provider";

/**
 * Kindwise plant.id v3 adapter — Wave 1: botanical identification only.
 *
 * This module is the only place that talks HTTP with Kindwise. No health /
 * diagnosis parameters are sent: `health` is intentionally absent from both
 * the query string and the body.
 */
const KINDWISE_ENDPOINT = "https://plant.id/api/v3/identification";
const KINDWISE_MODEL = "plant.id/v3";
/** A plain identification (no health, no similar_images) costs one credit. */
const IDENTIFICATION_CREDIT_COST = 1;
const REQUEST_TIMEOUT_MS = 30_000;

type KindwiseSuggestion = {
  name?: unknown;
  probability?: unknown;
  details?: { common_names?: unknown; rank?: unknown } | null;
};

type KindwiseResponse = {
  access_token?: unknown;
  result?: {
    is_plant?: { binary?: unknown } | null;
    classification?: { suggestions?: unknown } | null;
  } | null;
};

/** Kindwise ranks are broader than our enum; never promote to a finer rank. */
function mapRank(raw: unknown): IdentificationRank {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "species") return "species";
  if (value === "cultivar" || value === "variety" || value === "subspecies") {
    return "cultivar";
  }
  // family, order, genus and anything unknown stay at the broad end.
  return "genus";
}

function firstCommonName(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  const first = raw.find((name) => typeof name === "string" && name.trim());
  return typeof first === "string" ? first.trim() : "";
}

function mapCandidates(raw: unknown): PlantIdentificationCandidate[] {
  if (!Array.isArray(raw)) return [];
  const mapped: PlantIdentificationCandidate[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const suggestion = item as KindwiseSuggestion;

    const scientificRaw =
      typeof suggestion.name === "string" ? suggestion.name.trim() : "";
    const commonName = firstCommonName(suggestion.details?.common_names);

    // Phase 1.2 rule: a candidate is useful when it has a common name OR a
    // scientific name. Missing common names never drop a candidate.
    if (!scientificRaw && !commonName) continue;

    const probability = suggestion.probability;
    const confidence =
      typeof probability === "number" && Number.isFinite(probability) &&
      probability >= 0 && probability <= 1
        ? probability
        : null;

    const rank = mapRank(suggestion.details?.rank);

    mapped.push({
      commonName,
      scientificName: scientificRaw || null,
      // Kindwise returns no free-text explanation; never fabricate one.
      note: null,
      confidence,
      rank,
      broadOnly: rank !== "species" && rank !== "cultivar",
    });

    if (mapped.length === MAX_CANDIDATES) break;
  }

  return mapped;
}

function categorizeStatus(status: number): AiVisionErrorCategory {
  if (status === 401 || status === 403) return "not_configured";
  if (status === 402) return "no_credits";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 413 || status === 415) return "invalid_image";
  if (status >= 500) return "provider_unavailable";
  return "unknown";
}

export const kindwiseVisionProvider: AiVisionProvider = {
  name: "kindwise",

  async identifyPlant(input: IdentifyPlantInput): Promise<PlantIdentificationResult> {
    const apiKey = process.env["KINDWISE_API_KEY"]?.trim();
    if (!apiKey) {
      throw new AiVisionError("not_configured", "Kindwise API key is missing");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const startedAt = Date.now();

    try {
      // The images already reach this adapter as base64 in memory, so a JSON
      // body is the least invasive transport: no Blob/FormData round-trip.
      const url =
        `${KINDWISE_ENDPOINT}?details=common_names,rank` +
        `&language=${encodeURIComponent(input.language)}`;

      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Api-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          images: input.images.map((image) => image.imageBase64),
          similar_images: false,
        }),
      });

      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        const category = categorizeStatus(response.status);
        // Provider text stays server-side; only the category crosses out.
        const detail = await response.text().catch(() => "");
        console.error("[ai-vision] kindwise rejected request", response.status, detail.slice(0, 300));
        throw new AiVisionError(category, `Kindwise request failed (${response.status})`);
      }

      const body = (await response.json()) as KindwiseResponse;
      const candidates = mapCandidates(body.result?.classification?.suggestions);
      const isPlantBinary = body.result?.is_plant?.binary;

      return {
        candidates,
        // Only an explicit `false` means "not a plant".
        isPlant: isPlantBinary !== false,
        model: KINDWISE_MODEL,
        provider: "kindwise",
        usage: {
          tokensIn: 0,
          tokensOut: 0,
          costUsd: null,
          usageReported: false,
          creditsUsed: IDENTIFICATION_CREDIT_COST,
        },
        requestId: typeof body.access_token === "string" ? body.access_token : null,
        latencyMs,
      };
    } catch (error) {
      if (error instanceof AiVisionError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new AiVisionError("timeout", "Kindwise request timed out");
      }
      console.error("[ai-vision] kindwise call failed", error);
      throw new AiVisionError("provider_unavailable", "Kindwise is unreachable");
    } finally {
      clearTimeout(timer);
    }
  },
};
