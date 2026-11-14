// Nov 2026: "Calc today" list for the Flower / Chocolate dashboards — every ✓ Sold from the calcs today (Bahrain day).
// LBCalcToday.render(kind, branch, el) fills el (a .scroll box) and refreshes itself every minute while it is open.
(function () {
  if (window.LBCalcToday) return;
  var API = (window.LB_CONFIG && LB_CONFIG.CALC_SALE_API) || 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/calcsale-fast';
  var cache = {}, timer = null;
  function token() { try { return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function today() { return new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10); }
  function f3(n) { return (Number(n) || 0).toFixed(3); }
  function hm(t) { var d = new Date(t); return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bahrain' }); }
  function brKey(b) { b = String(b || '').toLowerCase().replace(/[^a-z]/g, ''); return b === 'qalali' ? 'galali' : b; }
  function load(kind, done) {
    var c = cache[kind]; if (c && c.day === today() && Date.now() - c.at < 60000) return done(c.rows);
    var q = new URLSearchParams({ action: 'listSales', token: token(), kind: kind, from: today(), to: today(), limit: '1000' });
    fetch(API + '?' + q).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.success) return done(null, (d && d.error) || 'Could not load.');
      cache[kind] = { day: today(), at: Date.now(), rows: d.sales || [] }; done(cache[kind].rows);
    }).catch(function () { done(null, 'Connection problem.'); });
  }
  function qtyOf(kind, it) { return kind === 'flower' ? (Number(it.qty) || 0) : (it.mode === 'pieces' ? (Number(it.amount) || 0) : (Number(it.kg) || 0)); }
  function unitOf(kind, it) { return kind === 'flower' ? '' : (it.mode === 'pieces' ? ' pcs' : ' kg'); }
  function html(kind, branch, rows) {
    var list = rows.filter(function (s) { return !branch || branch === 'All' || brKey(s.branch) === brKey(branch); });
    var act = list.filter(function (s) { return s.status === 'Active'; });
    var tot = act.reduce(function (a, s) { return a + (Number(s.total) || 0); }, 0);
    var agg = {}; act.forEach(function (s) { (s.items || []).forEach(function (it) { var k = it.name + unitOf(kind, it); agg[k] = (agg[k] || 0) + qtyOf(kind, it); }); });
    var aggTxt = Object.keys(agg).sort(function (a, b) { return agg[b] - agg[a]; }).map(function (k) {
      var u = / (pcs|kg)$/.exec(k), nm = u ? k.slice(0, -u[0].length) : k; return '<b>' + esc(nm) + '</b> ' + (u && u[1] === 'kg' ? f3(agg[k]) + ' kg' : (Math.round(agg[k] * 1000) / 1000) + (u ? ' pcs' : '')); }).join(' · ');
    var head = '<div class="mt" style="padding:6px 10px;line-height:1.5">🧮 <b>Today ' + esc(today().split('-').reverse().join('/')) + '</b> · ' + act.length + ' sale' + (act.length === 1 ? '' : 's') + ' · <b>' + f3(tot) + ' BD</b>' +
      (list.length - act.length ? ' · ' + (list.length - act.length) + ' cancelled' : '') + ' · <a href="calc-sales.html">Open Calc Sales →</a>' +
      (aggTxt ? '<div style="margin-top:4px">' + (kind === 'flower' ? '🌸 ' : '🍫 ') + aggTxt + '</div>' : '') + '</div>';
    if (!list.length) return head + '<div class="mt" style="padding:14px">No ✓ Sold from the ' + (kind === 'flower' ? 'Flower' : 'Chocolate') + ' Calc today yet.</div>';
    return head + list.map(function (s) {
      var cx = s.status !== 'Active';
      var items = (s.items || []).map(function (it) { return esc(it.name) + ' × ' + (kind === 'flower' ? esc(it.qty) : (it.mode === 'pieces' ? esc(it.amount) + ' pcs' : f3(it.kg) + ' kg')); }).join(' · ');
      return '<div class="row"' + (cx ? ' style="opacity:.5"' : '') + '><div class="nm">' + esc(s.saleNo || '…') + ' <span class="mt">· ' + esc(s.branch) + (s.source ? ' · ' + esc(s.source) : '') + (cx ? ' · Cancelled' : '') + (s.editedBy ? ' · ✏️ edited' : '') + '</span>' +
        '<div class="mt">' + items + '</div><div class="mt">' + hm(s.at) + ' · ' + esc(s.by || '') + (s.ref ? ' · ' + esc(s.ref) : '') + '</div></div><div class="rt">' + (cx ? '<s>' + f3(s.total) + ' BD</s>' : f3(s.total) + ' BD') + '</div></div>';
    }).join('');
  }
  window.LBCalcToday = {
    render: function (kind, branch, el) {
      if (!el) return; clearInterval(timer);
      var paint = function () { load(kind, function (rows, err) { if (!el.isConnected || el.getAttribute('data-calc-today') !== kind) return; el.innerHTML = rows ? html(kind, branch, rows) : '<div class="mt" style="padding:14px">' + esc(err) + '</div>'; }); };
      el.setAttribute('data-calc-today', kind);
      if (!(cache[kind] && cache[kind].day === today())) el.innerHTML = '<div class="mt" style="padding:14px">Loading today\'s calc sales…</div>';
      paint(); timer = setInterval(function () { if (el.getAttribute('data-calc-today') === kind && !document.hidden) { delete cache[kind]; paint(); } else clearInterval(timer); }, 60000);
    },
    stop: function (el) { if (el) el.removeAttribute('data-calc-today'); clearInterval(timer); }
  };
})();
