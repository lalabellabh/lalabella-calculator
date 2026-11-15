/* LALABELLA — stock shown in the calc search (Nov 15 2026).
 * Flower: "Stock 65 stems · ModaMall". Chocolate: total kg / pcs + the batches (oldest expiry first).
 * Put <span class="lbst" data-st-kind="flower|chocolate" data-st="Name"></span> anywhere, then LBCalcStock.paint(root).
 * Branch = the branch in the "✓ Sold" box (or the user's branch). Cached 45 s; refreshed after a Sold.
 */
(function () {
  'use strict';
  if (window.LBCalcStock) return;
  var API = (window.LB_CONFIG && LB_CONFIG.CALC_SALE_API) || 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/calcsale-fast';
  var css = document.createElement('style');
  css.textContent = '.lbst{display:block;font-size:11px;font-weight:600;margin-top:2px;color:#2f7a4f;line-height:1.35}.lbst.low{color:#c97a14}.lbst.out{color:#c0392b}.lbst .b{display:block;font-weight:500;color:#6b5a50}';
  document.head.appendChild(css);
  var cache = {}, wait = {};
  function token() { try { return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; } }
  function branch() {
    var s = document.querySelector('.lbcs select'); if (s && s.value) return s.value;
    var lb = document.getElementById('listBranch'); if (lb && lb.value && lb.value !== 'All') return lb.value;
    try { var u = JSON.parse(sessionStorage.getItem('lalabellaUser') || localStorage.getItem('lalabellaUser') || '{}'); return u.branch || ''; } catch (e) { return ''; }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n3(v) { return String(Math.round(v * 1000) / 1000); }
  function load(kind, br) {
    var k = kind + '|' + br, c = cache[k];
    if (c && Date.now() - c.at < 45000) return Promise.resolve(c.data);
    if (wait[k]) return wait[k];
    wait[k] = fetch(API + '?' + new URLSearchParams({ action: 'stockList', kind: kind, branch: br, token: token() }))
      .then(function (r) { return r.json(); })
      .then(function (d) { delete wait[k]; if (d && d.success) { cache[k] = { at: Date.now(), data: d }; return d; } return null; })
      .catch(function () { delete wait[k]; return null; });
    return wait[k];
  }
  function flowerHtml(d, name) {
    var m = d.stock || {}, key = Object.keys(m).find(function (x) { return x.trim().toLowerCase() === String(name).trim().toLowerCase(); });
    if (key == null) return { cls: 'out', html: 'No stock record · ' + esc(d.branch) };
    var v = Number(m[key]) || 0;
    return { cls: v <= 0 ? 'out' : v < 10 ? 'low' : '', html: 'Stock ' + n3(v) + ' stems · ' + esc(d.branch) };
  }
  function chocHtml(d, name, full) {
    var g = (d.stock || []).find(function (x) { return String(x.name).trim().toLowerCase() === String(name).trim().toLowerCase(); });
    if (!g) return { cls: 'out', html: 'No stock · ' + esc(d.branch) };
    var tot = Object.keys(g.total).map(function (u) { return n3(g.total[u]) + ' ' + u; }).join(' + ');
    var h = 'Stock ' + tot + ' · ' + g.batches.length + ' batch' + (g.batches.length > 1 ? 'es' : '') + ' · ' + esc(d.branch);
    if (full) h += g.batches.slice(0, 6).map(function (b) {
      var pcs = b.unit === 'kg' && b.gpp ? ' (~' + Math.floor(b.stock * 1000 / b.gpp) + ' pcs)' : '';
      return '<span class="b">• Batch ' + esc(b.batch || '—') + ': ' + n3(b.stock) + ' ' + esc(b.unit) + pcs + (b.expiry ? ' · exp ' + esc(String(b.expiry).slice(0, 10)) : '') + '</span>';
    }).join('');
    return { cls: '', html: h };
  }
  function paint(root) {
    var els = (root || document).querySelectorAll('.lbst[data-st]'); if (!els.length) return;
    var br = branch();
    if (!br) { els.forEach(function (e) { e.className = 'lbst low'; e.textContent = 'Pick the branch (✓ Sold box) to see the stock'; }); return; }
    var kinds = {}; els.forEach(function (e) { kinds[e.getAttribute('data-st-kind') || 'flower'] = 1; });
    Object.keys(kinds).forEach(function (kind) {
      load(kind, br).then(function (d) {
        if (!d) return;
        els.forEach(function (e) { if ((e.getAttribute('data-st-kind') || 'flower') !== kind || !e.isConnected) return;
          var r = kind === 'chocolate' ? chocHtml(d, e.getAttribute('data-st'), e.hasAttribute('data-st-full')) : flowerHtml(d, e.getAttribute('data-st'));
          e.className = 'lbst' + (r.cls ? ' ' + r.cls : ''); e.innerHTML = r.html; });
      });
    });
  }
  function tag(kind, name, full) { return '<span class="lbst" data-st-kind="' + kind + '" data-st="' + esc(name) + '"' + (full ? ' data-st-full' : '') + '></span>'; }
  // a Sold or a branch change -> fresh numbers
  document.addEventListener('change', function (e) { if (e.target.closest && (e.target.closest('.lbcs') || e.target.id === 'listBranch')) { cache = {}; paint(); } });
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.lbcs .go')) setTimeout(function () { cache = {}; paint(); }, 2500); });
  window.LBCalcStock = { paint: paint, tag: tag, refresh: function () { cache = {}; paint(); } };
})();
