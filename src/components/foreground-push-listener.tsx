import { useEffect } from "react";

import { startForegroundPushListener } from "@/lib/push/register-push";

/**
 * Attaches the FCM foreground handler once per session. Without it, messages
 * that arrive while the app is visible are delivered silently: Chrome only
 * auto-displays notifications when the page is in the background.
 */
export function ForegroundPushListener() {
  useEffect(() => {
    void startForegroundPushListener();
  }, []);
  return null;
}
