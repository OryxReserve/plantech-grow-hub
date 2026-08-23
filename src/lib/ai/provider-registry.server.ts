import { logorionVisionProvider } from "./logorion.server";
import { lovableVisionProvider } from "./lovable-vision.server";
import type { AiVisionProvider } from "./vision-provider";

/**
 * Provider selection is an environment decision, not a client decision.
 * Default is the Lovable AI Gateway; `logorion` stays inactive until its
 * contract and credentials exist.
 */
export function getVisionProvider(): AiVisionProvider {
  const configured = process.env["AI_VISION_PROVIDER"]?.trim().toLowerCase();
  if (configured === "logorion") return logorionVisionProvider;
  return lovableVisionProvider;
}
