import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/i18n";

export function AnalyzingStep({
  previewUrl,
  photoCount,
  phase,
}: {
  previewUrl: string | null;
  photoCount: number;
  phase: "uploading" | "analyzing";
}) {
  const { t } = useI18n();
  const label = phase === "uploading" ? t("identify.uploading") : t("identify.analyzing");

  return (
    <div className="space-y-5" aria-live="polite" aria-busy="true">
      {previewUrl ? (
        <div className="relative">
          <img
            src={previewUrl}
            alt={t("identify.previewAlt")}
            className="aspect-square w-full rounded-2xl border border-border object-cover opacity-70"
          />
          {photoCount > 1 ? (
            <span className="absolute right-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs font-medium">
              {photoCount}
            </span>
          ) : null}
        </div>
      ) : (
        <Skeleton className="aspect-square w-full rounded-2xl" />
      )}

      <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
        <Loader2
          className="size-5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
          aria-hidden
        />
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">
            {phase === "analyzing" && photoCount > 1
              ? t("identify.analyzingMultiHint")
              : t("identify.analyzingHint")}
          </p>
        </div>
      </div>
    </div>
  );
}
