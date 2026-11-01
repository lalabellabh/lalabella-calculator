/* In the Lalabella ANDROID APP: a link to Staff Chat (chatbox.html) opens the Lalabella Messenger app, and a link to
   driver.html opens the Lalabella Driver app. Not installed? You land on that app's download page instead.
   It uses an Android intent link with the app's own scheme, which the Messenger/Driver apps accept (BROWSABLE).
   Older Messenger/Driver builds do not know the scheme yet: install Messenger 1.3.2 / Driver 1.1.2 once.
   Browsers and iPhone are not touched. Keep the old behaviour: add ?stay=1 to the link, or localStorage lbChatInApp = '1'. */
(function () {
  'use strict';
  if (window.LBMessengerLink) return;
  window.LBMessengerLink = true;
  if (!/Android/i.test(navigator.userAgent || '')) return;
  var inApp = false;
  try { inApp = !!localStorage.getItem('lbAppVer'); } catch (e) { }
  try { inApp = inApp || window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches; } catch (e) { }
  if (!inApp) return;
  try { if (localStorage.getItem('lbChatInApp') === '1') return; } catch (e) { }
  if (/get-[a-z-]*app\.html$/i.test(location.pathname)) return;   // the download pages keep their own links

  var APPS = [
    { re: /(^|\/)chatbox\.html(\?|#|$)/i, scheme: 'lalabellamsg', pkg: 'com.mysystemlla.messenger', fallback: 'get-messenger-app.html' },
    { re: /(^|\/)driver\.html(\?|#|$)/i, scheme: 'lalabelladriver', pkg: 'com.mysystemlla.driver', fallback: 'get-driver-app.html' }
  ];
  function pick(a) {
    var h = a.getAttribute('href') || '';
    if (/[?&]stay=1/.test(h)) return null;
    for (var i = 0; i < APPS.length; i++) if (APPS[i].re.test(h)) return APPS[i];
    return null;
  }
  function note(txt) {
    try {
      var d = document.createElement('div');
      d.textContent = txt;
      d.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:2147483647;background:rgba(40,20,25,.88);color:#fff;font:600 13px sans-serif;padding:10px 16px;border-radius:20px;';
      document.body.appendChild(d);
      setTimeout(function () { d.remove(); }, 2500);
    } catch (e) { }
  }
  function open(app) {
    note('Opening ' + (app.scheme === 'lalabellamsg' ? 'Messenger' : 'Driver') + '…');
    var fb = location.origin + '/' + app.fallback;
    location.href = 'intent://open#Intent;scheme=' + app.scheme + ';package=' + app.pkg + ';S.browser_fallback_url=' + encodeURIComponent(fb) + ';end';
  }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    // the floating chat bubble / dock Chat button (in-page mini chat): in the app it opens Messenger instead
    if (t.closest('#lbcb-btn') && !/chatbox\.html$/i.test(location.pathname)) {
      e.preventDefault(); e.stopPropagation(); open(APPS[0]); return;
    }
    var a = t.closest('a[href]');
    if (!a) return;
    var app = pick(a);
    if (!app) return;
    e.preventDefault();
    e.stopPropagation();
    open(app);
  }, true);
  window.LBOpenMessenger = function () { open(APPS[0]); };
})();
