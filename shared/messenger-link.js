/* In the Lalabella ANDROID APP: opening Staff Chat / Messages goes to the Lalabella Messenger app instead of the
   web chat page inside the main app. Not installed? It lands on the "Get Messenger App" page (the download link).
   Uses an Android intent link, so no install check is needed. Browsers and iPhone are not touched.
   Add ?stay=1 to a chatbox.html link (or set localStorage lbChatInApp = '1') to keep the old behaviour. */
(function () {
  'use strict';
  if (window.LBMessengerLink) return;
  window.LBMessengerLink = true;
  if (!/Android/i.test(navigator.userAgent || '')) return;
  var inApp = false;
  try { inApp = !!localStorage.getItem('lbAppVer'); } catch (e) { }
  if (!inApp) return;
  try { if (localStorage.getItem('lbChatInApp') === '1') return; } catch (e) { }

  function isChatLink(a) {
    var h = a.getAttribute('href') || '';
    if (!/(^|\/)chatbox\.html(\?|#|$)/i.test(h)) return false;
    if (/[?&]stay=1/.test(h)) return false;
    return true;
  }
  function openMessenger() {
    var fb = location.origin + '/get-messenger-app.html';
    location.href = 'intent://open#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;' +
      'package=com.mysystemlla.messenger;S.browser_fallback_url=' + encodeURIComponent(fb) + ';end';
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !isChatLink(a)) return;
    e.preventDefault();
    e.stopPropagation();
    openMessenger();
  }, true);
  window.LBOpenMessenger = openMessenger;
})();
