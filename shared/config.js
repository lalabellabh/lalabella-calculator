/**
 * LALABELLA CONFIG — the ONE place for every backend URL.
 * Every page loads this first (before auth-guard.js).
 * All backends are Supabase Edge Functions now. The old Google Apps Script
 * links were removed (security audit 2026-11-10) — do not add them back.
 */
window.LB_CONFIG = Object.freeze({
  SESSION_KEEP_API: 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/sessionkeep-fast',
  AUTH_FAST_API:    'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/auth-fast',
  // Profile page extras (Team Status + Gallery pictures, saved as files in Storage). If a call to it fails with a server
  // error, profile.html automatically retries the same call on AUTH_FAST_API. To switch it off, delete this one line.
  PROFILE_FAST_API: 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/profile-fast',
  // Video status (30 sec / 40 MB, auto-deleted after 24 h) is built and ready on the server but switched OFF.
  // To turn it on later (best on a paid Supabase plan), change false to true.
  STATUS_VIDEO: false,
  CHOCOLATE_FAST_API: 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/chocolate-fast',
  CHOCOLATE_BB_API: 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/chocolate-bb',   // best-before date of saved lists/displays
  FLOWER_FAST_API:  'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/flower-fast',
  // Flower Admin: Fix an existing flower item (rename, unit, rate, min stock, active) — Admin only.
  // Flower Photos page: photo per flower + add a new flower (Admin only).
  FLOWER_PHOTO_API: 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/flowerphoto-fast',
  FLOWER_FIX_API:   'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/flowerfix-fast',
  // Fast path (Supabase Edge Function) — full Item Inventory module.
  // Photos now upload to Supabase Storage (bucket "item-photos") instead
  // of Google Drive; older Drive-linked photos still resolve fine.
  ITEM_FAST_API:    'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/item-fast',
  ORDER_ASSIGN_FAST_API: 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/orderassign-fast',
  ORDER_FORM_FAST_API: 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/orderform-fast',
  NOTES_FAST_API:   'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/notes-fast',
  SCHEDULE_FAST_API: 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/schedule-fast',
  PETTY_CASH_FAST_API: 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/pettycash-fast',
  CHOC_PHOTO_FAST_API: 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/chocphoto-fast',
  NOVA_FAST_API:    'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/nova-fast',
  // System "brain": reminders + smart alerts (shared/brain.js, User Management → Reminders).
  BRAIN_API:        'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/brain-fast',
  // System Health page (admin only, read-only report).
  HEALTH_API:       'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/health-fast',
  BACKUP_API:       'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/backup-fast',
  // Activity History (audit log) — Admin with User Management access only.
  AUDIT_API:        'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/audit-fast',
  // Attendance (time in / break / time out with GPS + fingerprint).
  ATTENDANCE_API:   'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/attendance-fast',
  // Delivery tracking (admin assigns an order to a driver, driver's phone sends GPS, admin sees the map).
  DELIVERY_API:     'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/delivery-fast',

  // Supabase (fast path). The publishable key is MEANT to be public: the
  // browser still cannot read or write any table (no grants + RLS) — it is
  // only used to listen for "new chat message" pings from Realtime.
  SUPABASE_URL:     'https://zoratiahjeldgsognfsj.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_nGSHoJFQvFB1_DarkVr4rQ_3E-d_R42',
  CHAT_API:         'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/chat'
});

// Bug History: load the small error reporter on every page (never blocks the page).
(function () {
  try {
    var cs = document.currentScript, base = cs && cs.src ? cs.src.replace(/config\.js(\?.*)?$/, '') : 'shared/';
    var s = document.createElement('script'); s.src = base + 'error-report.js'; s.async = true;
    (document.head || document.documentElement).appendChild(s);
    // Season themes (Undas / Christmas look + menu sounds), see shared/season.js
    var t = document.createElement('script'); t.src = base + 'season.js'; t.async = true;
    (document.head || document.documentElement).appendChild(t);
  } catch (e) {}
})();

