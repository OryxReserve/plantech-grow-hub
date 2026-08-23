import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PlantRow = Database["public"]["Tables"]["plants"]["Row"];

/** Basic plant fields editable in this slice. */
export type PlantInput = {
  nickname: string;
  species_name: string | null;
  scientific_name: string | null;
  location: string | null;
  acquired_at: string | null;
  notes: string | null;
};

const PLANT_COLUMNS =
  "id, account_id, nickname, species_name, scientific_name, location, acquired_at, notes, is_archived, created_at, updated_at";

/** Every plant query key is explicitly scoped by the active account. */
export const plantKeys = {
  all: (accountId: string) => ["plants", accountId] as const,
  list: (accountId: string) => ["plants", accountId, "list"] as const,
  detail: (accountId: string, plantId: string) =>
    ["plants", accountId, "detail", plantId] as const,
};

export function plantsListQuery(accountId: string) {
  return queryOptions({
    queryKey: plantKeys.list(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plants")
        .select(PLANT_COLUMNS)
        .eq("account_id", accountId)
        .eq("is_archived", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PlantRow[];
    },
  });
}

export function plantDetailQuery(accountId: string, plantId: string) {
  return queryOptions({
    queryKey: plantKeys.detail(accountId, plantId),
    queryFn: async () => {
      // account_id filter prevents cross-account access even if an id leaks.
      const { data, error } = await supabase
        .from("plants")
        .select(PLANT_COLUMNS)
        .eq("account_id", accountId)
        .eq("id", plantId)
        .maybeSingle();
      if (error) throw error;
      return (data as PlantRow | null) ?? null;
    },
  });
}

export async function createPlant(accountId: string, input: PlantInput) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("plants")
    .insert({
      ...input,
      account_id: accountId,
      created_by: userData.user?.id ?? null,
    })
    .select(PLANT_COLUMNS)
    .single();
  if (error) throw error;
  return data as PlantRow;
}

export async function updatePlant(
  accountId: string,
  plantId: string,
  input: PlantInput,
) {
  const { data, error } = await supabase
    .from("plants")
    .update(input)
    .eq("account_id", accountId)
    .eq("id", plantId)
    .select(PLANT_COLUMNS)
    .single();
  if (error) throw error;
  return data as PlantRow;
}

export async function deletePlant(accountId: string, plantId: string) {
  const { error } = await supabase
    .from("plants")
    .delete()
    .eq("account_id", accountId)
    .eq("id", plantId);
  if (error) throw error;
}
