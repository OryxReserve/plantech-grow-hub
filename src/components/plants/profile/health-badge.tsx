import { AlertCircle, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";

import { useI18n } from "@/i18n/i18n";
import { getPlantHealthStatus, type HealthStatus } from "@/lib/plant-health";
import type { PlantCareProfileRow } from "@/lib/plant-care-profile";
import { cn } from "@/lib/utils";

const STATUS_ICON: Record<HealthStatus, typeof CheckCircle2> = {
  healthy: CheckCircle2,
  needs_attention: AlertCircle,
  overdue: AlertTriangle,
  unknown: HelpCircle,
};

const STATUS_CLASS: Record<HealthStatus, string> = {
  healthy:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50",
  needs_attention:
    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50",
  overdue:
    "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50",
  unknown:
    "bg-muted text-muted-foreground border-border",
};

interface HealthBadgeProps {
  profile: PlantCareProfileRow | null;
}

export function HealthBadge({ profile }: HealthBadgeProps) {
  const { t } = useI18n();
  const result = getPlantHealthStatus({
    watering_interval_days: profile?.watering_interval_days ?? null,
    last_watered_at: profile?.last_watered_at ?? null,
    fertilizing_interval_days: profile?.fertilizing_interval_days ?? null,
  });

  const Icon = STATUS_ICON[result.status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        STATUS_CLASS[result.status],
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {t(result.justificationKey)}
    </span>
  );
}
