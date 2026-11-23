/* LALABELLA — pull down to refresh (Nov 23 2026, Bench: "di ko ma-scroll down para sa refresh" on Flower Tools).
 * Pages built as a fixed one-screen app (html/body overflow:hidden) lose the phone's own pull-to-refresh.
 * This adds it back: on a phone, pull down from the top of the page → a round ↻ appears → let go → the page reloads.
 * Ignored inside the ☰ menu, pop-ups, inputs, and any box that is scrolled down.
 *   <script src="shared/pull-refresh.js"></script>
 */
(function () {
  if (window.LBPullRefresh || !('ontouchstart' in window)) { window.LBPullRefresh = window.LBPullRefresh || 1; return; }
  window.LBPullRefresh = 1;
  var NEED = 90, sy = 0, sx = 0, pull = 0, on = false, dot = null;
  var css = '#lbptr{position:fixed;left:50%;top:0;z-index:2147483600;width:42px;height:42px;margin-left:-21px;border-radius:50%;background:#fff;color:#9e2f4a;' +
    'display:flex;align-items:center;justify-content:center;font:700 22px/1 system-ui,sans-serif;box-shadow:0 6px 18px rgba(60,30,40,.25);pointer-events:none;opacity:0;transform:translateY(-50px)}' +
    '#lbptr.go{color:#fff;background:#9e2f4a}#lbptr.spin span{animation:lbptrS .7s linear infinite}@keyframes lbptrS{to{transform:rotate(360deg)}}';
  function skip(t) {
    if (!t || !t.closest) return true;
    if (document.body.classList.contains('nav-open')) return true;
    if (t.closest('input,textarea,select,[contenteditable],.sidebar,.choco-drawer,.lbnav-drawer,.lbab-bg,.lbset-bg,[role="dialog"],.modal,#lbab')) return true;
    for (var e = t; e && e !== document.body; e = e.parentElement) { if (e.scrollTop > 0) return true; }
    return (window.scrollY || document.documentElement.scrollTop) > 0;
  }
  function show(p) {
    if (!dot) { var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); dot = document.createElement('div'); dot.id = 'lbptr'; dot.innerHTML = '<span>↻</span>'; document.body.appendChild(dot); }
    var y = Math.min(p, NEED * 1.4);
    dot.style.opacity = Math.min(1, p / 40); dot.style.transform = 'translateY(' + (y * .8 - 30) + 'px) rotate(' + (p * 3) + 'deg)';
    dot.classList.toggle('go', p >= NEED);
  }
  function hide() { if (dot) { dot.style.transition = 'opacity .2s,transform .2s'; dot.style.opacity = 0; dot.style.transform = 'translateY(-50px)'; setTimeout(function () { if (dot) dot.style.transition = ''; }, 220); } }
  document.addEventListener('touchstart', function (e) { if (e.touches.length !== 1 || skip(e.target)) { on = false; return; } on = true; pull = 0; sy = e.touches[0].clientY; sx = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!on) return; var dy = e.touches[0].clientY - sy, dx = Math.abs(e.touches[0].clientX - sx);
    if (dy <= 0 || dx > dy) { if (pull) hide(); pull = 0; if (dx > 20) on = false; return; }
    pull = dy * .6; show(pull);
  }, { passive: true });
  document.addEventListener('touchend', function () {
    if (!on) return; on = false;
    if (pull >= NEED) { dot.classList.add('spin'); dot.style.transform = 'translateY(' + (NEED * .8 - 30) + 'px)'; setTimeout(function () { location.reload(); }, 250); }
    else hide();
    pull = 0;
  }, { passive: true });
})();
