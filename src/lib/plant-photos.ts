import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PlantPhotoRow = Database["public"]["Tables"]["plant_photos"]["Row"];

export type PlantPhoto = PlantPhotoRow & {
  /** Short-lived signed URL for the private bucket. */
  url: string | null;
};

export const PLANT_PHOTOS_BUCKET = "plant-photos";
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

const SIGNED_URL_TTL_SECONDS = 60 * 60;

const PHOTO_COLUMNS =
  "id, account_id, plant_id, storage_path, is_primary, taken_at, uploaded_by, created_at";

/** Query keys are explicitly scoped by account and plant. */
export const plantPhotoKeys = {
  all: (accountId: string) => ["plant-photos", accountId] as const,
  list: (accountId: string, plantId: string) =>
    ["plant-photos", accountId, plantId] as const,
};

export type PhotoValidationError = "type" | "size";

export function validatePhotoFile(file: File): PhotoValidationError | null {
  if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) return "type";
  if (file.size > MAX_PHOTO_BYTES) return "size";
  return null;
}

/** Shared by the manual upload and the identification staging upload. */
export function extensionFor(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return file.type.split("/")[1] ?? "jpg";
}

export function plantPhotosQuery(accountId: string, plantId: string) {
  return queryOptions({
    queryKey: plantPhotoKeys.list(accountId, plantId),
    queryFn: async (): Promise<PlantPhoto[]> => {
      const { data, error } = await supabase
        .from("plant_photos")
        .select(PHOTO_COLUMNS)
        .eq("account_id", accountId)
        .eq("plant_id", plantId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as PlantPhotoRow[];
      if (rows.length === 0) return [];

      const { data: signed } = await supabase.storage
        .from(PLANT_PHOTOS_BUCKET)
        .createSignedUrls(
          rows.map((row) => row.storage_path),
          SIGNED_URL_TTL_SECONDS,
        );

      const urlByPath = new Map<string, string>();
      for (const item of signed ?? []) {
        if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
      }

      return rows.map((row) => ({
        ...row,
        url: urlByPath.get(row.storage_path) ?? null,
      }));
    },
  });
}

/**
 * Uploads a file to `{account_id}/{plant_id}/{uuid}.ext` and stores metadata.
 * The plant is re-checked against the active account before any write, so a
 * leaked plant id cannot be used to write into another tenant.
 */
export async function uploadPlantPhoto(
  accountId: string,
  plantId: string,
  file: File,
) {
  const { data: plant, error: plantError } = await supabase
    .from("plants")
    .select("id")
    .eq("account_id", accountId)
    .eq("id", plantId)
    .maybeSingle();
  if (plantError) throw plantError;
  if (!plant) throw new Error("Plant not found in the active account");

  const { data: userData } = await supabase.auth.getUser();
  const storagePath = `${accountId}/${plantId}/${crypto.randomUUID()}.${extensionFor(file)}`;

  const { error: uploadError } = await supabase.storage
    .from(PLANT_PHOTOS_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { count } = await supabase
    .from("plant_photos")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("plant_id", plantId);

  const { data, error } = await supabase
    .from("plant_photos")
    .insert({
      account_id: accountId,
      plant_id: plantId,
      storage_path: storagePath,
      is_primary: (count ?? 0) === 0,
      uploaded_by: userData.user?.id ?? null,
      taken_at: new Date(file.lastModified).toISOString(),
    })
    .select(PHOTO_COLUMNS)
    .single();

  if (error) {
    // Avoid orphan objects in storage when metadata insert fails.
    await supabase.storage.from(PLANT_PHOTOS_BUCKET).remove([storagePath]);
    throw error;
  }

  return data as PlantPhotoRow;
}

export async function deletePlantPhoto(
  accountId: string,
  plantId: string,
  photo: Pick<PlantPhotoRow, "id" | "storage_path" | "is_primary">,
) {
  const { error } = await supabase
    .from("plant_photos")
    .delete()
    .eq("account_id", accountId)
    .eq("plant_id", plantId)
    .eq("id", photo.id);
  if (error) throw error;

  await supabase.storage.from(PLANT_PHOTOS_BUCKET).remove([photo.storage_path]);

  if (photo.is_primary) {
    const { data: next } = await supabase
      .from("plant_photos")
      .select("id")
      .eq("account_id", accountId)
      .eq("plant_id", plantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (next) {
      await supabase
        .from("plant_photos")
        .update({ is_primary: true })
        .eq("account_id", accountId)
        .eq("id", next.id);
    }
  }
}

export async function setPrimaryPlantPhoto(
  accountId: string,
  plantId: string,
  photoId: string,
) {
  const { error: clearError } = await supabase
    .from("plant_photos")
    .update({ is_primary: false })
    .eq("account_id", accountId)
    .eq("plant_id", plantId)
    .eq("is_primary", true);
  if (clearError) throw clearError;

  const { error } = await supabase
    .from("plant_photos")
    .update({ is_primary: true })
    .eq("account_id", accountId)
    .eq("plant_id", plantId)
    .eq("id", photoId);
  if (error) throw error;
}
