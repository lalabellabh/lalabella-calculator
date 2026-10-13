/* Makes the floating chat bubble and the Nova (Joyboy) mic draggable — same feel as the floating order bell.
   Loaded by shared/nav.js. It finds the buttons by id once they exist, so chat-bubble.js / joyboy-bubble.js stay untouched.
   Each one remembers where you left it (per browser); the open panel follows its button, above or below, left or right. */
(function () {
  'use strict';
  if (window.LBDragFloat) return;
  window.LBDragFloat = true;

  var TARGETS = [
    { btn: 'lbcb-btn', panel: 'lbcb-panel', key: 'lbPosChat' },
    { btn: 'joyboy-bubble-btn', panel: 'joyboy-panel', key: 'lbPosNova' }
  ];
  var SIZE_PAD = 4;

  function imp(el, prop, val) { el.style.setProperty(prop, val, 'important'); }

  function attach(t) {
    var btn = document.getElementById(t.btn), panel = document.getElementById(t.panel);
    if (!btn || !panel || btn.__lbDrag) return false;
    btn.__lbDrag = true;
    btn.style.touchAction = 'none';
    btn.style.userSelect = 'none';
    btn.style.webkitUserSelect = 'none';

    function clamp(x, y) {
      var w = btn.offsetWidth || 48, h = btn.offsetHeight || 48;
      return {
        x: Math.max(SIZE_PAD, Math.min(window.innerWidth - w - SIZE_PAD, x)),
        y: Math.max(SIZE_PAD, Math.min(window.innerHeight - h - SIZE_PAD, y))
      };
    }
    function place(x, y) {
      var p = clamp(x, y);
      imp(btn, 'left', p.x + 'px'); imp(btn, 'top', p.y + 'px');
      imp(btn, 'right', 'auto'); imp(btn, 'bottom', 'auto');
    }
    function layoutPanel() {
      if (!panel.classList.contains('show')) return;
      if (t.btn === 'lbcb-btn' && window.innerWidth <= 600) {        // phones: the chat is full screen
        ['left', 'top', 'right', 'bottom'].forEach(function (k) { panel.style.removeProperty(k); });
        return;
      }
      if (!btn.style.left) return; // never moved: leave the original CSS position alone
      var r = btn.getBoundingClientRect(), pr = panel.getBoundingClientRect();
      var pw = pr.width || 320, ph = pr.height || 400;
      var below = r.top + r.height / 2 < window.innerHeight / 2;
      var left = (r.left + r.width / 2 < window.innerWidth / 2) ? r.left : r.right - pw;
      left = Math.max(8, Math.min(window.innerWidth - pw - 8, left));
      var top = below ? r.bottom + 8 : r.top - ph - 8;
      top = Math.max(8, Math.min(window.innerHeight - ph - 8, top));
      imp(panel, 'left', left + 'px'); imp(panel, 'top', top + 'px');
      imp(panel, 'right', 'auto'); imp(panel, 'bottom', 'auto');
    }

    try {
      var saved = JSON.parse(localStorage.getItem(t.key) || 'null');
      if (saved && isFinite(saved.x) && isFinite(saved.y)) place(saved.x, saved.y);
    } catch (e) {}

    var down = null, moved = false, suppress = false;
    btn.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      var r = btn.getBoundingClientRect();
      down = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY };
      moved = false;
      try { btn.setPointerCapture(e.pointerId); } catch (x) {}
    });
    btn.addEventListener('pointermove', function (e) {
      if (!down) return;
      if (!moved && Math.abs(e.clientX - down.sx) + Math.abs(e.clientY - down.sy) < 6) return;
      moved = true;
      place(e.clientX - down.dx, e.clientY - down.dy);
      layoutPanel();
    });
    function end() {
      if (!down) return;
      if (moved) {
        suppress = true; // swallow the click that follows a drag so the panel doesn't toggle
        setTimeout(function () { suppress = false; }, 350);
        var r = btn.getBoundingClientRect();
        try { localStorage.setItem(t.key, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); } catch (e) {}
      }
      down = null;
    }
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    document.addEventListener('click', function (e) {
      if (suppress && btn.contains(e.target)) { e.stopPropagation(); e.preventDefault(); suppress = false; }
    }, true);

    new MutationObserver(function () { if (panel.classList.contains('show')) layoutPanel(); })
      .observe(panel, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', function () {
      if (btn.style.left) { var r = btn.getBoundingClientRect(); place(r.left, r.top); }
      layoutPanel();
    });
    return true;
  }

  function scan() {
    var pending = 0;
    TARGETS.forEach(function (t) {
      attach(t);
      var b = document.getElementById(t.btn);
      if (!b || !b.__lbDrag) pending++;
    });
    return pending;
  }
  if (scan() === 0) return;
  var mo = new MutationObserver(function () { if (scan() === 0) mo.disconnect(); });
  mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
  setTimeout(function () { mo.disconnect(); }, 120000); // give up looking after 2 minutes
})();
