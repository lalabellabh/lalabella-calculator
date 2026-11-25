/* LALABELLA — section shortcuts (Nov 25 2026, Bench: "sa lahat ng page ng chocolate may shortcut na sa taas, pati flower, item inventory at coffee").
 * A row of small pill links at the top of every Chocolate / Flower / Item Inventory / Café page, to jump to the other pages of
 * the same section (+ the other calcs). The page you are on is highlighted. Loaded by shared/nav.js.
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
    cafe: [['cafe-hub.html', '🏪', 'Café Stock Room'], ['cafe-inventory.html', '☕', 'Café Items'], ['item-inventory.html', '📦', 'Item Inventory'], ['item-dashboard.html', '📊', 'Item Dashboard']]
  };
  var EXTRA = { 'receiving-approval.html': 'chocolate', 'chocolate-odoo-import.html': 'chocolate', 'flower-odoo-import.html': 'flower', 'item-odoo-import.html': 'item' };
  var key = EXTRA[page] || null;
  if (!key) for (var k in S) { if (S[k].some(function (x) { return x[0].split('?')[0] === page && x[0] !== 'index.html' && x[0] !== 'flower-tools.html'; })) { key = k; break; } }
  if (/^cafe-/.test(page)) key = 'cafe';
  if (!key) return;
  var admin = false; try { admin = String(JSON.parse(sessionStorage.getItem('lalabellaUser') || localStorage.getItem('lalabellaUser') || '{}').role || '').toLowerCase() === 'admin'; } catch (e) {}
  var list = S[key].filter(function (x) { return x[3] !== 'admin' || admin; });
  var css = '.lbsb{display:flex;gap:6px;max-width:100%;box-sizing:border-box;min-width:0;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:2px 2px 6px;margin:0 0 10px;position:relative;z-index:5}.lbsb::-webkit-scrollbar{display:none}' +
    '.lbsb a{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:99px;background:rgba(255,255,255,.78);border:1px solid rgba(0,0,0,.08);color:#5a3a46;font:700 12px/1.3 "Space Grotesk",system-ui,sans-serif;text-decoration:none;white-space:nowrap}' +
    '.lbsb a.on{background:#a8405e;color:#fff;border-color:#a8405e}.lbsb a:hover{border-color:rgba(168,64,94,.4)}' +
    '@media(min-width:901px){.lbsb{flex-wrap:wrap;overflow:visible}}@media print{.lbsb{display:none!important}}';
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var tries = 0;
  function mount() {
    if (document.querySelector('.lbsb,[data-lb-shortcuts]')) return;
    var host = null, C = ['#app', '.wrap', '.container', 'main', '.page', '.content', '.app-main', '.main'];
    for (var i = 0; i < C.length && !host; i++) { var el = document.querySelector(C[i]); if (el && el.offsetWidth > 200 && getComputedStyle(el).position !== 'fixed') host = el; }
    if (!host && ++tries < 15) { setTimeout(mount, 400); return; }   // page content still hidden while it loads
    if (!host) host = document.body;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var bar = document.createElement('nav'); bar.className = 'lbsb'; bar.setAttribute('aria-label', 'Shortcuts');
    bar.innerHTML = list.map(function (x) { var on = x[0].split('?')[0] === page; return '<a href="' + esc(x[0]) + '"' + (on ? ' class="on" aria-current="page"' : '') + '>' + x[1] + ' ' + esc(x[2]) + '</a>'; }).join('');
    // after a "← back" link if the page starts with one, else at the very top
    var first = host.firstElementChild, back = first && /back|←|&larr;/i.test((first.className || '') + ' ' + first.textContent.slice(0, 20)) && first.tagName === 'A' ? first : null;
    // in a grid / row-flex box (the dashboards) the bar takes the whole first row
    var hd = getComputedStyle(host).display, row = /grid/.test(hd) || (/flex/.test(hd) && !/column/.test(getComputedStyle(host).flexDirection));
    if (row) { bar.style.gridColumn = '1 / -1'; bar.style.flexBasis = '100%'; bar.style.order = '-1'; }
    var tb = document.querySelector('.topbar');   // dashboards: right under their title bar
    if (tb && tb.offsetWidth > 200 && getComputedStyle(tb).position !== 'fixed') { bar.style.gridColumn = '1 / -1'; bar.style.order = ''; bar.style.flexBasis = '100%'; bar.style.margin = '0 0 10px'; tb.parentNode.insertBefore(bar, tb.nextSibling); }
    else host.insertBefore(bar, back ? back.nextSibling : host.firstChild);
    // keep clear of the ☰ button (fixed, top-left)
    function clearBurger() {
      bar.style.marginLeft = '';
      var bt = [].slice.call(document.querySelectorAll('.choco-nav-toggle,.nav-toggle,.lbnav-btn')).filter(function (e) { return e.offsetWidth; })[0];
      if (!bt) return; var a = bt.getBoundingClientRect(), r = bar.getBoundingClientRect();
      if (a.right > r.left && a.left < r.right && a.bottom > r.top && a.top < r.bottom) bar.style.marginLeft = Math.ceil(a.right - r.left + 8) + 'px';
    }
    clearBurger(); setTimeout(clearBurger, 600);
    var cur = bar.querySelector('.on'); if (cur && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = Math.max(0, cur.offsetLeft - 40);
    try { if (window.LBIcons) LBIcons.scan(bar); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(mount, 0); }); else setTimeout(mount, 0);
})();
