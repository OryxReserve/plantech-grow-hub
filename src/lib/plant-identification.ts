import { supabase } from "@/integrations/supabase/client";
import {
  IDENTIFY_ACCEPTED_TYPES,
  type PlantIdentificationCandidate,
} from "@/lib/ai/vision-provider";
import { MAX_PHOTO_BYTES, PLANT_PHOTOS_BUCKET, extensionFor } from "@/lib/plant-photos";

export type IdentifyStep =
  | "select"
  | "preview"
  | "uploading"
  | "analyzing"
  | "result"
  | "uncertain"
  | "error"
  | "confirm"
  | "saving";

export type StagingPhoto = {
  /** `{account_id}/_staging/{uuid}.ext` — the storage policy checks segment 1. */
  path: string;
  /** Local object URL used only for preview; revoked when replaced. */
  previewUrl: string;
};

export type IdentifyValidationError = "type" | "size";

export function validateIdentifyFile(file: File): IdentifyValidationError | null {
  if (!(IDENTIFY_ACCEPTED_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > MAX_PHOTO_BYTES) return "size";
  return null;
}

export async function uploadStagingPhoto(
  accountId: string,
  file: File,
): Promise<StagingPhoto> {
  const path = `${accountId}/_staging/${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error } = await supabase.storage
    .from(PLANT_PHOTOS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return { path, previewUrl: URL.createObjectURL(file) };
}

/** Best-effort cleanup; a leftover object must never block the user's flow. */
export async function removeStagingPhoto(photo: StagingPhoto | null) {
  if (!photo) return;
  URL.revokeObjectURL(photo.previewUrl);
  const { error } = await supabase.storage
    .from(PLANT_PHOTOS_BUCKET)
    .remove([photo.path]);
  if (error) console.error("[identify] staging cleanup failed", error.message);
}

export function defaultNicknameFor(candidate: PlantIdentificationCandidate) {
  return candidate.commonName;
}
