import { createFileRoute, Link } from "@tanstack/react-router";

import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/i18n/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Plantech — cuidado de plantas e jardim" },
      {
        name: "description",
        content:
          "Plantech organiza suas plantas, o histórico de cuidados e o armário de produtos da sua conta em um app mobile-first.",
      },
      { property: "og:title", content: "Plantech — cuidado de plantas e jardim" },
      {
        property: "og:description",
        content:
          "Registre plantas, acompanhe cuidados e gerencie produtos em um só lugar.",
      },
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
      </div>
    </main>
  );
}
