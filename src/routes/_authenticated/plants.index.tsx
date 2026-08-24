import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Leaf, Plus, ScanLine } from "lucide-react";

import { ExpandablePlantDetail } from "@/components/plants/expandable-plant-detail";
import { PlantScreen } from "@/components/plants/screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveAccount } from "@/context/active-account";
import { useI18n } from "@/i18n/i18n";
import { plantsListQuery } from "@/lib/plants";

export const Route = createFileRoute("/_authenticated/plants/")({
  component: PlantsListPage,
});

function PlantsListPage() {
  const { t } = useI18n();
  const { activeAccountId, isLoading: accountLoading } = useActiveAccount();

  const query = useQuery({
    ...plantsListQuery(activeAccountId ?? ""),
    enabled: Boolean(activeAccountId),
  });

  return (
    <PlantScreen
      title={t("plants.title")}
      backTo="/app"
      backLabel={t("plants.back")}
      action={
        activeAccountId ? (
          <Button asChild size="sm">
            <Link to="/plants/new">
              <Plus className="size-4" />
              {t("plants.new")}
            </Link>
          </Button>
        ) : null
      }
    >
      {activeAccountId ? (
        <Button asChild className="mb-5 h-12 w-full text-base">
          <Link to="/plants/identify">
            <ScanLine className="size-5" aria-hidden />
            {t("identify.cta")}
          </Link>
        </Button>
      ) : null}

      {accountLoading || (activeAccountId && query.isPending) ? (
        <div className="space-y-3" aria-label={t("plants.loading")}>
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : !activeAccountId ? (
        <p className="text-sm text-muted-foreground">{t("plants.noAccountData")}</p>
      ) : query.isError ? (
        <div className="rounded-xl border border-destructive/40 p-4">
          <p className="text-sm text-destructive">{t("plants.error")}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => query.refetch()}
          >
            {t("plants.retry")}
          </Button>
        </div>
      ) : (query.data?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <Leaf className="size-8 text-primary" />
          <h2 className="text-base font-medium">{t("plants.empty.title")}</h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            {t("plants.empty.body")}
          </p>
          <Button asChild className="mt-2 h-12 w-full max-w-xs text-base">
            <Link to="/plants/identify">
              <ScanLine className="size-5" aria-hidden />
              {t("identify.cta")}
            </Link>
          </Button>
          <Button asChild variant="ghost" className="h-11">
            <Link to="/plants/new">{t("plants.empty.cta")}</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {query.data!.map((plant) => (
            <li key={plant.id}>
              <ExpandablePlantDetail
                id={plant.id}
                title={plant.nickname}
                subtitle={
                  plant.species_name ??
                  plant.scientific_name ??
                  plant.location ??
                  t("plants.noValue")
                }
                trigger={
                  <span className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Leaf className="size-5 text-primary" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {plant.nickname}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {plant.species_name ??
                          plant.scientific_name ??
                          plant.location ??
                          t("plants.noValue")}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </span>
                }
                footer={
                  <Button asChild className="h-12 w-full text-base">
                    <Link to="/plants/$plantId" params={{ plantId: plant.id }}>
                      {t("plants.openProfile")}
                    </Link>
                  </Button>
                }
              >
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">
                      {t("field.speciesName")}
                    </dt>
                    <dd>{plant.species_name ?? t("plants.noValue")}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("field.scientificName")}
                    </dt>
                    <dd className="italic">
                      {plant.scientific_name ?? t("plants.noValue")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("field.location")}</dt>
                    <dd>{plant.location ?? t("plants.noValue")}</dd>
                  </div>
                </dl>
              </ExpandablePlantDetail>
            </li>
          ))}
        </ul>
      )}
    </PlantScreen>
  );
}
