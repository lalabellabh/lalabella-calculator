/* LALABELLA — section shortcuts (Nov 25 2026, Bench: "sa lahat ng page ng chocolate may shortcut na sa taas, pati flower, item inventory at coffee").
 * A row of small pill links at the top of every Chocolate / Flower / Item Inventory / Café page, to jump to the other pages of
 * the same section (+ the other calcs). The page you are on is highlighted. tune icon = pick your own, ‹ = fold ("Shortcuts ›" brings it back).
 * Stays on top while you scroll (sticky). Saved on this device per section. Loaded by shared/nav.js.
 * Skipped on pages that already have their own row (the calcs, Calc Sales) and on the home hubs.
 */
(function () {
  if (window.LBSectionBar) return; window.LBSectionBar = 1;
  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var SKIP = ['index.html', 'flower-tools.html', 'chocolate-calc.html', 'flower-calc.html', 'mixed-calc.html', 'calc-sales.html', 'office.html', 'login.html', 'driver.html'];
  if (SKIP.indexOf(page) > -1 || window.top !== window.self) return;
  var S = {
    chocolate: [['index.html', '🏠', 'Choco Home'], ['dashboard.html', '📊', 'Dashboard'], ['chocolate-receiving.html', '📥', 'Receiving'], ['chocolate-release.html', '📤', 'Release'],
      ['stock-count.html', '📋', 'Stock Count'], ['stock-approval.html', '✅', 'Stock Approval'], ['chocolate-arrangements.html', '🎁', 'Arrangements'], ['chocolate-barcode.html', '🏷️', 'Barcode'],
      ['chocolate-calc.html', '🍫', 'Choco Calc'], ['calc-sales.html?kind=chocolate', '🧾', 'Choco Sales'], ['mixed-calc.html', '💐', 'Mixed Calc'], ['flower-calc.html', '🌸', 'Flower Calc'],
      ['chocolate-admin.html', '🔐', 'Admin', 'admin'], ['chocolate-photos.html', '🖼️', 'Photos', 'admin'], ['chocolate-guide.html', '📖', 'Guide']],
    flower: [['flower-tools.html', '🏠', 'Flower Tools'], ['flower-dashboard.html', '📊', 'Dashboard'], ['flower-receiving.html', '🛒', 'Receiving'], ['flower-purchase.html', '🧾', 'Purchase'],
      ['flower-stock-count.html', '📋', 'Stock Count'], ['flower-catalog.html', '📚', 'Catalog'], ['flower-arrangements.html', '💐', 'Arrangements'], ['flower-transfer.html', '🔄', 'Transfer'],
      ['flower-barcode.html', '🏷️', 'Barcode'], ['flower-calc.html', '🌸', 'Flower Calc'], ['calc-sales.html?kind=flower', '🧾', 'Flower Sales'], ['mixed-calc.html', '💐', 'Mixed Calc'],
      ['chocolate-calc.html', '🍫', 'Choco Calc'], ['flower-admin.html', '🔐', 'Admin', 'admin'], ['flower-photos.html', '🖼️', 'Photos', 'admin'], ['flower-guide.html', '📖', 'Guide']],
    item: [['item-inventory.html', '📦', 'Item Inventory'], ['item-dashboard.html', '📊', 'Item Dashboard'], ['item-saudi.html', '🚚', 'Saudi Transfers'],
      ['cafe-inventory.html', '☕', 'Café Items'], ['cafe-hub.html', '🏪', 'Café Stock Room'], ['item-admin.html', '🔐', 'Admin', 'admin'], ['item-photos.html', '🖼️', 'Photos', 'admin']],
    // Nov 25 2026 (Bench: "itong live order lagyan mo ng shortcut sa taas")
    orders: [['live-orders.html', '🎁', 'Live Orders'], ['flower-dashboard.html', '📊', 'Flower Dashboard'], ['dashboard.html', '📊', 'Choco Dashboard'],
      ['flower-calc.html', '🌸', 'Flower Calc'], ['chocolate-calc.html', '🍫', 'Choco Calc'], ['mixed-calc.html', '💐', 'Mixed Calc'], ['calc-sales.html', '🧾', 'Calc Sales'],
      ['order-form.html', '📝', 'Order Form'], ['petty-cash.html', '💰', 'Petty Cash']],
    cafe: [['cafe-hub.html', '🏪', 'Café Stock Room'], ['cafe-inventory.html', '☕', 'Café Items'], ['item-inventory.html', '📦', 'Item Inventory'], ['item-dashboard.html', '📊', 'Item Dashboard']]
  };
  var EXTRA = { 'receiving-approval.html': 'chocolate', 'chocolate-odoo-import.html': 'chocolate', 'flower-odoo-import.html': 'flower', 'item-odoo-import.html': 'item', 'live-orders.html': 'orders' };
  var key = EXTRA[page] || null;
  if (!key) for (var k in S) { if (S[k].some(function (x) { return x[0].split('?')[0] === page && x[0] !== 'index.html' && x[0] !== 'flower-tools.html'; })) { key = k; break; } }
  if (/^cafe-/.test(page)) key = 'cafe';
  if (!key) return;
  var admin = false; try { admin = String(JSON.parse(sessionStorage.getItem('lalabellaUser') || localStorage.getItem('lalabellaUser') || '{}').role || '').toLowerCase() === 'admin'; } catch (e) {}
  var vis = function (x) { return x[3] !== 'admin' || admin; };
  var DEF = S[key].filter(vis);
  // ✎ Edit (Nov 25 2026, Bench: "lagyan mo ng edit para kung ano gusto nila na shortcut, tapos ung ✕, at naka-fix sa taas")
  var ALL = [], seen = {};
  var PRE = { chocolate: 'Choco ', flower: 'Flower ', item: 'Item ', cafe: '', orders: '' }, GEN = /^(Dashboard|Receiving|Stock Count|Barcode|Admin|Photos|Guide|Arrangements|Release|Purchase|Catalog|Transfer|Stock Approval)$/;
  function tag(sec) { return S[sec].map(function (x) { return GEN.test(x[2]) ? [x[0], x[1], PRE[sec] + x[2], x[3]] : x; }); }
  [].concat(tag('chocolate'), tag('flower'), tag('item'), tag('cafe'), [['live-orders.html', '🎁', 'Live Orders'], ['petty-cash.html', '💰', 'Petty Cash'], ['order-form.html', '📝', 'Order Form'],
    ['card-print.html', '💌', 'Card Print'], ['schedule.html', '📆', 'Duty Schedule'], ['attendance.html', '🕒', 'Attendance'], ['notes.html', '🗒️', 'Notes'], ['profile.html', '👤', 'My Profile'],
    ['calc-sales.html', '🧾', 'All Calc Sales']]).forEach(function (x) { if (!seen[x[0]] && vis(x)) { seen[x[0]] = 1; ALL.push(x); } });
  var KEY = 'lbShort:' + key, HKEY = 'lbShortHide:' + key;
  function byHref(h) { for (var i = 0; i < ALL.length; i++) if (ALL[i][0] === h) return ALL[i]; return null; }
  function load() { try { var a = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(a) && a.length) { var l = a.map(byHref).filter(Boolean); if (l.length) return l; } } catch (e) {} return DEF; }
  function hiddenNow() { try { return localStorage.getItem(HKEY) === '1'; } catch (e) { return false; } }
  function setHidden(v) { try { if (v) localStorage.setItem(HKEY, '1'); else localStorage.removeItem(HKEY); } catch (e) {} }
  var css = '.lbsb{position:sticky;top:8px;z-index:60;display:flex;align-items:center;gap:6px;max-width:100%;box-sizing:border-box;min-width:0;contain:inline-size;overflow:hidden;padding:4px 5px;margin:0 0 10px;border-radius:16px;' +
      'background:rgba(255,255,255,.62);backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3);border:1px solid rgba(255,255,255,.75);box-shadow:0 6px 18px rgba(60,30,40,.1)}' +
    '.lbsb-s{flex:1;min-width:0;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}.lbsb-s::-webkit-scrollbar{display:none}' +
    '.lbsb a,.lbsb-b{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:99px;background:rgba(255,255,255,.85);border:1px solid rgba(0,0,0,.08);color:#5a3a46;font:700 12px/1.3 "Space Grotesk",system-ui,sans-serif;text-decoration:none;white-space:nowrap;cursor:pointer}' +
    '.lbsb a.on{background:#a8405e;color:#fff;border-color:#a8405e}' +
    /* Nov 25 2026 (Bench: "ito din"): a pill lifts and glows under the cursor / finger, like the side dock */
    '.lbsb a{transition:transform .18s ease,box-shadow .18s ease,color .18s ease,border-color .18s ease,background .18s ease}' +
    '.lbsb a:hover,.lbsb a:active,.lbsb a:focus-visible{transform:translateY(-2px) scale(1.05);color:#9e2f4a;border-color:rgba(168,64,94,.45);background:#fff;box-shadow:0 6px 14px rgba(158,47,74,.22)}' +
    '.lbsb a.on:hover,.lbsb a.on:active{color:#fff;background:#b8486a}.lbsb-s{padding:3px 2px}' +
    /* Nov 25 2026: premium controls — a small capsule (tune + fold arrow) instead of loose ✎ ✕ */
    '.lbsb-ctl{flex:0 0 auto;display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:99px;background:linear-gradient(180deg,rgba(255,255,255,.9),rgba(246,236,240,.85));border:1px solid rgba(158,47,74,.14);box-shadow:inset 0 1px 0 #fff,0 2px 8px rgba(60,30,40,.08)}' +
    '.lbsb-b{width:28px;height:28px;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;border:0;background:transparent;color:#8a2f48;cursor:pointer;transition:background .15s,transform .15s}' +
    '.lbsb-b:hover{background:rgba(158,47,74,.1)}.lbsb-b:active{transform:scale(.92)}.lbsb-ctl .lbsb-b+.lbsb-b{border-left:1px solid rgba(158,47,74,.12);border-radius:0 50% 50% 0}' +
    '.lbsb-open{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 10px 0 12px;border-radius:99px;border:1px solid rgba(158,47,74,.18);cursor:pointer;color:#8a2f48;font:700 12px/1 "Space Grotesk",system-ui,sans-serif;' +
      'background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(246,236,240,.9));box-shadow:inset 0 1px 0 #fff,0 4px 12px rgba(60,30,40,.12)}.lbsb-open .d{width:7px;height:7px;border-radius:50%;background:linear-gradient(135deg,#c9506b,#9e2f4a);box-shadow:0 0 0 3px rgba(201,80,107,.15)}.lbsb-open:hover{transform:translateY(-1px)}' +
    '.lbsb.min{contain:none;overflow:visible;display:inline-flex;width:auto;padding:4px;background:transparent;border:0;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none}' +
    '@media(min-width:901px){.lbsb-s{flex-wrap:wrap;overflow:visible}}@media print{.lbsb{display:none!important}}' +
    '.lbsb-bg{position:fixed;inset:0;z-index:2147483000;background:rgba(30,15,22,.45);display:flex;align-items:flex-end;justify-content:center}' +
    '.lbsb-sh{background:#fdfbf9;color:#3a2530;width:min(560px,100%);max-height:82vh;overflow:auto;border-radius:22px 22px 0 0;padding:0 16px calc(16px + env(safe-area-inset-bottom));font-family:"Space Grotesk",system-ui,sans-serif}' +
    '@media(min-width:700px){.lbsb-bg{align-items:center}.lbsb-sh{border-radius:22px}}' +
    '.lbsb-sh .h{position:sticky;top:0;background:#fdfbf9;display:flex;align-items:center;gap:10px;padding:16px 0 8px;z-index:2}.lbsb-sh .h b{font-size:17px}.lbsb-sh .h button{margin-left:auto;width:40px;height:40px;border-radius:50%;border:1px solid #eadfe3;background:#fff;font-size:17px;cursor:pointer}' +
    '.lbsb-sh .s{font-size:12.5px;color:#8a7078;margin:2px 0 12px}.lbsb-sh .g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}' +
    '.lbsb-sh .g button{position:relative;display:flex;align-items:center;gap:6px;border:1.5px solid #eee2e0;background:#fff;border-radius:12px;padding:9px 8px;font:600 12px/1.2 inherit;font-family:inherit;color:inherit;cursor:pointer;text-align:left}' +
    '.lbsb-sh .g button.on{border-color:#9e2f4a;background:#fff4f7}.lbsb-sh .g button i{position:absolute;top:-6px;right:-4px;font-style:normal;font-size:10px;font-weight:800;color:#fff;background:#9e2f4a;border-radius:999px;min-width:17px;height:17px;line-height:17px;text-align:center}' +
    '.lbsb-sh .f{display:flex;gap:8px;margin-top:14px}.lbsb-sh .f button{flex:1;border-radius:12px;padding:12px;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;border:1px solid #eadfe3;background:#fff;color:inherit}.lbsb-sh .f .go{background:linear-gradient(135deg,#c9506b,#9e2f4a);color:#fff;border:0}' +
    '@media(max-width:480px){.lbsb-sh .g{grid-template-columns:repeat(2,minmax(0,1fr))}}';
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var bar = null;
  function draw() {
    if (!bar) return;
    if (hiddenNow()) {
      bar.className = 'lbsb min';
      bar.innerHTML = '<button type="button" class="lbsb-open" data-show title="Show shortcuts" aria-label="Show shortcuts"><span class="d"></span>Shortcuts<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>';
    } else {
      bar.className = 'lbsb';
      bar.innerHTML = '<div class="lbsb-s">' + load().map(function (x) { var on = x[0].split('?')[0] === page; return '<a href="' + esc(x[0]) + '"' + (on ? ' class="on" aria-current="page"' : '') + '>' + x[1] + ' ' + esc(x[2]) + '</a>'; }).join('') + '</div>' +
        '<span class="lbsb-ctl"><button type="button" class="lbsb-b" data-edit title="Edit shortcuts" aria-label="Edit shortcuts"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></button><button type="button" class="lbsb-b" data-hide title="Fold shortcuts" aria-label="Fold shortcuts"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button></span>';
      var sc = bar.querySelector('.lbsb-s'), cur = sc.querySelector('.on'); if (cur && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = Math.max(0, cur.offsetLeft - 40);
    }
    try { if (window.LBIcons) LBIcons.scan(bar); } catch (e) {}
    clearBurger();
  }
  function clearBurger() {   // keep clear of the ☰ button (fixed, top-left)
    if (!bar) return; bar.style.marginLeft = ''; bar.style.marginTop = '';
    var bt = [].slice.call(document.querySelectorAll('.choco-nav-toggle,.nav-toggle,.lbnav-btn')).filter(function (e) { return e.offsetWidth; })[0];
    if (!bt) return; var a = bt.getBoundingClientRect(), r = bar.getBoundingClientRect();
    if (a.right > r.left && a.left < r.right && a.bottom > r.top && a.top < r.bottom) bar.style.marginLeft = Math.ceil(a.right - r.left + 8) + 'px';
    // line the bar up with the ☰ (same height, same top) — Nov 25 2026, Bench: "ung alignment ng hamburger"
    if (getComputedStyle(bt).position === 'fixed' && bar.style.position !== 'relative' && !bar.classList.contains('min') && window.scrollY < 5) {
      bar.style.minHeight = Math.round(a.height) + 'px'; bar.style.top = Math.round(a.top) + 'px';   // as tall as the ☰, on the same line
      var r2 = bar.getBoundingClientRect(), d = Math.round(a.top - r2.top), mt = parseFloat(getComputedStyle(bar).marginTop) || 0;
      if (Math.abs(d) > 1 && Math.abs(d) < 60 && mt + d >= -40) bar.style.marginTop = (mt + d) + 'px';
    }
  }
  function edit() {
    var pick = load().map(function (x) { return x[0]; }), bg = document.createElement('div'); bg.className = 'lbsb-bg';
    bg.innerHTML = '<div class="lbsb-sh" role="dialog" aria-modal="true"><div class="h"><b>✎ My shortcuts</b><button type="button" data-x aria-label="Close">✕</button></div>' +
      '<div class="s">Tap the pages you want on top — the number is the order. Saved on this device.</div><div class="g"></div>' +
      '<div class="f"><button type="button" data-r>Reset</button><button type="button" class="go" data-s>Save</button></div></div>';
    document.body.appendChild(bg);
    var g = bg.querySelector('.g');
    function paint() { g.innerHTML = ALL.map(function (x) { var i = pick.indexOf(x[0]); return '<button type="button" data-h="' + esc(x[0]) + '" class="' + (i > -1 ? 'on' : '') + '"><span>' + x[1] + '</span><span>' + esc(x[2]) + '</span>' + (i > -1 ? '<i>' + (i + 1) + '</i>' : '') + '</button>'; }).join(''); try { if (window.LBIcons) LBIcons.scan(g); } catch (e) {} }
    paint();
    g.onclick = function (e) { var b = e.target.closest('[data-h]'); if (!b) return; var h = b.getAttribute('data-h'), i = pick.indexOf(h); if (i > -1) pick.splice(i, 1); else pick.push(h); paint(); };
    bg.onclick = function (e) {
      if (e.target === bg || e.target.closest('[data-x]')) { bg.remove(); return; }
      if (e.target.closest('[data-r]')) { pick = DEF.map(function (x) { return x[0]; }); paint(); return; }
      if (e.target.closest('[data-s]')) { try { if (pick.length) localStorage.setItem(KEY, JSON.stringify(pick)); else localStorage.removeItem(KEY); } catch (x) {} bg.remove(); draw(); }
    };
  }
  var tries = 0;
  function mount() {
    if (document.querySelector('.lbsb,[data-lb-shortcuts]')) return;
    var host = null, C = ['#app', '.wrap', '.container', 'main', '.page', '.content', '.app-main', '.main'];
    for (var i = 0; i < C.length && !host; i++) { var el = document.querySelector(C[i]); if (el && el.offsetWidth > 200 && getComputedStyle(el).position !== 'fixed') host = el; }
    var any = C.some(function (q) { return document.querySelector(q); });
    if (!host && any && ++tries < 6) { setTimeout(mount, 350); return; }   // page content still hidden while it loads
    if (!host) host = document.body;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    bar = document.createElement('nav'); bar.className = 'lbsb'; bar.setAttribute('aria-label', 'Shortcuts');
    // after a "← back" link if the page starts with one, else at the very top
    var first = host.firstElementChild, back = first && /back|←|&larr;/i.test((first.className || '') + ' ' + first.textContent.slice(0, 20)) && first.tagName === 'A' ? first : null;
    // in a grid / row-flex box (the dashboards) the bar takes the whole first row
    var hd = getComputedStyle(host).display, row = /grid/.test(hd) || (/flex/.test(hd) && !/column/.test(getComputedStyle(host).flexDirection));
    if (row) { bar.style.gridColumn = '1 / -1'; bar.style.flexBasis = '100%'; bar.style.order = '-1'; }
    var tb = document.querySelector('.topbar');   // dashboards: right under their title bar
    if (tb && tb.offsetWidth > 200 && getComputedStyle(tb).position !== 'fixed') {
      bar.style.gridColumn = '1 / -1'; bar.style.order = ''; bar.style.flexBasis = '100%';
      var gp = tb.parentNode;   // inside a scrolling grid a sticky bar can't stay on top -> put it just above the grid box
      // (a fixed one-screen grid, like the dashboards on a computer, doesn't scroll at all -> the bar just sits under the title)
      if (/grid/.test(getComputedStyle(gp).display) && getComputedStyle(gp).position !== 'fixed' && gp !== document.body && gp.parentNode) { var r0 = tb.getBoundingClientRect(); bar.style.margin = '0 ' + Math.max(0, Math.round(innerWidth - r0.right)) + 'px 10px ' + Math.max(0, Math.round(r0.left)) + 'px'; gp.parentNode.insertBefore(bar, gp); }
      else if (/grid/.test(getComputedStyle(gp).display)) {   // fixed one-screen grid: an extra row would squash the others -> the bar goes inside the title bar, on its own line
        if (/flex/.test(getComputedStyle(tb).display)) tb.style.flexWrap = 'wrap';
        bar.style.margin = '6px 0 0'; bar.style.position = 'relative'; bar.style.top = '0'; bar.style.flex = '1 1 100%'; bar.style.order = '99'; tb.appendChild(bar);
      }
      else tb.parentNode.insertBefore(bar, tb.nextSibling);
    }
    else host.insertBefore(bar, back ? back.nextSibling : host.firstChild);
    bar.addEventListener('click', function (e) {
      if (e.target.closest('[data-edit]')) edit();
      else if (e.target.closest('[data-hide]')) { setHidden(true); draw(); }
      else if (e.target.closest('[data-show]')) { setHidden(false); draw(); }
    });
    draw(); setTimeout(clearBurger, 600);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(mount, 0); }); else setTimeout(mount, 0);
})();
