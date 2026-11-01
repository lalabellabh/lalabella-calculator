/**
 * LALABELLA BUG HISTORY — tiny error reporter (loaded by shared/config.js on every page).
 * Sends JS errors, unhandled promise errors and FAILED server calls (5xx / no connection) to errlog-fast.
 * You read them in Activity History -> Errors (admin with User Management access only).
 * Never breaks a page: everything is wrapped in try/catch, max 6 reports per page load, no passwords/tokens in the text.
 */
(function () {
  try {
    if (window.__lbErrReport) return; window.__lbErrReport = true;
    var URL_ = 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/errlog-fast';
    var sent = 0, seen = {};
    function tok() { try { return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; } }
    function page() { try { return (location.pathname.split('/').pop() || 'index.html'); } catch (e) { return ''; } }
    function clean(s) { return String(s == null ? '' : s).replace(/(token|password|pass|key)=([^&\s"']+)/gi, '$1=…').replace(/\b[a-f0-9]{32,}\b/gi, '…'); }
    function report(kind, message, detail) {
      try {
        message = clean(message).slice(0, 300); if (!message) return;
        var sig = kind + '|' + message; if (seen[sig] || sent >= 6) return; seen[sig] = 1; sent++;
        var body = JSON.stringify({ page: page(), kind: kind, message: message, detail: clean(detail).slice(0, 900), token: tok() });
        origFetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
      } catch (e) {}
    }
    var origFetch = window.fetch ? window.fetch.bind(window) : null;
    if (!origFetch) return;

    window.addEventListener('error', function (ev) {
      try {
        if (ev && ev.target && ev.target !== window && ev.target.tagName) { // a script / css / image failed to load
          var src = ev.target.src || ev.target.href || '';
          if (ev.target.tagName === 'SCRIPT' || ev.target.tagName === 'LINK') report('load', 'Failed to load ' + ev.target.tagName.toLowerCase() + ': ' + src.split('?')[0], '');
          return;
        }
        var m = ev && ev.message; if (!m || /^Script error\.?$/i.test(m) || /ResizeObserver loop/i.test(m)) return;
        report('js', m, (ev.filename ? ev.filename.split('/').pop() + ':' + ev.lineno + ':' + ev.colno + '\n' : '') + (ev.error && ev.error.stack || ''));
      } catch (e) {}
    }, true);

    window.addEventListener('unhandledrejection', function (ev) {
      try {
        var r = ev && ev.reason, m = r && (r.message || String(r));
        if (!m || /AbortError|aborted|Failed to fetch|NetworkError|Load failed/i.test(m)) return; // plain offline is not a bug
        report('promise', m, r && r.stack || '');
      } catch (e) {}
    });

    // failed calls to our own server functions
    window.fetch = function (input, init) {
      var url = ''; try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) {}
      var p = origFetch(input, init);
      try {
        if (url.indexOf('.supabase.co/functions/v1/') > -1 && url.indexOf('errlog-fast') < 0) {
          var fn = url.split('/functions/v1/')[1].split('?')[0];
          p.then(function (res) { if (res && res.status >= 500) report('api', fn + ' answered ' + res.status, ''); }, function (err) {
            if (navigator.onLine !== false && !(err && err.name === 'AbortError')) report('api', fn + ' did not answer', err && err.message || '');
          });
        }
      } catch (e) {}
      return p;
    };
  } catch (e) {}
})();
