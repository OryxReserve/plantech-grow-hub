import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BellRing, Info, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PlantScreen } from "@/components/plants/screen";
import { Button } from "@/components/ui/button";
import {
  FormCard,
  FormCardFooter,
  FormCardHeader,
  FormCardRow,
} from "@/components/ui/form-card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useActiveAccount } from "@/context/active-account";
import { useI18n } from "@/i18n/i18n";
import {
  detectTimezone,
  notificationPreferencesKeys,
  notificationPreferencesQuery,
  timezoneOptions,
  updateNotificationPreferences,
} from "@/lib/notification-preferences";
import {
  disablePush,
  enablePush,
  getPushPermission,
  getStoredToken,
  isIosDevice,
  isStandaloneDisplay,
  type PushPermission,
} from "@/lib/push/register-push";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  head: () => ({
    meta: [
      { title: "Notificações | Plantech" },
      {
        name: "description",
        content:
          "Configure lembretes de cuidado do Plantech: notificações push, horário preferido, fuso horário e fallback por e-mail.",
      },
      { property: "og:title", content: "Notificações | Plantech" },
      {
        property: "og:description",
        content: "Lembretes de rega e adubação no horário certo, no seu fuso.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationSettingsPage,
});

function NotificationSettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { activeAccountId, isLoading: accountLoading } = useActiveAccount();
  const accountId = activeAccountId ?? "";

  const query = useQuery({
    ...notificationPreferencesQuery(accountId),
    enabled: Boolean(activeAccountId),
  });

  const [permission, setPermission] = useState<PushPermission>("unsupported");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const [timezone, setTimezone] = useState<string>(detectTimezone());
  const [reminderHour, setReminderHour] = useState<number>(9);
  const [emailFallback, setEmailFallback] = useState(true);

  // Reads only the current permission state; it never prompts the user.
  useEffect(() => {
    setPermission(getPushPermission());
    setPushEnabled(Boolean(getStoredToken()) && getPushPermission() === "granted");
    setIosHint(isIosDevice() && !isStandaloneDisplay());
  }, []);

  useEffect(() => {
    if (!query.data) return;
    setTimezone(query.data.timezone);
    setReminderHour(query.data.reminderHour);
    setEmailFallback(query.data.emailFallbackEnabled);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () =>
      updateNotificationPreferences(accountId, {
        timezone,
        reminderHour,
        emailFallbackEnabled: emailFallback,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: notificationPreferencesKeys.detail(accountId),
      });
      toast.success(t("settings.notifications.saved"));
    },
    onError: () => toast.error(t("settings.notifications.saveError")),
  });

  async function togglePush(next: boolean) {
    setPushBusy(true);
    try {
      if (!next) {
        await disablePush();
        setPushEnabled(false);
        toast.success(t("settings.notifications.push.disabled"));
        return;
      }
      // Permission is requested here only, as a direct result of this click.
      const result = await enablePush(accountId);
      setPermission(getPushPermission());
      if (result.ok) {
        setPushEnabled(true);
        toast.success(t("settings.notifications.push.enabled"));
      } else {
        setPushEnabled(false);
        toast.error(
          result.reason === "denied"
            ? t("settings.notifications.push.deniedToast")
            : t("settings.notifications.push.error"),
        );
      }
    } finally {
      setPushBusy(false);
    }
  }

  const loading = accountLoading || (Boolean(activeAccountId) && query.isPending);

  return (
    <PlantScreen
      title={t("settings.notifications.title")}
      backTo="/app"
      backLabel={t("plants.back")}
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ) : !activeAccountId ? (
        <p className="text-sm text-muted-foreground">{t("plants.noAccountData")}</p>
      ) : (
        <div className="space-y-5">
          <FormCard>
            <FormCardHeader
              title={t("settings.notifications.push.title")}
              subtitle={t("settings.notifications.push.subtitle")}
            />
            <FormCardRow className="space-y-4">
              {permission === "unsupported" ? (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  {t("settings.notifications.push.unsupported")}
                </p>
              ) : permission === "denied" ? (
                <p className="flex gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {t("settings.notifications.push.denied")}
                </p>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="push-toggle" className="flex items-center gap-2">
                    <BellRing className="size-4 text-primary" aria-hidden />
                    {t("settings.notifications.push.toggle")}
                  </Label>
                  <Switch
                    id="push-toggle"
                    checked={pushEnabled}
                    disabled={pushBusy}
                    onCheckedChange={(next) => void togglePush(next)}
                  />
                </div>
              )}

              {iosHint ? (
                <p className="flex gap-2 rounded-lg bg-primary/5 p-3 text-sm text-muted-foreground">
                  <Smartphone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {t("settings.notifications.push.iosHint")}
                </p>
              ) : null}
            </FormCardRow>
          </FormCard>

          <FormCard>
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
            >
              <FormCardHeader
                title={t("settings.notifications.schedule.title")}
                subtitle={t("settings.notifications.schedule.subtitle")}
              />
              <FormCardRow className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reminder-hour">
                    {t("settings.notifications.reminderHour")}
                  </Label>
                  <Select
                    value={String(reminderHour)}
                    onValueChange={(value) => setReminderHour(Number(value))}
                  >
                    <SelectTrigger id="reminder-hour" className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, hour) => (
                        <SelectItem key={hour} value={String(hour)}>
                          {`${String(hour).padStart(2, "0")}:00`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">{t("settings.notifications.timezone")}</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="timezone" className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timezoneOptions(timezone).map((zone) => (
                        <SelectItem key={zone} value={zone}>
                          {zone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.notifications.timezoneHint")} {detectTimezone()}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 pt-1">
                  <Label htmlFor="email-fallback">
                    {t("settings.notifications.emailFallback")}
                  </Label>
                  <Switch
                    id="email-fallback"
                    checked={emailFallback}
                    onCheckedChange={setEmailFallback}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("settings.notifications.emailFallbackHint")}
                </p>
              </FormCardRow>

              <FormCardFooter>
                <Button type="submit" className="h-12 flex-1 text-base" disabled={save.isPending}>
                  {save.isPending
                    ? t("plants.saving")
                    : t("settings.notifications.save")}
                </Button>
              </FormCardFooter>
            </form>
          </FormCard>
        </div>
      )}
    </PlantScreen>
  );
}
