/* PWA support: registers the service worker and (the old Install-app button was removed).
   Loaded by shared/nav.js. On iPhone use Share → Add to Home Screen (no install prompt exists there). */
(function () {
  'use strict';
  if (window.LBPwa) return;
  window.LBPwa = true;

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(function (r) { try { r.update(); } catch (x) {} }).catch(function () {});
    });
  }

  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  if (standalone) {
    // Inside the installed app / Android app: no pinch-zoom (Chrome in the browser keeps its normal zoom).
    try {
      var vp = document.querySelector('meta[name=viewport]');
      if (!vp) { vp = document.createElement('meta'); vp.name = 'viewport'; document.head.appendChild(vp); }
      if (!/user-scalable/i.test(vp.content)) vp.content = (vp.content || 'width=device-width, initial-scale=1') + ', maximum-scale=1, user-scalable=no';
      var st = document.createElement('style');
      st.textContent = 'html{touch-action:pan-x pan-y}';
      document.head.appendChild(st);
    } catch (x) {}
    return;
  }

  // The "Install Lalabella app?" bar was removed: staff use the Android app (APK) now. The service worker above stays,
  // because the app's push notifications depend on it.
})();
