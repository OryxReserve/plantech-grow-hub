import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PlantForm } from "@/components/plants/plant-form";
import { PlantScreen } from "@/components/plants/screen";
import { useActiveAccount } from "@/context/active-account";
import { useI18n } from "@/i18n/i18n";
import { createPlant, plantKeys, type PlantInput } from "@/lib/plants";

export const Route = createFileRoute("/_authenticated/plants/new")({
  component: NewPlantPage,
});

function NewPlantPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeAccountId } = useActiveAccount();

  const mutation = useMutation({
    mutationFn: (input: PlantInput) => {
      if (!activeAccountId) throw new Error("No active account in context");
      return createPlant(activeAccountId, input);
    },
    onSuccess: (plant) => {
      queryClient.invalidateQueries({ queryKey: plantKeys.all(plant.account_id) });
      toast.success(t("plants.created"));
      navigate({ to: "/plants/$plantId", params: { plantId: plant.id }, replace: true });
    },
    onError: () => toast.error(t("plants.error")),
  });

  return (
    <PlantScreen
      title={t("plants.new")}
      backTo="/plants"
      backLabel={t("plants.backToList")}
    >
      {!activeAccountId ? (
        <p className="text-sm text-muted-foreground">{t("plants.noAccountData")}</p>
      ) : (
        <PlantForm
          submitLabel={t("plants.create")}
          isSubmitting={mutation.isPending}
          onSubmit={(input) => mutation.mutate(input)}
          onCancel={() => navigate({ to: "/plants" })}
        />
      )}
    </PlantScreen>
  );
}
