/* Android app version + "new version" notice.
   The app opens the website with ?lbapp=<version>; we remember it, compare it with downloads/app-version.json
   (written by the app build) and show the result at the bottom of the menu. Android only. */
(function () {
  'use strict';
  if (window.LBAppUpdate) return;
  if (!/Android/i.test(navigator.userAgent || '')) return;

  function get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

  var m = /[?&]lbapp=([0-9][0-9.]*)/.exec(location.search);
  if (m) {
    set('lbAppVer', m[1]);
    try { var u = new URL(location.href); u.searchParams.delete('lbapp'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) { }
  }
  var inApp = false;
  try { inApp = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || window.navigator.standalone === true; } catch (e) { }

  var latest = null;          // { versionName, versionCode }
  var PAGE = 'get-app.html?dl=1';

  function cmp(a, b) {
    var x = String(a).split('.'), y = String(b).split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0);
      if (d) return d < 0 ? -1 : 1;
    }
    return 0;
  }
  function installed() { return get('lbAppVer'); }
  function status() {
    var inst = installed();
    if (!inst && !inApp) return null;                       // plain browser: nothing to say
    if (!inst) return { kind: 'unknown' };                  // inside an app that does not report its version = an older build
    if (latest && latest.versionName && cmp(inst, latest.versionName) < 0) return { kind: 'update', inst: inst, latest: latest.versionName };
    return { kind: 'ok', inst: inst };
  }

  function paint() {
    var els = document.querySelectorAll('[data-lb-appver]');
    var s = status();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!s) { el.style.display = 'none'; continue; }
      el.style.cssText = 'display:block;text-align:center;font:600 11.5px "Space Grotesk",system-ui,sans-serif;padding:10px 12px 14px;opacity:.9';
      if (s.kind === 'update') el.innerHTML = '<a href="' + PAGE + '" style="display:block;padding:9px 12px;border-radius:10px;background:#c9506b;color:#fff;text-decoration:none">⬆️ New version ' + s.latest + ' is ready — tap to update<br><span style="font-weight:500;opacity:.85">You have v' + s.inst + '</span></a>';
      else if (s.kind === 'ok') el.innerHTML = '<span style="opacity:.65">Lalabella app v' + s.inst + ' ✓ up to date</span>';
      else el.innerHTML = '<span style="opacity:.65">App version not detected yet — close the app and open it from its icon</span>';
    }
    toastOnce(s);
  }
  function toastOnce(s) {
    if (!s || s.kind !== 'update' || !latest) return;
    var tag = s.latest;
    if (get('lbUpdToast') === tag || document.getElementById('lb-upd-toast')) return;
    set('lbUpdToast', tag);
    var t = document.createElement('a');
    t.id = 'lb-upd-toast'; t.href = PAGE;
    t.textContent = '⬆️ New Lalabella app (v' + latest.versionName + ') is ready — tap to update';
    t.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);max-width:88vw;background:#c9506b;color:#fff;padding:12px 16px;border-radius:12px;font:600 13px "Space Grotesk",system-ui,sans-serif;z-index:2147483000;box-shadow:0 8px 24px rgba(0,0,0,.25);text-align:center;text-decoration:none';
    (document.body || document.documentElement).appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 9000);
  }

  window.LBAppUpdate = { paint: paint, installed: installed };

  if (installed() || inApp) {
    fetch('downloads/app-version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.versionName) { latest = j; paint(); } })
      .catch(function () { });
  }
  paint();
})();
