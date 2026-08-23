/**
 * Shared, provider-agnostic contract for plant vision tasks.
 * Pure types only: this module is imported by both client and server code.
 */

export const AI_VISION_ERROR_CATEGORIES = [
  "rate_limited",
  "no_credits",
  "provider_blocked",
  "provider_unavailable",
  "invalid_image",
  "not_configured",
  "timeout",
  "unknown",
] as const;

export type AiVisionErrorCategory = (typeof AI_VISION_ERROR_CATEGORIES)[number];

/** Only these categories may be retried by the user without a config change. */
export const RETRYABLE_CATEGORIES: readonly AiVisionErrorCategory[] = [
  "rate_limited",
  "provider_unavailable",
  "timeout",
];

export class AiVisionError extends Error {
  readonly category: AiVisionErrorCategory;
  readonly retryable: boolean;

  constructor(category: AiVisionErrorCategory, message: string) {
    super(message);
    this.name = "AiVisionError";
    this.category = category;
    this.retryable = RETRYABLE_CATEGORIES.includes(category);
  }
}

/** Taxonomic precision the model is willing to commit to. */
export const IDENTIFICATION_RANKS = ["species", "genus", "cultivar"] as const;
export type IdentificationRank = (typeof IDENTIFICATION_RANKS)[number];

export type PlantIdentificationCandidate = {
  commonName: string;
  scientificName: string | null;
  /** Short identification note or uncertainty explanation, in the user's language. */
  note: string | null;
  /** Only set when the provider actually returned a value. Never fabricated. */
  confidence: number | null;
  /** How precise the answer is. Defaults to "species" when the model omits it. */
  rank: IdentificationRank;
  /** True when only a broad (usually genus-level) answer is justified. */
  broadOnly: boolean;
};

export type AiVisionUsage = {
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  /** False when the provider did not report token usage; the zeros are placeholders. */
  usageReported: boolean;
  /** Provider credits consumed, when the provider bills in credits. */
  creditsUsed: number | null;
};

export type PlantIdentificationResult = {
  /** Empty array means "no confident identification" — not an error. */
  candidates: PlantIdentificationCandidate[];
  /** The model reported the image does not contain an identifiable plant. */
  isPlant: boolean;
  model: string;
  provider: string;
  usage: AiVisionUsage;
  requestId: string | null;
  latencyMs: number;
};

export type IdentifyPlantImage = {
  imageBase64: string;
  mimeType: string;
};

export type IdentifyPlantInput = {
  /** 1..MAX_IDENTIFY_IMAGES images, in the order the user arranged them. */
  images: IdentifyPlantImage[];
  /** Optional, unverified user context. Never treated as ground truth. */
  hint?: string | null;
  /** UI locale, used only to localize the free-text note. */
  language: string;
};

export interface AiVisionProvider {
  /** Value persisted in `ai_usage_log.provider`. */
  readonly name: string;
  identifyPlant(input: IdentifyPlantInput): Promise<PlantIdentificationResult>;
}

/** Image types accepted by the identification flow (gateway-compatible). */
export const IDENTIFY_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_CANDIDATES = 3;
export const MAX_IDENTIFY_IMAGES = 3;
export const MAX_HINT_LENGTH = 280;

/** Trim, collapse to null when empty, hard-cap at MAX_HINT_LENGTH. */
export function normalizeHint(hint: string | null | undefined): string | null {
  const trimmed = (hint ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_HINT_LENGTH);
}
