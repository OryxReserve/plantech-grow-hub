import { differenceInDays } from "date-fns";

export type HealthStatus = "healthy" | "needs_attention" | "overdue" | "unknown";

export type HealthJustificationKey =
  | "health.unknown"
  | "health.on_track"
  | "health.needs_watering_soon"
  | "health.overdue_watering";

export interface HealthResult {
  status: HealthStatus;
  justificationKey: HealthJustificationKey;
  daysOverdue?: number;
  daysUntilNext?: number;
}

export function getPlantHealthStatus(
  profile: {
    watering_interval_days: number | null;
    last_watered_at: string | null;
    fertilizing_interval_days: number | null;
    last_fertilized_at?: string | null;
  },
): HealthResult {
  if (!profile.watering_interval_days || !profile.last_watered_at) {
    return { status: "unknown", justificationKey: "health.unknown" };
  }

  const today = new Date();
  const lastWatered = new Date(profile.last_watered_at);
  const daysSinceWatering = differenceInDays(today, lastWatered);
  const daysUntilNext = profile.watering_interval_days - daysSinceWatering;

  if (daysUntilNext < 0) {
    return {
      status: "overdue",
      justificationKey: "health.overdue_watering",
      daysOverdue: Math.abs(daysUntilNext),
    };
  }

  if (daysUntilNext <= 1) {
    return {
      status: "needs_attention",
      justificationKey: "health.needs_watering_soon",
      daysUntilNext,
    };
  }

  return {
    status: "healthy",
    justificationKey: "health.on_track",
    daysUntilNext,
  };
}
