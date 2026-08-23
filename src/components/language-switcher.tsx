import { useI18n } from "@/i18n/i18n";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/translations";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();

  return (
    <div className={cn("inline-flex rounded-full border border-border p-0.5", className)}>
      {LOCALES.map((code: Locale) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          aria-label={LOCALE_LABELS[code]}
          aria-pressed={locale === code}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium uppercase transition-colors",
            locale === code
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
