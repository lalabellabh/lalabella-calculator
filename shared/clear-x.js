/* LALABELLA — ✕ inside a text box to clear it fast (Nov 2026).
 * LBClearX.attach(['id1','id2',…]) or LBClearX.attach([inputEl,…]). The ✕ shows only when the box has something.
 * Clearing fires 'input' + 'change' so the page reacts as if the person deleted the text.
 */
(function () {
  'use strict';
  if (window.LBClearX) return;
  var css = document.createElement('style');
  css.textContent = '.lbcx{position:relative;display:block}.lbcx>input{padding-right:36px !important}' +
    '.lbcx>.lbcx-b{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:24px;height:24px;border-radius:50%;border:0;background:#ead9de;color:#7a3a4e;font-size:13px;font-weight:700;line-height:1;cursor:pointer;display:none;padding:0;z-index:2}' +
    '.lbcx>.lbcx-b:hover{background:#dfc3cc}.lbcx.has>.lbcx-b{display:block}' +
    '.lbcx>input[type=number]::-webkit-inner-spin-button,.lbcx>input[type=number]::-webkit-outer-spin-button{margin-right:26px}';
  document.head.appendChild(css);
  function one(inp) {
    if (!inp || inp.__lbcx || inp.tagName !== 'INPUT') return; inp.__lbcx = 1;
    var cs = getComputedStyle(inp), mb = cs.marginBottom, pd = getComputedStyle(inp.parentNode).display, fl = cs.flex;
    var w = document.createElement('span'); w.className = 'lbcx'; if (mb && mb !== '0px') { w.style.marginBottom = mb; inp.style.marginBottom = '0'; }
    if (/flex|grid/.test(pd)) { w.style.flex = fl && fl !== '0 1 auto' ? fl : '1 1 auto'; w.style.minWidth = '0'; inp.style.width = '100%'; }
    inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
    var b = document.createElement('button'); b.type = 'button'; b.className = 'lbcx-b'; b.textContent = '✕'; b.title = 'Clear'; b.setAttribute('aria-label', 'Clear'); b.tabIndex = -1;
    w.appendChild(b);
    // the ✕ sits in the middle of the box itself (not of the label + box)
    var paint = function () { w.classList.toggle('has', !!inp.value && !inp.disabled && !inp.readOnly); b.style.top = (inp.offsetTop + inp.offsetHeight / 2) + 'px'; };
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function () { inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); paint(); inp.focus(); });
    inp.addEventListener('input', paint); inp.addEventListener('change', paint);
    setInterval(paint, 700);   // the page may fill or clear the box by code
    paint();
  }
  window.LBClearX = { attach: function (list) { (list || []).forEach(function (x) { one(typeof x === 'string' ? document.getElementById(x) : x); }); } };
})();
