/* LALABELLA — alert counters that you can't miss (Nov 21 2026, Bench).
 * Any element with the attribute  data-hot  that shows a number turns into a red, softly pulsing badge when the
 * number is above 0, and the tab/button around it turns red too. Works on numbers the page fills in later.
 * Used on the Chocolate, Flower, Item and Café dashboards.
 */
(function () {
  if (window.LBHot) return;
  var css = '@keyframes lbhotP{0%{box-shadow:0 0 0 0 rgba(229,72,77,.6)}70%{box-shadow:0 0 0 7px rgba(229,72,77,0)}100%{box-shadow:0 0 0 0 rgba(229,72,77,0)}}' +
    '.lbhot{background:#e5484d!important;color:#fff!important;opacity:1!important;border-radius:999px!important;padding:1px 7px!important;margin-left:6px;font-weight:800!important;display:inline-block;min-width:18px;text-align:center;line-height:1.5;animation:lbhotP 1.6s ease-out infinite}' +
    '.lbhot-tab:not(.on){color:#c0392b!important;font-weight:700!important}' +
    '.lbhot-tab.on .lbhot{animation:none}' +
    '@media (prefers-reduced-motion:reduce){.lbhot{animation:none}}';
  function addCss() { if (document.getElementById('lbhotCss')) return; var s = document.createElement('style'); s.id = 'lbhotCss'; s.textContent = css; (document.head || document.documentElement).appendChild(s); }
  function num(t) { var m = String(t || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : 0; }
  function upd(b) { var on = num(b.textContent) > 0; b.classList.toggle('lbhot', on); var host = b.closest('button, .tab, [data-t], [data-v]'); if (host) host.classList.toggle('lbhot-tab', on); }
  function scan() {
    addCss();
    document.querySelectorAll('[data-hot]').forEach(function (b) {
      if (b.__lbh) return; b.__lbh = 1; upd(b);
      new MutationObserver(function () { upd(b); }).observe(b, { childList: true, characterData: true, subtree: true });
    });
  }
  window.LBHot = { scan: scan };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  setInterval(scan, 2500);   // badges added later by the page
})();
