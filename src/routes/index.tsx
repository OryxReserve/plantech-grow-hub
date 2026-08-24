import { createFileRoute, Link } from "@tanstack/react-router";

import { LanguageSwitcher } from "@/components/language-switcher";
import { CompletionBadge } from "@/components/ui/completion-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { useI18n } from "@/i18n/i18n";
import { headTranslate } from "@/i18n/translations";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: headTranslate("meta.landing.title") },
      { name: "description", content: headTranslate("meta.landing.description") },
      { property: "og:title", content: headTranslate("meta.landing.title") },
      { property: "og:description", content: headTranslate("meta.landing.ogDescription") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { t } = useI18n();

  return (
    <main className="flex min-h-screen flex-col bg-background px-5 py-8">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">{t("app.name")}</span>
        <LanguageSwitcher />
      </header>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t("landing.heading")}</h1>
        <p className="mt-3 text-muted-foreground">{t("landing.body")}</p>
        <Link
          to="/auth"
          className="mt-8 inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("landing.cta")}
        </Link>

        <div className="mt-8 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
          <StatusBadge status="completed" />
          <StatusBadge status="pending" />
          <StatusBadge status="active" />
          <StatusBadge status="inactive" />
          <StatusBadge status="error" />
          <StatusBadge status="warning" />
          <CompletionBadge status="completed" />
          <CompletionBadge status="pending" />
        </div>
      </div>
    </main>
  );
}
