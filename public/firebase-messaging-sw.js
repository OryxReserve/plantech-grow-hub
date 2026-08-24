/* eslint-disable no-undef */
/**
 * Messaging-only service worker (Firebase Cloud Messaging).
 *
 * This worker is NOT an app-shell cache: it never intercepts navigations and
 * never stores responses in Cache Storage. Any future offline worker must live
 * at a different path and leave this one untouched.
 *
 * The Firebase web config is public, but it is passed in as query params at
 * registration time so this static file never has to be rewritten per project.
 */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const params = new URL(self.location.href).searchParams;
const config = {
  apiKey: params.get("apiKey") || "",
  authDomain: params.get("authDomain") || "",
  projectId: params.get("projectId") || "",
  storageBucket: params.get("storageBucket") || "",
  messagingSenderId: params.get("messagingSenderId") || "",
  appId: params.get("appId") || "",
};

if (config.projectId && config.apiKey) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || "Plantech";
    const body = payload.notification?.body || payload.data?.body || "";
    const url = payload.fcmOptions?.link || payload.data?.url || "/tasks";

    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.data?.tag || "plantech-care-reminder",
      data: { url },
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/tasks";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
