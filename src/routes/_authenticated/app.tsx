import { createFileRoute, Link } from "@tanstack/react-router";
import { BellRing, Leaf, Droplets, Package, ChevronRight, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useActiveAccount, type AccountRole } from "@/context/active-account";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppShell,
});

const roleKey: Record<AccountRole, TranslationKey> = {
  owner: "role.owner",
  admin: "role.admin",
  member: "role.member",
};

function AppShell() {
  const { t } = useI18n();
  const {
    user,
    profile,
    memberships,
    activeAccountId,
    activeMembership,
    setActiveAccountId,
    isLoading,
  } = useActiveAccount();



  return (
    <div>
      <main className="mx-auto w-full max-w-2xl space-y-6 px-5 py-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("shell.loading")}</p>
        ) : (
          <>
            <section className="rounded-xl border border-border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("shell.user")}
              </p>
              <p className="mt-1 font-medium">{profile?.fullName ?? user?.email}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </section>

            <section className="rounded-xl border border-border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("shell.account")}
              </p>
              {activeMembership ? (
                <>
                  <p className="mt-1 font-medium">{activeMembership.accountName}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("shell.role")}: {t(roleKey[activeMembership.role])}
                  </p>

                  {memberships.length > 1 ? (
                    <div className="mt-4">
                      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                        {t("shell.switch")}
                      </p>
                      <div className="flex flex-col gap-2">
                        {memberships.map((membership) => (
                          <button
                            key={membership.accountId}
                            type="button"
                            onClick={() => setActiveAccountId(membership.accountId)}
                            className={
                              "rounded-lg border px-3 py-2 text-left text-sm transition-colors " +
                              (membership.accountId === activeAccountId
                                ? "border-primary bg-primary/10"
                                : "border-border hover:bg-accent")
                            }
                          >
                            {membership.accountName}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t("shell.singleAccount")}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-sm text-destructive">{t("shell.noAccount")}</p>
              )}
            </section>

            <section className="space-y-3">
              <Button asChild className="h-12 w-full text-base">
                <Link to="/plants/identify">
                  <ScanLine className="size-5" aria-hidden />
                  {t("identify.cta")}
                </Link>
              </Button>
              <Link
                to="/tasks"
                className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-accent"
              >
                <Droplets className="size-5 text-primary" aria-hidden />
                <span className="flex-1">
                  <span className="block font-medium">{t("shell.careLog")}</span>
                  <span className="block text-sm text-muted-foreground">
                    {t("shell.careLogDesc")}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link
                to="/plants"
                className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-accent"
              >
                <Leaf className="size-5 text-primary" aria-hidden />
                <span className="flex-1">
                  <span className="block font-medium">{t("shell.plants")}</span>
                  <span className="block text-sm text-muted-foreground">
                    {t("shell.plantsDesc")}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link
                to="/products"
                className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-accent"
              >
                <Package className="size-5 text-primary" aria-hidden />
                <span className="flex-1">
                  <span className="block font-medium">{t("shell.products")}</span>
                  <span className="block text-sm text-muted-foreground">
                    {t("shell.productsDesc")}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link
                to="/settings/notifications"
                className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-accent"
              >
                <BellRing className="size-5 text-primary" aria-hidden />
                <span className="flex-1">
                  <span className="block font-medium">{t("shell.notifications")}</span>
                  <span className="block text-sm text-muted-foreground">
                    {t("shell.notificationsDesc")}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>

            </section>

          </>
        )}
      </main>
    </div>
  );
}
