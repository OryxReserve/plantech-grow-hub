/**
 * Cron + manual entry point for the daily care reminders.
 *
 * Lives under /api/public/ so the scheduler can reach it on the published
 * site without a user session. It is NOT open: every request must carry the
 * cron secret.
 *
 * POST /api/public/hooks/care-reminders
 *   headers: x-cron-secret: <LOVABLE_CRON_SECRET>
 *   body (optional, for manual QA):
 *     { "accountId": "<uuid>", "dryRunDedupe": true }
 */
import { createFileRoute } from "@tanstack/react-router";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Constant-time compare so the secret cannot be guessed byte by byte. */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export const Route = createFileRoute("/api/public/hooks/care-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["LOVABLE_CRON_SECRET"];
        if (!expected) {
          console.error("[care-reminders] LOVABLE_CRON_SECRET is not configured");
          return json({ error: "Reminder job is not configured" }, 500);
        }

        const provided =
          request.headers.get("x-cron-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!provided || !secretMatches(provided, expected)) {
          return json({ error: "Unauthorized" }, 401);
        }

        let accountId: string | null = null;
        let dryRunDedupe = false;
        try {
          const raw = await request.text();
          if (raw.trim()) {
            const body = JSON.parse(raw) as {
              accountId?: string;
              dryRunDedupe?: boolean;
            };
            accountId = typeof body.accountId === "string" ? body.accountId : null;
            dryRunDedupe = body.dryRunDedupe === true;
          }
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        try {
          const { runCareReminders } = await import("@/lib/push/care-reminders.server");
          const summary = await runCareReminders({
            accountId,
            dryRunDedupe,
            triggeredManually: Boolean(accountId),
          });
          return json({ ok: true, ...summary });
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown error";
          return json({ ok: false, error: message }, 500);
        }
      },
    },
  },
});
