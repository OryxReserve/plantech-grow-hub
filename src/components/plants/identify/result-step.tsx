import { Check, Info, Sprout } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/i18n";
import type { PlantIdentificationCandidate } from "@/lib/ai/vision-provider";

export function ResultStep({
  previewUrl,
  candidates,
  selectedIndex,
  onSelect,
  onContinue,
  onManual,
}: {
  previewUrl: string | null;
  candidates: PlantIdentificationCandidate[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onContinue: () => void;
  onManual: () => void;
}) {
  const { t, locale } = useI18n();

  return (
    <div className="space-y-5">
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={t("identify.previewAlt")}
          className="aspect-square w-full rounded-2xl border border-border object-cover"
        />
      ) : null}

      <div>
        <h2 className="text-base font-medium">{t("identify.probableTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("identify.resultBody")}</p>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("identify.uncertaintyNotice")}
      </p>

      <ul className="space-y-3" role="radiogroup" aria-label={t("identify.probableTitle")}>
        {candidates.map((candidate, index) => {
          const selected = selectedIndex === index;
          return (
            <li key={`${candidate.commonName}-${index}`}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSelect(index)}
                className={
                  "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                  (selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent")
                }
              >
                <span
                  className={
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border " +
                    (selected ? "border-primary bg-primary text-primary-foreground" : "border-border")
                  }
                  aria-hidden
                >
                  {selected ? <Check className="size-4" /> : <Sprout className="size-3.5 text-muted-foreground" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{candidate.commonName}</span>
                  {candidate.scientificName ? (
                    <span className="block text-sm italic text-muted-foreground">
                      {candidate.scientificName}
                    </span>
                  ) : null}
                  {candidate.note ? (
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {candidate.note}
                    </span>
                  ) : null}
                  {candidate.broadOnly || candidate.rank === "genus" ? (
                    <span className="mt-2 block rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {t("identify.genusOnlyNote")}
                    </span>
                  ) : null}
                  <span className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {t(`identify.rank.${candidate.rank}`)}
                    </span>
                    {candidate.confidence !== null ? (
                      <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {t("identify.confidence")}:{" "}
                        {new Intl.NumberFormat(locale, { style: "percent" }).format(
                          candidate.confidence,
                        )}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Button
        className="h-12 w-full text-base"
        onClick={onContinue}
        disabled={selectedIndex === null}
      >
        {t("identify.continue")}
      </Button>
      <Button variant="outline" className="h-12 w-full" onClick={onManual}>
        {t("identify.rejectAll")}
      </Button>
    </div>
  );
}
