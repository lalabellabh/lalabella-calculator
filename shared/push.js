/* Push notifications: new chat messages and new unassigned orders reach this device even when the app is closed.
   Loaded by shared/nav.js. Shows a small "Turn on notifications" bar once (per device); after Allow, it quietly
   keeps this device registered for whoever is logged in. iPhone: only works from the Home Screen app (iOS 16.4+). */
(function () {
  'use strict';
  if (window.LBPush) return;
  var CFG = window.LB_CONFIG || {};
  var API = CFG.PUSH_FAST_API || (CFG.ORDER_ASSIGN_FAST_API ? CFG.ORDER_ASSIGN_FAST_API.replace('orderassign-fast', 'push-fast') : '');
  if (!API) return;
  var EP_KEY = 'lbPushEndpoint', DISMISS_KEY = 'lbPushDismiss';

  function token() {
    try { return sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; }
  }
  function call(body, keepalive) {
    return fetch(API, {
      method: 'POST', keepalive: !!keepalive,
      headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_PUBLISHABLE_KEY || '' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }
  function supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }
  function b64ToBytes(s) {
    var pad = '='.repeat((4 - s.length % 4) % 4);
    var raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  // Hand the service worker what it needs to send a reply typed inside a notification (same origin only).
  function idbOpen(cb) {
    try {
      var r = indexedDB.open('lbsw', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { cb(r.result); };
      r.onerror = function () {};
    } catch (e) {}
  }
  function saveCreds() {
    var t = token();
    if (!t || !CFG.CHAT_API) return;
    idbOpen(function (db) {
      try { db.transaction('kv', 'readwrite').objectStore('kv').put({ token: t, chatApi: CFG.CHAT_API, apikey: CFG.SUPABASE_PUBLISHABLE_KEY || '' }, 'creds'); } catch (e) {}
    });
  }
  function clearCreds() { idbOpen(function (db) { try { db.transaction('kv', 'readwrite').objectStore('kv').delete('creds'); } catch (e) {} }); }

  // Register (or refresh) this device for the logged-in user.
  function subscribe() {
    var t = token();
    if (!t || !supported() || Notification.permission !== 'granted') return Promise.resolve(false);
    saveCreds();
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription().then(function (sub) {
        if (sub) return sub;
        return call({ action: 'vapidKey', token: t }).then(function (k) {
          if (!k || !k.publicKey) throw new Error('no key');
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(k.publicKey) });
        });
      });
    }).then(function (sub) {
      return call({ action: 'subscribe', token: t, subscription: sub.toJSON() }).then(function (r) {
        if (r && r.success) { try { localStorage.setItem(EP_KEY, sub.endpoint); } catch (e) {} }
        return !!(r && r.success);
      });
    }).catch(function () { return false; });
  }

  // Called by logout: stop sending the previous user's notifications to this device.
  function off() {
    var t = token(), ep = '';
    clearCreds();
    try { ep = localStorage.getItem(EP_KEY) || ''; localStorage.removeItem(EP_KEY); } catch (e) {}
    if (t && ep) { try { call({ action: 'unsubscribe', token: t, endpoint: ep }, true).catch(function () {}); } catch (e) {} }
  }

  function hide() { var b = document.getElementById('lbpush-bar'); if (b) b.remove(); }
  function show(msg, buttonLabel, onClick, dismissible) {
    if (document.getElementById('lbpush-bar') || !document.body) return;
    var bar = document.createElement('div');
    bar.id = 'lbpush-bar';
    bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:72px;z-index:2147482900;display:flex;gap:10px;align-items:center;background:#1a0f12;color:#f7eee5;border:1px solid rgba(230,196,122,.4);border-radius:14px;padding:10px 14px;font:14px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4);max-width:calc(100vw - 24px)';
    bar.innerHTML = '<span>' + msg + '</span>' +
      (buttonLabel ? '<button id="lbpush-yes" style="background:#c9506b;color:#fff;border:0;border-radius:8px;padding:7px 14px;cursor:pointer;white-space:nowrap">' + buttonLabel + '</button>' : '') +
      (dismissible ? '<button id="lbpush-no" aria-label="Close" style="background:none;color:#b39a98;border:0;font-size:18px;cursor:pointer">✕</button>' : '');
    document.body.appendChild(bar);
    var y = document.getElementById('lbpush-yes'); if (y) y.onclick = onClick;
    var n = document.getElementById('lbpush-no');
    if (n) n.onclick = function () { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {} hide(); };
  }

  function ask() {
    Notification.requestPermission().then(function (perm) {
      hide();
      if (perm === 'granted') subscribe().then(function (ok) {
        if (ok) call({ action: 'test', token: token() }).catch(function () {});
      });
    });
  }

  function init() {
    if (!token() || !supported()) return;
    var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (Notification.permission === 'granted') { subscribe(); return; }
    if (Notification.permission === 'denied') return;
    if (isIOS && !standalone) return; // iOS only allows push from the Home Screen app
    var dismissed = 0; try { dismissed = Number(localStorage.getItem(DISMISS_KEY)) || 0; } catch (e) {}
    if (dismissed && Date.now() - dismissed < 7 * 86400000) return;
    setTimeout(function () { show('🔔 Get notified of new messages and orders?', 'Turn on', ask, true); }, 2500);
  }

  window.LBPush = { subscribe: subscribe, off: off, enable: ask };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
