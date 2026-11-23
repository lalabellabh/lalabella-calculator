/* LALABELLA — phone app bar (Nov 23 2026, Bench: "malalaki ang icon, parang nakapatong, pwede mag-add ng ibang apps").
 * A bottom bar on phones with big raised app icons. LONG-PRESS the bar: pick which apps sit in it (up to 5) and the bar style. Saved on this device.
 * The bar is attached to <body>, so it always shows (it used to vanish when a parent box had a blur effect).
 *   <script src="shared/app-bar.js" data-apps="index.html,flower-dashboard.html,flower-receiving.html,flower-stock-count.html" data-key="flower"></script>
 * The icons follow ⚙️ Settings → Icon style (they are drawn by shared/icons.js like everything else).
 */
(function () {
  if (window.LBAppBar) return;
  var me = document.currentScript;
  var DEF = String((me && me.getAttribute('data-apps')) || 'index.html,flower-tools.html,item-inventory.html,cafe-inventory.html').split(',');
  var KEY = 'lbAppBar:' + ((me && me.getAttribute('data-key')) || location.pathname.split('/').pop());
  var MAX = 5;
  var APPS = [
    ['index.html', '🏠', 'Home'], ['flower-tools.html', '🌸', 'Flower Tools'], ['item-inventory.html', '📦', 'Items'], ['cafe-inventory.html', '☕', 'Café'],
    ['flower-dashboard.html', '📊', 'Dashboard'], ['flower-receiving.html', '🛒', 'Receiving'], ['flower-stock-count.html', '📋', 'Stock Count'],
    ['flower-calc.html', '🧮', 'Flower Calc'], ['mixed-calc.html', '💐', 'Mixed Calc'], ['flower-arrangements.html', '💐', 'Arrangements'],
    ['flower-transfer.html', '🔄', 'Transfer'], ['flower-purchase.html', '🧾', 'Purchase'], ['flower-catalog.html', '📖', 'Catalog'],
    ['dashboard.html', '📊', 'Choco Dashboard'], ['chocolate-calc.html', '🍫', 'Choco Calc'], ['chocolate-receiving.html', '📥', 'Choco Receiving'],
    ['stock-count.html', '📋', 'Choco Count'], ['chocolate-barcode.html', '🏷️', 'Barcode'], ['calc-sales.html', '🧾', 'Calc Sales'],
    ['cafe-hub.html', '☕', 'Café Stock'], ['item-dashboard.html', '📊', 'Item Dashboard'], ['item-saudi.html', '🚚', 'Saudi'],
    ['schedule.html', '📆', 'Schedule'], ['attendance.html', '🕒', 'Attendance'], ['notes.html', '📝', 'Notes'], ['card-print.html', '💌', 'Card Print'],
    ['petty-cash.html', '💰', 'Petty Cash'], ['delivery-admin.html', '🗺️', 'Delivery'], ['chatbox.html', '💬', 'Chat'], ['profile.html', '👤', 'Profile'], ['office.html', '🏢', 'HQ']
  ];
  function app(h) { for (var i = 0; i < APPS.length; i++) if (APPS[i][0] === h) return APPS[i]; return null; }
  function load() { try { var a = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(a) && a.length) return a.filter(app).slice(0, MAX); } catch (e) {} return DEF.filter(app).slice(0, MAX); }
  function save(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var css = '#lbab{display:none}' +
    '@media(max-width:900px){#lbab{display:flex;position:fixed;left:12px;right:12px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:9000;height:62px;align-items:flex-end;justify-content:space-around;gap:4px;padding:0 8px 7px;' +
      'border-radius:24px;background:rgba(255,255,255,var(--lb-ba,.82));outline:1px solid rgba(120,60,80,.16);outline-offset:-1px;backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);border:1px solid rgba(255,255,255,.9);box-shadow:0 14px 36px rgba(60,30,40,.22)}' +
    '#lbab a,#lbab button{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px;text-decoration:none;color:#5a4048;font:600 10px/1.1 "Space Grotesk",system-ui,sans-serif;border:0;background:none;padding:0;cursor:pointer}' +
    '#lbab .t{width:54px;height:54px;margin-top:-26px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:27px;background:linear-gradient(160deg,#fff,#f6eef0);' +
      'box-shadow:0 8px 18px rgba(60,30,40,.2),inset 0 1px 0 #fff,inset 0 -2px 4px rgba(0,0,0,.05);border:1px solid rgba(255,255,255,.95);transition:transform .15s}' +
    '#lbab a:active .t,#lbab button:active .t{transform:translateY(2px) scale(.96)}' +
    '#lbab a.on .t{background:linear-gradient(160deg,#ffe3ea,#f7c9d5);box-shadow:0 10px 22px rgba(158,47,74,.3),inset 0 1px 0 #fff}#lbab a.on{color:#9e2f4a}' +
    '#lbab .l{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '#lbab{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}#lbab.lp{transform:scale(.97);transition:transform .2s}' +
    /* bar styles (long-press → Bar style) */
    '#lbab[data-s=flat]{height:64px;align-items:center;padding:0 6px;border-radius:20px}#lbab[data-s=flat] .t{width:34px;height:34px;margin:0;border-radius:11px;font-size:20px;box-shadow:none;background:none;border:0}#lbab[data-s=flat] a.on .t{background:#fde6ec;box-shadow:none}' +
    '#lbab[data-s=dark]{background:rgba(32,20,26,max(.4,var(--lb-ba,.92)));outline-color:rgba(255,255,255,.12);border-color:rgba(255,255,255,.08)}#lbab[data-s=dark] a,#lbab[data-s=dark] button{color:#e9d9de}#lbab[data-s=dark] .t{background:linear-gradient(160deg,#3d2a32,#2a1c22);border-color:rgba(255,255,255,.1);box-shadow:0 8px 18px rgba(0,0,0,.35)}#lbab[data-s=dark] a.on .t{background:linear-gradient(160deg,#c9506b,#9e2f4a)}#lbab[data-s=dark] a.on{color:#ffb3c4}' +
    '#lbab[data-s=glass]{background:rgba(255,255,255,calc(var(--lb-ba,.82) * .45));backdrop-filter:blur(26px) saturate(1.8);-webkit-backdrop-filter:blur(26px) saturate(1.8);border-color:rgba(255,255,255,.7)}#lbab[data-s=glass] .t{background:rgba(255,255,255,.55);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}' +
    '#lbab[data-s=color]{background:linear-gradient(135deg,#c9506b,#9e2f4a);border:0}#lbab[data-s=color] a,#lbab[data-s=color] button{color:#fff}#lbab[data-s=color] a.on .t{background:linear-gradient(160deg,#fff,#ffe3ea);box-shadow:0 10px 22px rgba(0,0,0,.25)}' +
    '#lbab[data-s=mini]{height:58px;align-items:center;padding:0 10px;left:50%;right:auto;transform:translateX(-50%);width:auto;gap:6px;border-radius:999px}#lbab[data-s=mini] a,#lbab[data-s=mini] button{flex:0 0 auto}#lbab[data-s=mini] .l{display:none}#lbab[data-s=mini] .t{width:44px;height:44px;margin:0;border-radius:50%;font-size:21px}#lbab[data-s=mini].lp{transform:translateX(-50%) scale(.97)}' +
    '#lbab[data-s=glossy]{background:linear-gradient(180deg,rgba(255,255,255,.5) 0,rgba(255,255,255,.12) 46%,rgba(255,255,255,0) 50%),linear-gradient(135deg,#c9506b,#9e2f4a);border:1px solid rgba(255,255,255,.45);box-shadow:0 14px 34px rgba(158,47,74,.38),inset 0 1px 0 rgba(255,255,255,.8),inset 0 -3px 8px rgba(0,0,0,.18)}' +
    '#lbab[data-s=glossy] a,#lbab[data-s=glossy] button{color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.25)}#lbab[data-s=glossy] .t,#lbab[data-s=color] .t{color:#5a4048;text-shadow:none}' +
    '#lbab[data-s=glossy] .t,#lbab[data-s=pearl] .t{background:linear-gradient(180deg,#fff 0,#fdf3f6 48%,#f3dde4 52%,#fbeef2 100%);box-shadow:0 8px 18px rgba(60,30,40,.25),inset 0 2px 0 #fff,inset 0 -3px 6px rgba(158,47,74,.12);border:1px solid rgba(255,255,255,.95)}' +
    '#lbab[data-s=glossy] a.on .t{background:linear-gradient(180deg,#fff6d8 0,#ffe39a 48%,#f6c75a 52%,#ffe08a 100%)}' +
    '#lbab[data-s=pearl]{background:linear-gradient(180deg,rgba(255,255,255,var(--lb-ba,.98)) 0,rgba(255,255,255,calc(var(--lb-ba,.82) * .85)) 48%,rgba(246,232,238,calc(var(--lb-ba,.82) * .95)) 52%,rgba(255,255,255,var(--lb-ba,.9)) 100%);border:1px solid #fff;box-shadow:0 14px 34px rgba(60,30,40,.22),inset 0 1px 0 #fff,inset 0 -2px 6px rgba(158,47,74,.1)}' +
    'body.nav-open #lbab{opacity:0;pointer-events:none}' +
    'body.lbab-on{padding-bottom:calc(96px + env(safe-area-inset-bottom))!important}}' +
    '.lbab-tip{position:fixed;left:50%;bottom:calc(112px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9001;background:rgba(40,22,30,.9);color:#fff;font:600 12px/1.3 system-ui,sans-serif;padding:8px 13px;border-radius:999px;white-space:nowrap;pointer-events:none;transition:opacity .4s}' +
    '.lbab-bg{position:fixed;inset:0;z-index:2147483000;background:rgba(30,15,22,.45);display:flex;align-items:flex-end;justify-content:center}' +
    '.lbab-sh{background:#fdfbf9;color:#3a2530;width:min(520px,100%);max-height:80vh;overflow:auto;border-radius:22px 22px 0 0;padding:0 16px calc(16px + env(safe-area-inset-bottom));font-family:"Space Grotesk",system-ui,sans-serif}' +
    '.lbab-sh .h{position:sticky;top:0;background:#fdfbf9;display:flex;align-items:center;gap:10px;padding:16px 0 10px;z-index:2}.lbab-sh .h b{font-size:17px}.lbab-sh .h button{margin-left:auto;width:40px;height:40px;border-radius:50%;border:1px solid #eadfe3;background:#fff;font-size:17px;cursor:pointer}' +
    '.lbab-sh .s{font-size:12.5px;color:#8a7078;margin:2px 0 12px}' +
    '.lbab-sh .g{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}' +
    '.lbab-sh .g button{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;border:1.5px solid #eee2e0;background:#fff;border-radius:14px;padding:10px 4px;font-size:11px;font-weight:600;line-height:1.15;font-family:inherit;color:inherit;cursor:pointer}' +
    '.lbab-sh .g button span:first-child{font-size:24px}.lbab-sh .g button.on{border-color:#9e2f4a;background:#fff4f7}' +
    '.lbab-sh .g button i{position:absolute;top:4px;right:6px;font-style:normal;font-size:11px;font-weight:800;color:#fff;background:#9e2f4a;border-radius:999px;min-width:18px;height:18px;line-height:18px}' +
    '.lbab-sh h4{margin:4px 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#9e2f4a}.lbab-sh .st{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}' +
    '.lbab-sh .st button{border:1.5px solid #eee2e0;background:#fff;border-radius:14px;padding:8px 6px 7px;font-size:12px;font-weight:600;line-height:1.2;font-family:inherit;color:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px}.lbab-sh .st button.on{border-color:#9e2f4a;background:#fff4f7}' +
    '.lbab-sh .st i{display:block;width:100%;height:22px;margin-top:6px;border-radius:9px;position:relative;border:1px solid #eadfe3}.lbab-sh .st i:before,.lbab-sh .st i:after{content:"";position:absolute;top:-5px;width:16px;height:16px;border-radius:6px;background:inherit;box-shadow:0 2px 5px rgba(0,0,0,.18)}.lbab-sh .st i:before{left:22%}.lbab-sh .st i:after{right:22%}' +
    '.lbab-sh .f{display:flex;gap:8px;margin-top:14px}.lbab-sh .f button{flex:1;border-radius:12px;padding:12px;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;border:1px solid #eadfe3;background:#fff;color:inherit}.lbab-sh .f .go{background:linear-gradient(135deg,#c9506b,#9e2f4a);color:#fff;border:0}';
  var STYLES = [['raised', 'Raised', 'linear-gradient(#fff,#f3e6ea)'], ['flat', 'Flat', '#fff'], ['glass', 'Glass', 'rgba(255,255,255,.5)'],
    ['glossy', 'Glossy', 'linear-gradient(180deg,rgba(255,255,255,.55) 0,rgba(255,255,255,.1) 46%,transparent 50%),linear-gradient(135deg,#c9506b,#9e2f4a)'], ['pearl', 'Pearl', 'linear-gradient(180deg,#fff 0,#fff 48%,#f3dde4 52%,#fff 100%)'], ['dark', 'Dark', '#2a1c22'], ['color', 'Color', 'linear-gradient(135deg,#c9506b,#9e2f4a)'], ['mini', 'Mini pill', '#fdeef2']];
  var SKEY = 'lbAppBarStyle';
  function getStyle() { try { return localStorage.getItem(SKEY) || 'raised'; } catch (e) { return 'raised'; } }
  var bar = null;
  function draw() {
    if (!bar) return;
    var list = load();
    bar.innerHTML = list.map(function (h) { var a = app(h); return '<a href="' + esc(h) + '"' + (h.toLowerCase() === page ? ' class="on"' : '') + ' aria-label="' + esc(a[2]) + '"><span class="t">' + a[1] + '</span><span class="l">' + esc(a[2]) + '</span></a>'; }).join('') +
'';
    bar.setAttribute('data-s', getStyle());
    try { if (window.LBIcons) LBIcons.scan(bar); } catch (e) {}
  }
  function edit() {
    var pick = load(), bg = document.createElement('div'); bg.className = 'lbab-bg';
    bg.innerHTML = '<div class="lbab-sh" role="dialog" aria-modal="true"><div class="h"><b>✎ My app bar</b><button type="button" data-x aria-label="Close">✕</button></div>' +
      '<div class="s">Tap up to ' + MAX + ' apps — the number shows their order in the bar. Saved on this device. (Long-press the bar anytime to come back here.)</div><h4>Bar style</h4><div class="st"></div><h4 style="margin-top:16px">Apps</h4><div class="g"></div>' +
      '<div class="f"><button type="button" data-r>Reset</button><button type="button" class="go" data-s>Save</button></div></div>';
    document.body.appendChild(bg);
    // the finger that long-pressed is still down: ignore its lift-up 'click' (it would tick an app under it)
    var armed = false; bg.addEventListener('pointerdown', function () { armed = true; }, true);
    bg.addEventListener('click', function (e) { if (!armed) { e.preventDefault(); e.stopPropagation(); } }, true);
    var g = bg.querySelector('.g');
    function paint() { g.innerHTML = APPS.map(function (a) { var i = pick.indexOf(a[0]); return '<button type="button" data-h="' + esc(a[0]) + '" class="' + (i > -1 ? 'on' : '') + '"><span>' + a[1] + '</span><span>' + esc(a[2]) + '</span>' + (i > -1 ? '<i>' + (i + 1) + '</i>' : '') + '</button>'; }).join(''); try { if (window.LBIcons) LBIcons.scan(g); } catch (e) {} }
    paint();
    var sty = getStyle(), stEl = bg.querySelector('.st');
    function paintSt() { stEl.innerHTML = STYLES.map(function (x) { return '<button type="button" data-st="' + x[0] + '" class="' + (x[0] === sty ? 'on' : '') + '"><i style="background:' + x[2] + '"></i>' + x[1] + '</button>'; }).join(''); }
    paintSt();
    stEl.onclick = function (e) { var b = e.target.closest('[data-st]'); if (!b) return; sty = b.getAttribute('data-st'); paintSt(); if (bar) bar.setAttribute('data-s', sty); };
    g.onclick = function (e) { var b = e.target.closest('[data-h]'); if (!b) return; var h = b.getAttribute('data-h'), i = pick.indexOf(h);
      if (i > -1) pick.splice(i, 1); else if (pick.length < MAX) pick.push(h); else { pick.shift(); pick.push(h); } paint(); };
    bg.onclick = function (e) {
      if (e.target === bg || e.target.closest('[data-x]')) { if (bar) bar.setAttribute('data-s', getStyle()); bg.remove(); return; }
      if (e.target.closest('[data-r]')) { pick = DEF.filter(app).slice(0, MAX); paint(); sty = 'raised'; paintSt(); if (bar) bar.setAttribute('data-s', sty); return; }
      if (e.target.closest('[data-s]')) { if (!pick.length) pick = DEF.filter(app).slice(0, MAX); save(pick); try { localStorage.setItem(SKEY, sty); } catch (x) {} bg.remove(); draw(); } };
  }
  function mount() {
    if (document.getElementById('lbab')) return;
    var st = document.createElement('style'); st.id = 'lbabCss'; st.textContent = css; document.head.appendChild(st);
    bar = document.createElement('nav'); bar.id = 'lbab'; bar.setAttribute('aria-label', 'Apps');
    document.body.appendChild(bar); document.body.classList.add('lbab-on'); draw();
    // long-press anywhere on the bar → edit apps + bar style
    var tm = 0, sx = 0, sy = 0, fired = false;
    function stop() { clearTimeout(tm); tm = 0; bar.classList.remove('lp'); }
    bar.addEventListener('pointerdown', function (e) { fired = false; sx = e.clientX; sy = e.clientY; bar.classList.add('lp');
      tm = setTimeout(function () { fired = true; stop(); try { navigator.vibrate && navigator.vibrate(18); } catch (x) {} edit(); }, 550); });
    bar.addEventListener('pointermove', function (e) { if (tm && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) stop(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { bar.addEventListener(ev, stop); });
    bar.addEventListener('click', function (e) { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
    bar.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // one-time hint
    try { if (!localStorage.getItem('lbAppBarTip')) { localStorage.setItem('lbAppBarTip', '1');
      var tip = document.createElement('div'); tip.className = 'lbab-tip'; tip.textContent = 'Tip: long-press the bar to change apps & style';
      document.body.appendChild(tip); setTimeout(function () { tip.style.opacity = 0; setTimeout(function () { tip.remove(); }, 500); }, 4000); } } catch (x) {}
  }
  window.LBAppBar = { edit: function () { edit(); }, refresh: draw };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
