/**
 * FCM HTTP v1 sender for the Cloudflare Workers runtime.
 *
 * The OAuth access token is minted from the service account with a JWT signed
 * through Web Crypto (RS256) — `firebase-admin` is Node-only and cannot run
 * here. Credentials come from FCM_PROJECT_ID / FCM_CLIENT_EMAIL /
 * FCM_PRIVATE_KEY and never reach the client bundle.
 */

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

export type PushMessage = {
  title: string;
  body: string;
  /** Relative path opened when the notification is clicked. */
  link?: string;
  data?: Record<string, string>;
};

export type PushSendResult =
  | { ok: true; messageId: string }
  | { ok: false; stale: boolean; status: number; error: string };

type ServiceAccount = { projectId: string; clientEmail: string; privateKey: string };

function readServiceAccount(): ServiceAccount {
  const projectId = process.env["FCM_PROJECT_ID"];
  const clientEmail = process.env["FCM_CLIENT_EMAIL"];
  const privateKey = process.env["FCM_PRIVATE_KEY"];
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing FCM service account configuration");
  }
  return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
}

function base64Url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: FCM_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(account.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!response.ok || !payload.access_token) {
    throw new Error(`FCM token exchange failed (${response.status})`);
  }

  cachedToken = {
    value: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600),
  };
  return cachedToken.value;
}

/**
 * Sends one push message to one device token.
 *
 * `stale: true` means the token is gone (UNREGISTERED / NOT_FOUND / invalid
 * argument) and the caller should delete the `push_subscriptions` row. Token
 * cleanup itself belongs to the reminder job (Phase 3.3).
 */
export async function sendPushToToken(
  token: string,
  message: PushMessage,
): Promise<PushSendResult> {
  const account = readServiceAccount();
  const accessToken = await getAccessToken(account);

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: message.title, body: message.body },
          ...(message.data ? { data: message.data } : {}),
          webpush: {
            // High urgency + explicit TTL keeps delivery prompt on devices with
            // aggressive battery saving, and drops the message after an hour
            // instead of showing a stale reminder.
            headers: { Urgency: "high", TTL: "3600" },
            notification: {
              icon: "/icons/icon-192.png",
              badge: "/icons/icon-192.png",
              tag: "plantech-care-reminder",
            },
            fcmOptions: { link: message.link ?? "/tasks" },
          },
        },
      }),
    },
  );

  const raw = await response.text();
  if (response.ok) {
    const parsed = JSON.parse(raw) as { name?: string };
    return { ok: true, messageId: parsed.name ?? "" };
  }

  let errorStatus = "";
  try {
    errorStatus =
      ((JSON.parse(raw) as { error?: { status?: string; message?: string } }).error?.status ??
        "") || "";
  } catch {
    errorStatus = "";
  }

  const stale =
    response.status === 404 ||
    errorStatus === "NOT_FOUND" ||
    errorStatus === "UNREGISTERED" ||
    (response.status === 400 && /registration-token|not a valid FCM/i.test(raw));

  console.error("[fcm] send failed", response.status, errorStatus);
  return { ok: false, stale, status: response.status, error: errorStatus || raw.slice(0, 300) };
}
