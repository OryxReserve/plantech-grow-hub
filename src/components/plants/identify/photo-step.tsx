import { Camera, ImagePlus, ScanLine, X } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/i18n";
import { IDENTIFY_ACCEPTED_TYPES } from "@/lib/ai/vision-provider";

export function PhotoStep({
  previewUrl,
  busy,
  onSelectFile,
  onRemove,
  onAnalyze,
}: {
  previewUrl: string | null;
  busy: boolean;
  onSelectFile: (file: File) => void;
  onRemove: () => void;
  onAnalyze: () => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("identify.intro")}</p>

      <input
        ref={inputRef}
        type="file"
        accept={IDENTIFY_ACCEPTED_TYPES.join(",")}
        capture="environment"
        className="sr-only"
        aria-label={t("identify.choosePhoto")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onSelectFile(file);
        }}
      />

      {previewUrl ? (
        <figure className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-muted">
            <img
              src={previewUrl}
              alt={t("identify.previewAlt")}
              className="aspect-square w-full object-cover"
            />
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              aria-label={t("identify.remove")}
              className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background disabled:opacity-50"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <figcaption className="sr-only">{t("identify.previewAlt")}</figcaption>

          <Button
            className="h-12 w-full text-base"
            onClick={onAnalyze}
            disabled={busy}
          >
            <ScanLine className="size-5" aria-hidden />
            {t("identify.analyze")}
          </Button>
          <Button
            variant="ghost"
            className="h-11 w-full"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {t("identify.replace")}
          </Button>
        </figure>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
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
    </div>
  );
}
