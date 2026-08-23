import { useI18n } from "@/i18n/i18n";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/translations";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** Fire-and-forget: keeps the preference synced across devices/browsers. */
function persistPreferredLanguage(locale: Locale) {
  void (async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;
      await supabase.from("profiles").update({ preferred_language: locale }).eq("id", userId);
    } catch {
      // Preference stays in localStorage; no user-facing error needed.
    }
  })();
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();

  return (
    <div className={cn("inline-flex rounded-full border border-border p-0.5", className)}>
      {LOCALES.map((code: Locale) => (
        <button
          key={code}
          type="button"
          onClick={() => {
            setLocale(code);
            persistPreferredLanguage(code);
          }}
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
