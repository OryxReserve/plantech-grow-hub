import { kindwiseVisionProvider } from "./kindwise.server";
import { logorionVisionProvider } from "./logorion.server";
import { lovableVisionProvider } from "./lovable-vision.server";
import type { AiVisionProvider } from "./vision-provider";

/**
 * Provider selection is an environment decision, not a client decision.
 * Default is Kindwise; `lovable` and `logorion` stay selectable through
 * AI_VISION_PROVIDER so a rollback is an env change, not a deploy.
 */
export function getVisionProvider(): AiVisionProvider {
  const configured = process.env["AI_VISION_PROVIDER"]?.trim().toLowerCase();
  if (configured === "logorion") return logorionVisionProvider;
  if (configured === "lovable") return lovableVisionProvider;
  return kindwiseVisionProvider;
}
