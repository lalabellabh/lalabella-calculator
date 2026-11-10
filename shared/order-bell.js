/* Floating "Unassigned Orders" bell — loaded by shared/nav.js on every page.
   Same bell as the one on the home / Flower Tools / Item Inventory pages (those keep their own,
   so this one steps aside when it finds #lalaBellBtn). Drag it anywhere; it remembers where you left it.
   Shows each unassigned order, the branch the assistant picked, or "For manual assign" when it could not decide. */
(function () {
  'use strict';
  if (window.LBOrderBell || document.getElementById('lbob-btn')) return;
  window.LBOrderBell = true;
  // Pages with their own bell (home, Flower Tools, Item Inventory): keep their bell, but still show the new-order pop-up.
  var own = document.getElementById('lalaBellBtn');
  var CFG = window.LB_CONFIG || {};
  var API = CFG.ORDER_ASSIGN_FAST_API;
  if (!API) return;
  var POS_KEY = 'lbOrderBellPos';
  var SHOP_API = CFG.SHOPIFY_ORDERS_API || API.replace('orderassign-fast', 'shopify-orders-fast');
  var VOL_KEY = 'lbAlertVol';   // 0-100, set in ⚙️ Settings → New-order alert sound
  function vol() { try { var v = parseInt(localStorage.getItem(VOL_KEY), 10); return isFinite(v) ? Math.max(0, Math.min(100, v)) : 80; } catch (e) { return 80; } }

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
    '#lbob-toast{position:fixed;left:50%;top:max(12px,env(safe-area-inset-top));transform:translate(-50%,-140%);z-index:2147483100;width:min(360px,calc(100vw - 20px));display:flex;gap:10px;align-items:flex-start;background:#fff;border:1px solid #f0d9d9;border-left:5px solid #c9506b;border-radius:14px;box-shadow:0 14px 36px rgba(60,20,35,.3);padding:11px 12px;font-family:"Space Grotesk",Arial,sans-serif;color:#2f2024;cursor:pointer;transition:transform .3s ease,opacity .3s ease;opacity:0;visibility:hidden;pointer-events:none;}' +
    '#lbob-toast.show{transform:translate(-50%,0);opacity:1;visibility:visible;pointer-events:auto}#lbob-toast .tt{flex:1;min-width:0;font-size:12.5px;line-height:1.4}#lbob-toast .tt b{display:block;font-size:13px;color:#9e2f4a;margin-bottom:2px}' +
    '@media(max-width:600px){#lbob-toast{top:calc(max(12px,env(safe-area-inset-top)) + 56px)}}' +
    '#lbob-toast .x{flex:0 0 auto;width:32px;height:32px;margin:-6px -6px 0 0;border:0;border-radius:50%;background:#f6ecec;color:#8a7078;font-size:15px;cursor:pointer;padding:0;line-height:1}#lbob-toast .x:hover{background:#f0d9d9;color:#9e2f4a}' +
    '#lbob-panel a{display:block;text-align:center;margin-top:10px;padding:9px 0;border-radius:8px;background:linear-gradient(135deg,#c9506b,#9e2f4a);color:#fff;text-decoration:none;font-size:12.5px;font-weight:700}';
  document.head.appendChild(css);

  var btn = document.createElement('button');
  btn.id = 'lbob-btn'; btn.type = 'button'; btn.title = 'Unassigned orders (drag to move)';
  btn.innerHTML = '🔔<span id="lbob-badge">0</span>';
  var panel = document.createElement('div');
  panel.id = 'lbob-panel';
  panel.innerHTML = '<button type="button" class="xb" aria-label="Close" onclick="this.parentNode.classList.remove(\'show\')">✕</button><h4>📦 Unassigned Orders</h4><div id="lbob-list"></div><a href="https://lalabella.web.app/" target="_blank" rel="noopener">Open lalabella.web.app →</a>';
  if (!own) { document.body.appendChild(btn); document.body.appendChild(panel); }
  var badge = btn.querySelector('#lbob-badge'), list = panel.querySelector('#lbob-list');

  // ---- pop-up alert: shows on whatever page you are on when a NEW unassigned order arrives ----
  var toast = document.createElement('div');
  toast.id = 'lbob-toast'; toast.setAttribute('role', 'status');
  toast.innerHTML = '<span style="font-size:20px">📦</span><div class="tt"></div><button class="x" type="button" aria-label="Close">✕</button>';
  document.body.appendChild(toast);
  var toastTimer = 0, toastPri = 0, toastQ = [];
  // One pop-up at a time. A ringing new-order pop-up is never replaced by a lower one (abandoned cart, approvals):
  // those wait in a queue and show after it is closed. Closing it in one tab closes it in the other open tabs too.
  var TOAST_ACK = 'lbobToastAck';
  function hideToast(fromOtherTab) {
    var was = toast.classList.contains('show');
    toast.classList.remove('show'); clearTimeout(toastTimer); stopRing(); toastPri = 0;
    if (was && !fromOtherTab) { try { localStorage.setItem(TOAST_ACK, String(Date.now())); } catch (e) {} }
    var next = toastQ.shift(); if (next) setTimeout(next, 450);
  }
  function canShow(pri, again) {
    if (toast.classList.contains('show') && toastPri > pri) { if (toastQ.length < 5) toastQ.push(again); return false; }
    toastPri = pri; return true;
  }
  window.addEventListener('storage', function (e) { if (e.key === TOAST_ACK && toast.classList.contains('show')) hideToast(true); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && toast.classList.contains('show')) hideToast(); });
  function showToast(rows) {
    // It may have waited in the queue behind a ringing Shopify pop-up: only show orders that are STILL unassigned now
    // (otherwise an old "New order to assign" pops up after the order was already placed in a branch).
    rows = rows.filter(function (o) { return monk.list.indexOf(onum(o.orderNo)) !== -1; });
    if (!rows.length) { if (!toast.classList.contains('show')) { var nx = toastQ.shift(); if (nx) nx(); } return; }
    if (!canShow(2, function () { showToast(rows); })) return;
    var one = rows.slice(0, 2).map(function (o) {
      return '<div><b style="display:inline;font-size:12.5px">' + esc(o.orderNo) + '</b> · ' +
        (o.branch ? '<span style="color:#2f7a4f;font-weight:700">➜ ' + esc(o.branch) + '</span>' : '<span style="color:#b2402e;font-weight:700">⚠ manual assign</span>') + '</div>';
    }).join('');
    var more = rows.length > 2 ? '<div style="color:#8a7078">+ ' + (rows.length - 2) + ' more</div>' : '';
    toast.querySelector('.tt').innerHTML = '<b>' + (rows.length === 1 ? 'New order to assign' : rows.length + ' new orders to assign') + '</b>' + one + more;
    toast.firstChild.textContent = '📦'; toast.removeAttribute('data-go');
    toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 14000);
  }
  // Flower rate changes waiting for an Admin's approval (the server only sends these to Admins).
  function showApprToast(n, rows) {
    if (!canShow(1, function () { showApprToast(n, rows); })) return;
    var one = rows.slice(0, 2).map(function (r) {
      return '<div><b style="display:inline;font-size:12.5px">' + esc(r.flower) + '</b>' + (r.origin ? ' (' + esc(r.origin) + ')' : '') + ' · ' + Number(r.oldRate || 0).toFixed(3) + ' ➜ ' + Number(r.newRate || 0).toFixed(3) + '</div>';
    }).join('');
    toast.firstChild.textContent = '🌸'; toast.setAttribute('data-go', 'flower-dashboard.html');
    toast.querySelector('.tt').innerHTML = '<b>' + (n === 1 ? 'Rate approval needed' : n + ' rate approvals needed') + '</b>' + one + '<div style="color:#8a7078;margin-top:2px">Tap to review</div>';
    toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 20000);
    try { beep(); } catch (e) {}
  }
  // Receiving waiting for Admin approval (Nov 2026): one row per invoice, each with a direct Open link.
  function recvHtml(rv) {
    if (!rv.length) return '';
    return '<div class="o" style="background:#fff7f8;border-radius:8px;padding:8px;margin-bottom:6px"><b>📝 ' + rv.length + ' receiving' + (rv.length > 1 ? 's' : '') + ' waiting for approval</b>' +
      rv.slice(0, 6).map(function (r) {
        var href = 'receiving-approval.html?m=' + encodeURIComponent(r.module || '') + '&batch=' + encodeURIComponent(r.batch || '');
        return '<div style="font-size:12px;margin-top:4px;display:flex;justify-content:space-between;gap:6px;align-items:center"><span>' + (r.module === 'chocolate' ? '🍫 ' : '🌸 ') + esc(r.branch) + ' · ' + esc(r.supplier || '—') + (r.invoice ? ' #' + esc(r.invoice) : '') + ' · ' + Number(r.total || 0).toFixed(3) + ' BD</span>' +
          '<a href="' + href + '" style="flex:none;padding:3px 10px;border-radius:8px;background:linear-gradient(135deg,#c9506b,#9e2f4a);color:#fff;text-decoration:none;font-size:11.5px;font-weight:700">Open</a></div>';
      }).join('') + (rv.length > 6 ? '<a href="receiving-approval.html" style="display:block;text-align:center;margin-top:6px;font-size:12px">See all ' + rv.length + '</a>' : '') + '</div>';
  }
  function apprHtml(rows) {
    var rv = rows.filter(function (r) { return r.kind === 'recv'; }); rows = rows.filter(function (r) { return r.kind !== 'recv'; });
    return recvHtml(rv) + apprHtmlRest(rows);
  }
  function apprHtmlRest(rows) {
    var cr = rows.filter(function(r){return r.kind==='choc';}); rows = rows.filter(function(r){return r.kind!=='choc';}); var chocHtml = cr.length ? '<div class="o" style="background:#fff7f8;border-radius:8px;padding:8px;margin-top:6px"><b>🍫 ' + cr[0].n + ' chocolate stock approval' + (cr[0].n > 1 ? 's' : '') + ' waiting</b><a href="stock-approval.html" style="display:block;text-align:center;margin-top:6px;padding:6px 0;border-radius:8px;background:linear-gradient(135deg,#c9506b,#9e2f4a);color:#fff;text-decoration:none;font-size:12px;font-weight:700">Review stock counts</a></div>' : ''; if(!rows.length) return chocHtml;
    return '<div class="o" style="background:#fff7f8;border-radius:8px;padding:8px"><b>🌸 ' + rows.length + ' rate approval' + (rows.length > 1 ? 's' : '') + ' waiting</b>' +
      rows.slice(0, 5).map(function (r) {
        return '<div style="font-size:12px;margin-top:3px">' + esc(r.flower) + (r.origin ? ' (' + esc(r.origin) + ')' : '') + ' · ' + Number(r.oldRate || 0).toFixed(3) + ' ➜ ' + Number(r.newRate || 0).toFixed(3) + '</div>';
      }).join('') + (rows.length > 5 ? '<div style="font-size:11px;color:#8a7078">+ ' + (rows.length - 5) + ' more</div>' : '') +
      '<a href="flower-dashboard.html" style="margin-top:6px;padding:6px 0">Review approvals</a></div>' + chocHtml;
  }
  var APPR_KEY = 'lbobAppr';   // last approval count this browser tab saw (so moving between pages does not pop up again)
  function apprSeen() { try { var v = sessionStorage.getItem(APPR_KEY); return v === null ? null : parseInt(v, 10); } catch (e) { return null; } }
  function apprSave(n) { try { sessionStorage.setItem(APPR_KEY, String(n)); } catch (e) {} }

  // New order from Shopify: stays on screen and rings (loud, repeating) until someone taps it.
  function showShopToast(rows, keep) {
    canShow(3, null);
    shopShown = keep ? rows.map(function (o) { return onum(o.order_no); }) : [];
    var bl = rows.every(function (o) { return o.source === 'bleems'; }), sh = rows.every(function (o) { return o.source !== 'bleems'; });
    var src = bl ? 'Bleems' : (sh ? 'Shopify' : 'online');
    var one = rows.slice(0, 2).map(function (o) {
      return '<div><b style="display:inline;font-size:12.5px">' + esc(o.order_no) + '</b>' + (o.source === 'bleems' && !bl ? ' <span style="color:#8a7078">(Bleems)</span>' : '') +    // no branch here: the Tampermonkey + Branch Config decide it (its own alert shows the branch)
        (o.total ? ' · ' + esc(o.currency || '') + ' ' + esc(o.total) : '') + '</div>';
    }).join('');
    var more = rows.length > 2 ? '<div style="color:#8a7078">+ ' + (rows.length - 2) + ' more</div>' : '';
    var pic = rows[0] && rows[0].thumb && /^https:\/\//.test(rows[0].thumb) ? rows[0].thumb : '';
    if (pic) toast.firstChild.innerHTML = '<img alt="" src="' + esc(pic) + '" style="width:46px;height:46px;border-radius:10px;object-fit:cover;display:block">';
    else toast.firstChild.textContent = '🛍️';
    toast.removeAttribute('data-go');
    var title = keep ? (rows.length === 1 ? src + ' order — not in a branch yet' : rows.length + ' ' + src + ' orders — not in a branch yet')
                     : (rows.length === 1 ? 'New ' + src + ' order!' : rows.length + ' new ' + src + ' orders!');
    toast.querySelector('.tt').innerHTML = '<b>' + title + '</b>' + one + more +
      (keep ? '<div style="color:#8a7078;margin-top:3px">Rings again until it is placed in a branch. Tap = quiet for 3 min.</div>' +
              '<button type="button" data-done style="margin-top:6px;border:0;border-radius:8px;padding:6px 10px;background:#2f7a4f;color:#fff;font-weight:700;font-size:12px;cursor:pointer">✓ Na-assign ko na</button>'
            : '<div style="color:#8a7078;margin-top:2px">Tap to stop the sound</div>');
    toast.classList.add('show');
    clearTimeout(toastTimer);
    if (!keep) toastTimer = setTimeout(hideToast, 90000);   // Bleems: closes by itself after 1.5 min (stays in the 🔔 list)
    shopRangAt = Date.now();
    ringLoop();
  }
  // a customer started checkout, left a phone/email, and never finished: a quiet notice (no alarm sound), logged in shopify_checkouts
  var AB_SEEN = 'lbobAbSeen';
  function abSeen() { try { var a = JSON.parse(localStorage.getItem(AB_SEEN) || 'null'); return Array.isArray(a) ? a : null; } catch (e) { return null; } }
  function showAbandonToast(rows) {
    if (!canShow(1, function () { showAbandonToast(rows); })) return;
    var one = rows.slice(0, 2).map(function (o) {
      var who = o.customer || o.phone || o.email || 'Customer';
      return '<div><b style="display:inline;font-size:12.5px">' + esc(who) + '</b>' + (o.total ? ' · ' + esc(o.currency || '') + ' ' + esc(o.total) : '') + (o.phone ? ' · ' + esc(o.phone) : '') + '<div style="color:#8a7078;font-size:11.5px">' + esc(o.items || '') + '</div></div>';
    }).join('');
    var pic = rows[0] && rows[0].thumb && /^https:\/\//.test(rows[0].thumb) ? rows[0].thumb : '';
    if (pic) toast.firstChild.innerHTML = '<img alt="" src="' + esc(pic) + '" style="width:46px;height:46px;border-radius:10px;object-fit:cover;display:block">';
    else toast.firstChild.textContent = '🛒';
    toast.removeAttribute('data-go');
    toast.querySelector('.tt').innerHTML = '<b>' + (rows.length === 1 ? 'Abandoned checkout' : rows.length + ' abandoned checkouts') + '</b>' + one + (rows.length > 2 ? '<div style="color:#8a7078">+ ' + (rows.length - 2) + ' more</div>' : '') + '<div style="color:#8a7078;margin-top:2px">Follow up with the customer? Tap to close</div>';
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { hideToast(); }, 20000);
  }
  toast.addEventListener('click', function (e) {
    if (shopShown.length) {   // Shopify order still not in a branch
      if (e.target.closest('[data-done]')) { shopMarkDone(shopShown); shopShown = []; hideToast(); return; }
      shopSnooze = Date.now() + 3 * 60000; try { localStorage.setItem('lbobShopSnooze', String(shopSnooze)); } catch (x) {}
      shopShown = []; hideToast(); return;   // ✕ or tap: quiet for 3 minutes, then it rings again if still not assigned
    }
    if (e.target.closest('.x')) { hideToast(); return; }
    var go = toast.getAttribute('data-go'); hideToast();
    if (go) { location.href = go; return; }
    if (own) { var op = document.getElementById('lalaBellPanel'); if (!op || !op.classList.contains('show')) own.click(); return; }
    panel.classList.add('show'); layoutPanel(); refresh();
  });
  // opened from a phone order alert (index.html?bell=1): show the order list
  if (/[?&]bell=1\b/.test(location.search)) setTimeout(function () {
    try { if (own) { var op = document.getElementById('lalaBellPanel'); if (!op || !op.classList.contains('show')) own.click(); } else { panel.classList.add('show'); layoutPanel(); refresh(); } } catch (e) {}
  }, 1200);
  var SEEN_KEY = 'lbobSeen';
  function seenSet() { try { var a = JSON.parse(sessionStorage.getItem(SEEN_KEY) || 'null'); return Array.isArray(a) ? a : null; } catch (e) { return null; } }
  // Remember every order already announced (not only the ones in the last list), so a list that briefly flips
  // empty and back never pops the same order up again.
  function saveSeen(rows) {
    try {
      var all = (seenSet() || []).concat(rows.map(function (o) { return String(o.orderNo); }));
      var uniq = all.filter(function (v, i) { return all.indexOf(v) === i; });
      sessionStorage.setItem(SEEN_KEY, JSON.stringify(uniq.slice(-200)));
    } catch (e) {}
  }

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
  // ---- sound (volume from ⚙️ Settings; 0 = silent). Browsers only allow sound after one tap/click on the page. ----
  var actx = null;
  function audio() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { audio(); }, { once: true, passive: true }); });
  function beep() {
    var v = vol(); if (!v) return;
    var c = audio(); if (!c) return;
    var peak = 0.03 + (v / 100) * 0.6;
    [880, 1108, 880, 1108, 880].forEach(function (f, i) {
      var o = c.createOscillator(), g = c.createGain(), t = c.currentTime + i * 0.2;
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.2);
    });
  }
  function alarm() { try { beep(); } catch (e) {} }
  var loopT = 0;
  function stopRing() { if (loopT) { clearInterval(loopT); loopT = 0; } }
  function ringLoop() {
    stopRing(); beep();
    var n = 0;
    loopT = setInterval(function () { if (++n >= 12 || !toast.classList.contains('show')) { stopRing(); return; } beep(); }, 3000);
  }
  window.lbAlertTest = function () { try { beep(); } catch (e) {} };

  // ---- new Shopify orders (webhook -> shopify-orders-fast): works even when the Tampermonkey script is off ----
  var SHOP_SEEN = 'lbobShopSeen';
  // ---- A Shopify order keeps ringing until it is placed in a branch ----
  // "Placed" = the Tampermonkey (order dashboard) reported its list AFTER the order arrived and the order is not in it.
  // While the Tampermonkey is off it never reports, so the order keeps ringing (every 2 min) until someone taps
  // "✓ Na-assign ko na" (or the Tampermonkey comes back and reports). Orders older than 6 h stop by themselves.
  var monk = { at: 0, list: [] }, shopShown = [], shopSnooze = 0, shopRangAt = 0, SHOP_DONE = 'lbobShopDone';
  function onum(v) { return String(v || '').replace(/\D+/g, ''); }
  function shopDone() { try { var a = JSON.parse(localStorage.getItem(SHOP_DONE) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function shopMarkDone(nos) { var a = shopDone().concat(nos); try { localStorage.setItem(SHOP_DONE, JSON.stringify(a.filter(function (v, i) { return v && a.indexOf(v) === i; }).slice(-200))); } catch (e) {} }
  function shopPending(orders) {
    var done = shopDone(), now = Date.now();
    return (orders || []).filter(function (o) {
      if (o.source === 'bleems') return false;
      var no = onum(o.order_no), at = new Date(o.received_at).getTime();
      if (!no || !at || now - at > 6 * 3600000 || done.indexOf(no) !== -1) return false;
      var reportedAfter = monk.at > at + 60000;
      if (reportedAfter && monk.list.indexOf(no) === -1) return false;   // the dashboard shows it is no longer unassigned
      return true;
    });
  }
  function shopAlarm(pend) {
    try { shopSnooze = Math.max(shopSnooze, Number(localStorage.getItem('lbobShopSnooze')) || 0); } catch (e) {}   // quiet in every open tab
    if (Date.now() < shopSnooze) return;
    var nos = pend.map(function (o) { return onum(o.order_no); }).join(',');
    var showing = toast.classList.contains('show') && shopShown.length;
    if (showing && shopShown.join(',') === nos) { if (Date.now() - shopRangAt > 2 * 60000) { shopRangAt = Date.now(); ringLoop(); } return; }
    showShopToast(pend, true);
  }
  function shopSeen() { try { var a = JSON.parse(localStorage.getItem(SHOP_SEEN) || 'null'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function pollShop() {
    var t = token(); if (!t || !SHOP_API) return;
    fetch(SHOP_API + '?action=getRecentOrders&token=' + encodeURIComponent(t) + '&_ts=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.success === false || !Array.isArray(d.orders)) return;
        var seen = shopSeen();
        // Shopify: keeps alarming until the order is in a branch (see shopPending) — Bleems: one alert like before
        var fresh = d.orders.filter(function (o) {
          return o.source === 'bleems' && seen.indexOf(String(o.shopify_id)) === -1 && (Date.now() - new Date(o.received_at).getTime()) < 15 * 60000;
        });
        var pend = shopPending(d.orders);
        var all = seen.concat(d.orders.map(function (o) { return String(o.shopify_id); }));
        var uniq = all.filter(function (v, i) { return all.indexOf(v) === i; });
        try { localStorage.setItem(SHOP_SEEN, JSON.stringify(uniq.slice(-100))); } catch (e) {}
        if (pend.length) shopAlarm(pend);
        else if (shopShown.length) { shopShown = []; hideToast(); }   // all placed in a branch now
        if (fresh.length && !pend.length) showShopToast(fresh);
        else if (!pend.length && Array.isArray(d.abandoned)) {
          var ab = abSeen(), keys = d.abandoned.map(function (x) { return String(x.token); });
          if (ab !== null) {
            var fa = d.abandoned.filter(function (x) { return ab.indexOf(String(x.token)) === -1 && (Date.now() - new Date(x.updated_at).getTime()) < 3 * 3600000; });
            if (fa.length) showAbandonToast(fa);
          }
          try { localStorage.setItem(AB_SEEN, JSON.stringify(keys.concat(ab || []).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).slice(0, 100))); } catch (e) {}
        }
      })
      .catch(function () {});
  }
  setTimeout(pollShop, 2500);   // after the first dashboard check, so already-placed orders don't ring for a second
  setInterval(pollShop, 10000);

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
        monk.at = d.lastUpdated ? new Date(d.lastUpdated).getTime() || 0 : 0;
        monk.list = rows.map(function (o) { return onum(o.orderNo); });
        var apRows = Array.isArray(d.approvalsDetail) ? d.approvalsDetail : [], ap = Number(d.pendingApprovals) || 0;
        var shown = n + ap;
        if (shown > 0) { badge.textContent = String(shown); badge.classList.add('show'); } else badge.classList.remove('show');
        var seenAp = apprSeen();
        apprSave(ap);
        if (lastCount !== null && n > lastCount && !own) { alarm(); btn.classList.remove('ring'); void btn.offsetWidth; btn.classList.add('ring'); }
        lastCount = n;
        var prev = seenSet();
        if (prev && rows.length) {
          var fresh = rows.filter(function (o) { return prev.indexOf(String(o.orderNo)) === -1; });
          if (fresh.length) showToast(fresh);
        }
        saveSeen(rows);
        list.innerHTML = apprHtml(apRows) + (rows.length ? rows.map(orderHtml).join('') : '<div class="e">No unassigned orders right now.</div>');
      })
      .catch(function () {});
  }
  refresh();
  // Pages with their own bell already poll every 7 s; this one only adds the pop-up, so it checks less often (less load).
  setInterval(function () { if (!document.hidden) refresh(); }, own ? 20000 : 7000);
})();
