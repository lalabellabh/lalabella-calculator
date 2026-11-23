/* LALABELLA — phone app bar (Nov 23 2026, Bench: "malalaki ang icon, parang nakapatong, pwede mag-add ng ibang apps").
 * A bottom bar on phones with big raised app icons. ✎ at the end: pick which apps sit in the bar (up to 5), saved on this device.
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
      'border-radius:24px;background:rgba(255,255,255,.82);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);border:1px solid rgba(255,255,255,.9);box-shadow:0 14px 36px rgba(60,30,40,.22)}' +
    '#lbab a,#lbab button{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px;text-decoration:none;color:#5a4048;font:600 10px/1.1 "Space Grotesk",system-ui,sans-serif;border:0;background:none;padding:0;cursor:pointer}' +
    '#lbab .t{width:54px;height:54px;margin-top:-26px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:27px;background:linear-gradient(160deg,#fff,#f6eef0);' +
      'box-shadow:0 8px 18px rgba(60,30,40,.2),inset 0 1px 0 #fff,inset 0 -2px 4px rgba(0,0,0,.05);border:1px solid rgba(255,255,255,.95);transition:transform .15s}' +
    '#lbab a:active .t,#lbab button:active .t{transform:translateY(2px) scale(.96)}' +
    '#lbab a.on .t{background:linear-gradient(160deg,#ffe3ea,#f7c9d5);box-shadow:0 10px 22px rgba(158,47,74,.3),inset 0 1px 0 #fff}#lbab a.on{color:#9e2f4a}' +
    '#lbab .l{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#lbab .ed .t{width:38px;height:38px;margin-top:-10px;border-radius:50%;font-size:17px;background:#fff}' +
    'body.lbab-on{padding-bottom:calc(96px + env(safe-area-inset-bottom))!important}}' +
    '.lbab-bg{position:fixed;inset:0;z-index:2147483000;background:rgba(30,15,22,.45);display:flex;align-items:flex-end;justify-content:center}' +
    '.lbab-sh{background:#fdfbf9;color:#3a2530;width:min(520px,100%);max-height:80vh;overflow:auto;border-radius:22px 22px 0 0;padding:0 16px calc(16px + env(safe-area-inset-bottom));font-family:"Space Grotesk",system-ui,sans-serif}' +
    '.lbab-sh .h{position:sticky;top:0;background:#fdfbf9;display:flex;align-items:center;gap:10px;padding:16px 0 10px;z-index:2}.lbab-sh .h b{font-size:17px}.lbab-sh .h button{margin-left:auto;width:40px;height:40px;border-radius:50%;border:1px solid #eadfe3;background:#fff;font-size:17px;cursor:pointer}' +
    '.lbab-sh .s{font-size:12.5px;color:#8a7078;margin:2px 0 12px}' +
    '.lbab-sh .g{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}' +
    '.lbab-sh .g button{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;border:1.5px solid #eee2e0;background:#fff;border-radius:14px;padding:10px 4px;font-size:11px;font-weight:600;line-height:1.15;font-family:inherit;color:inherit;cursor:pointer}' +
    '.lbab-sh .g button span:first-child{font-size:24px}.lbab-sh .g button.on{border-color:#9e2f4a;background:#fff4f7}' +
    '.lbab-sh .g button i{position:absolute;top:4px;right:6px;font-style:normal;font-size:11px;font-weight:800;color:#fff;background:#9e2f4a;border-radius:999px;min-width:18px;height:18px;line-height:18px}' +
    '.lbab-sh .f{display:flex;gap:8px;margin-top:14px}.lbab-sh .f button{flex:1;border-radius:12px;padding:12px;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;border:1px solid #eadfe3;background:#fff;color:inherit}.lbab-sh .f .go{background:linear-gradient(135deg,#c9506b,#9e2f4a);color:#fff;border:0}';
  var bar = null;
  function draw() {
    if (!bar) return;
    var list = load();
    bar.innerHTML = list.map(function (h) { var a = app(h); return '<a href="' + esc(h) + '"' + (h.toLowerCase() === page ? ' class="on"' : '') + ' aria-label="' + esc(a[2]) + '"><span class="t">' + a[1] + '</span><span class="l">' + esc(a[2]) + '</span></a>'; }).join('') +
      '<button type="button" class="ed" aria-label="Edit apps"><span class="t">✎</span><span class="l">Edit</span></button>';
    bar.querySelector('.ed').onclick = edit;
    try { if (window.LBIcons) LBIcons.scan(bar); } catch (e) {}
  }
  function edit() {
    var pick = load(), bg = document.createElement('div'); bg.className = 'lbab-bg';
    bg.innerHTML = '<div class="lbab-sh" role="dialog" aria-modal="true"><div class="h"><b>✎ My app bar</b><button type="button" data-x aria-label="Close">✕</button></div>' +
      '<div class="s">Tap up to ' + MAX + ' apps — the number shows their order in the bar. Saved on this device.</div><div class="g"></div>' +
      '<div class="f"><button type="button" data-r>Reset</button><button type="button" class="go" data-s>Save</button></div></div>';
    document.body.appendChild(bg);
    var g = bg.querySelector('.g');
    function paint() { g.innerHTML = APPS.map(function (a) { var i = pick.indexOf(a[0]); return '<button type="button" data-h="' + esc(a[0]) + '" class="' + (i > -1 ? 'on' : '') + '"><span>' + a[1] + '</span><span>' + esc(a[2]) + '</span>' + (i > -1 ? '<i>' + (i + 1) + '</i>' : '') + '</button>'; }).join(''); try { if (window.LBIcons) LBIcons.scan(g); } catch (e) {} }
    paint();
    g.onclick = function (e) { var b = e.target.closest('[data-h]'); if (!b) return; var h = b.getAttribute('data-h'), i = pick.indexOf(h);
      if (i > -1) pick.splice(i, 1); else if (pick.length < MAX) pick.push(h); else { pick.shift(); pick.push(h); } paint(); };
    bg.onclick = function (e) {
      if (e.target === bg || e.target.closest('[data-x]')) { bg.remove(); return; }
      if (e.target.closest('[data-r]')) { pick = DEF.filter(app).slice(0, MAX); paint(); return; }
      if (e.target.closest('[data-s]')) { if (!pick.length) pick = DEF.filter(app).slice(0, MAX); save(pick); bg.remove(); draw(); } };
  }
  function mount() {
    if (document.getElementById('lbab')) return;
    var st = document.createElement('style'); st.id = 'lbabCss'; st.textContent = css; document.head.appendChild(st);
    bar = document.createElement('nav'); bar.id = 'lbab'; bar.setAttribute('aria-label', 'Apps');
    document.body.appendChild(bar); document.body.classList.add('lbab-on'); draw();
  }
  window.LBAppBar = { edit: function () { edit(); }, refresh: draw };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
