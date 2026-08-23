import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import {
  LIGHT_EXPOSURE_VALUES,
  MAX_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
  isLightExposure,
  plantCareProfileKeys,
  upsertPlantCareProfile,
  type LightExposure,
  type PlantCareProfileInput,
  type PlantCareProfileRow,
} from "@/lib/plant-care-profile";

const NONE = "__none__";

export const LIGHT_LABEL: Record<LightExposure, TranslationKey> = {
  low: "care.light.low",
  medium: "care.light.medium",
  bright_indirect: "care.light.bright_indirect",
  direct: "care.light.direct",
};

type FormState = {
  watering_interval_days: string;
  watering_amount_note: string;
  light_exposure: LightExposure | typeof NONE;
  light_note: string;
  fertilizing_interval_days: string;
  fertilizer_type: string;
  fertilizing_note: string;
};

function toFormState(profile: PlantCareProfileRow | null): FormState {
  return {
    watering_interval_days: profile?.watering_interval_days?.toString() ?? "",
    watering_amount_note: profile?.watering_amount_note ?? "",
    light_exposure: isLightExposure(profile?.light_exposure ?? null)
      ? (profile!.light_exposure as LightExposure)
      : NONE,
    light_note: profile?.light_note ?? "",
    fertilizing_interval_days: profile?.fertilizing_interval_days?.toString() ?? "",
    fertilizer_type: profile?.fertilizer_type ?? "",
    fertilizing_note: profile?.fertilizing_note ?? "",
  };
}

function textOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Returns `undefined` when the value is present but invalid. */
function intervalOrNull(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  if (parsed < MIN_INTERVAL_DAYS || parsed > MAX_INTERVAL_DAYS) return undefined;
  return parsed;
}

/** Soft advisory check: true when the field has content but no letters or digits. */
function fieldLooksUseless(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return !/[\p{L}\p{N}]/u.test(trimmed);
}

export function CareProfileSheet({
  accountId,
  plantId,
  profile,
  open,
  onOpenChange,
}: {
  accountId: string;
  plantId: string;
  profile: PlantCareProfileRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toFormState(profile));
  const [fieldError, setFieldError] = useState<string | null>(null);
  const wateringRef = useRef<HTMLInputElement>(null);
  const fertilizingRef = useRef<HTMLInputElement>(null);

  // A missing profile simply opens an empty form.
  useEffect(() => {
    if (open) {
      setForm(toFormState(profile));
      setFieldError(null);
    }
  }, [open, profile]);

  const mutation = useMutation({
    mutationFn: (input: PlantCareProfileInput) =>
      upsertPlantCareProfile(accountId, plantId, input),
    onSuccess: (row) => {
      queryClient.setQueryData(plantCareProfileKeys.detail(accountId, plantId), row);
      queryClient.invalidateQueries({
        queryKey: plantCareProfileKeys.detail(accountId, plantId),
      });
      toast.success(t("care.saveSuccessToast"));
      onOpenChange(false);
    },
    onError: () => {
      toast.error(t("care.saveErrorToast"));
    },
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const focusFirstInvalid = (firstRef: React.RefObject<HTMLInputElement | null>) => {
    const element = firstRef.current;
    if (!element) return;
    element.focus();
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();

    const watering = intervalOrNull(form.watering_interval_days);
    const fertilizing = intervalOrNull(form.fertilizing_interval_days);
    const wateringInvalid = watering === undefined;
    const fertilizingInvalid = fertilizing === undefined;

    if (wateringInvalid || fertilizingInvalid) {
      setFieldError(t("care.invalidInterval"));
      toast.error(t("care.validationErrorToast"));
      focusFirstInvalid(wateringInvalid ? wateringRef : fertilizingRef);
      return;
    }
    setFieldError(null);

    mutation.mutate({
      watering_interval_days: watering,
      watering_amount_note: textOrNull(form.watering_amount_note),
      light_exposure: form.light_exposure === NONE ? null : form.light_exposure,
      light_note: textOrNull(form.light_note),
      fertilizing_interval_days: fertilizing,
      fertilizer_type: textOrNull(form.fertilizer_type),
      fertilizing_note: textOrNull(form.fertilizing_note),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>{t("care.sheetTitle")}</SheetTitle>
          <SheetDescription>{t("care.sheetBody")}</SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="space-y-5 px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="watering_interval_days">
              {t("care.field.wateringIntervalDays")} ({t("care.daysUnit")})
            </Label>
            <Input
              id="watering_interval_days"
              ref={wateringRef}
              inputMode="numeric"
              value={form.watering_interval_days}
              onChange={(e) => set("watering_interval_days", e.target.value)}
              className="h-12"
              aria-invalid={fieldError ? "true" : "false"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="watering_amount_note">
              {t("care.field.wateringAmountNote")}
            </Label>
            <Textarea
              id="watering_amount_note"
              value={form.watering_amount_note}
              onChange={(e) => set("watering_amount_note", e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="light_exposure">{t("care.field.lightExposure")}</Label>
            <Select
              value={form.light_exposure}
              onValueChange={(value) =>
                set("light_exposure", value === NONE ? NONE : (value as LightExposure))
              }
            >
              <SelectTrigger id="light_exposure" className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("care.light.none")}</SelectItem>
                {LIGHT_EXPOSURE_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(LIGHT_LABEL[value])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="light_note">{t("care.field.lightNote")}</Label>
            <Textarea
              id="light_note"
              value={form.light_note}
              onChange={(e) => set("light_note", e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fertilizing_interval_days">
              {t("care.field.fertilizingIntervalDays")} ({t("care.daysUnit")})
            </Label>
            <Input
              id="fertilizing_interval_days"
              ref={fertilizingRef}
              inputMode="numeric"
              value={form.fertilizing_interval_days}
              onChange={(e) => set("fertilizing_interval_days", e.target.value)}
              className="h-12"
              aria-invalid={fieldError ? "true" : "false"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fertilizer_type">{t("care.field.fertilizerType")}</Label>
            <Input
              id="fertilizer_type"
              value={form.fertilizer_type}
              onChange={(e) => set("fertilizer_type", e.target.value)}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fertilizing_note">{t("care.field.fertilizingNote")}</Label>
            <Textarea
              id="fertilizing_note"
              value={form.fertilizing_note}
              onChange={(e) => set("fertilizing_note", e.target.value)}
              rows={2}
            />
          </div>

          {fieldError ? (
            <p role="alert" className="text-sm text-destructive">
              {fieldError}
            </p>
          ) : null}
          {mutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {t("care.saveError")}
            </p>
          ) : null}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1"
              onClick={() => onOpenChange(false)}
            >
              {t("care.cancel")}
            </Button>
            <Button type="submit" className="h-12 flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? t("care.saving") : t("care.save")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
