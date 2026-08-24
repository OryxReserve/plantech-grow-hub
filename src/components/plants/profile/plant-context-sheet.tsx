import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  DRAINAGE_LABEL,
  ENVIRONMENT_LABEL,
  PERCEIVED_LIGHT_LABEL,
  SOIL_TYPE_LABEL,
  WINDOW_ORIENTATION_LABEL,
} from "@/components/plants/profile/plant-context-card";
import { Button } from "@/components/ui/button";
import { FormCard } from "@/components/ui/form-card";
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
import {
  DRAINAGE_VALUES,
  ENVIRONMENT_VALUES,
  MAX_CONTEXT_NOTE_LENGTH,
  MAX_POT_SIZE_CM,
  MAX_WINDOW_DISTANCE_CM,
  MIN_POT_SIZE_CM,
  MIN_WINDOW_DISTANCE_CM,
  PERCEIVED_LIGHT_VALUES,
  SOIL_TYPE_SUGGESTIONS,
  WINDOW_ORIENTATION_VALUES,
  isDrainage,
  isEnvironment,
  isPerceivedLight,
  isWindowOrientation,
  plantCareProfileKeys,
  upsertPlantCareProfile,
  type Drainage,
  type Environment,
  type PerceivedLight,
  type PlantCareProfileRow,
  type PlantContextInput,
  type WindowOrientation,
} from "@/lib/plant-care-profile";

const NONE = "__none__";
const OTHER = "__other__";

type FormState = {
  soil_choice: string;
  soil_custom: string;
  drainage: Drainage | typeof NONE;
  pot_size_cm: string;
  environment: Environment | typeof NONE;
  window_orientation: WindowOrientation | typeof NONE;
  window_distance_cm: string;
  perceived_light: PerceivedLight | typeof NONE;
  last_watered_at: string;
  context_note: string;
};

function toFormState(profile: PlantCareProfileRow | null): FormState {
  const soil = profile?.soil_type ?? "";
  const isSuggestion = (SOIL_TYPE_SUGGESTIONS as readonly string[]).includes(soil);
  return {
    soil_choice: soil.length === 0 ? NONE : isSuggestion ? soil : OTHER,
    soil_custom: soil.length > 0 && !isSuggestion ? soil : "",
    drainage: isDrainage(profile?.drainage ?? null)
      ? (profile!.drainage as Drainage)
      : NONE,
    pot_size_cm: profile?.pot_size_cm?.toString() ?? "",
    environment: isEnvironment(profile?.environment ?? null)
      ? (profile!.environment as Environment)
      : NONE,
    window_orientation: isWindowOrientation(profile?.window_orientation ?? null)
      ? (profile!.window_orientation as WindowOrientation)
      : NONE,
    window_distance_cm: profile?.window_distance_cm?.toString() ?? "",
    perceived_light: isPerceivedLight(profile?.perceived_light ?? null)
      ? (profile!.perceived_light as PerceivedLight)
      : NONE,
    last_watered_at: profile?.last_watered_at ?? "",
    context_note: profile?.context_note ?? "",
  };
}

function textOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Returns `undefined` when the value is present but outside the DB limits. */
function numberOrNull(
  value: string,
  min: number,
  max: number,
): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  if (parsed < min || parsed > max) return undefined;
  return parsed;
}

