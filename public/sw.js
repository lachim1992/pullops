/* PullOps push service worker — messaging only, no app-shell caching. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (_e) {
      data = { title: "PullOps", body: event.data.text() };
    }
  }
  const title = data.title || "PullOps";
  const options = {
    body: data.body || "",
    icon: "/icon-512.png",
    badge: "/icon-512.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || "/dashboard" },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        try {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        } catch (_e) {
          /* ignore */
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
