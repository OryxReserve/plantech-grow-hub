import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PlantCareProfileRow =
  Database["public"]["Tables"]["plant_care_profile"]["Row"];

/** Mirrors the CHECK constraint on plant_care_profile.light_exposure. */
export const LIGHT_EXPOSURE_VALUES = [
  "low",
  "medium",
  "bright_indirect",
  "direct",
] as const;
export type LightExposure = (typeof LIGHT_EXPOSURE_VALUES)[number];

export const MIN_INTERVAL_DAYS = 1;
export const MAX_INTERVAL_DAYS = 3650;

export type PlantCareProfileInput = {
  watering_interval_days: number | null;
  watering_amount_note: string | null;
  light_exposure: LightExposure | null;
  light_note: string | null;
  fertilizing_interval_days: number | null;
  fertilizer_type: string | null;
  fertilizing_note: string | null;
};

const CARE_PROFILE_COLUMNS =
  "id, account_id, plant_id, watering_interval_days, watering_amount_note, light_exposure, light_note, fertilizing_interval_days, fertilizer_type, fertilizing_note, created_at, updated_at";

/** Query keys are always scoped by the active account. */
export const plantCareProfileKeys = {
  detail: (accountId: string, plantId: string) =>
    ["plant-care-profile", accountId, plantId] as const,
};

export function plantCareProfileQuery(accountId: string, plantId: string) {
  return queryOptions({
    queryKey: plantCareProfileKeys.detail(accountId, plantId),
    queryFn: async (): Promise<PlantCareProfileRow | null> => {
      const { data, error } = await supabase
        .from("plant_care_profile")
        .select(CARE_PROFILE_COLUMNS)
        .eq("account_id", accountId)
        .eq("plant_id", plantId)
        .maybeSingle();
      if (error) throw error;
      // A missing profile is a normal state, not an error.
      return (data as PlantCareProfileRow | null) ?? null;
    },
  });
}

export function isLightExposure(value: string | null): value is LightExposure {
  return (
    value !== null && (LIGHT_EXPOSURE_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Creates the profile on first save and updates it afterwards.
 * `account_id` always comes from the active account context and `plant_id`
 * from the loaded plant, never from user input or the URL.
 */
export async function upsertPlantCareProfile(
  accountId: string,
  plantId: string,
  input: PlantCareProfileInput,
) {
  const { data, error } = await supabase
    .from("plant_care_profile")
    .upsert(
      { ...input, account_id: accountId, plant_id: plantId },
      { onConflict: "plant_id" },
    )
    .select(CARE_PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return data as PlantCareProfileRow;
}
