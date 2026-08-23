import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/i18n";
import type { AiVisionErrorCategory } from "@/lib/ai/vision-provider";
import type { TranslationKey } from "@/i18n/translations";

const MESSAGE_KEY: Record<AiVisionErrorCategory, TranslationKey> = {
  rate_limited: "identify.error.rateLimited",
  no_credits: "identify.error.noCredits",
  provider_blocked: "identify.error.blocked",
  provider_unavailable: "identify.error.unavailable",
  invalid_image: "identify.error.invalidImage",
  not_configured: "identify.error.notConfigured",
  timeout: "identify.error.timeout",
  unknown: "identify.error.unknown",
};

export function ErrorStep({
  category,
  retryable,
  onRetry,
  onManual,
}: {
  category: AiVisionErrorCategory;
  retryable: boolean;
  onRetry: () => void;
  onManual: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-5" role="alert">
      <div className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div>
          <p className="font-medium">{t("identify.errorTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t(MESSAGE_KEY[category])}</p>
        </div>
      </div>

      {retryable ? (
        <Button className="h-12 w-full text-base" onClick={onRetry}>
          {t("identify.retry")}
        </Button>
      ) : null}

      <Button variant="outline" className="h-12 w-full" onClick={onManual}>
        {t("identify.manualFallback")}
      </Button>
    </div>
  );
}
