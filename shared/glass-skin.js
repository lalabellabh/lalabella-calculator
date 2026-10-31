/* Glass skin loader — see glass-skin.css. Moves the page header / tabs / refresh into one top bar and
   arranges the boxes in columns on desktop. It only MOVES the page's own elements (same ids), so the page's own JS keeps working. */
(function () {
  var pg = (location.pathname.split('/').pop() || '').replace(/\.html$/i, '');
  // per page: grid columns (desktop), which element goes in which column, and groups of boxes stacked in one scrolling column
  var PAGES = {
    'chocolate-receiving': { cols: 'minmax(0,1.05fr) minmax(0,1fr) minmax(0,.8fr)', place: { '.pulse-card': ['3', '2'], '#historyList': ['2', '2'] } },
    'chocolate-release': { cols: 'minmax(0,1.1fr) minmax(0,1fr) minmax(0,.75fr)', col: ['.release-main'], place: { '.release-main': ['1', '2'], '.release-visual': ['3', '2'], '#historyList': ['2', '2'] } },
    'stock-count': { cols: 'minmax(0,1.15fr) minmax(0,.85fr)', col: ['.count-layout > div:first-child'], place: { '.count-layout > div:first-child': ['1', '2'], '.count-garden': ['2', '2'] } },
    'stock-approval': { cols: 'minmax(0,1fr) minmax(0,1fr)' },
    'initial-stock': { cols: 'minmax(0,1fr) minmax(0,1fr)' },
    'chocolate-arrangements': { cols: 'minmax(0,.9fr) minmax(0,1.1fr)', stack: [['.scan-hero', '#scanResultCard', '#arrName'], 1], place: { '#arrGrid': ['2', '2'] } },
    'chocolate-barcode': { cols: 'minmax(0,.55fr) minmax(0,1.45fr)', place: { '.cb-left': ['1', '2'], '.cb-right': ['2', '2'] } },
    'chocolate-admin': { cols: 'minmax(0,1fr)' }
  };
  function go() {
    var b = document.body; if (!b || b.hasAttribute('data-skin')) return;
    b.setAttribute('data-skin', ''); b.setAttribute('data-pg', pg);
    function mode() { b.setAttribute('data-gmode', (window.LBTheme && LBTheme.isDark && LBTheme.isDark()) ? 'dark' : 'light'); }
    mode(); window.addEventListener('lb:theme-changed', mode); setTimeout(mode, 300);
    var bg = document.createElement('div'); bg.className = 'gbg'; bg.setAttribute('data-lb-theme-skip', ''); b.insertBefore(bg, b.firstChild);
    var w = document.querySelector('.wrap'); if (!w) return;
    var cfg = PAGES[pg] || {};
    var top = document.createElement('div'); top.className = 'gtop';
    var left = document.createElement('div'); left.className = 'gt-l';
    var hd = w.querySelector('header');
    if (hd) left.appendChild(hd);
    else { var h1 = w.querySelector(':scope > h1'), sb = w.querySelector(':scope > p.sub'); var hh = document.createElement('header'); if (h1) hh.appendChild(h1); if (sb) hh.appendChild(sb); left.appendChild(hh); }
    top.appendChild(left);
    var sp = document.createElement('div'); sp.className = 'gt-sp'; top.appendChild(sp);
    var tabs = w.querySelector('.branch-tabs, #tabs.tabs'); if (tabs) top.appendChild(tabs);
    var ref = w.querySelector('.refresh-link'); if (ref) top.appendChild(ref);
    var back = w.querySelector('.back-link'), tb = w.querySelector(':scope > .topbar');
    var href = (back && back.getAttribute('href')) || (tb && tb.querySelector('a') && tb.querySelector('a').getAttribute('href')) || 'index.html';
    var a = document.createElement('a'); a.className = 'gt-back'; a.href = href; a.textContent = '← Back to Tools'; top.appendChild(a);
    if (back) back.style.display = 'none'; if (tb) tb.style.display = 'none';
    w.insertBefore(top, w.firstChild);
    // stack several boxes into one scrolling column
    if (cfg.stack) {
      var els = cfg.stack[0].map(function (s) { var e = w.querySelector(s); return e && (e.closest('.card') || e); }).filter(Boolean);
      if (els.length) { var col = document.createElement('div'); col.className = 'gcol'; els[0].parentNode.insertBefore(col, els[0]); els.forEach(function (e) { col.appendChild(e); }); col.classList.add('gcell'); col.style.setProperty('--gc', String(cfg.stack[1])); col.style.setProperty('--gr', '2'); }
    }
    (cfg.col || []).forEach(function (s) { var e = w.querySelector(s); if (e) e.classList.add('gcol'); });
    if (cfg.cols) w.style.setProperty('--gcols', cfg.cols);
    Object.keys(cfg.place || {}).forEach(function (sel) {
      var el = w.querySelector(sel); if (!el) return; el = (el.classList.contains('gcol') ? el : (el.closest('.card,.panel') || el));
      var v = cfg.place[sel]; el.classList.add('gcell'); el.style.setProperty('--gc', v[0]); el.style.setProperty('--gr', v[1] || '2');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
