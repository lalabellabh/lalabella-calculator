/* LALABELLA — 📜 Log for the calcs (Nov 22 2026, Bench): the last ✓ Sold of this calc, for reference.
 * A "📜 Log" button (bottom-left) opens a side panel: sale no, time, branch, sold to / source, items, total, who, status
 * (cancelled ones struck out). Search + branch filter. Read-only — changes are done in Calc Sales (Admin).
 *   <script src="shared/calc-log.js" data-kind="chocolate|flower|mixed"></script>
 */
(function () {
  if (window.LBCalcLog) return;
  var me = document.currentScript, KIND = (me && me.getAttribute('data-kind')) || 'chocolate';
  var API = (window.LB_CONFIG && LB_CONFIG.CALC_SALE_API) || 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/calcsale-fast';
  function tok() { try { return sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; } }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function bd(n) { return (Math.round((Number(n) || 0) * 1000) / 1000).toFixed(3) + ' BD'; }
  function when(d) { try { var x = new Date(d); return x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Bahrain' }) + ' · ' + x.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bahrain' }); } catch (e) { return ''; } }
  var css = '#lbclBtn{position:fixed;left:14px;bottom:14px;z-index:9000;border:0;border-radius:999px;padding:10px 16px;font:600 13px "Space Grotesk",system-ui,sans-serif;background:#2b211b;color:#fff;box-shadow:0 8px 22px rgba(0,0,0,.25);cursor:pointer}' +
    '#lbclBg{position:fixed;inset:0;z-index:9500;background:rgba(20,10,15,.35);display:none}#lbclBg.on{display:block}' +
    '#lbcl{position:fixed;top:0;bottom:0;right:0;width:min(440px,100%);z-index:9501;background:#fff;color:#2a2024;box-shadow:-20px 0 50px rgba(0,0,0,.2);transform:translateX(105%);transition:transform .25s ease;display:flex;flex-direction:column;font-family:"Space Grotesk",system-ui,sans-serif}' +
    '#lbcl.on{transform:none}#lbcl .h{display:flex;align-items:center;gap:8px;padding:16px 16px 10px}#lbcl .h b{font-size:17px}#lbcl .h button{margin-left:auto;border:1px solid #eee;background:#fff;border-radius:9px;width:32px;height:32px;cursor:pointer;font-size:15px}' +
    '#lbcl .f{display:flex;gap:6px;padding:0 16px 10px}#lbcl .f input,#lbcl .f select{font:inherit;font-size:13px;border:1px solid #eadfe3;border-radius:10px;padding:8px 10px;background:#fff;color:inherit}#lbcl .f input{flex:1;min-width:0}' +
    '#lbcl .l{flex:1;overflow-y:auto;padding:0 10px 16px}#lbcl .d{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#9a8a90;padding:12px 6px 4px}' +
    '#lbcl .r{border:1px solid #f0e6e9;border-radius:12px;padding:9px 11px;margin:6px 0;cursor:pointer}#lbcl .r:hover{border-color:#e0c3cd}#lbcl .r.x{opacity:.55}#lbcl .r.x .t{text-decoration:line-through}' +
    '#lbcl .r .a{display:flex;gap:8px;align-items:baseline}#lbcl .r .no{font-family:monospace;font-weight:700;color:#9e2f4a;font-size:12px}#lbcl .r .t{margin-left:auto;font-weight:700;white-space:nowrap}' +
    '#lbcl .r .m{font-size:11.5px;color:#8c7c82;margin-top:2px}#lbcl .r .it{display:none;font-size:12px;margin-top:6px;border-top:1px dashed #eee;padding-top:6px;line-height:1.5}#lbcl .r.open .it{display:block}' +
    '#lbcl .tag{display:inline-block;font-size:10px;font-weight:700;border-radius:999px;padding:1px 7px;margin-left:4px;background:#f3eef0;color:#7a6a70}#lbcl .tag.c{background:#fde8e8;color:#b8483c}#lbcl .tag.f{background:#e8f3ea;color:#3f7a4f}#lbcl .tag.k{background:#f7ece2;color:#8a5a2b}' +
    '@media(max-width:600px){#lbclBtn{padding:7px 11px;font-size:12px;left:10px;bottom:10px;opacity:.92}}' +
    '#lbcl .e{color:#9a8a90;text-align:center;padding:30px 10px;font-size:13px}@media print{#lbclBtn,#lbcl,#lbclBg{display:none!important}}';
  var rows = [], el, bg;
  function build() {
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    var b = document.createElement('button'); b.id = 'lbclBtn'; b.type = 'button'; b.textContent = '📜 Log'; b.title = 'Last sales of this calc (reference)'; document.body.appendChild(b);
    bg = document.createElement('div'); bg.id = 'lbclBg'; document.body.appendChild(bg);
    el = document.createElement('aside'); el.id = 'lbcl'; el.setAttribute('data-lb-look-skip', '');
    el.innerHTML = '<div class="h"><b>📜 ' + (KIND === 'flower' ? 'Flower' : KIND === 'mixed' ? 'Mixed' : 'Chocolate') + ' calc log</b><button type="button" data-r title="Refresh">↻</button><button type="button" data-x title="Close" style="margin-left:0">✕</button></div>' +
      '<div class="f"><input data-q placeholder="Search sale no, name, item…"><select data-b><option value="">All branches</option><option>ModaMall</option><option>Hamala</option><option>Galali</option></select></div><div class="l"><div class="e">Loading…</div></div>';
    document.body.appendChild(el);
    b.onclick = open; bg.onclick = close; el.querySelector('[data-x]').onclick = close; el.querySelector('[data-r]').onclick = load;
    el.querySelector('[data-q]').oninput = paint; el.querySelector('[data-b]').onchange = paint;
    el.querySelector('.l').addEventListener('click', function (e) { var r = e.target.closest('.r'); if (r) r.classList.toggle('open'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && el.classList.contains('on')) close(); });
  }
  function open() { el.classList.add('on'); bg.classList.add('on'); load(); }
  function close() { el.classList.remove('on'); bg.classList.remove('on'); }
  function load() {
    el.querySelector('.l').innerHTML = '<div class="e">Loading…</div>';
    var from = new Date(Date.now() + 3 * 3600000 - 30 * 86400000).toISOString().slice(0, 10);
    var u = API + '?action=listSales&limit=300&from=' + from + (KIND === 'mixed' ? '' : '&kind=' + KIND) + '&token=' + encodeURIComponent(tok());
    fetch(u).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.success) { el.querySelector('.l').innerHTML = '<div class="e">' + esc((d && d.error) || 'Could not load.') + '</div>'; return; }
      rows = (d.sales || []).filter(function (s) { return KIND !== 'mixed' || s.groupNo; }); paint();
    }).catch(function () { el.querySelector('.l').innerHTML = '<div class="e">Connection problem.</div>'; });
  }
  function itemsText(s) {
    return (s.items || []).map(function (i) {
      if (s.kind === 'flower') return '• ' + esc(i.name) + ' — ' + (Number(i.qty) || 0) + ' stem' + (Number(i.qty) === 1 ? '' : 's');
      return '• ' + esc(i.name) + ' — ' + (i.mode === 'pieces' ? (Number(i.amount) || 0) + ' pcs' : i.mode === 'grams' ? (Number(i.amount) || 0) + ' g' : (Number(i.kg || i.amount) || 0) + ' kg') + (i.total ? ' · ' + bd(i.total) : '');
    }).concat((s.extras || []).map(function (x) { return '• ✨ ' + esc(x.desc) + (x.price ? ' · ' + bd(x.price) : ''); })).join('<br>');
  }
  function paint() {
    var q = el.querySelector('[data-q]').value.trim().toLowerCase(), br = el.querySelector('[data-b]').value, last = '';
    var L = rows.filter(function (s) {
      if (br && s.branch !== br) return false;
      if (!q) return true;
      return (s.saleNo + ' ' + (s.ref || '') + ' ' + (s.customer || '') + ' ' + (s.source || '') + ' ' + (s.by || '') + ' ' + (s.groupNo || '') + ' ' + (s.items || []).map(function (i) { return i.name; }).join(' ')).toLowerCase().indexOf(q) !== -1;
    });
    el.querySelector('.l').innerHTML = L.length ? L.map(function (s) {
      var day = when(s.at).split(' · ')[0], head = day !== last ? '<div class="d">' + esc(day) + '</div>' : ''; last = day;
      var who = s.customer || (s.ref && s.ref !== s.source ? s.ref : '') || '';
      return head + '<div class="r' + (s.status !== 'Active' ? ' x' : '') + '"><div class="a"><span class="no">' + esc(s.saleNo) + '</span>' +
        (KIND === 'mixed' ? '<span class="tag ' + (s.kind === 'flower' ? 'f' : 'k') + '">' + (s.kind === 'flower' ? '🌸' : '🍫') + '</span>' : '') +
        (s.source === 'Display' ? '<span class="tag">Display</span>' : '') + (s.status !== 'Active' ? '<span class="tag c">Cancelled</span>' : '') +
        '<span class="t">' + bd(s.total) + '</span></div>' +
        '<div class="m">' + esc((when(s.at).split(' · ')[1] || '') + ' · ' + s.branch + (who ? ' · ' + who : '') + (s.source && s.source !== 'Display' ? ' · ' + s.source : '') + (s.by ? ' · by ' + s.by : '') + (s.releaseNo ? ' · ' + s.releaseNo : '')) + '</div>' +
        '<div class="it">' + itemsText(s) + (s.status !== 'Active' ? '<div style="margin-top:4px;color:#b8483c">Cancelled' + (s.cancelledBy ? ' by ' + esc(s.cancelledBy) : '') + (s.cancelledAt ? ' · ' + esc(when(s.cancelledAt)) : '') + '</div>' : '') + '</div></div>';
    }).join('') : '<div class="e">No sales in the last 30 days' + (q || br ? ' for this filter' : '') + '.</div>';
  }
  window.LBCalcLog = { open: function () { if (el) open(); }, refresh: function () { if (el && el.classList.contains('on')) load(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
