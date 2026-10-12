/* Android home-screen widget: links the installed Lalabella app to the logged-in user.
   Loaded by shared/nav.js. The drawer item "Link home-screen widget" (Android only) asks widget-fast for a
   read-only widget key, then hands it to the app through an intent link (lalabella://widget?key=...). */
(function () {
  'use strict';
  if (window.LBWidget) return;
  var CFG = window.LB_CONFIG || {};
  var API = CFG.WIDGET_FAST_API || (CFG.ORDER_ASSIGN_FAST_API ? CFG.ORDER_ASSIGN_FAST_API.replace('orderassign-fast', 'widget-fast') : '');
  var PKG = 'com.mysystemlla.twa';

  function token() {
    try { return sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; }
  }
  function isAndroid() { return /Android/i.test(navigator.userAgent || ''); }

  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:86vw;background:#3a2a2e;color:#fff;padding:12px 16px;border-radius:12px;font:600 13px "Space Grotesk",system-ui,sans-serif;z-index:2147483000;box-shadow:0 8px 24px rgba(0,0,0,.25);text-align:center';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 6000);
  }

  function link() {
    var t = token();
    if (!API || !t) { toast('Please log in again.'); return; }
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_PUBLISHABLE_KEY || '' },
      body: JSON.stringify({ action: 'createKey', token: t, device: 'Android widget' })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.success || !d.key) { toast((d && d.error) || 'Could not link the widget.'); return; }
      var fallback = encodeURIComponent(location.origin + '/get-app.html');
      location.href = 'intent://widget?key=' + d.key + '#Intent;scheme=lalabella;package=' + PKG +
        ';S.browser_fallback_url=' + fallback + ';end';
      setTimeout(function () {
        if (!document.hidden) toast('Open the Lalabella app (latest version) then try again. Get it at Get App.');
      }, 3000);
    }).catch(function () { toast('No connection. Try again.'); });
  }


  // ---- tell the server what this person has already read, so the widget counts only UNREAD messages ----
  var lastSent = '';
  function readSeen() {
    try {
      var s = JSON.parse(localStorage.getItem('lbChatSeen') || '{}') || {};
      var g = Number(localStorage.getItem('lalabellaChatLastSeenId')) || 0;
      return { group: Math.max(Number(s.group) || 0, g), dm: s.dm || {}, grp: s.grp || {} };
    } catch (e) { return null; }
  }
  function syncSeen() {
    var t = token();
    if (!API || !t) return;
    var s = readSeen();
    if (!s || (!s.group && !Object.keys(s.dm).length && !Object.keys(s.grp).length)) return;
    var sig = JSON.stringify(s) + '|' + t.slice(-8);
    if (sig === lastSent) return;
    lastSent = sig;
    fetch(API, {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_PUBLISHABLE_KEY || '' },
      body: JSON.stringify({ action: 'syncSeen', token: t, seen: s })
    }).then(function (r) { return r.json(); }).then(function (d) { if (!d || !d.success) lastSent = ''; })
      .catch(function () { lastSent = ''; });
  }
  setTimeout(syncSeen, 3000);
  setInterval(function () { if (!document.hidden) syncSeen(); }, 15000);
  document.addEventListener('visibilitychange', function () { if (document.hidden) syncSeen(); });
  window.addEventListener('pagehide', syncSeen);

  window.LBWidget = { link: link, supported: isAndroid };
})();
