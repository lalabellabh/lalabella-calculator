/* ==========================================================
   LALABELLA BRAIN — the system "core" (client side)
   Loaded once by shared/nav.js on every page. Shows reminders and
   smart alerts as small banners at the top of the page.

   WHERE THINGS COME FROM
   • Reminders typed by an admin in User Management → Reminders
   • Auto rules that live on the server (supabase function
     "brain-fast", list named RULES)  — add one entry there to teach
     the system a new check
   • Rules/alerts registered from the browser (see below)

   FOR DEVELOPERS (all optional, from any page script):
     LBBrain.notify({ id:'my-alert', text:'Something happened', link:'page.html', linkText:'Open' })
     LBBrain.register({ id:'low-stock', run: async ctx => ({ text:'…', link:'…' }) | null })
         ctx = { user, isAdmin, today:'YYYY-MM-DD', token }
     LBBrain.refresh()            // re-check now
   Banners can be dismissed: "Got it" (reminders — remembered on the
   server) or "Later" (hidden until tomorrow on this device).
   ========================================================== */
(function () {
  if (window.LBBrain) return;
  var API = window.LB_CONFIG && LB_CONFIG.BRAIN_API;
  if (!API) return;

  function token() {
    return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || '';
  }
  function me() {
    try { return JSON.parse(sessionStorage.getItem('lalabellaUser') || localStorage.getItem('lalabellaUser') || '{}') || {}; } catch (e) { return {}; }
  }
  function todayStr() {
    var d = new Date(Date.now() + 3 * 3600 * 1000);          // Bahrain date
    return d.toISOString().slice(0, 10);
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  var CACHE_KEY = 'lbBrainCache', CACHE_MS = 5 * 60 * 1000;
  var localRules = [], localItems = [], shown = {};

  // ---------- UI ----------
  function css() {
    if (document.getElementById('lbBrainCss')) return;
    var s = document.createElement('style'); s.id = 'lbBrainCss';
    s.textContent =
      '#lbBrain{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:9990;width:min(560px,calc(100% - 24px));display:flex;flex-direction:column;gap:8px;pointer-events:none;font-family:"Space Grotesk",system-ui,sans-serif}' +
      '.lbb{pointer-events:auto;background:#fff;border:1px solid #f0dede;border-left:4px solid #d9a441;border-radius:14px;box-shadow:0 10px 30px rgba(47,32,36,.18);padding:12px 14px;display:flex;gap:10px;align-items:flex-start;animation:lbbIn .3s ease}' +
      '@keyframes lbbIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}' +
      '.lbb .ic{font-size:18px;line-height:1.3}' +
      '.lbb .tx{flex:1;font-size:13px;line-height:1.45;color:#2f2024;word-break:break-word}' +
      '.lbb .bt{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}' +
      '.lbb .bt a,.lbb .bt button{border:0;border-radius:9px;padding:7px 11px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;text-decoration:none}' +
      '.lbb .bt a{background:linear-gradient(135deg,#c9506b,#9e2f4a);color:#fff}' +
      '.lbb .bt button{background:#f6eeee;color:#9e2f4a}' +
      '@media(prefers-color-scheme:dark){.lbb{background:#2a1e22;border-color:#4a3338;color:#fff}.lbb .tx{color:#f4e8ea}.lbb .bt button{background:#3a2a2f;color:#f1c3cd}}' +
      'html[data-theme="dark"] .lbb{background:#2a1e22;border-color:#4a3338}html[data-theme="dark"] .lbb .tx{color:#f4e8ea}';
    document.head.appendChild(s);
  }
  function host() {
    var h = document.getElementById('lbBrain');
    if (!h) { h = document.createElement('div'); h.id = 'lbBrain'; document.body.appendChild(h); }
    return h;
  }
  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }

  function laterKey(id) { return 'lbBrainLater:' + id; }
  function hiddenToday(id) { return lsGet(laterKey(id)) === todayStr(); }

  function ack(item, el) {
    el.remove();
    if (item.ackable) {
      var body = new URLSearchParams({ action: 'ack', token: token(), id: item.id });
      fetch(API, { method: 'POST', body: body }).catch(function () {});
      try { sessionStorage.removeItem(CACHE_KEY); } catch (e) {}
    }
  }
  function render(items) {
    css();
    var h = host();
    items.forEach(function (it) {
      if (!it || !it.id || !it.text || shown[it.id] || hiddenToday(it.id)) return;
      shown[it.id] = true;
      var el = document.createElement('div'); el.className = 'lbb'; el.dataset.id = it.id;
      var link = it.link && /^[A-Za-z0-9._\/-]+(\?[^"<>\s]*)?(#[A-Za-z0-9_-]*)?$/.test(it.link) ? it.link : '';
      el.innerHTML = '<div class="ic">' + (it.ackable ? '🔔' : '💡') + '</div><div class="tx">' + esc(it.text) + '<div class="bt">' +
        (link ? '<a href="' + esc(link) + '">' + esc(it.linkText || 'Open') + '</a>' : '') +
        (it.ackable ? '<button type="button" data-a="got">Got it</button>' : '') +
        '<button type="button" data-a="later">Later</button></div></div>';
      el.querySelector('[data-a="later"]').addEventListener('click', function () { lsSet(laterKey(it.id), todayStr()); el.remove(); });
      var g = el.querySelector('[data-a="got"]'); if (g) g.addEventListener('click', function () { ack(it, el); });
      h.appendChild(el);
    });
  }

  // ---------- data ----------
  async function fetchServer() {
    var raw = ssGet(CACHE_KEY);
    if (raw) { try { var c = JSON.parse(raw); if (c && Date.now() - c.t < CACHE_MS && c.tok === token()) return c.items || []; } catch (e) {} }
    try {
      var res = await fetch(API + '?action=due&token=' + encodeURIComponent(token()));
      var d = await res.json();
      if (!d || !d.success) return [];
      ssSet(CACHE_KEY, JSON.stringify({ t: Date.now(), tok: token(), items: d.items || [] }));
      return d.items || [];
    } catch (e) { return []; }
  }
  async function runLocal() {
    var u = me(), ctx = { user: u, isAdmin: String(u.role || '').toLowerCase() === 'admin', today: todayStr(), token: token() };
    var out = [];
    for (var i = 0; i < localRules.length; i++) {
      try { var it = await localRules[i].run(ctx); if (it) { it.id = it.id || ('local:' + localRules[i].id); out.push(it); } } catch (e) {}
    }
    return out;
  }
  async function refresh() {
    if (!token()) return;
    var all = [].concat(await fetchServer(), await runLocal(), localItems);
    render(all);
  }

  window.LBBrain = {
    notify: function (item) { if (!item || !item.id || !item.text) return; localItems.push(item); css(); if (document.body) render([item]); },
    register: function (rule) { if (rule && rule.id && typeof rule.run === 'function') localRules.push(rule); },
    refresh: function () { shown = {}; var h = document.getElementById('lbBrain'); if (h) h.innerHTML = ''; try { sessionStorage.removeItem(CACHE_KEY); } catch (e) {} return refresh(); }
  };

  // First check a moment after the page is up (the login token may still be verifying),
  // and again whenever a different user signs in.
  function start() { setTimeout(refresh, 1500); }
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
  window.addEventListener('lb:user-changed', function () { try { sessionStorage.removeItem(CACHE_KEY); } catch (e) {} shown = {}; setTimeout(refresh, 800); });
})();
