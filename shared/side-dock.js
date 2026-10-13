/* ==========================================================
   LALABELLA SIDE DOCK — one slim glass handle on the screen edge
   Replaces the separate floating buttons (staff chat, Nova mic, orders bell).
   • A small see-through handle sits on the edge. Tap it, or swipe it inward, and a glass tray slides out.
   • Move the handle: drag it up/down; press-and-hold then drag to put it anywhere / on the other side.
   • Tray = the chat, Nova and the orders bell (when the page has them) + up to 6 of your own page shortcuts.
   • ✎ in the tray: drag the icons up/down to rearrange them, ✕ removes a shortcut. Move the handle itself by press-and-hold + drag.
   The old buttons are still there (just hidden) — the dock simply presses them, so nothing else changes.
   Remembered per device in localStorage 'lbDock'. Loaded by shared/nav.js.
   ========================================================== */
(function () {
  'use strict';
  if (window.LBSideDock) return;
  var root = document.documentElement;
  if (!root.classList.contains('lb-dock')) return;          // old floating buttons selected (or not set)
  window.LBSideDock = true;

  var KEY = 'lbDock', MAX_CUSTOM = 6;
  var PAGES = [
    ['index.html', '🍫', 'Chocolate Home'], ['flower-tools.html', '🌸', 'Flower Tools'], ['item-inventory.html', '📦', 'Item Inventory'],
    ['dashboard.html', '📊', 'Dashboard'], ['chocolate-calc.html', '🍫', 'Chocolate Calculator'], ['chocolate-receiving.html', '📥', 'Chocolate Receiving'],
    ['chocolate-release.html', '📤', 'Chocolate Release'], ['chocolate-barcode.html', '🏷️', 'Chocolate Barcode'], ['stock-count.html', '📋', 'Stock Count'],
    ['flower-calc.html', '🧮', 'Flower Calculator'], ['flower-receiving.html', '🛒', 'Flower Receiving'], ['flower-purchase.html', '🧾', 'Flower Purchase'],
    ['flower-arrangements.html', '💐', 'Flower Arrangements'], ['flower-transfer.html', '🔄', 'Flower Transfer'], ['item-dashboard.html', '📊', 'Item Dashboard'],
    ['schedule.html', '📆', 'Duty Schedule'], ['attendance.html', '🕒', 'Attendance'], ['profile.html', '👤', 'My Profile'],
    ['petty-cash.html', '💰', 'Petty Cash'], ['notes.html', '📝', 'Notes'], ['order-form.html', '🧾', 'Order Form'],
    ['card-print.html', '💌', 'Card Print'], ['nova-command-center.html', '🎙️', 'NOVA'], ['chatbox.html', '💬', 'Full Chat'],
    ['user-admin.html', '👥', 'User Management'], ['brain.html', '🧠', 'Brain Vault'], ['system-health.html', '🩺', 'System Health']
  ];
  var BUILTIN = [
    { id: 'lbcb-btn', icon: '💬', label: 'Chat', badge: 'lbcb-badge' },
    { id: 'joyboy-bubble-btn', icon: '🎙️', label: 'Nova' },
    { id: 'lbob-btn', icon: '🔔', label: 'Orders', badge: 'lbob-badge' },
    { id: 'lalaBellBtn', icon: '🔔', label: 'Orders', badge: 'lalaBellBadge' }      /* the bell the home / Flower Tools / Item Inventory pages have of their own */
  ];

  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') return s; } catch (e) {}
    return {};
  }
  var st = load();
  st.side = st.side === 'left' ? 'left' : 'right';
  st.y = isFinite(st.y) ? st.y : Math.round(window.innerHeight * 0.42);
  st.order = Array.isArray(st.order) ? st.order : [];
  st.items = Array.isArray(st.items) ? st.items.filter(function (h) { return PAGES.some(function (p) { return p[0] === h; }); }).slice(0, MAX_CUSTOM) : [];
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- styles ----------
  var css = document.createElement('style');
  css.textContent =
    /* the old floating buttons stay in the page (the dock presses them) but are invisible */
    'html.lb-dock #lbcb-btn,html.lb-dock #joyboy-bubble-btn,html.lb-dock #lbob-btn,html.lb-dock #lalaBellBtn{opacity:0 !important;pointer-events:none !important;}' +
    /* the home / Flower Tools / Item Inventory pages had their own 💬 message button at the top — the dock has Chat now */
    'html.lb-dock a#msgBtn,html.lb-dock a#chatBtn{display:none !important;}' +
    /* Flower Tools: the date made room for the chat + bell buttons — they are gone, so it goes to the side */
    '@media(min-width:901px){html.lb-dock .topbar .today{transform:none !important;right:22px !important;left:auto !important;}}' +
    '@media(min-width:601px){html[data-lbside="right"].lb-dock #lbcb-panel{left:auto !important;right:84px !important;}html[data-lbside="left"].lb-dock #lbcb-panel{left:84px !important;}}' +
    '#lbdock-handle{position:fixed;z-index:9400;width:16px;height:68px;border:1px solid rgba(255,255,255,.55);background:rgba(255,255,255,.3);' +
    '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 2px 12px rgba(60,20,35,.25);cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;padding:0;transition:width .15s,background .15s;}' +
    '#lbdock-handle.r{right:0;border-radius:12px 0 0 12px;border-right:0;}#lbdock-handle.l{left:0;border-radius:0 12px 12px 0;border-left:0;}' +
    '#lbdock-handle:hover,#lbdock-handle.hold{background:rgba(255,255,255,.5);width:20px;}' +
    '#lbdock-handle::before{content:"";position:absolute;top:50%;left:50%;width:3px;height:26px;margin:-13px 0 0 -1.5px;border-radius:2px;background:rgba(150,50,75,.6);}' +
    '#lbdock-handle.free{transition:none;border-radius:12px;box-shadow:0 6px 20px rgba(60,20,35,.4);}' +
    '#lbdock-dot{position:absolute;top:-5px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#e03a3a;color:#fff;font:700 9.5px "Space Grotesk",Arial,sans-serif;display:none;align-items:center;justify-content:center;border:2px solid #fff;}' +
    '#lbdock-handle.r #lbdock-dot{left:-9px;}#lbdock-handle.l #lbdock-dot{right:-9px;}#lbdock-dot.show{display:flex;}' +
    '#lbdock-handle.alert{animation:lbdockPulse 1.8s ease-out infinite;}' +
    '@keyframes lbdockPulse{0%{box-shadow:0 0 0 0 rgba(224,58,58,.55)}70%{box-shadow:0 0 0 10px rgba(224,58,58,0)}100%{box-shadow:0 0 0 0 rgba(224,58,58,0)}}' +
    '#lbdock-tray{position:fixed;z-index:9401;display:flex;flex-direction:column;gap:10px;padding:12px 10px;border:1px solid rgba(255,255,255,.55);' +
    'background:linear-gradient(160deg,rgba(255,255,255,.42),rgba(255,235,240,.22));-webkit-backdrop-filter:blur(16px) saturate(1.5);backdrop-filter:blur(16px) saturate(1.5);' +
    'box-shadow:0 10px 34px rgba(60,20,35,.3);max-height:calc(100vh - 24px);overflow-y:auto;visibility:hidden;opacity:0;transition:transform .2s ease,opacity .18s,visibility 0s .2s;scrollbar-width:none;}' +
    '#lbdock-tray::-webkit-scrollbar{display:none;}' +
    '#lbdock-tray.r{right:0;border-radius:22px 0 0 22px;border-right:0;transform:translateX(105%);}#lbdock-tray.l{left:0;border-radius:0 22px 22px 0;border-left:0;transform:translateX(-105%);}' +
    '#lbdock-tray.open{visibility:visible;opacity:1;transform:none;transition:transform .2s ease,opacity .18s;}' +
    '.lbd-it{position:relative;width:48px;height:48px;border-radius:50%;border:1px solid rgba(255,255,255,.7);background:rgba(255,255,255,.45);font-size:22px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;text-decoration:none;color:inherit;box-shadow:0 2px 8px rgba(60,20,35,.15);transition:transform .12s,background .12s;flex:0 0 auto;}' +
    '.lbd-it:hover,.lbd-it:active{transform:scale(1.1);background:rgba(255,255,255,.7);}' +
    '.lbd-w{position:relative;align-self:center;flex:0 0 auto;touch-action:none;}#lbdock-tray.edit .lbd-w{cursor:grab;}' +
    '.lbd-it.add{font-size:24px;color:#9e2f4a;border-style:dashed;}.lbd-it.tool{width:34px;height:34px;font-size:15px;align-self:center;background:rgba(255,255,255,.3);}' +
    '.lbd-b{position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#e03a3a;color:#fff;font:700 10px "Space Grotesk",Arial,sans-serif;display:none;align-items:center;justify-content:center;border:2px solid #fff;}.lbd-b.show{display:flex;}' +
    '.lbd-x{position:absolute;top:-5px;left:-5px;width:20px;height:20px;border-radius:50%;border:2px solid #fff;background:#c9506b;color:#fff;font-size:11px;line-height:1;cursor:pointer;display:none;align-items:center;justify-content:center;padding:0;}' +
    '#lbdock-tray.edit .lbd-x{display:flex;}#lbdock-tray.edit .lbd-w .lbd-it:not(.drag){animation:lbdWig .5s ease-in-out infinite alternate;}' +
    '@keyframes lbdWig{from{transform:rotate(-4deg)}to{transform:rotate(4deg)}}' +
    '.lbd-sep{height:1px;background:rgba(255,255,255,.55);margin:0 6px;flex:0 0 auto;}' +
    '#lbdock-pick{position:fixed;inset:0;z-index:100002;background:rgba(40,20,28,.35);display:none;align-items:center;justify-content:center;padding:14px;}#lbdock-pick.show{display:flex;}' +
    '#lbdock-pick .box{width:min(340px,100%);max-height:78vh;overflow:auto;background:rgba(255,255,255,.88);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.8);border-radius:18px;padding:14px;box-shadow:0 16px 44px rgba(60,20,35,.35);font-family:"Space Grotesk",Arial,sans-serif;}' +
    '#lbdock-pick h4{margin:0 0 10px;font-size:14px;color:#9e2f4a;}' +
    '#lbdock-pick button.pg{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:0;background:none;padding:9px 6px;border-radius:10px;font:600 13.5px "Space Grotesk",Arial,sans-serif;color:#2f2024;cursor:pointer;}' +
    '#lbdock-pick button.pg:hover{background:#fdf1f0;}#lbdock-pick button.pg[disabled]{opacity:.4;cursor:default;}' +
    '#lbdock-pick .cl{margin-top:8px;width:100%;border:0;border-radius:10px;padding:10px;background:#f6ecec;font:700 13px "Space Grotesk",Arial,sans-serif;cursor:pointer;color:#2f2024;}' +
    '@media print{#lbdock-handle,#lbdock-tray,#lbdock-pick{display:none !important;}}';
  document.head.appendChild(css);

  // ---------- markup ----------
  var handle = document.createElement('button');
  handle.id = 'lbdock-handle'; handle.type = 'button'; handle.setAttribute('aria-label', 'Open quick tray'); handle.title = 'Quick tray (tap or swipe in · hold to move)';
  handle.innerHTML = '<span id="lbdock-dot"></span>';
  var tray = document.createElement('div'); tray.id = 'lbdock-tray';
  var pick = document.createElement('div'); pick.id = 'lbdock-pick';
  document.body.appendChild(handle); document.body.appendChild(tray); document.body.appendChild(pick);
  var dot = handle.querySelector('#lbdock-dot');

  // ---------- layout ----------
  function applySide() {
    root.setAttribute('data-lbside', st.side);
    handle.className = (st.side === 'right' ? 'r' : 'l') + (handle.classList.contains('alert') ? ' alert' : '');
    tray.className = (st.side === 'right' ? 'r' : 'l') + (tray.classList.contains('open') ? ' open' : '') + (tray.classList.contains('edit') ? ' edit' : '');
  }
  function clampY(y) { return Math.max(8, Math.min(window.innerHeight - 76, y)); }
  function placeHandle() {
    st.y = clampY(st.y);
    handle.style.top = st.y + 'px'; handle.style.left = ''; handle.style.right = '';
    placeTray();
  }
  function placeTray() {
    var h = tray.offsetHeight || 200;
    var top = Math.max(12, Math.min(window.innerHeight - h - 12, st.y + 34 - h / 2));
    tray.style.top = top + 'px';
  }

  // ---------- tray content ----------
  function badgeOf(id) { var b = document.getElementById(id); return b && b.classList.contains('show') ? b.textContent : ''; }
  function orderKeys(keys) {
    var ord = Array.isArray(st.order) ? st.order : [];
    var pos = function (k) { var i = ord.indexOf(k); return i === -1 ? 1e6 : i; };
    return keys.map(function (k, i) { return [k, i]; }).sort(function (a, b) { return (pos(a[0]) - pos(b[0])) || (a[1] - b[1]); }).map(function (x) { return x[0]; });
  }
  function build() {
    tray.innerHTML = '';
    var made = {}, keys = [];
    BUILTIN.forEach(function (b) {
      var o = document.getElementById(b.id); if (!o) return;
      if ((b.id === 'lbob-btn' || b.id === 'lalaBellBtn') && !o.getClientRects().length) return;   // the bell only shows for people who can see orders
      var el = document.createElement('button'); el.type = 'button'; el.className = 'lbd-it'; el.title = b.label; el.setAttribute('aria-label', b.label);
      el.innerHTML = b.icon + (b.badge ? '<span class="lbd-b" data-b="' + b.badge + '"></span>' : '');
      el.addEventListener('click', function () { if (tray.classList.contains('edit')) return; closeTray(); var t = document.getElementById(b.id); if (t) t.click(); });
      var w = document.createElement('div'); w.className = 'lbd-w'; w.appendChild(el);
      made['b:' + b.id] = w; keys.push('b:' + b.id);
    });
    st.items.forEach(function (h) {
      var pg = PAGES.filter(function (p) { return p[0] === h; })[0]; if (!pg) return;
      var w = document.createElement('div'); w.className = 'lbd-w';
      var a = document.createElement('a'); a.className = 'lbd-it cu'; a.href = pg[0]; a.title = pg[2]; a.setAttribute('aria-label', pg[2]); a.textContent = pg[1];
      a.addEventListener('click', function (e) { if (tray.classList.contains('edit')) e.preventDefault(); });
      var x = document.createElement('button'); x.type = 'button'; x.className = 'lbd-x'; x.textContent = '✕'; x.setAttribute('aria-label', 'Remove ' + pg[2]);
      x.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); st.items = st.items.filter(function (i) { return i !== h; }); save(); build(); tray.classList.add('edit'); });
      w.appendChild(a); w.appendChild(x);
      made['p:' + h] = w; keys.push('p:' + h);
    });
    orderKeys(keys).forEach(function (k) { made[k].setAttribute('data-k', k); tray.appendChild(made[k]); });
    if (st.items.length < MAX_CUSTOM) {
      var add = document.createElement('button'); add.type = 'button'; add.className = 'lbd-it add'; add.title = 'Add a shortcut'; add.setAttribute('aria-label', 'Add a shortcut'); add.textContent = '+';
      add.addEventListener('click', openPicker); tray.appendChild(add);
    }
    var sp2 = document.createElement('div'); sp2.className = 'lbd-sep'; tray.appendChild(sp2);
    var ed = document.createElement('button'); ed.type = 'button'; ed.className = 'lbd-it tool'; ed.id = 'lbd-edit';
    function paintEd() { var on = tray.classList.contains('edit'); ed.textContent = on ? '✓' : '✎'; ed.title = on ? 'Done' : 'Rearrange / remove shortcuts'; ed.setAttribute('aria-label', ed.title); }
    ed.addEventListener('click', function () { tray.classList.toggle('edit'); paintEd(); });
    paintEd(); tray.appendChild(ed);
    syncBadges(); placeTray();
  }

  // ---------- rearrange: in edit mode (✎) press an icon and drag it up/down ----------
  (function () {
    var d = null;
    tray.addEventListener('pointerdown', function (e) {
      if (!tray.classList.contains('edit')) return;
      var w = e.target.closest('.lbd-w'); if (!w || e.target.closest('.lbd-x')) return;
      var list = Array.prototype.slice.call(tray.querySelectorAll('.lbd-w'));
      var tops = list.map(function (n) { return n.getBoundingClientRect().top; });
      d = { w: w, list: list, tops: tops, i: list.indexOf(w), sy: e.clientY, step: list.length > 1 ? Math.abs(tops[1] - tops[0]) || 58 : 58, to: list.indexOf(w) };
      try { tray.setPointerCapture(e.pointerId); } catch (x) {}
      w.style.zIndex = '5'; w.style.transition = 'none';
    });
    tray.addEventListener('pointermove', function (e) {
      if (!d) return;
      var dy = e.clientY - d.sy;
      d.w.style.transform = 'translateY(' + dy + 'px) scale(1.12)';
      var to = Math.max(0, Math.min(d.list.length - 1, d.i + Math.round(dy / d.step)));
      d.to = to;
      d.list.forEach(function (n, k) {
        if (n === d.w) return;
        var sh = 0;
        if (d.to > d.i && k > d.i && k <= d.to) sh = -d.step;
        else if (d.to < d.i && k >= d.to && k < d.i) sh = d.step;
        n.style.transition = 'transform .12s'; n.style.transform = sh ? 'translateY(' + sh + 'px)' : '';
      });
    });
    function end() {
      if (!d) return;
      var x = d; d = null;
      if (x.to !== x.i) {
        var keys = x.list.map(function (n) { return n.getAttribute('data-k'); });
        var k = keys.splice(x.i, 1)[0]; keys.splice(x.to, 0, k);
        st.order = keys; save();
      }
      build(); tray.classList.add('edit'); var ed = document.getElementById('lbd-edit'); if (ed) ed.textContent = '✓';
    }
    tray.addEventListener('pointerup', end); tray.addEventListener('pointercancel', end);
  })();

  function syncBadges() {
    var total = 0;
    Array.prototype.forEach.call(tray.querySelectorAll('.lbd-b'), function (el) {
      var v = badgeOf(el.getAttribute('data-b')); el.textContent = v; el.classList.toggle('show', !!v);
      var n = parseInt(v, 10); total += isNaN(n) ? (v ? 1 : 0) : n;
    });
    // chat badge also counts when the tray has not been built with it yet
    if (!tray.querySelector('.lbd-b')) { total = parseInt(badgeOf('lbcb-badge'), 10) || 0; total += parseInt(badgeOf('lbob-badge'), 10) || 0; total += parseInt(badgeOf('lalaBellBadge'), 10) || 0; }
    dot.textContent = total > 99 ? '99+' : String(total); dot.classList.toggle('show', total > 0); handle.classList.toggle('alert', total > 0);
  }

  // ---------- picker ----------
  function openPicker() {
    var h = '<div class="box"><h4>➕ Add a shortcut (' + st.items.length + '/' + MAX_CUSTOM + ')</h4>';
    PAGES.forEach(function (p) {
      var on = st.items.indexOf(p[0]) !== -1;
      h += '<button type="button" class="pg" data-h="' + esc(p[0]) + '"' + (on ? ' disabled' : '') + '><span style="font-size:20px">' + p[1] + '</span><span>' + esc(p[2]) + (on ? ' ✓' : '') + '</span></button>';
    });
    h += '<button type="button" class="cl">Close</button></div>';
    pick.innerHTML = h; pick.classList.add('show');
  }
  pick.addEventListener('click', function (e) {
    var b = e.target.closest('button.pg');
    if (b && !b.disabled) {
      if (st.items.length < MAX_CUSTOM) { st.items.push(b.getAttribute('data-h')); save(); build(); }
      pick.classList.remove('show'); return;
    }
    if (e.target === pick || e.target.closest('.cl')) pick.classList.remove('show');
  });

  // ---------- open / close ----------
  function openTray() { build(); applySide(); tray.classList.add('open'); handle.style.visibility = 'hidden'; placeTray(); }
  function closeTray() { tray.classList.remove('open', 'edit'); handle.style.visibility = ''; }
  document.addEventListener('pointerdown', function (e) {
    if (tray.classList.contains('open') && !tray.contains(e.target) && !pick.contains(e.target) && e.target !== handle) closeTray();
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeTray(); pick.classList.remove('show'); } });

  // ---------- handle gestures: tap / swipe in = open · vertical drag = move · hold then drag = place anywhere ----------
  (function () {
    var d = null, holdT = null;
    function endHold() { if (holdT) { clearTimeout(holdT); holdT = null; } }
    handle.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      var r = handle.getBoundingClientRect();
      d = { sx: e.clientX, sy: e.clientY, oy: st.y, ox: r.left, mode: '', moved: false };
      try { handle.setPointerCapture(e.pointerId); } catch (x) {}
      holdT = setTimeout(function () { holdT = null; if (d && !d.moved) { d.mode = 'free'; handle.classList.add('hold', 'free'); handle.style.left = d.ox + 'px'; handle.style.right = 'auto'; if (navigator.vibrate) { try { navigator.vibrate(12); } catch (x) {} } } }, 380);
    });
    handle.addEventListener('pointermove', function (e) {
      if (!d) return;
      var dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (d.mode === 'free') {
        d.moved = true;
        handle.style.left = Math.max(2, Math.min(window.innerWidth - 18, d.ox + dx)) + 'px';
        handle.style.top = clampY(d.oy + dy) + 'px'; return;
      }
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 8) return;
      endHold();
      if (!d.mode) {
        var inward = st.side === 'right' ? dx < 0 : dx > 0;
        d.mode = (Math.abs(dx) > Math.abs(dy) * 1.2 && inward) ? 'swipe' : 'slide';
      }
      d.moved = true;
      if (d.mode === 'swipe') { if (Math.abs(dx) > 22) { d.done = true; d = null; openTray(); } return; }
      st.y = clampY(d.oy + dy); handle.style.top = st.y + 'px';
    });
    function up() {
      endHold();
      if (!d) return;
      var x = d;
      d = null; handle.classList.remove('hold', 'free');
      if (x.mode === 'free') {
        var r = handle.getBoundingClientRect();
        st.side = (r.left + r.width / 2) > window.innerWidth / 2 ? 'right' : 'left'; st.y = clampY(parseFloat(handle.style.top) || st.y);
        handle.style.left = ''; handle.style.right = ''; save(); applySide(); placeHandle();
      } else if (x.mode === 'slide') { save(); placeTray(); }
      else if (!x.moved) openTray();
    }
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', function () { endHold(); d = null; handle.classList.remove('hold', 'free'); handle.style.left = ''; handle.style.right = ''; });
    handle.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTray(); } });
  })();

  window.addEventListener('resize', function () { placeHandle(); });
  applySide(); placeHandle();
  // the old buttons appear a moment after the page loads; keep the badge in step
  setInterval(function () { if (!document.hidden) { if (!tray.classList.contains('open')) { /* cheap refresh */ } syncBadges(); } }, 1500);
})();
