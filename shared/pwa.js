/* PWA support: registers the service worker and offers an "Install app" button on Android/Chrome.
   Loaded by shared/nav.js. On iPhone use Share → Add to Home Screen (no install prompt exists there). */
(function () {
  'use strict';
  if (window.LBPwa) return;
  window.LBPwa = true;

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
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

  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    try { if (localStorage.getItem('lbPwaDismiss') === '1') return; } catch (x) {}
    show();
  });
  window.addEventListener('appinstalled', function () { hide(); deferred = null; });

  function hide() { var b = document.getElementById('lbpwa-bar'); if (b) b.remove(); }
  function show() {
    if (document.getElementById('lbpwa-bar') || !document.body) return;
    var bar = document.createElement('div');
    bar.id = 'lbpwa-bar';
    bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:2147483000;display:flex;gap:10px;align-items:center;background:#1a0f12;color:#f7eee5;border:1px solid rgba(230,196,122,.4);border-radius:14px;padding:10px 14px;font:14px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4);max-width:calc(100vw - 24px)';
    bar.innerHTML = '<span>Install Lalabella app?</span>' +
      '<button id="lbpwa-yes" style="background:#c9506b;color:#fff;border:0;border-radius:8px;padding:7px 14px;cursor:pointer">Install</button>' +
      '<button id="lbpwa-no" aria-label="Close" style="background:none;color:#b39a98;border:0;font-size:18px;cursor:pointer">✕</button>';
    document.body.appendChild(bar);
    document.getElementById('lbpwa-yes').onclick = function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; hide(); });
    };
    document.getElementById('lbpwa-no').onclick = function () {
      try { localStorage.setItem('lbPwaDismiss', '1'); } catch (x) {}
      hide();
    };
  }
})();
