/**
 * Daily care reminder job — server only.
 *
 * Runs hourly. Each run picks the accounts whose *local* hour equals their
 * `reminder_hour` and that have not been notified yet on their local date,
 * derives the due care tasks, and sends one grouped push per device token.
 *
 * Everything here uses the service role on purpose: the job has no user
 * session and must read across every tenant. It never returns tenant data to
 * a caller — only aggregate counters.
 */
import { sendPushToToken } from "@/lib/push/fcm.server";

/** Only interval-based care types produce reminders. */
const CARE_TYPES = ["watering", "fertilizing"] as const;
type CareType = (typeof CARE_TYPES)[number];

/** Names listed in the notification body before collapsing into "+N". */
const MAX_NAMES_IN_BODY = 3;
/** Concurrent FCM sends. Keeps a large account from stalling the whole run. */
const SEND_CONCURRENCY = 5;

export type ReminderRunSummary = {
  accountsConsidered: number;
  accountsNotified: number;
  pushSent: number;
  pushFailed: number;
  staleTokensRemoved: number;
  /** Per-account detail, returned only to the authenticated caller. */
  accounts: {
    accountId: string;
    localDate: string;
    taskCount: number;
    plantNames: string[];
    tokens: number;
    delivered: number;
  }[];
};

type DueAccount = { account_id: string; timezone: string; local_date: string };

/** Calendar day in the account timezone, as `yyyy-mm-dd`. */
function localDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function addDaysToIsoDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type PlantRow = { id: string; nickname: string };
type ProfileRow = {
  plant_id: string;
  watering_interval_days: number | null;
  fertilizing_interval_days: number | null;
  last_watered_at: string | null;
};
type LogRow = { plant_id: string; care_type: string; performed_at: string };

/**
 * Names of the plants with at least one care task due today or overdue.
 *
 * A care type with no interval configured never generates a task — no implicit
 * default is applied. The anchor is the most recent of: the last care log, the
 * profile's `last_watered_at` (watering only), or the plant's creation date.
 */
function derivePlantsDue(
  plants: PlantRow[],
  profiles: ProfileRow[],
  logs: LogRow[],
  plantCreatedAt: Map<string, string>,
  timeZone: string,
  today: string,
): { names: string[]; taskCount: number } {
  const profileByPlant = new Map(profiles.map((row) => [row.plant_id, row]));

  const lastCareByKey = new Map<string, string>();
  for (const log of logs) {
    const key = `${log.plant_id}:${log.care_type}`;
    const day = localDay(new Date(log.performed_at), timeZone);
    const current = lastCareByKey.get(key);
    if (!current || day > current) lastCareByKey.set(key, day);
  }

  const names: string[] = [];
  let taskCount = 0;

  for (const plant of plants) {
    const profile = profileByPlant.get(plant.id);
    if (!profile) continue;

    let plantHasTask = false;

    for (const careType of CARE_TYPES) {
      const interval =
        careType === "watering"
          ? profile.watering_interval_days
          : profile.fertilizing_interval_days;
      if (!interval || interval <= 0) continue;

      const candidates: string[] = [];
      const lastLog = lastCareByKey.get(`${plant.id}:${careType}`);
      if (lastLog) candidates.push(lastLog);
      if (careType === "watering" && profile.last_watered_at) {
        candidates.push(profile.last_watered_at.slice(0, 10));
      }
      if (candidates.length === 0) {
        const created = plantCreatedAt.get(plant.id);
        if (created) candidates.push(localDay(new Date(created), timeZone));
      }
      if (candidates.length === 0) continue;

      const anchor = candidates.reduce((a, b) => (a > b ? a : b));
      const dueDay = addDaysToIsoDay(anchor, interval);

      // Due today or already overdue.
      if (dueDay <= today) {
        taskCount += 1;
        plantHasTask = true;
      }
    }

    if (plantHasTask) names.push(plant.nickname);
  }

  return { names, taskCount };
}

function buildNotification(names: string[], taskCount: number) {
  const plantCount = names.length;
  const title =
    plantCount === 1
      ? "1 planta precisa de atenção hoje"
      : `${plantCount} plantas precisam de atenção hoje`;

  const shown = names.slice(0, MAX_NAMES_IN_BODY);
  const rest = plantCount - shown.length;
  const body = rest > 0 ? `${shown.join(", ")} +${rest} outras` : shown.join(", ");

  return { title, body, taskCount };
}

/** Sends to every token of the account, cleaning up the dead ones. */
async function notifyAccount(
  supabaseAdmin: SupabaseAdmin,
  accountId: string,
  notification: { title: string; body: string },
): Promise<{ tokens: number; delivered: number; failed: number; removed: number }> {
  const { data: subscriptions, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("fcm_token")
    .eq("account_id", accountId);
  if (error) throw new Error(`Could not read push subscriptions: ${error.message}`);

  const tokens = (subscriptions ?? []).map((row) => row.fcm_token);
  if (tokens.length === 0) return { tokens: 0, delivered: 0, failed: 0, removed: 0 };

  let delivered = 0;
  let failed = 0;
  const staleTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += SEND_CONCURRENCY) {
    const batch = tokens.slice(i, i + SEND_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (token) => {
        try {
          return await sendPushToToken(token, {
            title: notification.title,
            body: notification.body,
            link: "/tasks",
          });
        } catch (sendError) {
          console.error("[care-reminders] send threw", sendError);
          return { ok: false as const, stale: false, status: 0, error: "send_threw" };
        }
      }),
    );

    results.forEach((result, index) => {
      if (result.ok) {
        delivered += 1;
        return;
      }
      failed += 1;
      // A token the device no longer owns is garbage; keeping it would make
      // every future run fail on the same row.
      if (result.stale) staleTokens.push(batch[index]!);
    });
  }

  let removed = 0;
  if (staleTokens.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .in("fcm_token", staleTokens);
    if (deleteError) {
      console.error("[care-reminders] stale cleanup failed", deleteError.message);
    } else {
      removed = staleTokens.length;
    }
  }

  return { tokens: tokens.length, delivered, failed, removed };
}

