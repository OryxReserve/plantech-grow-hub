import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PlantForm } from "@/components/plants/plant-form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useI18n } from "@/i18n/i18n";
import { plantKeys, updatePlant, type PlantInput, type PlantRow } from "@/lib/plants";

/**
 * Edits the plant fields already available in the schema. Persistence reuses
 * `updatePlant`, the same function backing the `/plants/$plantId/edit` route.
 */
export function PlantDetailsSheet({
  accountId,
  plant,
  open,
  onOpenChange,
}: {
  accountId: string;
  plant: PlantRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: PlantInput) => updatePlant(accountId, plant.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plantKeys.all(accountId) });
      toast.success(t("plants.updated"));
      onOpenChange(false);
    },
    // The sheet stays open with the typed values so the user can retry.
    onError: () => toast.error(t("details.saveError")),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("details.title")}</SheetTitle>
          <SheetDescription>{t("details.sheetDescription")}</SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <PlantForm
            key={open ? "open" : "closed"}
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
            onInvalidSubmit={() => toast.error(t("field.nicknameRequired"))}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
