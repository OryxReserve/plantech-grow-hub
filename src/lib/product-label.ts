import { supabase } from "@/integrations/supabase/client";

export const PRODUCT_LABELS_BUCKET = "product-labels";
export const MAX_LABEL_BYTES = 8 * 1024 * 1024;
export const MAX_LABEL_PHOTOS = 2;
export const ACCEPTED_LABEL_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Longest side sent to the model: enough to read a label, cheap to process. */
const MAX_DIMENSION = 1600;

/** Draft fields the AI may fill. Never persisted without user confirmation. */
export type ProductLabelDraft = {
  name: string | null;
  brand: string | null;
  category: string | null;
  npk: string | null;
  quantity: number | null;
  unit: string | null;
  expires_at: string | null;
  description: string | null;
  dosage_instructions: string | null;
};

export type LabelValidationError = "type" | "size";

export function validateLabelFile(file: File): LabelValidationError | null {
  if (!ACCEPTED_LABEL_TYPES.includes(file.type)) return "type";
  if (file.size > MAX_LABEL_BYTES) return "size";
  return null;
}

export type StagedLabelPhoto = {
  clientId: string;
  file: File;
  previewUrl: string;
  path: string | null;
};

export function createStagedLabelPhoto(file: File): StagedLabelPhoto {
  return {
    clientId: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
    path: null,
  };
}

function extensionFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

/** Downscales in the browser; falls back to the original file on any failure. */
async function compress(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1_500_000) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((value) => resolve(value), "image/jpeg", 0.85),
    );
    if (!blob || blob.size === 0) return file;
    return new File([blob], "label.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function uploadLabelPhotos(
  accountId: string,
  photos: StagedLabelPhoto[],
): Promise<{ photos: StagedLabelPhoto[]; failed: boolean }> {
  const next: StagedLabelPhoto[] = [];
  let failed = false;

  for (const photo of photos) {
    if (photo.path) {
      next.push(photo);
      continue;
    }
    try {
      const prepared = await compress(photo.file);
      const path = `${accountId}/${crypto.randomUUID()}.${extensionFor(prepared.type)}`;
      const { error } = await supabase.storage
        .from(PRODUCT_LABELS_BUCKET)
        .upload(path, prepared, { contentType: prepared.type, upsert: false });
      if (error) throw error;
      next.push({ ...photo, path });
    } catch (error) {
      console.error("[product-label] upload failed", error);
      failed = true;
      next.push(photo);
    }
  }

  return { photos: next, failed };
}

/** Best-effort client cleanup; the server also removes staged objects. */
export async function removeLabelPhotos(photos: StagedLabelPhoto[]) {
  const paths: string[] = [];
  for (const photo of photos) {
    URL.revokeObjectURL(photo.previewUrl);
    if (photo.path) paths.push(photo.path);
  }
  if (paths.length === 0) return;
  try {
    await supabase.storage.from(PRODUCT_LABELS_BUCKET).remove(paths);
  } catch (error) {
    console.error("[product-label] client cleanup failed", error);
  }
}