type SupabaseAdmin = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

export type RunOptions = {
  /** Manual runs bypass the local-hour filter and target one account. */
  accountId?: string | null;
  /** Manual runs may re-send without writing the daily dedupe row. */
  dryRunDedupe?: boolean;
  triggeredManually?: boolean;
};

export async function runCareReminders(
  options: RunOptions = {},
): Promise<ReminderRunSummary> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date();

  const { data: runRow } = await supabaseAdmin
    .from("reminder_run_log")
    .insert({ triggered_manually: options.triggeredManually ?? false })
    .select("id")
    .single();
  const runId = runRow?.id ?? null;

  const summary: ReminderRunSummary = {
    accountsConsidered: 0,
    accountsNotified: 0,
    pushSent: 0,
    pushFailed: 0,
    staleTokensRemoved: 0,
    accounts: [],
  };

  try {
    let dueAccounts: DueAccount[] = [];

    if (options.accountId) {
      // Manual test path: the account is targeted regardless of local hour.
      const { data: account, error } = await supabaseAdmin
        .from("accounts")
        .select("id, timezone")
        .eq("id", options.accountId)
        .maybeSingle();
      if (error) throw new Error(`Could not read account: ${error.message}`);
      if (account) {
        dueAccounts = [
          {
            account_id: account.id,
            timezone: account.timezone,
            local_date: localDay(now, account.timezone),
          },
        ];
      }
    } else {
      const { data, error } = await supabaseAdmin.rpc("list_accounts_due_for_reminder");
      if (error) throw new Error(`Could not list due accounts: ${error.message}`);
      dueAccounts = (data ?? []) as DueAccount[];
    }

    summary.accountsConsidered = dueAccounts.length;

    for (const account of dueAccounts) {
      const accountId = account.account_id;
      const timeZone = account.timezone || "UTC";
      const today = account.local_date ?? localDay(now, timeZone);

      const { data: plantRows, error: plantError } = await supabaseAdmin
        .from("plants")
        .select("id, nickname, created_at")
        .eq("account_id", accountId)
        .eq("is_archived", false);
      if (plantError) throw new Error(`Could not read plants: ${plantError.message}`);

      const plants = (plantRows ?? []).map((row) => ({
        id: row.id,
        nickname: row.nickname,
      }));
      if (plants.length === 0) continue;

      const plantCreatedAt = new Map(
        (plantRows ?? []).map((row) => [row.id, row.created_at]),
      );
      const plantIds = plants.map((plant) => plant.id);

      const [profileResult, logResult] = await Promise.all([
        supabaseAdmin
          .from("plant_care_profile")
          .select(
            "plant_id, watering_interval_days, fertilizing_interval_days, last_watered_at",
          )
          .eq("account_id", accountId),
        supabaseAdmin
          .from("plant_care_log")
          .select("plant_id, care_type, performed_at")
          .eq("account_id", accountId)
          .in("plant_id", plantIds)
          .in("care_type", [...CARE_TYPES]),
      ]);
      if (profileResult.error) {
        throw new Error(`Could not read care profiles: ${profileResult.error.message}`);
      }
      if (logResult.error) {
        throw new Error(`Could not read care log: ${logResult.error.message}`);
      }

      const { names, taskCount } = derivePlantsDue(
        plants,
        (profileResult.data ?? []) as ProfileRow[],
        (logResult.data ?? []) as LogRow[],
        plantCreatedAt,
        timeZone,
        today,
      );

      if (names.length === 0) continue;

      const notification = buildNotification(names, taskCount);
      const sendResult = await notifyAccount(supabaseAdmin, accountId, notification);

      summary.pushSent += sendResult.delivered;
      summary.pushFailed += sendResult.failed;
      summary.staleTokensRemoved += sendResult.removed;
      if (sendResult.delivered > 0) summary.accountsNotified += 1;
      summary.accounts.push({
        accountId,
        localDate: today,
        taskCount,
        plantNames: names,
        tokens: sendResult.tokens,
        delivered: sendResult.delivered,
      });

      // The dedupe row is written only when something actually went out, so a
      // run with zero devices does not silently burn the day's reminder.
      if (!options.dryRunDedupe && sendResult.delivered > 0) {
        const { error: markError } = await supabaseAdmin
          .from("care_reminder_sent")
          .upsert(
            {
              account_id: accountId,
              local_date: today,
              task_count: taskCount,
              delivered_count: sendResult.delivered,
            },
            { onConflict: "account_id,local_date" },
          );
        if (markError) {
          console.error("[care-reminders] dedupe write failed", markError.message);
        }
      }
    }

    if (runId) {
      await supabaseAdmin
        .from("reminder_run_log")
        .update({
          finished_at: new Date().toISOString(),
          accounts_considered: summary.accountsConsidered,
          accounts_notified: summary.accountsNotified,
          push_sent: summary.pushSent,
          push_failed: summary.pushFailed,
          stale_tokens_removed: summary.staleTokensRemoved,
        })
        .eq("id", runId);
    }

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("[care-reminders] run failed", message);
    if (runId) {
      await supabaseAdmin
        .from("reminder_run_log")
        .update({ finished_at: new Date().toISOString(), error: message })
        .eq("id", runId);
    }
    throw error;
  }
}
