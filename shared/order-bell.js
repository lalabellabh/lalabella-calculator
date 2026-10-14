/* Floating "Unassigned Orders" bell — loaded by shared/nav.js on every page.
   Same bell as the one on the home / Flower Tools / Item Inventory pages (those keep their own,
   so this one steps aside when it finds #lalaBellBtn). Drag it anywhere; it remembers where you left it.
   Shows each unassigned order, the branch the assistant picked, or "For manual assign" when it could not decide. */
(function () {
  'use strict';
  if (window.LBOrderBell || document.getElementById('lalaBellBtn') || document.getElementById('lbob-btn')) return;
  window.LBOrderBell = true;
  var CFG = window.LB_CONFIG || {};
  var API = CFG.ORDER_ASSIGN_FAST_API;
  if (!API) return;
  var POS_KEY = 'lbOrderBellPos';

  function token() {
    try { return sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; }
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var css = document.createElement('style');
  css.textContent =
    '#lbob-btn{position:fixed;top:16px;right:16px;z-index:9300;width:44px;height:44px;border-radius:50%;border:0;cursor:grab;touch-action:none;' +
    'background:linear-gradient(135deg,#d9a441,#b8860b);color:#2a1a0a;font-size:20px;display:none;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(0,0,0,.2);user-select:none;-webkit-user-select:none}' +
    '#lbob-btn.on{display:flex}#lbob-btn.drag{cursor:grabbing}' +
    '#lbob-badge{position:absolute;top:-4px;right:-4px;background:#c0392b;color:#fff;font:700 10px "Space Grotesk",Arial,sans-serif;border-radius:10px;min-width:18px;height:18px;display:none;align-items:center;justify-content:center;padding:0 4px}' +
    '#lbob-badge.show{display:flex}' +
    '#lbob-btn.ring{animation:lbobRing .5s ease 2}@keyframes lbobRing{0%,100%{transform:rotate(0)}25%{transform:rotate(-15deg)}75%{transform:rotate(15deg)}}' +
    '#lbob-panel{position:fixed;z-index:9301;width:280px;max-width:calc(100vw - 16px);max-height:70vh;overflow:auto;background:#fff;border:1px solid #f0d9d9;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.2);padding:14px;display:none;font-family:"Space Grotesk",Arial,sans-serif;color:#2f2024}' +
    '#lbob-panel .xb{position:absolute;top:8px;right:8px;width:28px;height:28px;border:0;border-radius:50%;background:#f6ecec;color:#8a7078;font-size:14px;cursor:pointer;line-height:1}#lbob-panel .xb:hover{background:#f0d9d9;color:#9e2f4a}' +
    '#lbob-panel.show{display:block}#lbob-panel h4{margin:0 0 8px;font-size:13px;color:#9e2f4a}' +
    '#lbob-panel .o{font-size:12.5px;padding:6px 0;border-bottom:1px solid #f6e0da}' +
    '#lbob-panel .e{font-size:12px;color:#8a7078;text-align:center;padding:10px 0}' +
    '#lbob-toast{position:fixed;left:50%;top:max(12px,env(safe-area-inset-top));transform:translate(-50%,-140%);z-index:9302;width:min(360px,calc(100vw - 20px));display:flex;gap:10px;align-items:flex-start;background:#fff;border:1px solid #f0d9d9;border-left:5px solid #c9506b;border-radius:14px;box-shadow:0 14px 36px rgba(60,20,35,.3);padding:11px 12px;font-family:"Space Grotesk",Arial,sans-serif;color:#2f2024;cursor:pointer;transition:transform .3s ease,opacity .3s ease;opacity:0;visibility:hidden;pointer-events:none;}' +
    '#lbob-toast.show{transform:translate(-50%,0);opacity:1;visibility:visible;pointer-events:auto}#lbob-toast .tt{flex:1;min-width:0;font-size:12.5px;line-height:1.4}#lbob-toast .tt b{display:block;font-size:13px;color:#9e2f4a;margin-bottom:2px}' +
    '@media(max-width:600px){#lbob-toast{top:calc(max(12px,env(safe-area-inset-top)) + 56px)}}' +
    '#lbob-toast .x{border:0;background:none;color:#8a7078;font-size:17px;cursor:pointer;padding:0 2px;line-height:1}' +
    '#lbob-panel a{display:block;text-align:center;margin-top:10px;padding:9px 0;border-radius:8px;background:linear-gradient(135deg,#c9506b,#9e2f4a);color:#fff;text-decoration:none;font-size:12.5px;font-weight:700}';
  document.head.appendChild(css);

  var btn = document.createElement('button');
  btn.id = 'lbob-btn'; btn.type = 'button'; btn.title = 'Unassigned orders (drag to move)';
  btn.innerHTML = '🔔<span id="lbob-badge">0</span>';
  var panel = document.createElement('div');
  panel.id = 'lbob-panel';
  panel.innerHTML = '<button type="button" class="xb" aria-label="Close" onclick="this.parentNode.classList.remove(\'show\')">✕</button><h4>📦 Unassigned Orders</h4><div id="lbob-list"></div><a href="https://lalabella.web.app/" target="_blank" rel="noopener">Open lalabella.web.app →</a>';
  document.body.appendChild(btn); document.body.appendChild(panel);
  var badge = btn.querySelector('#lbob-badge'), list = panel.querySelector('#lbob-list');

  // ---- pop-up alert: shows on whatever page you are on when a NEW unassigned order arrives ----
  var toast = document.createElement('div');
  toast.id = 'lbob-toast'; toast.setAttribute('role', 'status');
  toast.innerHTML = '<span style="font-size:20px">📦</span><div class="tt"></div><button class="x" type="button" aria-label="Close">✕</button>';
  document.body.appendChild(toast);
  var toastTimer = 0;
  function hideToast() { toast.classList.remove('show'); clearTimeout(toastTimer); }
  function showToast(rows) {
    var one = rows.slice(0, 2).map(function (o) {
      return '<div><b style="display:inline;font-size:12.5px">' + esc(o.orderNo) + '</b> · ' +
        (o.branch ? '<span style="color:#2f7a4f;font-weight:700">➜ ' + esc(o.branch) + '</span>' : '<span style="color:#b2402e;font-weight:700">⚠ manual assign</span>') + '</div>';
    }).join('');
    var more = rows.length > 2 ? '<div style="color:#8a7078">+ ' + (rows.length - 2) + ' more</div>' : '';
    toast.querySelector('.tt').innerHTML = '<b>' + (rows.length === 1 ? 'New order to assign' : rows.length + ' new orders to assign') + '</b>' + one + more;
    toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 14000);
  }
  toast.addEventListener('click', function (e) {
    if (e.target.closest('.x')) { hideToast(); return; }
    hideToast(); panel.classList.add('show'); layoutPanel(); refresh();
  });
  var SEEN_KEY = 'lbobSeen';
  function seenSet() { try { var a = JSON.parse(sessionStorage.getItem(SEEN_KEY) || 'null'); return Array.isArray(a) ? a : null; } catch (e) { return null; } }
  function saveSeen(rows) { try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(rows.map(function (o) { return String(o.orderNo); }))); } catch (e) {} }

  // ---- position (draggable, remembered) ----
  function clamp(x, y) {
    return { x: Math.max(4, Math.min(window.innerWidth - 48, x)), y: Math.max(4, Math.min(window.innerHeight - 48, y)) };
  }
  function place(x, y) {
    var p = clamp(x, y);
    btn.style.left = p.x + 'px'; btn.style.top = p.y + 'px'; btn.style.right = 'auto';
  }
  try { var saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); if (saved && isFinite(saved.x) && isFinite(saved.y)) place(saved.x, saved.y); } catch (e) {}
  window.addEventListener('resize', function () {
    if (btn.style.left) { var r = btn.getBoundingClientRect(); place(r.left, r.top); }
    if (panel.classList.contains('show')) layoutPanel();
  });

  function layoutPanel() {
    var r = btn.getBoundingClientRect(), pw = Math.min(280, window.innerWidth - 16);
    var left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.right - pw));
    var below = r.top < window.innerHeight / 2;
    panel.style.left = left + 'px';
    if (below) { panel.style.top = (r.bottom + 8) + 'px'; panel.style.bottom = 'auto'; }
    else { panel.style.bottom = (window.innerHeight - r.top + 8) + 'px'; panel.style.top = 'auto'; }
  }

  var down = null, moved = false;
  btn.addEventListener('pointerdown', function (e) {
    var r = btn.getBoundingClientRect();
    down = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY };
    moved = false;
    try { btn.setPointerCapture(e.pointerId); } catch (x) {}
  });
  btn.addEventListener('pointermove', function (e) {
    if (!down) return;
    if (!moved && Math.abs(e.clientX - down.sx) + Math.abs(e.clientY - down.sy) < 6) return;
    moved = true; btn.classList.add('drag');
    place(e.clientX - down.dx, e.clientY - down.dy);
    if (panel.classList.contains('show')) layoutPanel();
  });
  function endDrag() {
    if (!down) return;
    btn.classList.remove('drag');
    if (moved) { var r = btn.getBoundingClientRect(); try { localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); } catch (e) {} }
    down = null;
  }
  btn.addEventListener('pointerup', endDrag);
  btn.addEventListener('pointercancel', endDrag);
  btn.addEventListener('click', function () {
    if (moved) { moved = false; return; }
    panel.classList.toggle('show');
    if (panel.classList.contains('show')) { layoutPanel(); refresh(); }
  });
  document.addEventListener('click', function (e) {
    if (panel.classList.contains('show') && !panel.contains(e.target) && !btn.contains(e.target) && !(e.target.closest && (e.target.closest('#lbdock-tray') || e.target.closest('#lbob-toast')))) panel.classList.remove('show'); // a tap on the side-dock's bell presses this button for you; do not close it again
  });

  // ---- data ----
  function orderHtml(o) {
    var line = o.branch
      ? '<div style="font-size:12px;font-weight:700;color:#2f7a4f;margin-top:3px;">➜ ' + esc(o.branch) + (o.note ? ' <span style="font-weight:400;color:#8a7078;font-size:11px;">' + esc(o.note) + '</span>' : '') + '</div>'
      : '<div style="font-size:12px;font-weight:700;color:#b2402e;margin-top:3px;">⚠ For manual assign' + (o.note ? ' <span style="font-weight:400;color:#8a7078;font-size:11px;">— ' + esc(o.note) + '</span>' : '') + '</div>';
    return '<div class="o"><b>' + esc(o.orderNo) + '</b>' +
      (o.address ? '<div style="font-size:11px;color:#8a7078;margin-top:2px;">' + esc(o.address) + '</div>' : '') + line + '</div>';
  }
  function alarm() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      [880, 1108, 880].forEach(function (f, i) {
        var o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.18;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.18);
      });
    } catch (e) {}
  }
  var lastCount = null;
  function refresh() {
    var t = token();
    if (!t) { btn.classList.remove('on'); panel.classList.remove('show'); return; }
    btn.classList.add('on');
    fetch(API + '?action=getUnassignedStatus&token=' + encodeURIComponent(t) + '&_ts=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.success === false) return;
        var n = Number(d.count) || 0, rows = Array.isArray(d.ordersDetail) ? d.ordersDetail : [];
        if (n > 0) { badge.textContent = String(n); badge.classList.add('show'); } else badge.classList.remove('show');
        if (lastCount !== null && n > lastCount) { alarm(); btn.classList.remove('ring'); void btn.offsetWidth; btn.classList.add('ring'); }
        lastCount = n;
        var prev = seenSet();
        if (prev && rows.length) {
          var fresh = rows.filter(function (o) { return prev.indexOf(String(o.orderNo)) === -1; });
          if (fresh.length) showToast(fresh);
        }
        saveSeen(rows);
        list.innerHTML = rows.length ? rows.map(orderHtml).join('') : '<div class="e">No unassigned orders right now.</div>';
      })
      .catch(function () {});
  }
  refresh();
  setInterval(function () { if (!document.hidden) refresh(); }, 7000);
})();
