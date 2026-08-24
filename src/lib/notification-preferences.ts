import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type NotificationPreferences = {
  timezone: string;
  reminderHour: number;
  emailFallbackEnabled: boolean;
};

export const notificationPreferencesKeys = {
  all: ["notification-preferences"] as const,
  detail: (accountId: string) => ["notification-preferences", accountId] as const,
};

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** IANA zones offered in the selector, plus whatever the browser reports. */
export function timezoneOptions(current: string): string[] {
  const base = [
    "UTC",
    "Europe/Madrid",
    "Europe/Lisbon",
    "Europe/London",
    "America/Sao_Paulo",
    "America/New_York",
    "America/Mexico_City",
    "America/Bogota",
    "America/Buenos_Aires",
    "America/Los_Angeles",
  ];
  const detected = detectTimezone();
  return Array.from(new Set([current, detected, ...base].filter(Boolean))).sort();
}

export async function fetchNotificationPreferences(
  accountId: string,
): Promise<NotificationPreferences> {
  const { data, error } = await supabase
    .from("accounts")
    .select("timezone, reminder_hour, email_fallback_enabled")
    .eq("id", accountId)
    .single();
  if (error) throw error;
  return {
    timezone: data.timezone,
    reminderHour: data.reminder_hour,
    emailFallbackEnabled: data.email_fallback_enabled,
  };
}

export function notificationPreferencesQuery(accountId: string) {
  return queryOptions({
    queryKey: notificationPreferencesKeys.detail(accountId),
    queryFn: () => fetchNotificationPreferences(accountId),
    staleTime: 30_000,
  });
}

export async function updateNotificationPreferences(
  accountId: string,
  input: NotificationPreferences,
): Promise<void> {
  const { error } = await supabase
    .from("accounts")
    .update({
      timezone: input.timezone,
      reminder_hour: input.reminderHour,
      email_fallback_enabled: input.emailFallbackEnabled,
    })
    .eq("id", accountId);
  if (error) throw error;
}