/** Editor for the physical context of this plant. No scheduling logic here. */
export function PlantContextSheet({
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
  const potRef = useRef<HTMLInputElement>(null);
  const distanceRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setForm(toFormState(profile));
      setFieldError(null);
    }
  }, [open, profile]);

  const mutation = useMutation({
    mutationFn: (input: PlantContextInput) =>
      upsertPlantCareProfile(accountId, plantId, input),
    onSuccess: (row) => {
      queryClient.setQueryData(plantCareProfileKeys.detail(accountId, plantId), row);
      queryClient.invalidateQueries({
        queryKey: plantCareProfileKeys.detail(accountId, plantId),
      });
      toast.success(t("context.saveSuccessToast"));
      onOpenChange(false);
    },
    onError: () => toast.error(t("context.saveErrorToast")),
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const focusInvalid = (
    ref:
      | React.RefObject<HTMLInputElement | null>
      | React.RefObject<HTMLTextAreaElement | null>,
  ) => {
    const element = ref.current;
    if (!element) return;
    element.focus();
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();

    const potSize = numberOrNull(form.pot_size_cm, MIN_POT_SIZE_CM, MAX_POT_SIZE_CM);
    const distance = numberOrNull(
      form.window_distance_cm,
      MIN_WINDOW_DISTANCE_CM,
      MAX_WINDOW_DISTANCE_CM,
    );
    const note = textOrNull(form.context_note);

    if (potSize === undefined) {
      setFieldError(t("context.invalidPotSize"));
      toast.error(t("context.validationErrorToast"));
      focusInvalid(potRef);
      return;
    }
    if (distance === undefined) {
      setFieldError(t("context.invalidWindowDistance"));
      toast.error(t("context.validationErrorToast"));
      focusInvalid(distanceRef);
      return;
    }
    if (note && note.length > MAX_CONTEXT_NOTE_LENGTH) {
      setFieldError(t("context.invalidNote"));
      toast.error(t("context.validationErrorToast"));
      focusInvalid(noteRef);
      return;
    }
    setFieldError(null);

    const soil =
      form.soil_choice === NONE
        ? null
        : form.soil_choice === OTHER
          ? textOrNull(form.soil_custom)
          : form.soil_choice;

    mutation.mutate({
      soil_type: soil,
      drainage: form.drainage === NONE ? null : form.drainage,
      pot_size_cm: potSize,
      window_distance_cm: distance,
      window_orientation:
        form.window_orientation === NONE ? null : form.window_orientation,
      perceived_light: form.perceived_light === NONE ? null : form.perceived_light,
      environment: form.environment === NONE ? null : form.environment,
      last_watered_at: textOrNull(form.last_watered_at),
      context_note: note,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>{t("context.sheetTitle")}</SheetTitle>
          <SheetDescription>{t("context.sheetBody")}</SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="px-4 pb-6">
          <FormCard animate={false} className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("context.group.soilAndPot")}
          </p>

          <div className="space-y-2">
            <Label htmlFor="soil_type">{t("context.field.soilType")}</Label>
            <Select
              value={form.soil_choice}
              onValueChange={(value) => set("soil_choice", value)}
            >
              <SelectTrigger id="soil_type" className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("context.none")}</SelectItem>
                {SOIL_TYPE_SUGGESTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(SOIL_TYPE_LABEL[value]!)}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER}>{t("context.soil.other")}</SelectItem>
              </SelectContent>
            </Select>
            {form.soil_choice === OTHER ? (
              <Input
                aria-label={t("context.soil.otherPlaceholder")}
                placeholder={t("context.soil.otherPlaceholder")}
                value={form.soil_custom}
                onChange={(e) => set("soil_custom", e.target.value)}
                className="h-12"
              />
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="drainage">{t("context.field.drainage")}</Label>
            <Select
              value={form.drainage}
              onValueChange={(value) =>
                set("drainage", value === NONE ? NONE : (value as Drainage))
              }
            >
              <SelectTrigger id="drainage" className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("context.none")}</SelectItem>
                {DRAINAGE_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(DRAINAGE_LABEL[value])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pot_size_cm">
              {t("context.field.potSize")} ({t("context.cmUnit")})
            </Label>
            <Input
              id="pot_size_cm"
              ref={potRef}
              inputMode="numeric"
              value={form.pot_size_cm}
              onChange={(e) => set("pot_size_cm", e.target.value)}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="environment">{t("context.field.environment")}</Label>
            <Select
              value={form.environment}
              onValueChange={(value) =>
                set("environment", value === NONE ? NONE : (value as Environment))
              }
            >
              <SelectTrigger id="environment" className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("context.none")}</SelectItem>
                {ENVIRONMENT_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(ENVIRONMENT_LABEL[value])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("context.group.lightAndPosition")}
          </p>

          <div className="space-y-2">
            <Label htmlFor="window_orientation">
              {t("context.field.windowOrientation")}
            </Label>
            <Select
              value={form.window_orientation}
              onValueChange={(value) =>
                set(
                  "window_orientation",
                  value === NONE ? NONE : (value as WindowOrientation),
                )
              }
            >
              <SelectTrigger id="window_orientation" className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("context.none")}</SelectItem>
                {WINDOW_ORIENTATION_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(WINDOW_ORIENTATION_LABEL[value])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="window_distance_cm">
              {t("context.field.windowDistance")} ({t("context.cmUnit")})
            </Label>
            <Input
              id="window_distance_cm"
              ref={distanceRef}
              inputMode="numeric"
              value={form.window_distance_cm}
              onChange={(e) => set("window_distance_cm", e.target.value)}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="perceived_light">{t("context.field.perceivedLight")}</Label>
            <Select
              value={form.perceived_light}
              onValueChange={(value) =>
                set("perceived_light", value === NONE ? NONE : (value as PerceivedLight))
              }
            >
              <SelectTrigger id="perceived_light" className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("context.none")}</SelectItem>
                {PERCEIVED_LIGHT_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(PERCEIVED_LIGHT_LABEL[value])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("context.group.wateringAndNote")}
          </p>

          <div className="space-y-2">
            <Label htmlFor="last_watered_at">{t("context.field.lastWateredAt")}</Label>
            <Input
              id="last_watered_at"
              type="date"
              value={form.last_watered_at}
              onChange={(e) => set("last_watered_at", e.target.value)}
              className="h-12"
            />
            <p className="text-xs text-muted-foreground">
              {t("context.lastWateredHint")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="context_note">{t("context.field.note")}</Label>
            <Textarea
              id="context_note"
              ref={noteRef}
              value={form.context_note}
              onChange={(e) => set("context_note", e.target.value)}
              rows={3}
              maxLength={MAX_CONTEXT_NOTE_LENGTH}
            />
            <p className="text-right text-xs text-muted-foreground">
              {form.context_note.length}/{MAX_CONTEXT_NOTE_LENGTH}
            </p>
          </div>

          {fieldError ? (
            <p role="alert" className="text-sm text-destructive">
              {fieldError}
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
          </FormCard>
        </form>
      </SheetContent>
    </Sheet>
  );
}
