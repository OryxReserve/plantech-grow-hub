import { queryOptions } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { PLANT_PHOTOS_BUCKET } from "@/lib/plant-photos";

/**
 * Only interval-based care types generate recurring tasks. Pruning, repotting
 * and treatment stay manual entries in `plant_care_log`.
 */
export const TASK_CARE_TYPES = ["watering", "fertilizing"] as const;
export type TaskCareType = (typeof TASK_CARE_TYPES)[number];

export type CareTaskStatus = "overdue" | "today" | "upcoming";

export type CareTask = {
  id: string;
  plantId: string;
  plantNickname: string;
  photoUrl: string | null;
  careType: TaskCareType;
  /** Calendar day the task is due, as `yyyy-MM-dd`. */
  dueDate: string;
  status: CareTaskStatus;
  /** Negative when overdue, 0 today, positive when upcoming. */
  daysUntilDue: number;
};

/** Window used by the "upcoming" tab and by the reminder digest. */
export const UPCOMING_WINDOW_DAYS = 7;

const SIGNED_URL_TTL_SECONDS = 60 * 60;

type PlantSource = {
  id: string;
  nickname: string;
  created_at: string;
};

type CareProfileSource = {
  plant_id: string;
  watering_interval_days: number | null;
  fertilizing_interval_days: number | null;
  last_watered_at: string | null;
};

type CareLogSource = {
  plant_id: string;
  care_type: Database["public"]["Enums"]["care_log_type"];
  performed_at: string;
};

export type CareTaskSources = {
  plants: PlantSource[];
  profiles: CareProfileSource[];
  logs: CareLogSource[];
  photoUrlByPlantId?: Record<string, string | null>;
};

/**
 * `date-fns` day math on a timezone-shifted clone of the instant. Phase 3.1
 * always passes UTC; the account timezone column arrives with the reminder
 * work and only needs to be threaded into this one helper.
 */
function zonedDayStart(instant: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return parseISO(`${parts}T00:00:00`);
}

/**
 * Pure task derivation shared by the tasks screen and, later, the reminder
 * cron. A care type with no interval configured never produces a task — no
 * implicit default interval is applied.
 */
export function buildCareTasks(
  sources: CareTaskSources,
  options: { now?: Date; timeZone?: string } = {},
): CareTask[] {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? "UTC";
  const today = zonedDayStart(now, timeZone);

  const profileByPlant = new Map(sources.profiles.map((row) => [row.plant_id, row]));

  // Latest performed_at per plant + care type.
  const lastLogByKey = new Map<string, Date>();
  for (const log of sources.logs) {
    const key = `${log.plant_id}:${log.care_type}`;
    const performed = new Date(log.performed_at);
    const current = lastLogByKey.get(key);
    if (!current || performed > current) lastLogByKey.set(key, performed);
  }

  const tasks: CareTask[] = [];

  for (const plant of sources.plants) {
    const profile = profileByPlant.get(plant.id);
    if (!profile) continue;

    for (const careType of TASK_CARE_TYPES) {
      const interval =
        careType === "watering"
          ? profile.watering_interval_days
          : profile.fertilizing_interval_days;
      if (!interval || interval <= 0) continue;

      const candidates: Date[] = [];
      const lastLog = lastLogByKey.get(`${plant.id}:${careType}`);
      if (lastLog) candidates.push(lastLog);
      if (careType === "watering" && profile.last_watered_at) {
        candidates.push(new Date(profile.last_watered_at));
      }
      if (candidates.length === 0) candidates.push(new Date(plant.created_at));

      const lastCare = candidates.reduce((a, b) => (a > b ? a : b));
      const dueDay = addDays(zonedDayStart(lastCare, timeZone), interval);
      const daysUntilDue = differenceInCalendarDays(dueDay, today);

      tasks.push({
        id: `${plant.id}:${careType}`,
        plantId: plant.id,
        plantNickname: plant.nickname,
        photoUrl: sources.photoUrlByPlantId?.[plant.id] ?? null,
        careType,
        dueDate: format(dueDay, "yyyy-MM-dd"),
        status: daysUntilDue < 0 ? "overdue" : daysUntilDue === 0 ? "today" : "upcoming",
        daysUntilDue,
      });
    }
  }

  return tasks.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

export const careTaskKeys = {
  list: (accountId: string) => ["care-tasks", accountId] as const,
};

/** Everything the tasks screen needs, scoped to the active account. */
export async function fetchCareTasks(accountId: string): Promise<CareTask[]> {
  const [plantsResult, profilesResult] = await Promise.all([
    supabase
      .from("plants")
      .select("id, nickname, created_at")
      .eq("account_id", accountId)
      .eq("is_archived", false),
    supabase
      .from("plant_care_profile")
      .select(
        "plant_id, watering_interval_days, fertilizing_interval_days, last_watered_at",
      )
      .eq("account_id", accountId),
  ]);

  if (plantsResult.error) throw plantsResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const plants = (plantsResult.data ?? []) as PlantSource[];
  if (plants.length === 0) return [];

  const plantIds = plants.map((plant) => plant.id);

  const [logsResult, photosResult] = await Promise.all([
    supabase
      .from("plant_care_log")
      .select("plant_id, care_type, performed_at")
      .eq("account_id", accountId)
      .in("plant_id", plantIds)
      .in("care_type", [...TASK_CARE_TYPES])
      .order("performed_at", { ascending: false }),
    supabase
      .from("plant_photos")
      .select("plant_id, storage_path")
      .eq("account_id", accountId)
      .eq("is_primary", true)
      .in("plant_id", plantIds),
  ]);

  if (logsResult.error) throw logsResult.error;
  if (photosResult.error) throw photosResult.error;

  const photoRows = photosResult.data ?? [];
  const photoUrlByPlantId: Record<string, string | null> = {};

  if (photoRows.length > 0) {
    const { data: signed } = await supabase.storage
      .from(PLANT_PHOTOS_BUCKET)
      .createSignedUrls(
        photoRows.map((row) => row.storage_path),
        SIGNED_URL_TTL_SECONDS,
      );
    const urlByPath = new Map<string, string>();
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
    }
    for (const row of photoRows) {
      photoUrlByPlantId[row.plant_id] = urlByPath.get(row.storage_path) ?? null;
    }
  }

  return buildCareTasks({
    plants,
    profiles: (profilesResult.data ?? []) as CareProfileSource[],
    logs: (logsResult.data ?? []) as CareLogSource[],
    photoUrlByPlantId,
  });
}

export function careTasksQuery(accountId: string) {
  return queryOptions({
    queryKey: careTaskKeys.list(accountId),
    queryFn: () => fetchCareTasks(accountId),
  });
}

/**
 * Registers the care as performed now. Watering also refreshes
 * `last_watered_at`, which keeps the plant health badge in sync.
 */
export async function completeCareTask(
  accountId: string,
  plantId: string,
  careType: TaskCareType,
) {
  const performedAt = new Date().toISOString();
  const { data: userData } = await supabase.auth.getUser();

  const { error } = await supabase.from("plant_care_log").insert({
    account_id: accountId,
    plant_id: plantId,
    care_type: careType,
    performed_at: performedAt,
    performed_by: userData.user?.id ?? null,
  });
  if (error) throw error;

  if (careType === "watering") {
    const { error: profileError } = await supabase
      .from("plant_care_profile")
      .update({ last_watered_at: performedAt.slice(0, 10) })
      .eq("account_id", accountId)
      .eq("plant_id", plantId);
    if (profileError) throw profileError;
  }
}
