import {
  FIREBASE_PUBLIC_CONFIG,
  FIREBASE_VAPID_KEY,
  serviceWorkerUrl,
  type FirebaseWebConfig,
} from "@/lib/push/firebase-config";
import { getFirebaseWebConfig, registerPushToken, unregisterPushToken } from "@/lib/push/push.functions";

export type PushPermission = "granted" | "denied" | "default" | "unsupported";

const TOKEN_STORAGE_KEY = "plantech.pushToken";

/**
 * Shared with `public/firebase-messaging-sw.js`: if foreground and background
 * handlers ever fire for the same message, the browser replaces instead of
 * duplicating the notification.
 */
const NOTIFICATION_TAG = "plantech-care-reminder";

let foregroundListenerAttached = false;

/**
 * Foreground messages are NOT displayed by Chrome automatically — the SDK hands
 * them to `onMessage` and the page must call `showNotification` itself.
 */
export async function startForegroundPushListener(): Promise<void> {
  if (foregroundListenerAttached) return;
  if (!isPushSupported() || Notification.permission !== "granted") return;
  if (!getStoredToken()) return;
  foregroundListenerAttached = true;

  try {
    const { getApps, getApp, initializeApp } = await import("firebase/app");
    const { getMessaging, onMessage } = await import("firebase/messaging");
    const config = getApps().length ? null : await resolveConfig();
    const app = config ? initializeApp(config) : getApp();
    const registration = await navigator.serviceWorker.ready;

    onMessage(getMessaging(app), (payload) => {
      const title = payload.notification?.title ?? payload.data?.["title"] ?? "Plantech";
      const body = payload.notification?.body ?? payload.data?.["body"] ?? "";
      const url =
        (payload as { fcmOptions?: { link?: string } }).fcmOptions?.link ??
        payload.data?.["url"] ??
        "/tasks";

      void registration.showNotification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: payload.data?.["tag"] ?? NOTIFICATION_TAG,
        data: { url },
      });
    });
  } catch (error) {
    foregroundListenerAttached = false;
    console.error("[push] foreground listener failed", error);
  }
}

/** Browser support check — Safari on iOS only exposes push inside an installed PWA. */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function getPushPermission(): PushPermission {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission as PushPermission;
}

/** True on iOS/iPadOS Safari, where push needs the app installed to the home screen. */
export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

async function resolveConfig(): Promise<FirebaseWebConfig> {
  const { apiKey } = await getFirebaseWebConfig();
  if (!apiKey) throw new Error("missing-firebase-api-key");
  return { apiKey, ...FIREBASE_PUBLIC_CONFIG };
}

/**
 * Requests notification permission and registers the device token.
 * MUST only be called from an explicit user gesture — never on page load.
 */
export async function enablePush(accountId: string): Promise<
  { ok: true; token: string } | { ok: false; reason: PushPermission | "error" }
> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: permission as PushPermission };
  }

  try {
    const config = await resolveConfig();
    const registration = await navigator.serviceWorker.register(serviceWorkerUrl(config), {
      scope: "/",
    });
    await navigator.serviceWorker.ready;

    const { initializeApp, getApps, getApp } = await import("firebase/app");
    const { getMessaging, getToken } = await import("firebase/messaging");

    const app = getApps().length ? getApp() : initializeApp(config);
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return { ok: false, reason: "error" };

    await registerPushToken({
      data: { accountId, token, userAgent: navigator.userAgent.slice(0, 500) },
    });
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    void startForegroundPushListener();
    return { ok: true, token };
  } catch (error) {
    console.error("[push] enable failed", error);
    return { ok: false, reason: "error" };
  }
}

/** Deletes the device token locally and server-side. */
export async function disablePush(): Promise<boolean> {
  const token = getStoredToken();
  try {
    if (isPushSupported()) {
      const { getApps, getApp } = await import("firebase/app");
      if (getApps().length) {
        const { getMessaging, deleteToken } = await import("firebase/messaging");
        await deleteToken(getMessaging(getApp())).catch(() => false);
      }
    }
    if (token) await unregisterPushToken({ data: { token } });
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    return true;
  } catch (error) {
    console.error("[push] disable failed", error);
    return false;
  }
}
