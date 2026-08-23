import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/i18n";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global header for every authenticated screen. Mounted once in the
 * `_authenticated` layout, so routes must not render their own copy.
 */
export function AppHeader() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success(t("auth.signedOut"));
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-5 py-3 backdrop-blur">
      <button
        type="button"
        onClick={() => navigate({ to: "/app" })}
        className="text-lg font-semibold tracking-tight"
      >
        {t("app.name")}
      </button>
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          {t("shell.signOut")}
        </Button>
      </div>
    </header>
  );
}
