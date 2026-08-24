import { useRef, useState } from "react";

import { PlantFormCard } from "@/components/plants/plant-form-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/i18n";
import type { PlantInput } from "@/lib/plants";

type PlantFormProps = {
  initialValue?: Partial<PlantInput>;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (input: PlantInput) => void;
  onInvalidSubmit?: () => void;
  onCancel: () => void;
};

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function PlantForm({
  initialValue,
  submitLabel,
  isSubmitting,
  onSubmit,
  onInvalidSubmit,
  onCancel,
}: PlantFormProps) {
  const { t } = useI18n();
  const [nickname, setNickname] = useState(initialValue?.nickname ?? "");
  const [speciesName, setSpeciesName] = useState(initialValue?.species_name ?? "");
  const [scientificName, setScientificName] = useState(
    initialValue?.scientific_name ?? "",
  );
  const [location, setLocation] = useState(initialValue?.location ?? "");
  const [acquiredAt, setAcquiredAt] = useState(initialValue?.acquired_at ?? "");
  const [notes, setNotes] = useState(initialValue?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const nicknameRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    if (nickname.trim().length === 0) {
      setError(t("field.nicknameRequired"));
      nicknameRef.current?.focus();
      onInvalidSubmit?.();
      return;
    }
    setError(null);
    onSubmit({
      nickname: nickname.trim(),
      species_name: nullable(speciesName),
      scientific_name: nullable(scientificName),
      location: nullable(location),
      acquired_at: nullable(acquiredAt),
      notes: nullable(notes),
    });
  }

  return (
    <PlantFormCard
      title={t("plants.details")}
      animate={false}
      submitLabel={submitLabel}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onCancel={onCancel}
    >
      <div className="space-y-1.5">
        <Label htmlFor="nickname">{t("field.nickname")}</Label>
        <Input
          id="nickname"
          ref={nicknameRef}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={t("field.nicknamePlaceholder")}
          maxLength={120}
          aria-invalid={error ? true : undefined}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="species_name">
          {t("field.speciesName")}{" "}
          <span className="text-xs text-muted-foreground">({t("field.optional")})</span>
        </Label>
        <Input
          id="species_name"
          value={speciesName}
          onChange={(e) => setSpeciesName(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="scientific_name">
          {t("field.scientificName")}{" "}
          <span className="text-xs text-muted-foreground">({t("field.optional")})</span>
        </Label>
        <Input
          id="scientific_name"
          value={scientificName}
          onChange={(e) => setScientificName(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="location">
          {t("field.location")}{" "}
          <span className="text-xs text-muted-foreground">({t("field.optional")})</span>
        </Label>
        <Input
          id="location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="acquired_at">
          {t("field.acquiredAt")}{" "}
          <span className="text-xs text-muted-foreground">({t("field.optional")})</span>
        </Label>
        <Input
          id="acquired_at"
          type="date"
          value={acquiredAt}
          onChange={(e) => setAcquiredAt(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">
          {t("field.notes")}{" "}
          <span className="text-xs text-muted-foreground">({t("field.optional")})</span>
        </Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </PlantFormCard>
  );
}
