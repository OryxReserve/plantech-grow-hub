import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/i18n";
import { LOCALES, LOCALE_LABELS, headTranslate } from "@/i18n/translations";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: headTranslate("meta.auth.title") },
      { name: "description", content: headTranslate("meta.auth.description") },
      { property: "og:title", content: headTranslate("meta.auth.title") },
      { property: "og:description", content: headTranslate("meta.auth.ogDescription") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const router = useRouter();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) navigate({ to: "/app", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      if (mode === "signUp") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName, preferred_language: locale },
          },
        });
        if (error) throw error;
        toast.success(t("auth.created"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success(t("auth.welcome"));
      }
      await router.invalidate();
      navigate({ to: "/app", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-background px-5 py-8">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">{t("app.name")}</span>
        <LanguageSwitcher />
      </header>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "signIn" ? t("auth.signIn") : t("auth.signUp")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("app.tagline")}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "signUp" && (
            <div className="space-y-1.5">
              <Label htmlFor="fullName">{t("auth.fullName")}</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </div>

          {mode === "signUp" && (
            <div className="space-y-1.5">
              <Label htmlFor="language">{t("auth.language")}</Label>
              <select
                id="language"
                value={locale}
                onChange={(e) => setLocale(e.target.value as (typeof LOCALES)[number])}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {LOCALE_LABELS[code]}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button type="submit" className="h-11 w-full" disabled={pending}>
            {pending
              ? t("auth.loading")
              : mode === "signIn"
                ? t("auth.submitSignIn")
                : t("auth.submitSignUp")}
          </Button>
        </form>

        <button
          type="button"
          className="mt-5 text-sm text-muted-foreground underline underline-offset-4"
          onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
        >
          {mode === "signIn" ? t("auth.toSignUp") : t("auth.toSignIn")}
        </button>
      </div>
    </main>
  );
}
