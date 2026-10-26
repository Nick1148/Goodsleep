// 우리의 하루 - 푸시 서비스워커
// 오프라인 지원: 화면(HTML)은 네트워크 우선 + 실패 시 캐시, 해시가 붙은 정적 파일은 캐시 우선.
// Supabase 등 다른 출처 요청과 GET 이 아닌 요청은 건드리지 않는다.
const CACHE = "goodsleep-v2";
const PRECACHE = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png", "/seal.jpg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/", copy)); }
        return res;
      }).catch(() => caches.match("/").then((r) => r || Response.error()))
    );
    return;
  }

  const isStatic = url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname);
  if (!isStatic) return;
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});

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
