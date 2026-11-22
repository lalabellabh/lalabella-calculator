/* LALABELLA — "already taken out?" warning (Nov 22 2026, Bench).
 * The same chocolates must not leave the stock twice: once as a Calc ✓ Sold and again as a Build Display (or the other way).
 * Before saving, we look at the chocolate sales of the same branch in the last 3 days; if one has (almost) the same
 * chocolates with the same amounts, the page asks first.
 *   LBDup.check(branch, items, 'display'|'calc') → Promise<null | { saleNo, at, by, ref, source, same, of }>
 *   items: [{ name, amount, mode:'pieces'|'grams'|'kg' }]
 */
(function () {
  if (window.LBDup) return;
  var API = (window.LB_CONFIG && LB_CONFIG.CALC_SALE_API) || 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/calcsale-fast';
  function token() { try { return sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; } }
  function key(it) { var m = String(it.mode || 'pieces'), a = Number(it.amount) || 0; if (m === 'kg') { m = 'grams'; a = a * 1000; } return String(it.name || '').trim().toLowerCase() + '|' + m + '|' + Math.round(a * 1000) / 1000; }
  function check(branch, items, against) {
    var mine = (items || []).filter(function (i) { return i && i.name && Number(i.amount) > 0; }).map(key);
    if (!mine.length || !branch) return Promise.resolve(null);
    var from = new Date(Date.now() + 3 * 3600000 - 3 * 86400000).toISOString().slice(0, 10);
    var u = API + '?action=listSales&kind=chocolate&limit=200&from=' + from + '&branch=' + encodeURIComponent(branch) + '&token=' + encodeURIComponent(token());
    return fetch(u).then(function (r) { return r.json(); }).then(function (d) {
      var best = null;
      ((d && d.sales) || []).forEach(function (s) {
        if (s.status !== 'Active') return;
        if (against === 'calc' && s.source !== 'Display') return;   // a calc sale only worries about a display made from the same chocolates
        var theirs = (s.items || []).map(key), same = mine.filter(function (k) { return theirs.indexOf(k) !== -1; }).length;
        var need = Math.max(1, Math.ceil(mine.length * 0.6));
        if (same >= need && theirs.length <= mine.length + 2 && (!best || same > best.same)) best = { saleNo: s.saleNo, at: s.at, by: s.by, ref: s.ref, source: s.source, same: same, of: mine.length };
      });
      return best;
    }).catch(function () { return null; });
  }
  function when(at) { try { return new Date(at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bahrain' }); } catch (e) { return ''; } }
  function msg(m, what) {
    return '⚠️ ALREADY TAKEN OUT?\n\n' + m.same + ' of ' + m.of + ' chocolates (same amounts) were already taken out of stock by ' + m.saleNo +
      (m.source === 'Display' ? ' (a display: ' + (m.ref || '') + ')' : ' (Calc' + (m.ref ? ' · ' + m.ref : '') + ')') + ' — ' + when(m.at) + (m.by ? ' by ' + m.by : '') + '.\n\n' +
      (what === 'display' ? 'Is this the SAME one?\n\nOK = YES, the same → save the display + label only, NOT taken out of stock again.\nCancel = NO, it is a new, separate display → take it out of stock.'
        : 'If it is the SAME order, press Cancel — it is already out of stock. Press OK only if this is a NEW, separate one.');
  }
  window.LBDup = { check: check, msg: msg };
})();
