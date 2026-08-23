import { APICallError, generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";

import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import {
  AiVisionError,
  MAX_CANDIDATES,
  type AiVisionErrorCategory,
  type AiVisionProvider,
  type IdentifyPlantInput,
  type PlantIdentificationResult,
} from "./vision-provider";

/** Expensive multimodal route required for plant identification. */
export const LOVABLE_VISION_MODEL = "google/gemini-3-pro";

const TIMEOUT_MS = 45_000;

const CandidateSchema = z.object({
  commonName: z.string(),
  scientificName: z.string().nullable(),
  note: z.string().nullable(),
  confidence: z.number().nullable(),
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

function buildPrompt(language: string) {
  const languageName = LANGUAGE_NAMES[language] ?? "English";
  return [
    "You are a botanist identifying a plant from a single photograph.",
    "Answer strictly as JSON matching the requested schema.",
    `Write every free-text value ("note") in ${languageName}.`,
    `Return at most ${MAX_CANDIDATES} candidate species, ordered from most to least likely.`,
    'Set "isPlant" to false when the photo does not show a plant.',
    "Return an empty candidates array when you cannot identify the plant with reasonable certainty; explain nothing outside the JSON.",
    'Use "confidence" as a number between 0 and 1 only when you can genuinely estimate it; otherwise use null.',
    'Use "note" for a short identification cue or an explanation of the uncertainty.',
    'Use null for "scientificName" when you do not know it. Never invent a name.',
  ].join("\n");
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

export const lovableVisionProvider: AiVisionProvider = {
  name: "lovable",

  async identifyPlant(input: IdentifyPlantInput): Promise<PlantIdentificationResult> {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new AiVisionError("not_configured", "Missing LOVABLE_API_KEY");
    }

    const gateway = createLovableAiGatewayProvider(apiKey);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const startedAt = Date.now();

    try {
      const result = await generateText({
        model: gateway(LOVABLE_VISION_MODEL),
        abortSignal: controller.signal,
        maxRetries: 0,
        output: Output.object({ schema: ResultSchema }),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: buildPrompt(input.language) },
              {
                type: "file",
                mediaType: input.mimeType,
                data: input.imageBase64,
              },
            ],
          },
        ],
      });

      const latencyMs = Date.now() - startedAt;
      const parsed = result.output;

      const candidates = (parsed.candidates ?? [])
        .slice(0, MAX_CANDIDATES)
        .filter((candidate) => candidate.commonName?.trim())
        .map((candidate) => ({
          commonName: candidate.commonName.trim(),
          scientificName: candidate.scientificName?.trim() || null,
          note: candidate.note?.trim() || null,
          confidence:
            typeof candidate.confidence === "number" &&
            candidate.confidence >= 0 &&
            candidate.confidence <= 1
              ? candidate.confidence
              : null,
        }));

      const inputTokens = result.usage?.inputTokens;
      const outputTokens = result.usage?.outputTokens;
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
