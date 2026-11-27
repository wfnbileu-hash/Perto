self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const clientsAtivos = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const cliente of clientsAtivos) {
      if ("focus" in cliente) return cliente.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow("/");
  })());
});
