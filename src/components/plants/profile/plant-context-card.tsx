import { Pencil, Sprout } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import {
  isDrainage,
  isEnvironment,
  isPerceivedLight,
  isWindowOrientation,
  type Drainage,
  type Environment,
  type PerceivedLight,
  type PlantCareProfileRow,
  type WindowOrientation,
} from "@/lib/plant-care-profile";

export const DRAINAGE_LABEL: Record<Drainage, TranslationKey> = {
  poor: "context.drainage.poor",
  medium: "context.drainage.medium",
  good: "context.drainage.good",
};

export const WINDOW_ORIENTATION_LABEL: Record<WindowOrientation, TranslationKey> = {
  north: "context.orientation.north",
  south: "context.orientation.south",
  east: "context.orientation.east",
  west: "context.orientation.west",
  no_window: "context.orientation.no_window",
};

export const PERCEIVED_LIGHT_LABEL: Record<PerceivedLight, TranslationKey> = {
  very_low: "context.perceivedLight.very_low",
  low: "context.perceivedLight.low",
  medium: "context.perceivedLight.medium",
  high: "context.perceivedLight.high",
};

export const ENVIRONMENT_LABEL: Record<Environment, TranslationKey> = {
  indoor: "context.environment.indoor",
  outdoor: "context.environment.outdoor",
  balcony: "context.environment.balcony",
  greenhouse: "context.environment.greenhouse",
};

/** Suggested soil values are stored as free text; only known keys are translated. */
export const SOIL_TYPE_LABEL: Record<string, TranslationKey> = {
  potting_mix: "context.soil.potting_mix",
  cactus_mix: "context.soil.cactus_mix",
  orchid_mix: "context.soil.orchid_mix",
  garden_soil: "context.soil.garden_soil",
};

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{value}</p>
    </div>
  );
}

/**
 * Physical context of this specific plant. Read-only view; only filled values
 * are rendered. No scheduling or inference happens here.
 */
export function PlantContextCard({
  profile,
  onEdit,
}: {
  profile: PlantCareProfileRow | null;
  onEdit: () => void;
}) {
  const { t, locale } = useI18n();

  const soil = profile?.soil_type ?? null;
  const soilLabel = soil
    ? SOIL_TYPE_LABEL[soil]
      ? t(SOIL_TYPE_LABEL[soil] as TranslationKey)
      : soil
    : null;
  const drainage = isDrainage(profile?.drainage ?? null)
    ? t(DRAINAGE_LABEL[profile!.drainage as Drainage])
    : null;
  const potSize =
    profile?.pot_size_cm != null ? `${profile.pot_size_cm} ${t("context.cmUnit")}` : null;
  const environment = isEnvironment(profile?.environment ?? null)
    ? t(ENVIRONMENT_LABEL[profile!.environment as Environment])
    : null;
  const orientation = isWindowOrientation(profile?.window_orientation ?? null)
    ? t(WINDOW_ORIENTATION_LABEL[profile!.window_orientation as WindowOrientation])
    : null;
  const distance =
    profile?.window_distance_cm != null
      ? `${profile.window_distance_cm} ${t("context.cmUnit")}`
      : null;
  const perceivedLight = isPerceivedLight(profile?.perceived_light ?? null)
    ? t(PERCEIVED_LIGHT_LABEL[profile!.perceived_light as PerceivedLight])
    : null;
  const lastWatered = profile?.last_watered_at
    ? new Date(`${profile.last_watered_at}T00:00:00`).toLocaleDateString(locale)
    : null;
  const note = profile?.context_note ?? null;

  const soilLine = [soilLabel, drainage].filter(Boolean).join(" · ");
  const potLine = [potSize, environment].filter(Boolean).join(" · ");
  const windowLine = [orientation, distance, perceivedLight].filter(Boolean).join(" · ");

  const isEmpty =
    !soilLine && !potLine && !windowLine && !lastWatered && !note;

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Sprout className="size-4 text-primary" aria-hidden />
            {t("context.title")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("context.subtitle")}</p>
        </div>
        {isEmpty ? null : (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="size-4" aria-hidden />
            {t("context.edit")}
          </Button>
        )}
      </div>

      {isEmpty ? (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">{t("context.emptyBody")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onEdit}>
            {t("context.fill")}
          </Button>
        </div>
      ) : (
        <div className="mt-2">
          {soilLine ? <Line label={t("context.group.soil")} value={soilLine} /> : null}
          {potLine ? <Line label={t("context.group.pot")} value={potLine} /> : null}
          {windowLine ? (
            <Line label={t("context.group.window")} value={windowLine} />
          ) : null}
          {lastWatered ? (
            <Line label={t("context.field.lastWateredAt")} value={lastWatered} />
          ) : null}
          {note ? <Line label={t("context.field.note")} value={note} /> : null}
        </div>
      )}
    </section>
  );
}
