/* eslint-env serviceworker */
/* global self */
// Service worker do painel: só Web Push (sem cache offline).
self.addEventListener('push', (e) => {
  let d = { title: 'Garfeed', body: 'Novo alerta no painel' };
  try { d = { ...d, ...e.data.json() }; } catch { if (e.data) d.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: '/icon-192.png', tag: d.tag || 'gf-alerta', data: d }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins[0];
    if (w) { await w.focus(); return; }
    await self.clients.openWindow((e.notification.data && e.notification.data.url) || '/ao-vivo');
  })());
});
