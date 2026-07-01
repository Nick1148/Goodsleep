// 우리의 하루 - 푸시 서비스워커
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  let payload = { title: "우리의 하루", body: "" };
  try { if (event.data) payload = { ...payload, ...event.data.json() }; } catch (e) {}
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [80, 40, 80],
    data: { url: "/" },
    tag: payload.tag || "goodsleep",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(payload.title || "우리의 하루", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
