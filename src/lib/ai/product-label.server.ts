import { APICallError, NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";

import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { AiVisionError, type AiVisionErrorCategory } from "./vision-provider";

/** Cheap multimodal model: label reading is OCR + light structuring. */
export const PRODUCT_LABEL_MODEL = "google/gemini-3.7-flash";

const TIMEOUT_MS = 45_000;

/** Strict contract; every extracted field is nullable and never fabricated. */
const LabelSchema = z.object({
  isLabel: z.boolean(),
  unreadable: z.boolean(),
  name: z.string().nullable(),
  brand: z.string().nullable(),
  category: z.string().nullable(),
  npk: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  expires_at: z.string().nullable(),
  description: z.string().nullable(),
  dosage_instructions: z.string().nullable(),
});

export type ProductLabelFields = z.infer<typeof LabelSchema>;

export type ProductLabelReadResult = {
  fields: ProductLabelFields;
  model: string;
  provider: string;
  requestId: string | null;
  latencyMs: number;
  usage: {
    tokensIn: number;
    tokensOut: number;
    usageReported: boolean;
    costUsd: number | null;
    creditsUsed: number | null;
  };
};

const LANGUAGE_NAMES: Record<string, string> = {
  pt: "Brazilian Portuguese",
  en: "English",
  es: "Spanish",
};

function buildPrompt(language: string, imageCount: number) {
  const languageName = LANGUAGE_NAMES[language] ?? "English";
  return [
    "You read the label of a gardening product (fertilizer, compost, substrate, pesticide, tool or similar) from photographs.",
    imageCount > 1
      ? `You receive ${imageCount} photographs of the SAME product (usually front and back). Combine the evidence into one answer.`
      : "You receive one photograph of a product label.",
    "Answer strictly as JSON matching the requested schema. Never write anything outside the JSON.",
    "NEVER invent a value. Use null for every field you cannot read with confidence directly from the images.",
    'Set "isLabel" to false when the photos do not show a product/package label.',
    'Set "unreadable" to true when the photos show a label but it is too blurry, dark or cropped to read.',
    '"category" must be exactly one of: fertilizer, compost, substrate, pesticide, tool, other. Use null when unsure.',
    '"npk" must be the N-P-K ratio exactly as printed, formatted like "10-10-10" or "4-5-6". Use null when the label shows no NPK.',
    '"quantity" is the numeric net content only (no unit), and "unit" must be one of: g, kg, ml, L, un.',
    '"expires_at" must be an ISO date (YYYY-MM-DD). Use null when no expiry date is printed.',
    `Write "description" and "dosage_instructions" in ${languageName}, short and factual, based only on what the label says.`,
    '"description" summarizes what the product is for. "dosage_instructions" holds dilution/dose/application instructions.',
  ].join("\n");
}

/** Maps gateway/provider failures to safe, user-presentable categories. */
function categorize(error: unknown): AiVisionErrorCategory {
  if (error instanceof AiVisionError) return error.category;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return "timeout";
  }
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

export type ProductLabelImage = { imageBase64: string; mimeType: string };

export async function readProductLabelWithAi(input: {
  images: ProductLabelImage[];
  language: string;
}): Promise<ProductLabelReadResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AiVisionError("not_configured", "Missing LOVABLE_API_KEY");
  if (input.images.length === 0) {
    throw new AiVisionError("invalid_image", "No image provided");
  }

  const gateway = createLovableAiGatewayProvider(apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const stream = streamText({
      model: gateway(PRODUCT_LABEL_MODEL),
      abortSignal: controller.signal,
      maxRetries: 0,
      temperature: 0.1,
      output: Output.object({ schema: LabelSchema }),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildPrompt(input.language, input.images.length) },
            ...input.images.map((image, index) => ({
              type: "file" as const,
              mediaType: image.mimeType,
              filename: `label-${index + 1}`,
              data: image.imageBase64,
            })),
          ],
        },
      ],
    });

    const parsed = await stream.output;
    const usage = await stream.usage;
    const inputTokens = usage?.inputTokens;
    const outputTokens = usage?.outputTokens;

    return {
      fields: parsed,
      model: PRODUCT_LABEL_MODEL,
      provider: "lovable",
      requestId: gateway.getRunId() ?? null,
      latencyMs: Date.now() - startedAt,
      usage: {
        tokensIn: inputTokens ?? 0,
        tokensOut: outputTokens ?? 0,
        usageReported:
          typeof inputTokens === "number" || typeof outputTokens === "number",
        costUsd: null,
        creditsUsed: null,
      },
    };
  } catch (error) {
    // A schema mismatch is a weak answer, not an outage: treat it as unreadable.
    if (NoObjectGeneratedError.isInstance(error)) {
      throw new AiVisionError("unknown", "Model did not return valid JSON");
    }
    const category = categorize(error);
    console.error("[product-label] extraction failed", category, error);
    throw new AiVisionError(category, "Product label extraction failed");
  } finally {
    clearTimeout(timer);
  }
}
