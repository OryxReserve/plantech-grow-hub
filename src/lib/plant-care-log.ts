import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PlantCareLogRow = Database["public"]["Tables"]["plant_care_log"]["Row"];
export type CareLogType = Database["public"]["Enums"]["care_log_type"];

const CARE_LOG_COLUMNS =
  "id, account_id, plant_id, care_type, performed_at, performed_by, notes, created_at";

const CARE_LOG_LIMIT = 20;

export const plantCareLogKeys = {
  list: (accountId: string, plantId: string) =>
    ["plant-care-log", accountId, plantId] as const,
};

/** Read-only timeline for the plant profile. */
export function plantCareLogQuery(accountId: string, plantId: string) {
  return queryOptions({
    queryKey: plantCareLogKeys.list(accountId, plantId),
    queryFn: async (): Promise<PlantCareLogRow[]> => {
      const { data, error } = await supabase
        .from("plant_care_log")
        .select(CARE_LOG_COLUMNS)
        .eq("account_id", accountId)
        .eq("plant_id", plantId)
        .order("performed_at", { ascending: false })
        .limit(CARE_LOG_LIMIT);
      if (error) throw error;
      return (data ?? []) as PlantCareLogRow[];
    },
  });
}
