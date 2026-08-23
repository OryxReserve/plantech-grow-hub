import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/i18n";

export function AnalyzingStep({
  previewUrl,
  phase,
}: {
  previewUrl: string | null;
  phase: "uploading" | "analyzing";
}) {
  const { t } = useI18n();
  const label = phase === "uploading" ? t("identify.uploading") : t("identify.analyzing");

  return (
    <div className="space-y-5" aria-live="polite" aria-busy="true">
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={t("identify.previewAlt")}
          className="aspect-square w-full rounded-2xl border border-border object-cover opacity-70"
        />
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
          <p className="text-sm text-muted-foreground">{t("identify.analyzingHint")}</p>
        </div>
      </div>
    </div>
  );
}
