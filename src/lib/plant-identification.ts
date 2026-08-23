import { supabase } from "@/integrations/supabase/client";
import {
  IDENTIFY_ACCEPTED_TYPES,
  MAX_HINT_LENGTH,
  MAX_IDENTIFY_IMAGES,
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

export type StagedPhoto = {
  /** Stable identity so removing an item never shifts the primary selection. */
  clientId: string;
  file: File;
  /** Local object URL used only for preview; revoked when the item is dropped. */
  previewUrl: string;
  /** `{account_id}/_staging/{uuid}.ext` — the storage policy checks segment 1. */
  path: string | null;
};

export type IdentifyValidationError = "type" | "size";

export function validateIdentifyFile(file: File): IdentifyValidationError | null {
  if (!(IDENTIFY_ACCEPTED_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > MAX_PHOTO_BYTES) return "size";
  return null;
}

export function isHintTooLong(hint: string) {
  return hint.trim().length > MAX_HINT_LENGTH;
}

export function canAddPhotos(current: number) {
  return current < MAX_IDENTIFY_IMAGES;
}

export function createStagedPhoto(file: File): StagedPhoto {
  return {
    clientId: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
    path: null,
  };
}

async function uploadOne(accountId: string, photo: StagedPhoto): Promise<string> {
  const path = `${accountId}/_staging/${crypto.randomUUID()}.${extensionFor(photo.file)}`;
  const { error } = await supabase.storage
    .from(PLANT_PHOTOS_BUCKET)
    .upload(path, photo.file, { contentType: photo.file.type, upsert: false });
  if (error) throw error;
  return path;
}

export type UploadStagingResult = {
  photos: StagedPhoto[];
  failedClientIds: string[];
};

/**
 * Uploads every photo that is not staged yet. A failed item keeps its local
 * preview and `path === null`, so the user can retry without losing the others.
 */
export async function uploadStagingPhotos(
  accountId: string,
  photos: StagedPhoto[],
): Promise<UploadStagingResult> {
  const failedClientIds: string[] = [];
  const next: StagedPhoto[] = [];

  for (const photo of photos) {
    if (photo.path) {
      next.push(photo);
      continue;
    }
    try {
      const path = await uploadOne(accountId, photo);
      next.push({ ...photo, path });
    } catch (error) {
      console.error("[identify] staging upload failed", error);
      failedClientIds.push(photo.clientId);
      next.push(photo);
    }
  }

  return { photos: next, failedClientIds };
}

/** Best-effort cleanup; a leftover object must never block the user's flow. */
export async function removeStagingPhotos(photos: StagedPhoto[]) {
  const paths: string[] = [];
  for (const photo of photos) {
    URL.revokeObjectURL(photo.previewUrl);
    if (photo.path) paths.push(photo.path);
  }
  if (paths.length === 0) return;

  const { error } = await supabase.storage.from(PLANT_PHOTOS_BUCKET).remove(paths);
  if (error) console.error("[identify] staging cleanup failed", error.message);
}

export function defaultNicknameFor(candidate: PlantIdentificationCandidate) {
  return candidate.commonName;
}
