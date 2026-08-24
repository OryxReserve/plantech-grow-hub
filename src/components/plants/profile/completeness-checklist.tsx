import { CompletionBadge } from "@/components/ui/completion-badge";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import type { PlantCareProfileRow } from "@/lib/plant-care-profile";
import type { PlantRow } from "@/lib/plants";

type ChecklistItem = {
  key: string;
  labelKey: TranslationKey;
  completed: boolean;
};

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Read-only completeness overview of the fields that matter most for care
 * quality. Purely derived from data already loaded by the profile screen.
 */
export function ProfileCompletenessChecklist({
  plant,
  profile,
}: {
  plant: PlantRow;
  profile: PlantCareProfileRow | null;
}) {
  const { t } = useI18n();

  const items: ChecklistItem[] = [
    {
      key: "species",
      labelKey: "checklist.speciesName",
      completed: hasText(plant.species_name) || hasText(plant.scientific_name),
    },
    {
      key: "potSize",
      labelKey: "checklist.potSize",
      completed: profile?.pot_size_cm !== null && profile?.pot_size_cm !== undefined,
    },
    {
      key: "windowDistance",
      labelKey: "checklist.windowDistance",
      completed:
        profile?.window_distance_cm !== null && profile?.window_distance_cm !== undefined,
    },
    {
      key: "light",
      labelKey: "checklist.lightExposure",
      completed: hasText(profile?.light_exposure),
    },
  ];

  const done = items.filter((item) => item.completed).length;

  return (
    <section className="mt-5 rounded-xl border border-border px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">{t("checklist.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("checklist.subtitle")}</p>
        </div>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {done}/{items.length}
        </span>
      </div>

      <ul className="mt-3">
        {items.map((item) => (
          <li
            key={item.key}
            className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-b-0"
          >
            <span className="text-sm">{t(item.labelKey)}</span>
            <CompletionBadge status={item.completed ? "completed" : "pending"} />
          </li>
        ))}
      </ul>
    </section>
  );
}
