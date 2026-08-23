import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Droplets, Leaf, Sun, TriangleAlert } from "lucide-react";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/i18n";
import {
  isUsableScientificName,
  normalizeSpeciesKey,
  speciesCareKeys,
} from "@/lib/species-care";
import { getSpeciesCareGuide } from "@/lib/species-care.functions";

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3 border-b border-border py-3 last:border-b-0">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm leading-relaxed">{value}</p>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card px-4 py-4">
      <h3 className="text-base font-semibold tracking-tight">{t("initialCare.title")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("initialCare.subtitle")}</p>
      {children}
    </section>
  );
}

/**
 * Species-level orientation for a plant, read from the global guide cache and
 * generated once per species and language. Purely informative: it never writes
 * to the plant's own care profile and never schedules anything.
 */
export function InitialCareCard({
  accountId,
  scientificName,
}: {
  accountId: string;
  scientificName: string | null;
}) {
  const { t, locale } = useI18n();
  const fetchGuide = useServerFn(getSpeciesCareGuide);
  const usable = isUsableScientificName(scientificName);
  const speciesKey = usable ? normalizeSpeciesKey(scientificName) : "";

  const query = useQuery({
    queryKey: speciesCareKeys.guide(speciesKey, locale),
    enabled: usable,
    staleTime: Infinity,
    retry: false,
    queryFn: () =>
      fetchGuide({
        data: { accountId, scientificName: scientificName as string, language: locale },
      }),
  });

  if (!usable) {
    return (
      <Shell>
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {t("initialCare.noSpecies")}
        </p>
      </Shell>
    );
  }

  if (query.isPending) {
    return (
      <Shell>
        <div className="mt-2 space-y-3" aria-label={t("initialCare.loading")}>
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </Shell>
    );
  }

  const guide = query.data?.ok ? query.data.guide : null;

  if (query.isError || !guide) {
    return (
      <Shell>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t("initialCare.error")}</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            {t("plants.retry")}
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mt-2">
        {guide.water ? (
          <Row icon={Droplets} label={t("care.tab.water")} value={guide.water} />
        ) : null}
        {guide.light ? (
          <Row icon={Sun} label={t("care.tab.light")} value={guide.light} />
        ) : null}
        {guide.fertilizing ? (
          <Row icon={Leaf} label={t("care.tab.fertilizer")} value={guide.fertilizing} />
        ) : null}
        {guide.notes ? (
          <Row
            icon={TriangleAlert}
            label={t("initialCare.notes")}
            value={guide.notes}
          />
        ) : null}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("initialCare.basedOn")} {guide.scientificName}
      </p>
    </Shell>
  );
}
