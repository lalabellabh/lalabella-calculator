/* LALABELLA — display guard (Nov 2026).
 * Before a saved display (DISP-…) is loaded for a sale (Chocolate Calc) or a release (Chocolate Release),
 * check if it was already sold or released, so it is not taken out of stock twice.
 * LBDispGuard.ok(code) -> Promise<boolean>  (true = go on)
 */
(function () {
  'use strict';
  var API = (window.LB_CONFIG && LB_CONFIG.CALC_SALE_API) || 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/calcsale-fast';
  function token() { try { return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; } }
  function day(t) { try { return new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(t || ''); } }
  function ok(code) {
    code = String(code || '').trim().toUpperCase();
    if (!/^DISP-\d+$/.test(code)) return Promise.resolve(true);
    return fetch(API + '?action=dispUsed&code=' + encodeURIComponent(code) + '&token=' + encodeURIComponent(token())).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.success) return true;
      var lines = (d.sales || []).map(function (x) { return '• SOLD in calc: ' + x.no + ' (' + x.branch + ', ' + day(x.at) + (x.by ? ', ' + x.by : '') + ')'; })
        .concat((d.releases || []).map(function (x) { return '• RELEASED: ' + x.no + ' (' + x.branch + ', ' + (x.date || '') + (x.by ? ', ' + x.by : '') + ')'; }));
      if (!lines.length) return true;
      var mk = d.made ? '\n(' + (d.made.name || '') + ' — made ' + day(d.made.at) + (d.made.by ? ' by ' + d.made.by : '') + ')' : '';
      return confirm('⚠ ' + code + ' was already taken out of stock:' + mk + '\n\n' + lines.join('\n') + '\n\nUse it again? (only if this is really a second box)');
    }).catch(function () { return true; });
  }
  window.LBDispGuard = { ok: ok };
})();
