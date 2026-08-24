/**
 * Public Firebase web configuration.
 *
 * These values are safe in the client bundle by design (Firebase web configs
 * are public identifiers). Only the `apiKey` is resolved at runtime from the
 * server, because it is stored as a project secret.
 */
export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

export const FIREBASE_PUBLIC_CONFIG = {
  authDomain: "plantech-app.firebaseapp.com",
  projectId: "plantech-app",
  storageBucket: "plantech-app.firebasestorage.app",
  messagingSenderId: "789247288246",
  appId: "1:789247288246:web:f1019ed3aed34846ce1717",
} as const;

export const FIREBASE_VAPID_KEY =
  "BC8C3pz6LETo1UpChNEcI3INGwdok69C47eCe0wsBxcxVKkabJVkZF20Yi8Ql-57uaY8Q4NQM0tqjoPAMiT_30E";

/** Query string used to hand the public config to the messaging service worker. */
export function serviceWorkerUrl(config: FirebaseWebConfig): string {
  const params = new URLSearchParams(config as unknown as Record<string, string>);
  return `/firebase-messaging-sw.js?${params.toString()}`;
}
