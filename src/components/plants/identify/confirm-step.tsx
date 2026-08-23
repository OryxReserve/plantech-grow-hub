import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/i18n";

export type ConfirmValues = {
  nickname: string;
  speciesName: string;
  scientificName: string;
};

export function ConfirmStep({
  mode,
  plantName,
  values,
  onChange,
  onSubmit,
  onBack,
  isSubmitting,
}: {
  mode: "new" | "existing";
  plantName?: string;
  values: ConfirmValues;
  onChange: (values: ConfirmValues) => void;
  onSubmit: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}) {
  const { t } = useI18n();
  const nicknameMissing = mode === "new" && values.nickname.trim().length === 0;

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!nicknameMissing) onSubmit();
      }}
    >
      <div>
        <h2 className="text-base font-medium">{t("identify.confirmTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "existing"
            ? `${t("identify.confirmExistingBody")} ${plantName ?? ""}`.trim()
            : t("identify.confirmBody")}
        </p>
      </div>

      {mode === "new" ? (
        <div className="space-y-2">
          <Label htmlFor="identify-nickname">{t("field.nickname")}</Label>
          <Input
            id="identify-nickname"
            className="h-12"
            value={values.nickname}
            required
            onChange={(event) => onChange({ ...values, nickname: event.target.value })}
          />
          {nicknameMissing ? (
            <p className="text-sm text-destructive">{t("field.nicknameRequired")}</p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="identify-species">{t("field.speciesName")}</Label>
        <Input
          id="identify-species"
          className="h-12"
          value={values.speciesName}
          onChange={(event) => onChange({ ...values, speciesName: event.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="identify-scientific">{t("field.scientificName")}</Label>
        <Input
          id="identify-scientific"
          className="h-12"
          value={values.scientificName}
          onChange={(event) =>
            onChange({ ...values, scientificName: event.target.value })
          }
        />
      </div>

      <Button type="submit" className="h-12 w-full text-base" disabled={isSubmitting}>
        {isSubmitting
          ? t("identify.saving")
          : mode === "existing"
            ? t("identify.applyConfirm")
            : t("identify.createPlant")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-11 w-full"
        onClick={onBack}
        disabled={isSubmitting}
      >
        {t("plants.cancel")}
      </Button>
    </form>
  );
}
