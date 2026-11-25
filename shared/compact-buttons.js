/* LALABELLA — compact buttons on big screens (Nov 25 2026, Bench: "itong mga long button sa lahat ng page… dapat premium ang looks,
 * lumiit at hindi mahaba").
 * On a computer / tablet (901px and wider) an action button that stretches across a whole card (Load Flowers, Save Count,
 * Print Sheet, Excel, + Add to List, Take Photo …) becomes a neat pill that is only as wide as its words, centred, with a soft shadow.
 * Phones keep the full-width buttons (easier to tap). Choice buttons (Consumable / Fixed Asset, tabs, branch pickers), list rows and
 * pop-ups are left as they are. Nothing in the page's code changes: only a class (lbcb) is added. Loaded by shared/nav.js.
 * A page can opt out with data-lb-nocompact on any parent.
 */
(function () {
  if (window.LBCompactButtons) return; window.LBCompactButtons = 1;
  var MQ = window.matchMedia ? matchMedia('(min-width:901px)') : null;
  var css = '@media(min-width:901px){' +
    '.lbcb{width:fit-content!important;min-width:200px!important;max-width:100%!important;flex:0 0 auto!important;justify-self:center!important;align-self:center!important;' +
      'margin-left:auto!important;margin-right:auto!important;padding-left:26px!important;padding-right:26px!important;border-radius:14px!important;' +
      'box-shadow:0 6px 16px rgba(60,30,40,.14),inset 0 1px 0 rgba(255,255,255,.35)!important;transition:transform .15s ease,box-shadow .15s ease!important;letter-spacing:.01em}' +
    '.lbcb.lbcb{display:flex;align-items:center;justify-content:center;gap:6px}' +   /* not !important: a page that hides the button (display:none) still wins */
    /* Nov 25 2026 (Bench: "baka may nakadikit"): stacked pills / rows always keep a little space between them */
    '.lbcb-row+.lbcb,.lbcb+.lbcb,.lbcb+.lbcb-row,.lbcb-row+.lbcb-row,input+.lbcb,input+.lbcb-row,select+.lbcb,select+.lbcb-row,textarea+.lbcb,textarea+.lbcb-row{margin-top:10px!important}' +
    '.lbcb-row.lbcb-row{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:10px}.lbcb-row>.lbcb{margin:0!important}' +
    '.lbcb:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(60,30,40,.18),inset 0 1px 0 rgba(255,255,255,.35)!important}' +
    '.lbcb:active{transform:translateY(0) scale(.98)}}';
  var SKIPIN = '[data-lb-nocompact],.lbsb,.lbsb-sh,.lbset,.lbab-sh,#lbab,.choco-drawer,.lbnav-drawer,.sidebar,nav,table,ul,ol,[role=listbox],[role=tablist],[role=dialog],.modal,.ed,.ed-bg,.lbcl-panel,.dropdown,.suggest,.suggestions,.results,.carousel,.toast';
  var TOGGLE = /(^|[\s_-])(seg|segment|tab|tabs|toggle|switch|type|mode|choice|chips?|pill|branch|br|opts?|options)([\s_-]|$)/i;
  function eligible(b) {
    if (b.classList.contains('lbcb') || b.__lbcbNo) return false;
    if (b.offsetWidth < 300 || !b.offsetParent) return false;
    if (b.closest(SKIPIN)) { b.__lbcbNo = 1; return false; }
    var t = (b.textContent || '').trim(); if (!t || t.length > 40 || b.querySelectorAll('*').length > 6) { b.__lbcbNo = 1; return false; }
    var c = getComputedStyle(b); if (c.textAlign === 'left' || c.textAlign === 'start' && !/flex/.test(c.display)) { b.__lbcbNo = 1; return false; }
    if (/flex/.test(c.display) && /start|left|space-between/.test(c.justifyContent)) { b.__lbcbNo = 1; return false; }
    if (b.getAttribute('role') === 'tab' || b.hasAttribute('aria-pressed') || b.hasAttribute('aria-selected')) { b.__lbcbNo = 1; return false; }
    if (TOGGLE.test(b.className || '') || TOGGLE.test((b.parentElement && b.parentElement.className) || '') || b.hasAttribute('data-type') || b.hasAttribute('data-mode') || b.hasAttribute('data-tab')) { b.__lbcbNo = 1; return false; }
    // a row of 3+ same-width buttons = a choice bar (branch pickers …) -> leave it
    var p = b.parentElement, sibs = p ? [].filter.call(p.children, function (x) { return /^(BUTTON|A)$/.test(x.tagName); }) : [];
    if (sibs.length >= 3 && /flex|grid/.test(getComputedStyle(p).display) && !/column/.test(getComputedStyle(p).flexDirection)) { b.__lbcbNo = 1; return false; }
    return true;
  }
  function scan() {
    if (MQ && !MQ.matches) return;
    var list = document.querySelectorAll('button, a.btn, a.button, input[type=button], input[type=submit]');
    for (var i = 0; i < list.length; i++) if (eligible(list[i])) list[i].classList.add('lbcb');
    // a box holding only these buttons (e.g. Load Flowers + Recall Count side by side) -> keep them together in the middle
    [].forEach.call(document.querySelectorAll('.lbcb'), function (b) { var p = b.parentElement; if (!p || p.classList.contains('lbcb-row') || p === document.body) return;
      var kids = [].filter.call(p.children, function (x) { return x.offsetParent; }); if (kids.length > 1 && kids.every(function (x) { return x.classList.contains('lbcb'); })) p.classList.add('lbcb-row'); });
  }
  var t = 0; function later() { clearTimeout(t); t = setTimeout(scan, 250); }
  function start() {
    var st = document.createElement('style'); st.id = 'lbcbCss'; st.textContent = css; document.head.appendChild(st);
    scan(); setTimeout(scan, 900); setTimeout(scan, 2500);
    if (window.MutationObserver) new MutationObserver(later).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    if (MQ) { var f = function () { later(); }; if (MQ.addEventListener) MQ.addEventListener('change', f); else if (MQ.addListener) MQ.addListener(f); }
    addEventListener('resize', later);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
