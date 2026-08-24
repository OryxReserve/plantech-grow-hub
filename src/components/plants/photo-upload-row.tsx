import { ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/i18n";
import { IDENTIFY_ACCEPTED_TYPES, MAX_IDENTIFY_IMAGES } from "@/lib/ai/vision-provider";
import {
  createStagedPhoto,
  removeStagingPhotos,
  validateIdentifyFile,
  type StagedPhoto,
} from "@/lib/plant-identification";

/**
 * Thin UI row over the existing staging helpers. It never uploads on its own;
 * the owner decides when to call `uploadStagingPhotos`.
 */
export function PhotoUploadRow({
  label,
  photos,
  onChange,
  max = MAX_IDENTIFY_IMAGES,
  disabled,
}: {
  label: string;
  photos: StagedPhoto[];
  onChange: (photos: StagedPhoto[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const canAdd = photos.length < max;

  function handleFiles(list: FileList | null) {
    if (!list) return;
    const accepted: StagedPhoto[] = [];
    let nextError: string | null = null;

    for (const file of Array.from(list)) {
      if (photos.length + accepted.length >= max) break;
      const invalid = validateIdentifyFile(file);
      if (invalid) {
        nextError =
          invalid === "type" ? t("upload.invalidType") : t("upload.invalidSize");
        continue;
      }
      accepted.push(createStagedPhoto(file));
    }

    setError(nextError);
    if (accepted.length > 0) onChange([...photos, ...accepted]);
  }

  function handleRemove(photo: StagedPhoto) {
    onChange(photos.filter((item) => item.clientId !== photo.clientId));
    void removeStagingPhotos([photo]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm">{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10"
          disabled={disabled || !canAdd}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="size-4" aria-hidden />
          {t("upload.addPhoto")}
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={IDENTIFY_ACCEPTED_TYPES.join(",")}
        className="sr-only"
        aria-label={t("upload.addPhoto")}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("upload.emptyHint")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-3">
          {photos.map((photo, index) => (
            <li key={photo.clientId} className="relative">
              <img
                src={photo.previewUrl}
                alt={`${t("upload.previewAlt")} ${index + 1}`}
                className="aspect-square w-full rounded-[var(--radius)] border border-border object-cover"
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleRemove(photo)}
                aria-label={`${t("upload.removePhoto")} ${index + 1}`}
                className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
