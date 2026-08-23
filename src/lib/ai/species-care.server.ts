import { Output, streamText } from "ai";
import { z } from "zod";

import { createLovableAiGatewayProvider } from "./ai-gateway.server";

/** Single text model used for species care guidance. */
export const SPECIES_CARE_MODEL = "google/gemini-3.7-flash";

const TIMEOUT_MS = 45_000;
const MAX_FIELD_LENGTH = 280;

const GuideSchema = z.object({
  water: z.string(),
  light: z.string(),
  fertilizing: z.string(),
  notes: z.string(),
});

export type GeneratedSpeciesCare = {
  water: string;
  light: string;
  fertilizing: string;
  notes: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  usageReported: boolean;
  requestId: string | null;
  latencyMs: number;
};

const LANGUAGE_LABEL: Record<string, string> = {
  pt: "Brazilian Portuguese",
  en: "English",
  es: "Spanish",
};

function buildPrompt(scientificName: string, language: string): string {
  const label = LANGUAGE_LABEL[language] ?? "English";
  return [
    `Write general beginner-friendly care guidance for the plant species "${scientificName}".`,
    `Answer in ${label}.`,
    "Return exactly four short fields: water, light, fertilizing, notes.",
    `Each field is plain prose, at most ${MAX_FIELD_LENGTH} characters, no bullet points, no markdown, no headings.`,
    "water: how this species generally likes to be watered, including how to judge when it needs water.",
    "light: the light exposure it generally prefers and what to avoid.",
    "fertilizing: general feeding guidance, described as a broad tendency rather than a strict rule.",
    "notes: general signs to watch for that suggest the plant is unhappy, plus one honest caveat.",
    "Rules: this is species-level orientation, not a personalized routine.",
    "Never give calendar dates, never present a frequency as a universal rule (say 'usually' or 'often'),",
    "never mention reminders, schedules, notifications, apps, specific commercial products or brands,",
    "and never diagnose a disease or pest. Be honest and calm, never alarmist.",
    "If the species is unfamiliar, give conservative guidance for its genus and say so plainly.",
  ].join(" ");
}

function clamp(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= MAX_FIELD_LENGTH ? text : `${text.slice(0, MAX_FIELD_LENGTH - 1).trim()}…`;
}

/**
 * The single place that generates species care text. Server-only: it reads
 * LOVABLE_API_KEY and must never be reachable from the client bundle.
 */
export async function generateSpeciesCare(
  scientificName: string,
  language: string,
): Promise<GeneratedSpeciesCare> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const gateway = createLovableAiGatewayProvider(apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const stream = streamText({
      model: gateway(SPECIES_CARE_MODEL),
      abortSignal: controller.signal,
      maxRetries: 0,
      output: Output.object({ schema: GuideSchema }),
      prompt: buildPrompt(scientificName, language),
    });

    const parsed = await stream.output;
    const usage = await stream.usage;
    const inputTokens = usage?.inputTokens;
    const outputTokens = usage?.outputTokens;

    return {
      water: clamp(parsed.water),
      light: clamp(parsed.light),
      fertilizing: clamp(parsed.fertilizing),
      notes: clamp(parsed.notes),
      model: SPECIES_CARE_MODEL,
      tokensIn: inputTokens ?? 0,
      tokensOut: outputTokens ?? 0,
      usageReported:
        typeof inputTokens === "number" || typeof outputTokens === "number",
      requestId: gateway.getRunId() ?? null,
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}
