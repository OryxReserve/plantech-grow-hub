import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PlantForm } from "@/components/plants/plant-form";
import { PlantScreen } from "@/components/plants/screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveAccount } from "@/context/active-account";
import { useI18n } from "@/i18n/i18n";
import {
  plantDetailQuery,
  plantKeys,
  updatePlant,
  type PlantInput,
} from "@/lib/plants";

export const Route = createFileRoute("/_authenticated/plants/$plantId/edit")({
  component: EditPlantPage,
});

function EditPlantPage() {
  const { t } = useI18n();
  const { plantId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeAccountId, isLoading: accountLoading } = useActiveAccount();

  const query = useQuery({
    ...plantDetailQuery(activeAccountId ?? "", plantId),
    enabled: Boolean(activeAccountId),
  });

  const mutation = useMutation({
    mutationFn: (input: PlantInput) => {
      if (!activeAccountId) throw new Error("No active account in context");
      return updatePlant(activeAccountId, plantId, input);
    },
    onSuccess: () => {
      if (activeAccountId) {
        queryClient.invalidateQueries({ queryKey: plantKeys.all(activeAccountId) });
      }
      toast.success(t("plants.updated"));
      navigate({ to: "/plants/$plantId", params: { plantId }, replace: true });
    },
    onError: () => toast.error(t("plants.error")),
  });

  const plant = query.data ?? null;

  return (
    <PlantScreen
      title={t("plants.editTitle")}
      backTo="/plants"
      backLabel={t("plants.backToList")}
    >
      {accountLoading || (activeAccountId && query.isPending) ? (
        <div className="space-y-3" aria-label={t("plants.detailLoading")}>
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
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
      ) : !plant ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">{t("plants.notFound")}</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/plants">{t("plants.backToList")}</Link>
          </Button>
        </div>
      ) : (
        <PlantForm
          initialValue={{
            nickname: plant.nickname,
            species_name: plant.species_name,
            scientific_name: plant.scientific_name,
            location: plant.location,
            acquired_at: plant.acquired_at,
            notes: plant.notes,
          }}
          submitLabel={t("plants.save")}
          isSubmitting={mutation.isPending}
          onSubmit={(input) => mutation.mutate(input)}
          onCancel={() =>
            navigate({ to: "/plants/$plantId", params: { plantId } })
          }
        />
      )}
    </PlantScreen>
  );
}
