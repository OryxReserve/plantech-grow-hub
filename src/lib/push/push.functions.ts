import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { FirebaseWebConfig } from "@/lib/push/firebase-config";

/**
 * Firebase web config for the browser. The apiKey lives in a server secret,
 * the remaining values are compiled-in public identifiers.
 */
export const getFirebaseWebConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<Pick<FirebaseWebConfig, "apiKey">> => ({
    apiKey: process.env["GOOGLE_API_KEY"] ?? "",
  }),
);

const RegisterInput = z.object({
  accountId: z.string().uuid(),
  token: z.string().trim().min(20).max(4096),
  userAgent: z.string().trim().max(500).optional(),
});

/** Stores (or refreshes) the FCM token of the current device for the account. */
export const registerPushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RegisterInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        account_id: data.accountId,
        user_id: userId,
        fcm_token: data.token,
        user_agent: data.userAgent ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "fcm_token" },
    );
    if (error) throw new Error("Could not store the push subscription");

    return { ok: true as const };
  });

const UnregisterInput = z.object({ token: z.string().trim().min(20).max(4096) });

/** Removes the current device token (used when push is turned off). */
export const unregisterPushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UnregisterInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("fcm_token", data.token);
    if (error) throw new Error("Could not remove the push subscription");
    return { ok: true as const };
  });
