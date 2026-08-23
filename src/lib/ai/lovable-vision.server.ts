import { APICallError, NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";

import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import {
  AiVisionError,
  MAX_CANDIDATES,
  MAX_IDENTIFY_IMAGES,
  normalizeHint,
  type AiVisionErrorCategory,
  type AiVisionProvider,
  type IdentificationRank,
  type IdentifyPlantInput,
  type PlantIdentificationResult,
} from "./vision-provider";

/** Expensive multimodal route required for plant identification. */
export const LOVABLE_VISION_MODEL = "google/gemini-3-pro";

/** Up to three images plus reasoning: the single-image budget was too tight. */
const TIMEOUT_MS = 75_000;

const CandidateSchema = z.object({
  commonName: z.string(),
  scientificName: z.string().nullable(),
  note: z.string().nullable(),
  confidence: z.number().nullable(),
  rank: z.enum(["species", "genus", "cultivar"]).nullable(),
  broadOnly: z.boolean().nullable(),
});

const ResultSchema = z.object({
  isPlant: z.boolean(),
  candidates: z.array(CandidateSchema),
});

const LANGUAGE_NAMES: Record<string, string> = {
  pt: "Brazilian Portuguese",
  en: "English",
  es: "Spanish",
};

function buildPrompt(language: string, imageCount: number, hasHint: boolean) {
  const languageName = LANGUAGE_NAMES[language] ?? "English";
  const lines = [
    "You are a botanist identifying a plant from photographs.",
    imageCount > 1
      ? `You receive ${imageCount} photographs of the SAME plant, in the order the user arranged them. Combine the evidence from all of them into a single identification.`
      : "You receive one photograph of a plant.",
    "Answer strictly as JSON matching the requested schema.",
    `Write every free-text value ("note") in ${languageName}.`,
    `Return at most ${MAX_CANDIDATES} candidate taxa, ordered from most to least likely.`,
    'Set "isPlant" to false when the photos do not show a plant.',
    "Return an empty candidates array when you cannot identify the plant with reasonable certainty; explain nothing outside the JSON.",
    'Use "confidence" as a number between 0 and 1 only when you can genuinely estimate it; otherwise use null.',
    'Use "note" for a short identification cue or an explanation of the uncertainty.',
    'Use null for "scientificName" when you do not know it. Never invent a name.',
    'Set "rank" to the most precise level the visual evidence actually supports: "cultivar", "species" or "genus".',
    'Never claim a cultivar without clear visual evidence for it. When in doubt, answer at species or genus level instead.',
    'When only a broad answer is justified, return the genus with rank "genus", set "broadOnly" to true, and use "note" to say what is missing (leaves, flowers, fruits, scale, whole plant) to narrow it down.',
    'Set "broadOnly" to false when the answer is as precise as the user could expect.',
  ];

  if (hasHint) {
    lines.push(
      "The user provided a free-text hint. Treat it as UNVERIFIED supporting context only: use it to disambiguate between otherwise similar candidates, never as ground truth.",
      "If the photographs contradict the hint, the visual evidence wins and you must mention the contradiction in the note.",
    );
  }

  return lines.join("\n");
}

/** Maps gateway/provider failures to safe, user-presentable categories. */
function categorize(error: unknown): AiVisionErrorCategory {
  if (error instanceof AiVisionError) return error.category;
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  if (error instanceof Error && error.name === "TimeoutError") return "timeout";

  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    if (status === 429) return "rate_limited";
    if (status === 402) return "no_credits";
    if (status === 403) return "provider_blocked";
    if (status === 401) return "not_configured";
    if (status === 400) return "invalid_image";
    if (status !== undefined && status >= 500) return "provider_unavailable";
  }
  return "unknown";
}

function normalizeRank(rank: IdentificationRank | null): IdentificationRank {
  return rank ?? "species";
}

export const lovableVisionProvider: AiVisionProvider = {
  name: "lovable",

  async identifyPlant(input: IdentifyPlantInput): Promise<PlantIdentificationResult> {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new AiVisionError("not_configured", "Missing LOVABLE_API_KEY");
    }

    const images = input.images.slice(0, MAX_IDENTIFY_IMAGES);
    if (images.length === 0) {
      throw new AiVisionError("invalid_image", "No image provided");
    }
    const hint = normalizeHint(input.hint);

    const gateway = createLovableAiGatewayProvider(apiKey);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const startedAt = Date.now();

    try {
      // Streaming keeps bytes flowing on slow multi-image requests; the result
      // is still consumed as one shot. Exactly one gateway request either way.
      const stream = streamText({
        model: gateway(LOVABLE_VISION_MODEL),
        abortSignal: controller.signal,
        maxRetries: 0,
        output: Output.object({ schema: ResultSchema }),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: buildPrompt(input.language, images.length, Boolean(hint)) },
              ...images.map((image, index) => ({
                type: "file" as const,
                mediaType: image.mimeType,
                filename: `photo-${index + 1}`,
                data: image.imageBase64,
              })),
              ...(hint
                ? [
                    {
                      type: "text" as const,
                      text: `Unverified user hint (supporting context only, not a fact): "${hint}"`,
                    },
                  ]
                : []),
            ],
          },
        ],
      });

      const parsed = await stream.output;
      const usage = await stream.usage;
      const latencyMs = Date.now() - startedAt;

      const candidates = (parsed.candidates ?? [])
        .slice(0, MAX_CANDIDATES)
        .filter((candidate) => candidate.commonName?.trim())
        .map((candidate) => {
          const rank = normalizeRank(candidate.rank);
          return {
            commonName: candidate.commonName.trim(),
            scientificName: candidate.scientificName?.trim() || null,
            note: candidate.note?.trim() || null,
            confidence:
              typeof candidate.confidence === "number" &&
              candidate.confidence >= 0 &&
              candidate.confidence <= 1
                ? candidate.confidence
                : null,
            rank,
            broadOnly: candidate.broadOnly ?? rank === "genus",
          };
        });

      const inputTokens = usage?.inputTokens;
      const outputTokens = usage?.outputTokens;
      const usageReported =
        typeof inputTokens === "number" || typeof outputTokens === "number";

      return {
        candidates,
        isPlant: parsed.isPlant !== false,
        model: LOVABLE_VISION_MODEL,
        provider: "lovable",
        usage: {
          tokensIn: inputTokens ?? 0,
          tokensOut: outputTokens ?? 0,
          costUsd: null,
          usageReported,
        },
        requestId: gateway.getRunId() ?? null,
        latencyMs,
      };
    } catch (error) {
      // A schema-mismatch response is a weak answer, not an outage: surface it
      // as "no confident result" so the user gets the manual fallback.
      if (NoObjectGeneratedError.isInstance(error)) {
        return {
          candidates: [],
          isPlant: true,
          model: LOVABLE_VISION_MODEL,
          provider: "lovable",
          usage: { tokensIn: 0, tokensOut: 0, costUsd: null, usageReported: false },
          requestId: gateway.getRunId() ?? null,
          latencyMs: Date.now() - startedAt,
        };
      }

      const category = categorize(error);
      // Provider details stay server-side; only the category crosses the boundary.
      console.error("[ai-vision] identification failed", category, error);
      throw new AiVisionError(category, `Vision provider failed (${category})`);
    } finally {
      clearTimeout(timer);
    }
  },
};