// Branch confirmation before a save (every page that loads this file).
// A save that carries a branch (receiving, release, transfer, stock count, initial stock, sales, petty cash, item moves...)
// first shows which branch it goes to; Cancel = nothing is sent. If that branch has no starting stock yet for that
// module (no flower stock count / no chocolate initial stock / no item count) the box also warns about it.
// Once confirmed, the same save + branch is not asked again for 2 minutes (so "Save all" asks only once).
(function () {
  if (window.__lbBranchConfirm || !window.fetch) return; window.__lbBranchConfirm = true;
  var WRITE = /^(addEntry|addInitialStock|addNewItem|addSale|addPettyCashEntry|addCashCount|saveReceiving|saveRelease|saveTransfer|saveStockCount|saveCountSession|saveNovaCount|saveDisplay|receiveItem|releaseItem|transferItem|fulfillFlowerArrangement|setPettyCashBalance)$/;
  var LABEL = { addEntry: 'Receiving', addInitialStock: 'Initial stock', addNewItem: 'New item', addSale: 'Sales', addPettyCashEntry: 'Petty cash', addCashCount: 'Cash count',
    saveReceiving: 'Flower receiving', saveRelease: 'Chocolate release', saveTransfer: 'Flower transfer', saveStockCount: 'Flower stock count', saveCountSession: 'Chocolate stock count',
    saveNovaCount: 'Item stock count', saveDisplay: 'Display', receiveItem: 'Item receiving', releaseItem: 'Item release', transferItem: 'Item transfer',
    fulfillFlowerArrangement: 'Arrangement (flowers used)', setPettyCashBalance: 'Petty cash balance' };
  var orig = window.fetch.bind(window), okAt = {}, pending = {};
  function readParams(input, init) {
    var p = new URLSearchParams(), url = typeof input === 'string' ? input : (input && input.url) || '';
    try { new URL(url, location.href).searchParams.forEach(function (v, k) { p.set(k, v); }); } catch (e) {}
    var b = init && init.body;
    try {
      if (b instanceof URLSearchParams) b.forEach(function (v, k) { p.set(k, v); });
      else if (typeof FormData !== 'undefined' && b instanceof FormData) b.forEach(function (v, k) { if (typeof v === 'string') p.set(k, v); });
      else if (typeof b === 'string') {
        if (/^\s*\{/.test(b)) { var o = JSON.parse(b); Object.keys(o).forEach(function (k) { if (typeof o[k] !== 'object') p.set(k, String(o[k])); }); }
        else new URLSearchParams(b).forEach(function (v, k) { p.set(k, v); });
      }
    } catch (e) {}
    return { p: p, url: url };
  }
  function moduleOf(url, action) {
    if (/flower-fast/.test(url) && /^(saveReceiving|saveTransfer|fulfillFlowerArrangement)$/.test(action)) return 'flower';
    if (/chocolate-fast/.test(url) && /^(addEntry|saveRelease)$/.test(action)) return 'chocolate';
    if (/item-fast/.test(url) && /^(receiveItem|releaseItem|transferItem)$/.test(action)) return 'item';
    return '';
  }
  function token() { try { return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; } }
  var startCache = {};
  function startCheck(branch) {
    if (startCache[branch]) return startCache[branch];
    var api = (window.LB_CONFIG && LB_CONFIG.SUPABASE_URL ? LB_CONFIG.SUPABASE_URL : 'https://zoratiahjeldgsognfsj.supabase.co') + '/functions/v1/branch-start';
    var pr = orig(api, { method: 'POST', body: new URLSearchParams({ branch: branch, token: token() }) }).then(function (r) { return r.json(); }).catch(function () { return null; });
    pr = Promise.race([pr, new Promise(function (res) { setTimeout(function () { res(null); }, 2500); })]);
    startCache[branch] = pr; setTimeout(function () { delete startCache[branch]; }, 60000);
    return pr;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ask(action, branch, toBranch, mod) {
    return (mod ? startCheck(branch) : Promise.resolve(null)).then(function (st) {
      return new Promise(function (resolve) {
        var warn = '';
        if (st && st.success) {
          if (mod === 'flower' && !st.flower) warn = branch + ' has no Flower Stock Count yet. The stock will only show what is received from now on. Please do a Flower Stock Count for ' + branch + ' first.';
          if (mod === 'chocolate' && !st.chocolate) warn = branch + ' has no chocolate Initial Stock yet. Please enter the Initial Stock for ' + branch + ' first.';
          if (mod === 'item' && !st.item) warn = branch + ' has no Item Inventory stock count yet. Please count the items of ' + branch + ' first.';
        }
        var wrap = document.createElement('div');
        wrap.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;background:rgba(30,15,20,.45);display:flex;align-items:center;justify-content:center;padding:16px;font-family:"Space Grotesk",system-ui,sans-serif');
        wrap.innerHTML = '<div role="dialog" aria-modal="true" style="background:#fff;color:#2f2024;border-radius:18px;max-width:380px;width:100%;padding:20px 20px 16px;box-shadow:0 20px 50px rgba(0,0,0,.25);text-align:center">'
          + '<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a7078;font-weight:700">' + esc(LABEL[action] || 'Save') + ' — confirm branch</div>'
          + '<div style="font-size:13px;margin:10px 0 4px;color:#8a7078">This will be saved to</div>'
          + '<div style="font-size:26px;font-weight:800;color:#9e2f4a;line-height:1.2">' + esc(branch) + (toBranch ? ' <span style="color:#8a7078;font-size:18px">→</span> ' + esc(toBranch) : '') + '</div>'
          + (warn ? '<div style="margin:12px 0 0;padding:10px 12px;border-radius:12px;background:#fff4e5;color:#8a4b00;font-size:12.5px;text-align:left;line-height:1.4">⚠️ ' + esc(warn) + '</div>' : '')
          + '<div style="display:flex;gap:8px;margin-top:16px"><button type="button" data-no style="flex:1;padding:12px;border-radius:12px;border:1px solid #efdfde;background:#fff;color:#2f2024;font:700 14px inherit;cursor:pointer">Cancel</button>'
          + '<button type="button" data-yes style="flex:1.4;padding:12px;border-radius:12px;border:0;background:linear-gradient(135deg,#c9506b,#9e2f4a);color:#fff;font:700 14px inherit;cursor:pointer">Yes, save to ' + esc(branch) + '</button></div></div>';
        function done(v) { try { document.removeEventListener('keydown', onKey, true); wrap.remove(); } catch (e) {} resolve(v); }
        function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); done(false); } }
        wrap.querySelector('[data-no]').onclick = function () { done(false); };
        wrap.querySelector('[data-yes]').onclick = function () { done(true); };
        wrap.addEventListener('click', function (e) { if (e.target === wrap) done(false); });
        document.addEventListener('keydown', onKey, true);
        (document.body || document.documentElement).appendChild(wrap);
        setTimeout(function () { var y = wrap.querySelector('[data-yes]'); if (y) y.focus(); }, 30);
      });
    });
  }
  window.fetch = function (input, init) {
    try {
      var r = readParams(input, init), action = r.p.get('action') || '';
      if (WRITE.test(action) && !/branch-start/.test(r.url)) {
        var branch = (r.p.get('branch') || r.p.get('fromBranch') || '').trim(), to = (r.p.get('toBranch') || '').trim();
        if (branch && branch !== 'All') {
          var key = action + '|' + branch + '|' + to;
          if (!(okAt[key] && Date.now() - okAt[key] < 120000)) {
            if (!pending[key]) pending[key] = ask(action, branch, to, moduleOf(r.url, action)).then(function (yes) { delete pending[key]; if (yes) okAt[key] = Date.now(); return yes; });
            return pending[key].then(function (yes) {
              if (!yes) return new Response(JSON.stringify({ success: false, cancelled: true, error: 'Not saved: branch not confirmed.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              return orig(input, init);
            });
          }
        }
      }
    } catch (e) {}
    return orig(input, init);
  };
})();

// "Open" from the dashboard Check list: ?branch=<name> selects that branch tab on the page (pages with .branch-tab buttons).
(function () {
  try {
    var b = new URLSearchParams(location.search).get('branch'); if (!b) return;
    var tries = 0, t = setInterval(function () {
      var btn = document.querySelector('.branch-tab[data-branch="' + b.replace(/"/g, '') + '"], #branchTabs [data-branch="' + b.replace(/"/g, '') + '"]');
      if (btn || ++tries > 40) { clearInterval(t); if (btn && !btn.classList.contains('active') && !btn.classList.contains('on')) btn.click(); }
    }, 250);
  } catch (e) {}
})();

// A tapped phone notification asks the open app window to go to its page (sw.js 'lb-go'), so an order alert never just
// re-opens the last page (e.g. the chat).
(function () {
  try {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.type !== 'lb-go' || !d.url) return;
      var u = new URL(d.url, location.href);
      if (u.origin !== location.origin) return;
      if (u.pathname + u.search !== location.pathname + location.search) location.href = u.href;
    });
  } catch (e) {}
})();
