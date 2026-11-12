/* LALABELLA — small "Live Orders" box for the dashboards (Nov 2026).
 * Sits under the top bar and follows the branch tabs (#branchTabs): pick ModaMall on the dashboard
 * and the box shows ModaMall's orders. Data = orderassign-fast getLiveOrders (same as live-orders.html).
 * The sound / gift pop-up comes from the order bell (shared/order-bell.js), so this box stays quiet.
 */
(function () {
  'use strict';
  if (window.__lbLiveMini) return; window.__lbLiveMini = 1;
  var API = (window.LALABELLA_CONFIG && LALABELLA_CONFIG.ORDER_ASSIGN_FAST_API) || 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/orderassign-fast';
  function token() { try { return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; } }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brKey(b) { b = String(b || '').toLowerCase().replace(/[^a-z]/g, ''); return b === 'galali' ? 'qalali' : b; }
  function ago(t) { var s = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 1000)); if (s < 60) return s + 's'; if (s < 3600) return Math.round(s / 60) + ' min'; return Math.round(s / 3600) + ' h'; }

  var tabs = document.getElementById('branchTabs'); if (!tabs) return;
  var top = tabs.closest('.topbar') || tabs.parentElement;
  var css = document.createElement('style');
  css.textContent =
    '#lbLiveMini{margin:12px 0 4px;border-radius:16px;padding:12px 14px;background-image:linear-gradient(135deg,rgba(255,255,255,.94),rgba(255,246,248,.94));border:1px solid #f0d9df;box-shadow:0 8px 24px rgba(80,20,40,.10);font-family:"Space Grotesk",Arial,sans-serif;color:#2a1c22}' +
    '#lbLiveMini .h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-weight:800;font-size:14px}' +
    '#lbLiveMini .h .pill{font-size:11.5px;font-weight:800;border-radius:99px;padding:2px 9px;background:#f1e7ea;color:#2a1c22}' +
    '#lbLiveMini .h .pill.red{background:#d32f2f;color:#fff}#lbLiveMini .h .pill.new{background:#c9506b;color:#fff}' +
    '#lbLiveMini .h a{margin-left:auto;font-size:12px;font-weight:700;color:#9e2f4a;text-decoration:none}' +
    '#lbLiveMini .h .dot{width:8px;height:8px;border-radius:50%;background:#2ecc71}#lbLiveMini .h .dot.off{background:#d32f2f}' +
    '#lbLiveMini .rows{margin-top:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}' +
    '#lbLiveMini .r{border:1px solid #efe2e6;border-radius:12px;padding:8px 10px;font-size:12.5px;background:#fff}' +
    '#lbLiveMini .r.n{border-color:#e9a3ae;background:linear-gradient(90deg,#fff1f1,#fff)}' +
    '#lbLiveMini .r b{font-size:14px}#lbLiveMini .r .m{color:#7a6670;font-size:11.5px}' +
    '#lbLiveMini .bd{display:inline-block;background:#d32f2f;color:#fff;font-size:10px;font-weight:800;border-radius:5px;padding:1px 6px;margin-left:5px;animation:lbmb .7s infinite alternate}' +
    '#lbLiveMini .ok{margin-top:6px;border:0;border-radius:8px;padding:5px 10px;font:inherit;font-size:12px;font-weight:700;background:#2f7a4f;color:#fff;cursor:pointer}' +
    '#lbLiveMini .e{color:#7a6670;font-size:12.5px;margin-top:6px}' +
    '#lbLiveMini.one{padding:9px 12px}#lbLiveMini.one .rows{display:flex;overflow-x:auto;gap:8px;margin-top:6px;padding-bottom:2px}#lbLiveMini.one .r{flex:0 0 250px}' +
    '@keyframes lbmb{to{opacity:.35}}';
  document.head.appendChild(css);
  var box = document.createElement('div'); box.id = 'lbLiveMini';
  box.innerHTML = '<div class="h">🎁 Orders <span class="pill" data-br>All</span><span class="dot" data-dot></span><span data-pills></span><a href="live-orders.html">Open Live Orders →</a></div><div data-body><div class="e">Loading…</div></div>';
  top.parentNode.insertBefore(box, top.nextSibling);
  // Full-screen glass dashboards (#app = grid: top bar, KPIs, main): give the box its own short row and keep it to one line.
  function fit() {
    var par = box.parentNode, grid = getComputedStyle(par).display === 'grid';
    box.classList.toggle('one', grid);
    if (grid) { par.style.gridTemplateRows = 'auto auto auto minmax(0,1fr)'; box.style.margin = '0'; } else { par.style.gridTemplateRows = ''; box.style.margin = ''; }
  }
  fit(); window.addEventListener('resize', fit);

  function branch() { var b = tabs.querySelector('button.on'); return b ? (b.getAttribute('data-branch') || 'All') : 'All'; }
  var DATA = null;
  function render() {
    if (!DATA) return;
    var br = branch(), all = br === 'All';
    box.querySelector('[data-br]').textContent = all ? 'All branches' : br;
    var mine = function (o) { return all || brKey(o.branch) === brKey(br); };
    var un = (DATA.unassigned || []).filter(function (o) { return all || !o.branch || brKey(o.branch) === brKey(br); });
    var rows = (DATA.orders || []).filter(mine).sort(function (a, b) { var x = a.ackAt ? 1 : 0, y = b.ackAt ? 1 : 0; return x !== y ? x - y : new Date(b.assignedAt) - new Date(a.assignedAt); });
    var nNew = rows.filter(function (o) { return !o.ackAt; }).length;
    box.querySelector('[data-pills]').innerHTML = '<span class="pill' + (un.length ? ' red' : '') + '">Unassigned ' + un.length + '</span> <span class="pill' + (nNew ? ' new' : '') + '">NEW ' + nNew + '</span> <span class="pill">In branch ' + rows.length + '</span>';
    var last = DATA.unassignedUpdated ? new Date(DATA.unassignedUpdated).getTime() : 0;
    box.querySelector('[data-dot]').className = 'dot' + (!last || Date.now() - last > 300000 ? ' off' : '');
    box.querySelector('[data-dot]').title = last ? 'Tampermonkey checked ' + ago(last) + ' ago' : 'Tampermonkey not reporting';
    var html = un.slice(0, 3).map(function (o) { return '<div class="r n"><b style="color:#d32f2f">' + esc(o.orderNo) + '</b> <span class="m">unassigned</span><div class="m">' + esc(o.address || 'no address') + (o.branch ? ' → ' + esc(o.branch) : '') + '</div></div>'; }).join('') +
      rows.slice(0, 6).map(function (o) {
        var n = !o.ackAt;
        return '<div class="r' + (n ? ' n' : '') + '"><b>' + (o.source === 'bleems' ? '🌸 ' : '') + esc(o.orderNo) + '</b>' + (n ? '<span class="bd">NEW</span>' : '') + (all ? ' <span class="m">· ' + esc(o.branch) + '</span>' : '') +
          '<div>' + esc(o.receiver || o.sender || '') + (o.price ? ' · <b style="font-size:12.5px">' + esc(o.price) + '</b>' : '') + '</div>' +
          '<div class="m">' + esc(o.method || '') + ' · ' + esc(o.date || '') + ' ' + esc(o.time || '') + ' · given ' + ago(o.assignedAt) + ' ago</div>' +
          (n ? '<button class="ok" data-ack="' + esc(o.id) + '">✓ Nakita ko</button>' : '<div class="m" style="color:#2f7a4f">' + (o.ackBy === 'Accepted on web' ? '✓ Accepted on web' : '✓ Seen' + (o.ackBy ? ' by ' + esc(o.ackBy) : '')) + '</div>') + '</div>';
      }).join('');
    box.querySelector('[data-body]').innerHTML = html ? '<div class="rows">' + html + '</div>' + (rows.length > 6 ? '<div class="e">+ ' + (rows.length - 6) + ' more — open Live Orders</div>' : '') : '<div class="e">No orders for ' + esc(all ? 'any branch' : br) + ' right now.</div>';
  }
  var busy = false;
  function load() {
    if (busy || !token()) return; busy = true;
    fetch(API + '?action=getLiveOrders&token=' + encodeURIComponent(token()) + '&_=' + Date.now()).then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.success) { DATA = d; render(); } }).catch(function () {}).then(function () { busy = false; });
  }
  box.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ack]'); if (!b) return; b.disabled = true;
    var q = new URLSearchParams({ action: 'ackLiveOrder', id: b.getAttribute('data-ack'), token: token() });
    fetch(API, { method: 'POST', body: q }).then(load, load);
  });
  tabs.addEventListener('click', function () { setTimeout(render, 0); });
  load(); setInterval(function () { if (!document.hidden) load(); }, 10000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
})();
