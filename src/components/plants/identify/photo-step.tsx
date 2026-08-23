import { Camera, ImagePlus, ScanLine, Star, X } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/i18n";
import {
  IDENTIFY_ACCEPTED_TYPES,
  MAX_HINT_LENGTH,
  MAX_IDENTIFY_IMAGES,
} from "@/lib/ai/vision-provider";
import type { StagedPhoto } from "@/lib/plant-identification";

export function PhotoStep({
  photos,
  primaryClientId,
  failedClientIds,
  hint,
  busy,
  onSelectFiles,
  onRemove,
  onSetPrimary,
  onHintChange,
  onAnalyze,
}: {
  photos: StagedPhoto[];
  primaryClientId: string | null;
  failedClientIds: string[];
  hint: string;
  busy: boolean;
  onSelectFiles: (files: File[]) => void;
  onRemove: (clientId: string) => void;
  onSetPrimary: (clientId: string) => void;
  onHintChange: (hint: string) => void;
  onAnalyze: () => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const accept = IDENTIFY_ACCEPTED_TYPES.join(",");
  const canAdd = photos.length < MAX_IDENTIFY_IMAGES;
  const hintTooLong = hint.trim().length > MAX_HINT_LENGTH;

  function handleFiles(list: FileList | null) {
    if (!list) return;
    onSelectFiles(Array.from(list));
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("identify.intro")}</p>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="sr-only"
        aria-label={t("identify.choosePhoto")}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <input
        ref={cameraRef}
        type="file"
        accept={accept}
        capture="environment"
        className="sr-only"
        aria-label={t("identify.takePhoto")}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {photos.length > 0 ? (
        <div className="space-y-3">
          <ul className="grid grid-cols-3 gap-3">
            {photos.map((photo, index) => {
              const isPrimary = photo.clientId === primaryClientId;
              const failed = failedClientIds.includes(photo.clientId);
              return (
                <li key={photo.clientId} className="space-y-2">
                  <div
                    className={
                      "relative overflow-hidden rounded-xl border bg-muted " +
                      (isPrimary ? "border-primary ring-2 ring-primary/30" : "border-border") +
                      (failed ? " opacity-60" : "")
                    }
                  >
                    <img
                      src={photo.previewUrl}
                      alt={`${t("identify.previewAlt")} ${index + 1}`}
                      className="aspect-square w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => onRemove(photo.clientId)}
                      disabled={busy}
                      aria-label={`${t("identify.removePhoto")} ${index + 1}`}
                      className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background disabled:opacity-50"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                    {isPrimary ? (
                      <span className="absolute inset-x-1 bottom-1 rounded-full bg-primary px-2 py-0.5 text-center text-[11px] font-medium text-primary-foreground">
                        {t("identify.primaryBadge")}
                      </span>
                    ) : null}
                  </div>

                  {!isPrimary ? (
                    <button
                      type="button"
                      onClick={() => onSetPrimary(photo.clientId)}
                      disabled={busy}
                      aria-pressed={false}
                      className="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg border border-border px-2 text-xs transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      <Star className="size-3.5" aria-hidden />
                      {t("identify.setPrimary")}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <p className="text-sm text-muted-foreground">{t("identify.morePhotosHint")}</p>

          {canAdd ? (
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-12"
                onClick={() => cameraRef.current?.click()}
                disabled={busy}
              >
                <Camera className="size-5" aria-hidden />
                {t("identify.takePhoto")}
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
              >
                <ImagePlus className="size-5" aria-hidden />
                {t("identify.choosePhoto")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10">
              <Camera className="size-6 text-primary" aria-hidden />
            </span>
            <span className="font-medium">{t("identify.takePhoto")}</span>
            <span className="max-w-xs text-sm text-muted-foreground">
              {t("identify.photoHint")}
            </span>
          </button>
          <Button
            variant="outline"
            className="h-12 w-full"
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="size-5" aria-hidden />
            {t("identify.choosePhoto")}
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="identify-hint">{t("identify.addHint")}</Label>
        <Textarea
          id="identify-hint"
          value={hint}
          rows={3}
          maxLength={MAX_HINT_LENGTH}
          disabled={busy}
          aria-describedby="identify-hint-help"
          placeholder={t("identify.hintPlaceholder")}
          onChange={(event) => onHintChange(event.target.value)}
        />
        <div className="flex items-start justify-between gap-3">
          <p id="identify-hint-help" className="text-sm text-muted-foreground">
            {t("identify.hintHelp")}
          </p>
          <span
            className={
              "shrink-0 text-xs tabular-nums " +
              (hintTooLong ? "text-destructive" : "text-muted-foreground")
            }
          >
            {hint.trim().length}/{MAX_HINT_LENGTH}
          </span>
        </div>
      </div>

      {photos.length > 0 ? (
        <Button
          className="h-12 w-full text-base"
          onClick={onAnalyze}
          disabled={busy || hintTooLong}
        >
          <ScanLine className="size-5" aria-hidden />
          {t("identify.analyze")}
        </Button>
      ) : null}
    </div>
  );
}
