import { useQuery } from "@tanstack/react-query";
import { Leaf } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/i18n";
import { plantPhotosQuery } from "@/lib/plant-photos";
import type { PlantRow } from "@/lib/plants";

/**
 * Profile header: primary photo (falls back to the most recent one, then to an
 * empty state), nickname and species/scientific name.
 */
export function PlantHero({
  accountId,
  plant,
}: {
  accountId: string;
  plant: PlantRow;
}) {
  const { t } = useI18n();
  const photos = useQuery(plantPhotosQuery(accountId, plant.id));

  // The query already orders by is_primary desc, created_at desc.
  const hero =
    photos.data?.find((photo) => photo.is_primary) ?? photos.data?.[0] ?? null;
  const secondary = plant.species_name ?? plant.scientific_name;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      {photos.isPending ? (
        <Skeleton className="aspect-[4/3] w-full rounded-none" />
      ) : hero?.url ? (
        <img
          src={hero.url}
          alt={plant.nickname}
          className="aspect-[4/3] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-muted/50 px-6 text-center">
          <Leaf className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">{t("care.noPhoto")}</p>
        </div>
      )}

      <div className="px-4 py-4">
        <h2 className="truncate text-xl font-semibold tracking-tight">
          {plant.nickname}
        </h2>
        {secondary ? (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{secondary}</p>
        ) : null}
        {plant.scientific_name && plant.species_name ? (
          <p className="mt-0.5 truncate text-xs italic text-muted-foreground">
            {plant.scientific_name}
          </p>
        ) : null}
      </div>
    </section>
  );
}
