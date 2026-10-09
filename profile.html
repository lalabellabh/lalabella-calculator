/**
 * LALABELLA PROFILE FX — a little living animation behind your name in the menu.
 *
 * Finds the profile card at the top of the drawer (.lb-menu-profile, drawn by
 * nav.js) and puts a tiny canvas animation behind the text:
 *   🐟 Fish   — small fish swimming, a few bubbles
 *   ❄️ Snow   — soft snowfall
 *   🔥 Fire   — little flames + rising embers
 *   🌸 Petals — flower petals drifting down
 *   🚫 Off
 * Tap the ✨ at the corner of the card to change it. The choice is remembered
 * on this device, per login.
 *
 * Light on battery: it only draws while the menu is actually on screen and the
 * tab is visible, at ~30 frames a second.
 *
 * Add a new effect = add one entry to EFFECTS below (init + draw). Nothing else.
 */
(function () {
  'use strict';
  if (window.LBProfileFx) return;

  var KEY = 'lbProfileFx';
  var DEFAULT = 'fish';

  // ---------- helpers ----------
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function user() {
    try { return JSON.parse(sessionStorage.getItem('lalabellaUser') || localStorage.getItem('lalabellaUser') || '{}') || {}; }
    catch (e) { return {}; }
  }
  function who() { var u = user(); return String(u.username || u.fullName || 'anon').toLowerCase(); }
  function getChoice() {
    try {
      var all = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
      if (all[who()]) return all[who()];
    } catch (e) {}
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    return reduce ? 'off' : DEFAULT;
  }
  function setChoice(v) {
    try {
      var all = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
      all[who()] = v; localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e) {}
  }

  // ---------- the effects ----------
  // init(w,h) -> state ; draw(ctx,w,h,t,dt,state)
  var EFFECTS = {
    fish: {
      label: '🐟 Fish', tint: 'linear-gradient(135deg,rgba(110,200,225,.30),rgba(150,225,235,.10))',
      init: function (w, h) {
        var colors = ['#ff8a3d', '#ff6f91', '#ffc93c', '#4cc9c0', '#f7a8c4', '#ff9f5a'];
        var fish = [], bubbles = [];
        for (var i = 0; i < 6; i++) fish.push(newFish(w, h, colors, true));
        return { fish: fish, bubbles: bubbles, colors: colors, nextBubble: 0 };
      },
      draw: function (c, w, h, t, dt, s) {
        s.fish.forEach(function (f, i) {
          f.x += f.v * f.dir * dt;
          if ((f.dir > 0 && f.x > w + 30) || (f.dir < 0 && f.x < -30)) Object.assign(f, newFish(w, h, s.colors, false, f.dir));
          var y = f.y + Math.sin(t * f.wob + f.ph) * 3;
          drawFish(c, f.x, y, f.s, f.dir, f.col, t * 9 + f.ph);
        });
        s.nextBubble -= dt;
        if (s.nextBubble <= 0) { s.nextBubble = rnd(.5, 1.6); s.bubbles.push({ x: rnd(8, w - 8), y: h + 4, r: rnd(1, 2.4), v: rnd(10, 22) }); }
        c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.75)';
        s.bubbles = s.bubbles.filter(function (b) { return b.y > -6; });
        s.bubbles.forEach(function (b) {
          b.y -= b.v * dt; b.x += Math.sin(t * 2 + b.y * .1) * .2;
          c.beginPath(); c.arc(b.x, b.y, b.r, 0, 6.283); c.stroke();
        });
      }
    },
    snow: {
      label: '❄️ Snow', tint: 'linear-gradient(160deg,rgba(150,185,230,.34),rgba(200,220,245,.12))',
      init: function (w, h) {
        var a = []; for (var i = 0; i < 30; i++) a.push({ x: rnd(0, w), y: rnd(0, h), r: rnd(1, 2.8), v: rnd(10, 30), ph: rnd(0, 6) });
        return { flakes: a };
      },
      draw: function (c, w, h, t, dt, s) {
        s.flakes.forEach(function (f) {
          f.y += f.v * dt; f.x += Math.sin(t * 1.3 + f.ph) * .35;
          if (f.y > h + 4) { f.y = -4; f.x = rnd(0, w); }
          c.beginPath(); c.arc(f.x, f.y, f.r, 0, 6.283);
          c.fillStyle = 'rgba(255,255,255,.95)'; c.fill();
          c.lineWidth = .6; c.strokeStyle = 'rgba(110,150,200,.45)'; c.stroke();
        });
      }
    },
    fire: {
      label: '🔥 Fire', tint: 'linear-gradient(0deg,rgba(255,140,60,.30),rgba(255,200,130,.08))',
      init: function (w, h) {
        var n = Math.max(6, Math.round(w / 34)), fl = [], em = [];
        for (var i = 0; i < n; i++) fl.push({ x: (i + .5) * w / n, ph: rnd(0, 6), base: rnd(.7, 1.1) });
        for (var j = 0; j < 14; j++) em.push(newEmber(w, h, true));
        return { fl: fl, em: em, n: n };
      },
      draw: function (c, w, h, t, dt, s) {
        var wd = w / s.n * .75;
        s.fl.forEach(function (f) {
          var k = (Math.sin(t * 4 + f.ph) + Math.sin(t * 6.7 + f.ph * 1.7)) * .25 + .5; // 0..1
          var H = (11 + 15 * k) * f.base, sway = Math.sin(t * 3 + f.ph) * 3;
          flame(c, f.x, h, wd, H, sway, 'rgba(255,70,20,.55)');
          flame(c, f.x, h, wd * .66, H * .74, sway * .8, 'rgba(255,150,30,.75)');
          flame(c, f.x, h, wd * .36, H * .48, sway * .5, 'rgba(255,235,130,.9)');
        });
        s.em.forEach(function (e, i) {
          e.y -= e.v * dt; e.x += Math.sin(t * 3 + e.ph) * .4; e.life -= dt;
          if (e.life <= 0 || e.y < -4) s.em[i] = newEmber(w, h, false);
          c.globalAlpha = Math.max(0, Math.min(1, e.life / e.max));
          c.fillStyle = e.col; c.beginPath(); c.arc(e.x, e.y, e.r, 0, 6.283); c.fill();
        });
        c.globalAlpha = 1;
      }
    },
    petals: {
      label: '🌸 Petals', tint: 'linear-gradient(135deg,rgba(255,170,200,.30),rgba(255,215,225,.10))',
      init: function (w, h) {
        var a = []; for (var i = 0; i < 14; i++) a.push(newPetal(w, h, true));
        return { p: a };
      },
      draw: function (c, w, h, t, dt, s) {
        s.p.forEach(function (p, i) {
          p.y += p.v * dt; p.x += Math.sin(t * 1.2 + p.ph) * .5 + p.dx * dt; p.rot += p.vr * dt;
          if (p.y > h + 8 || p.x > w + 10 || p.x < -10) s.p[i] = newPetal(w, h, false);
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.scale(1, .62 + Math.abs(Math.sin(t * 1.5 + p.ph)) * .38);
          c.fillStyle = p.col; c.beginPath(); c.ellipse(0, 0, p.r * 1.25, p.r * .75, 0, 0, 6.283); c.fill();
          c.restore();
        });
      }
    },
    off: { label: '🚫 Off', tint: '' }
  };
  var ORDER = ['fish', 'snow', 'fire', 'petals', 'off'];

  function newFish(w, h, colors, spread, dirIn) {
    var dir = dirIn || (Math.random() < .5 ? 1 : -1);
    return { x: spread ? rnd(0, w) : (dir > 0 ? -20 : w + 20), y: rnd(10, h - 10), s: rnd(4.5, 8), v: rnd(14, 34),
      dir: dir, col: pick(colors), wob: rnd(.8, 2), ph: rnd(0, 6) };
  }
  function drawFish(c, x, y, s, dir, col, tw) {
    c.save(); c.translate(x, y); c.scale(dir, 1);
    var wag = Math.sin(tw) * .35;
    c.fillStyle = col;
    c.save(); c.translate(-s * .85, 0); c.rotate(wag);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-s * .95, -s * .6); c.lineTo(-s * .95, s * .6); c.closePath(); c.fill(); c.restore();
    c.beginPath(); c.ellipse(0, 0, s, s * .58, 0, 0, 6.283); c.fill();
    c.beginPath(); c.moveTo(-s * .2, -s * .5); c.lineTo(s * .15, -s * .95); c.lineTo(s * .35, -s * .45); c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(s * .52, -s * .12, s * .2, 0, 6.283); c.fill();
    c.fillStyle = '#222'; c.beginPath(); c.arc(s * .57, -s * .12, s * .1, 0, 6.283); c.fill();
    c.restore();
  }
  function flame(c, x, base, wd, H, sway, col) {
    c.fillStyle = col; c.beginPath();
    c.moveTo(x - wd, base);
    c.quadraticCurveTo(x - wd * .6, base - H * .55, x + sway, base - H);
    c.quadraticCurveTo(x + wd * .6, base - H * .55, x + wd, base);
    c.closePath(); c.fill();
  }
  function newEmber(w, h, spread) {
    var max = rnd(1, 2.2);
    return { x: rnd(0, w), y: spread ? rnd(0, h) : h - rnd(0, 6), r: rnd(.8, 1.9), v: rnd(14, 32), ph: rnd(0, 6), life: spread ? rnd(.3, max) : max, max: max, col: pick(['#ffb02e', '#ff7a1a', '#ffd966']) };
  }
  function newPetal(w, h, spread) {
    return { x: rnd(0, w), y: spread ? rnd(0, h) : -8, r: rnd(2.6, 4.4), v: rnd(10, 22), dx: rnd(-4, 6), ph: rnd(0, 6), rot: rnd(0, 6), vr: rnd(-1.5, 1.5), col: pick(['#ff8fb1', '#ffb3c8', '#ff6f9c', '#ffd1dc']) };
  }

  // ---------- one card ----------
  var cards = [];

  function decorate(card) {
    if (card.getAttribute('data-fx')) return;
    card.setAttribute('data-fx', '1');
    card.style.position = 'relative';

    var wrap = document.createElement('span');
    wrap.className = 'lbfx-wrap';
    var cv = document.createElement('canvas');
    wrap.appendChild(cv);
    card.insertBefore(wrap, card.firstChild);

    var btn = document.createElement('span');
    btn.className = 'lbfx-btn'; btn.setAttribute('role', 'button'); btn.setAttribute('aria-label', 'Change animation'); btn.title = 'Change animation';
    btn.textContent = '✨';
    card.appendChild(btn);

    var pop = null;
    function closePop() { if (pop) { pop.remove(); pop = null; document.removeEventListener('click', outside, true); } }
    function outside(e) { if (pop && !pop.contains(e.target) && e.target !== btn) closePop(); }
    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (pop) { closePop(); return; }
      pop = document.createElement('span');
      pop.className = 'lbfx-pop';
      var cur = getChoice();
      pop.innerHTML = ORDER.map(function (k) {
        return '<span class="lbfx-opt' + (k === cur ? ' on' : '') + '" data-k="' + k + '" role="button">' + EFFECTS[k].label + '</span>';
      }).join('');
      pop.addEventListener('click', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var o = ev.target.closest && ev.target.closest('.lbfx-opt'); if (!o) return;
        setChoice(o.getAttribute('data-k')); closePop(); apply();
        window.dispatchEvent(new CustomEvent('lb:profile-fx', { detail: { effect: o.getAttribute('data-k') } }));
      });
      card.appendChild(pop);
      setTimeout(function () { document.addEventListener('click', outside, true); }, 0);
    });

    var st = { card: card, wrap: wrap, cv: cv, ctx: cv.getContext('2d'), w: 0, h: 0, eff: 'off', state: null, visible: false, last: 0, acc: 0, t: 0 };
    cards.push(st);

    function size() {
      var r = card.getBoundingClientRect(); if (!r.width) return;
      var d = Math.min(window.devicePixelRatio || 1, 2);
      st.w = Math.round(r.width); st.h = Math.round(r.height);
      cv.width = st.w * d; cv.height = st.h * d; cv.style.width = st.w + 'px'; cv.style.height = st.h + 'px';
      st.ctx.setTransform(d, 0, 0, d, 0, 0);
      if (st.eff !== 'off' && EFFECTS[st.eff].init) st.state = EFFECTS[st.eff].init(st.w, st.h);
    }
    function apply() {
      st.eff = EFFECTS[getChoice()] ? getChoice() : DEFAULT;
      wrap.style.background = EFFECTS[st.eff].tint || '';
      wrap.style.display = st.eff === 'off' ? 'none' : '';
      size();
      st.ctx.clearRect(0, 0, st.w, st.h);
      loop();
    }
    st.apply = apply;
    if (window.ResizeObserver) new ResizeObserver(size).observe(card);
    if (window.IntersectionObserver) new IntersectionObserver(function (en) { st.visible = en[0].isIntersecting; if (st.visible) loop(); }).observe(card);
    else st.visible = true;
    apply();
  }

  // one shared animation loop, ~30fps, only while something is visible
  var running = false;
  function loop() {
    if (running) return;
    running = true;
    var prev = 0;
    function frame(now) {
      var any = false;
      if (!document.hidden) {
        var dt = prev ? Math.min((now - prev) / 1000, .1) : 0;
        if (!prev || now - prev >= 32) {
          prev = now;
          cards.forEach(function (st) {
            if (!st.card.isConnected || st.eff === 'off' || !st.visible || !st.w) return;
            any = true; st.t += dt;
            st.ctx.clearRect(0, 0, st.w, st.h);
            EFFECTS[st.eff].draw(st.ctx, st.w, st.h, st.t, dt, st.state);
          });
        } else any = true;
      }
      cards = cards.filter(function (st) { return st.card.isConnected; });
      if (any || (document.hidden && cards.length)) requestAnimationFrame(frame); else running = false;
    }
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) loop(); });

  // ---------- styles ----------
  if (!document.getElementById('lbfx-style')) {
    var css = document.createElement('style'); css.id = 'lbfx-style';
    css.textContent =
      '.lb-menu-profile .lbfx-wrap{position:absolute;inset:0;border-radius:inherit;overflow:hidden;pointer-events:none;z-index:0}' +
      '.lb-menu-profile .lbfx-wrap canvas{display:block}' +
      '.lb-menu-profile>.lb-menu-avatar,.lb-menu-profile>.lb-menu-profile-text{position:relative;z-index:1}' +
      '.lbfx-btn{position:absolute;top:5px;right:6px;z-index:3;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
        'font-size:12px;line-height:1;cursor:pointer;background:rgba(255,255,255,.7);box-shadow:0 1px 4px rgba(0,0,0,.15);-webkit-tap-highlight-color:transparent}' +
      '.lbfx-btn:active{transform:scale(.92)}' +
      '.lbfx-pop{position:absolute;top:32px;right:4px;z-index:5;display:flex;flex-direction:column;gap:2px;padding:5px;border-radius:12px;background:#fff;' +
        'box-shadow:0 8px 24px rgba(60,30,40,.25);border:1px solid rgba(0,0,0,.06);color:#3a2a2e;font-weight:600}' +
      '.lbfx-opt{display:block;padding:7px 12px;border-radius:8px;font-size:13px;white-space:nowrap;cursor:pointer}' +
      '.lbfx-opt:hover{background:rgba(201,80,107,.1)}' +
      '.lbfx-opt.on{background:#9e2f4a;color:#fff}' +
      '@media print{.lbfx-wrap,.lbfx-btn,.lbfx-pop{display:none!important}}';
    document.head.appendChild(css);
  }

  // ---------- find cards (nav.js redraws the menu, so keep watching) ----------
  var queued = false;
  function scan() {
    queued = false;
    document.querySelectorAll('.lb-menu-profile:not([data-fx])').forEach(decorate);
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(scan); } }
  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('lb:user-changed', function () { cards.forEach(function (st) { st.apply && st.apply(); }); });
  scan();

  window.LBProfileFx = {
    effects: ORDER.slice(),
    set: function (k) { if (EFFECTS[k]) { setChoice(k); cards.forEach(function (st) { st.apply && st.apply(); }); } },
    get: getChoice
  };
})();
