/* Lalabella service worker — network-first, so uploads show up right away (no stale pages).
   Cache is only a fallback when offline. Only same-origin GET requests are touched;
   Supabase / API calls always go straight to the network. */
const CACHE = 'lalabella-v2';

// ---- tiny key/value store for the quick-reply credentials (written by shared/push.js) ----
function idb() {
  return new Promise((res, rej) => { const r = indexedDB.open('lbsw', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function kvGet(k) {
  try { const db = await idb(); return await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (x) { return null; }
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(new Request('/offline.html', { cache: 'reload' }))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() =>
      caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/offline.html') : Response.error()))
    )
  );
});

// ---------- Push notifications (sent by push-fast) ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'Lalabella';
  const opts = {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || 'index.html', reply: d.reply || null }
  };
  // chat messages get a "Reply" box (type:'text' works on Android Chrome; elsewhere it is just a button that opens the chat)
  if (d.reply) opts.actions = [{ action: 'reply', type: 'text', title: 'Reply', placeholder: 'Type a reply…' }];
  e.waitUntil(self.registration.showNotification(title, opts));
});

async function quickReply(n, text) {
  const target = n.data && n.data.reply;
  const creds = await kvGet('creds');
  const msg = String(text || '').trim().slice(0, 1000);
  if (!target || !creds || !creds.token || !creds.chatApi || !msg) return false;
  const body = { action: 'send', token: creds.token, text: msg };
  if (target.peerId) body.peerId = target.peerId; else if (target.groupId) body.groupId = target.groupId; else if (!target.team) return false;   // never guess: only a Team notification may reply to Team
  try {
    const r = await fetch(creds.chatApi, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: creds.apikey || '' }, body: JSON.stringify(body) });
    const j = await r.json();
    return !!(j && j.success);
  } catch (x) { return false; }
}

self.addEventListener('notificationclick', (e) => {
  const n = e.notification;
  if (e.action === 'reply' && e.reply) {
    // answer straight from the notification; if it fails, open the chat so nothing is lost
    e.waitUntil(quickReply(n, e.reply).then((ok) => {
      if (ok) {
        n.close();
        return self.registration.showNotification('Sent ✓', { body: String(e.reply).slice(0, 100), icon: '/icons/icon-192.png', tag: n.tag || 'lb-reply', renotify: false, silent: true, data: n.data })
          .then(() => setTimeout(() => self.registration.getNotifications({ tag: n.tag || 'lb-reply' }).then((l) => l.forEach((x) => x.close())), 4000));
      }
      return openTarget(n);
    }));
    return;
  }
  e.waitUntil(openTarget(n));
});

function openTarget(n) {
  n.close();
  const target = new URL((n.data && n.data.url) || 'index.html', self.location.origin).href;
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url === target && 'focus' in c) return c.focus();
    }
    for (const c of list) {
      if ('navigate' in c && 'focus' in c) return c.navigate(target).then((x) => x && x.focus());
    }
    return self.clients.openWindow(target);
  });
}
