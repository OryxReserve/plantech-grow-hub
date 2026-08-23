import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, ScanLine, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PlantPhotoGallery } from "@/components/plants/photo-gallery";
import { CareProfileSheet } from "@/components/plants/profile/care-profile-sheet";
import { CareSummary } from "@/components/plants/profile/care-summary";
import { CareTimeline } from "@/components/plants/profile/care-timeline";
import { PlantDetailsCard } from "@/components/plants/profile/plant-details-card";
import { PlantDetailsSheet } from "@/components/plants/profile/plant-details-sheet";
import { PlantHero } from "@/components/plants/profile/plant-hero";
import { PlantScreen } from "@/components/plants/screen";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveAccount } from "@/context/active-account";
import { useI18n } from "@/i18n/i18n";
import { plantCareProfileQuery } from "@/lib/plant-care-profile";
import { deletePlant, plantDetailQuery, plantKeys } from "@/lib/plants";

export const Route = createFileRoute("/_authenticated/plants/$plantId/")({
  component: PlantDetailPage,
});

function PlantDetailPage() {
  const { t, locale } = useI18n();
  const { plantId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeAccountId, isLoading: accountLoading } = useActiveAccount();
  const [careOpen, setCareOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const query = useQuery({
    ...plantDetailQuery(activeAccountId ?? "", plantId),
    enabled: Boolean(activeAccountId),
  });

  const careProfile = useQuery({
    ...plantCareProfileQuery(activeAccountId ?? "", plantId),
    enabled: Boolean(activeAccountId),
  });

  const removal = useMutation({
    mutationFn: () => {
      if (!activeAccountId) throw new Error("No active account in context");
      return deletePlant(activeAccountId, plantId);
    },
    onSuccess: () => {
      if (activeAccountId) {
        queryClient.invalidateQueries({ queryKey: plantKeys.all(activeAccountId) });
      }
      toast.success(t("plants.deleted"));
      navigate({ to: "/plants", replace: true });
    },
    onError: () => toast.error(t("plants.error")),
  });

  const plant = query.data ?? null;
  const dash = t("plants.noValue");
  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString(locale) : dash;

  return (
    <PlantScreen
      title={plant?.nickname ?? t("plants.title")}
      backTo="/plants"
      backLabel={t("plants.backToList")}
      action={
        plant ? (
          <Button asChild variant="ghost" size="sm">
            <Link to="/plants/$plantId/edit" params={{ plantId }}>
              <Pencil className="size-4" />
              {t("plants.edit")}
            </Link>
          </Button>
        ) : null
      }
    >
      {accountLoading || (activeAccountId && query.isPending) ? (
        <div className="space-y-3" aria-label={t("plants.detailLoading")}>
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
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
        <>
          <PlantHero accountId={activeAccountId} plant={plant} />

          <InitialCareCard
            accountId={activeAccountId}
            scientificName={plant.scientific_name}
          />

          <CareSummary profile={careProfile.data ?? null} />

          {careProfile.isError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {t("care.loadError")}
            </p>
          ) : null}

          <Button
            className="mt-4 h-12 w-full text-base"
            onClick={() => setCareOpen(true)}
            disabled={careProfile.isPending}
          >
            <Settings2 className="size-5" aria-hidden />
            {careProfile.data ? t("care.edit") : t("care.configure")}
          </Button>

          <CareProfileSheet
            accountId={activeAccountId}
            plantId={plant.id}
            profile={careProfile.data ?? null}
            open={careOpen}
            onOpenChange={setCareOpen}
          />

          <CareTimeline accountId={activeAccountId} plantId={plant.id} />

          <PlantDetailsCard plant={plant} onEdit={() => setDetailsOpen(true)} />

          <PlantDetailsSheet
            accountId={activeAccountId}
            plant={plant}
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
          />

          <Button asChild variant="outline" className="mt-5 h-12 w-full text-base">
            <Link to="/plants/identify" search={{ plantId: plant.id }}>
              <ScanLine className="size-5" aria-hidden />
              {t("identify.fromDetail")}
            </Link>
          </Button>

          <PlantPhotoGallery accountId={activeAccountId} plantId={plant.id} />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="mt-6 w-full text-destructive">
                <Trash2 className="size-4" />
                {t("plants.delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("plants.deleteTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("plants.deleteBody")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("plants.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => removal.mutate()}
                  disabled={removal.isPending}
                >
                  {t("plants.deleteConfirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </PlantScreen>
  );
}
