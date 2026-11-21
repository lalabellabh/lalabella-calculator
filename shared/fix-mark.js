/* LALABELLA — "Open →" from the dashboard Check list lands on the exact thing to fix (Nov 21 2026, Bench).
 * URL: page.html?branch=<branch>&field=<element id>&why=<what is wrong>&fix=1   (+ &edit=<entry ID> handled by the page)
 *  - shows a red bar at the top saying what to fix,
 *  - switches to the right branch tab (.branch-tab[data-branch]),
 *  - scrolls to the field / button and makes it blink red until it is touched.
 * Pages can also call LBFix.mark(element, 'message') themselves (e.g. after opening an Edit pop-up).
 */
(function () {
  if (window.LBFix) return;
  var css = '@keyframes lbfixPulse{0%,100%{box-shadow:0 0 0 3px rgba(214,48,49,.95),0 0 0 7px rgba(214,48,49,.25)}50%{box-shadow:0 0 0 3px rgba(214,48,49,.35),0 0 0 12px rgba(214,48,49,0)}}' +
    '.lbfix-on{animation:lbfixPulse 1s ease-in-out infinite!important;border-radius:10px;position:relative;z-index:5}' +
    '.lbfix-tip{position:absolute;z-index:2147480000;background:#d63031;color:#fff;font:600 12px/1.35 "Space Grotesk",system-ui,sans-serif;padding:6px 10px;border-radius:8px;max-width:260px;box-shadow:0 8px 20px rgba(0,0,0,.25);pointer-events:none}' +
    '.lbfix-tip:after{content:"";position:absolute;left:16px;top:-6px;border:6px solid transparent;border-top:0;border-bottom-color:#d63031}' +
    '.lbfix-bar{position:sticky;top:0;z-index:2147480001;display:flex;align-items:center;gap:10px;background:#d63031;color:#fff;font:600 13px/1.4 "Space Grotesk",system-ui,sans-serif;padding:10px 14px;box-shadow:0 6px 18px rgba(214,48,49,.35)}' +
    '.lbfix-bar b{font-weight:800}.lbfix-bar .d{width:10px;height:10px;border-radius:50%;background:#fff;flex:none;animation:lbfixB 1s infinite}@keyframes lbfixB{50%{opacity:.25}}' +
    '.lbfix-bar button{margin-left:auto;background:rgba(255,255,255,.2);border:0;color:#fff;border-radius:8px;padding:5px 10px;font:inherit;cursor:pointer;flex:none}';
  function addCss() { if (document.getElementById('lbfixCss')) return; var s = document.createElement('style'); s.id = 'lbfixCss'; s.setAttribute('data-lb-theme-skip', ''); s.textContent = css; document.head.appendChild(s); }
  var tips = [];
  function place(tip, el) { var r = el.getBoundingClientRect(); tip.style.left = Math.max(8, r.left + window.scrollX) + 'px'; tip.style.top = (r.bottom + window.scrollY + 9) + 'px'; }
  function mark(el, msg) {
    if (!el) return false; addCss();
    el.classList.add('lbfix-on');
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(); }
    if (msg) { var tip = document.createElement('div'); tip.className = 'lbfix-tip'; tip.textContent = msg; document.body.appendChild(tip); tips.push([tip, el]); setTimeout(function () { place(tip, el); }, 450); }
    var off = function () { el.classList.remove('lbfix-on'); tips = tips.filter(function (t) { if (t[1] === el) { t[0].remove(); return false; } return true; }); };
    ['input', 'change', 'click'].forEach(function (ev) { el.addEventListener(ev, off, { once: true }); });
    return true;
  }
  window.addEventListener('resize', function () { tips.forEach(function (t) { place(t[0], t[1]); }); });
  window.addEventListener('scroll', function () { tips.forEach(function (t) { place(t[0], t[1]); }); }, true);
  function bar(text) {
    addCss(); var b = document.createElement('div'); b.className = 'lbfix-bar';
    b.innerHTML = '<span class="d"></span><span><b>Fix this:</b> </span><button type="button">OK ✕</button>';
    b.children[1].appendChild(document.createTextNode(text));
    b.querySelector('button').onclick = function () { b.remove(); };
    document.body.insertBefore(b, document.body.firstChild);
  }
  function auto() {
    var q = new URLSearchParams(location.search); if (!q.get('fix')) return;
    var why = q.get('why') || '', br = q.get('branch'), field = q.get('field'), edit = q.get('edit');
    if (why) bar(why + (br ? ' (' + br + ')' : ''));
    var n = 0, done = false, t = setInterval(function () {
      n++;
      // 1) the right branch tab
      if (br) { var tab = document.querySelector('.branch-tab[data-branch="' + br.replace(/"/g, '') + '"]');
        if (tab && !tab.classList.contains('active')) tab.click(); }
      // 2) the field / button (when the page opens an Edit pop-up itself, it marks the field there)
      if (!done && field && !edit) { var el = document.getElementById(field);
        if (el && el.offsetParent !== null) { done = true; setTimeout(function () { mark(el, why); }, 300); }
        else if (el && n > 6) { done = true; var box = el.closest('.card, section, .panel') || el.parentElement; mark(box, why + ' — this part of the page'); } }
      if ((done || !field || edit) && (n > 4 || !br) || n > 40) clearInterval(t);
    }, 500);
  }
  window.LBFix = { mark: mark, bar: bar };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
