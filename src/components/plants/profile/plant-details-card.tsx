import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/i18n";
import type { PlantRow } from "@/lib/plants";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{value}</p>
    </div>
  );
}

/** Read-only summary of the plant fields that already exist in the schema. */
export function PlantDetailsCard({
  plant,
  onEdit,
}: {
  plant: PlantRow;
  onEdit: () => void;
}) {
  const { t, locale } = useI18n();
  const dash = t("plants.noValue");
  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString(locale) : dash;

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight">
          {t("details.title")}
        </h3>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="size-4" aria-hidden />
          {t("details.edit")}
        </Button>
      </div>

      <div className="mt-2">
        <Field label={t("field.nickname")} value={plant.nickname} />
        <Field label={t("field.speciesName")} value={plant.species_name ?? dash} />
        <Field
          label={t("field.scientificName")}
          value={plant.scientific_name ?? dash}
        />
        <Field label={t("field.location")} value={plant.location ?? dash} />
        <Field label={t("field.acquiredAt")} value={formatDate(plant.acquired_at)} />
        <Field label={t("field.notes")} value={plant.notes ?? dash} />
        <Field label={t("plants.addedOn")} value={formatDate(plant.created_at)} />
      </div>
    </section>
  );
}
