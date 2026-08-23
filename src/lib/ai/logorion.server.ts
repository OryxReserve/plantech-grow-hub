import {
  AiVisionError,
  type AiVisionProvider,
  type PlantIdentificationResult,
} from "./vision-provider";

/**
 * LogoriOn adapter placeholder.
 *
 * The LogoriOn request/response contract, base URL, auth scheme and model ids
 * are not available to this project yet. Nothing here is guessed: the adapter
 * fails loudly with a configuration error until the real contract is supplied.
 *
 * To activate it later: implement `identifyPlant` against the documented
 * LogoriOn contract, add the required secret, and set AI_VISION_PROVIDER=logorion.
 */
export const logorionVisionProvider: AiVisionProvider = {
  name: "logorion",
  async identifyPlant(): Promise<PlantIdentificationResult> {
    throw new AiVisionError(
      "not_configured",
      "LogoriOn is not configured: missing base URL, credentials and request/response contract.",
    );
  },
};
