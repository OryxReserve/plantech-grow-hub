import { useQuery } from "@tanstack/react-query";
import { Droplets, Leaf, NotebookPen, Scissors, Shrub, Stethoscope } from "lucide-react";
import type { ComponentType } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import { plantCareLogQuery, type CareLogType } from "@/lib/plant-care-log";

const CARE_TYPE_LABEL: Record<CareLogType, TranslationKey> = {
  watering: "careType.watering",
  fertilizing: "careType.fertilizing",
  pruning: "careType.pruning",
  repotting: "careType.repotting",
  treatment: "careType.treatment",
  note: "careType.note",
};

const CARE_TYPE_ICON: Record<CareLogType, ComponentType<{ className?: string }>> = {
  watering: Droplets,
  fertilizing: Leaf,
  pruning: Scissors,
  repotting: Shrub,
  treatment: Stethoscope,
  note: NotebookPen,
};

/** Read-only history. This slice never writes to plant_care_log. */
export function CareTimeline({
  accountId,
  plantId,
}: {
  accountId: string;
  plantId: string;
}) {
  const { t, locale } = useI18n();
  const query = useQuery(plantCareLogQuery(accountId, plantId));
  const events = query.data ?? [];

  return (
    <section className="mt-8">
      <h3 className="text-sm font-semibold tracking-tight">{t("timeline.title")}</h3>

      {query.isPending ? (
        <div className="mt-3 space-y-2" aria-label={t("timeline.loading")}>
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : query.isError ? (
        <p className="mt-3 text-sm text-destructive">{t("timeline.error")}</p>
      ) : events.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("timeline.empty")}</p>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {events.map((event) => {
            const Icon = CARE_TYPE_ICON[event.care_type];
            return (
              <li
                key={event.id}
                className="flex gap-3 rounded-xl border border-border px-4 py-3"
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {t(CARE_TYPE_LABEL[event.care_type])}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(event.performed_at).toLocaleString(locale)}
                  </p>
                  {event.notes ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm">{event.notes}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
