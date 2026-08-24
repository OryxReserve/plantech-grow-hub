import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppHeader } from "@/components/app-header";
import { ForegroundPushListener } from "@/components/foreground-push-listener";
import { ProfileLocaleSync } from "@/components/profile-locale-sync";
import { ActiveAccountProvider } from "@/context/active-account";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => (
    <ActiveAccountProvider>
      <ProfileLocaleSync />
      <div className="min-h-screen bg-background">
        <AppHeader />
        <Outlet />
      </div>
    </ActiveAccountProvider>
  ),
});
