/**
 * LALABELLA PROFILE FX v2 — a small "living" scene behind your name in the menu.
 *
 * Finds the profile card at the top of the drawer (.lb-menu-profile, drawn by
 * nav.js) and paints a pseudo-3D scene on a canvas behind the text:
 *   🐠 Ocean    — deep water, light rays, swaying kelp, fish with real swimming bodies, depth layers
 *   ❄️ Snowfall — night sky, stars, soft bokeh snow in 3 depth layers, snow crystals, rolling hills
 *   🔥 Fire     — real fire: additive glowing particles that burn yellow → orange → red, sparks, glow
 *   🌸 Petals   — flower petals that flip and tumble in the wind
 *   🚫 Off
 * Move your finger / mouse over the card and the layers shift (parallax) — that is what makes it feel 3D.
 * Tap the ✨ in the corner to change it. The choice is remembered on this device, per login.
 *
 * Light on battery: draws only while the menu is on screen and the tab is visible, ~30 frames a second.
 * Add a new effect = add one entry to EFFECTS (tint, dark?, init, draw). Nothing else.
 */
(function () {
  'use strict';
  if (window.LBProfileFx) return;

  var KEY = 'lbProfileFx';
  var DEFAULT = 'fish';
  var TAU = Math.PI * 2;

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
  // pre-rendered soft sprite (fast: one drawImage per particle)
  function sprite(size, stops) {
    var cv = document.createElement('canvas'); cv.width = cv.height = size;
    var g = cv.getContext('2d'), r = size / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
    stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return cv;
  }

  // =====================================================================
  //  OCEAN
  // =====================================================================
  var FISH_COLORS = [
    ['#ffbf80', '#ff7a1f', '#ffe6cc'],   // orange
    ['#7db8ff', '#2467d6', '#c9e4ff'],   // blue
    ['#fff39a', '#ffc61a', '#fff9d6'],   // yellow
    ['#ffb3d0', '#ff5f98', '#ffe3ee'],   // pink
    ['#9ff5cc', '#2fbf86', '#dcffee']    // green
  ];
  var bubbleSprite, kelpCols = ['rgba(34,150,105,.85)', 'rgba(70,190,120,.8)'];
  function newFish(w, h, spread, dirIn) {
    var z = Math.random(), dir = dirIn || (Math.random() < .5 ? 1 : -1);
    var s = 3.2 + z * 5.2;                            // far = small, near = big
    return { z: z, s: s, dir: dir, x: spread ? rnd(0, w) : (dir > 0 ? -30 : w + 30), y: rnd(9, h - 12),
      v: 9 + z * 24, col: pick(FISH_COLORS), ph: rnd(0, 6), wob: rnd(.5, 1.3), sp: rnd(7, 10) };
  }
  function drawFish(c, f, t, par) {
    var N = 9, s = f.s, L = s * 2.5, amp = s * .42, w = [], i, u;
    var pts = [];
    for (i = 0; i <= N; i++) {
      u = i / N;
      var y = Math.sin(t * f.sp + f.ph - i * .6) * amp * Math.pow(u, 1.4);
      var hw = s * .62 * Math.pow(Math.sin(Math.PI * (.12 + .78 * u)), .8) * (1 - .35 * u);
      pts.push({ x: L / 2 - u * L, y: y, hw: hw });
    }
    c.save();
    c.translate(f.x + par * f.z * 7, f.y + Math.sin(t * f.wob + f.ph) * 2.2);
    c.scale(f.dir, 1);
    c.globalAlpha = .5 + f.z * .5;
    // tail fin
    var e = pts[N], wag = Math.sin(t * f.sp + f.ph - (N + 1) * .6) * amp * 1.1;
    c.fillStyle = f.col[1];
    c.beginPath();
    c.moveTo(e.x + s * .1, e.y);
    c.lineTo(e.x - s * .95, e.y + wag - s * .7);
    c.quadraticCurveTo(e.x - s * .55, e.y + wag * .6, e.x - s * .85, e.y + wag + s * .7);
    c.closePath(); c.fill();
    // dorsal fin
    var d0 = pts[3], d1 = pts[4], d2 = pts[6];
    c.fillStyle = f.col[1];
    c.beginPath(); c.moveTo(d0.x, d0.y - d0.hw * .8); c.quadraticCurveTo(d1.x + s * .1, d1.y - d1.hw - s * .8, d2.x, d2.y - d2.hw * .7); c.closePath(); c.fill();
    // body with belly-to-back shading
    var g = c.createLinearGradient(0, -s * .7, 0, s * .7);
    g.addColorStop(0, f.col[0]); g.addColorStop(.5, f.col[1]); g.addColorStop(1, f.col[2]);
    c.fillStyle = g;
    c.beginPath();
    for (i = 0; i <= N; i++) c[i ? 'lineTo' : 'moveTo'](pts[i].x, pts[i].y - pts[i].hw);
    for (i = N; i >= 0; i--) c.lineTo(pts[i].x, pts[i].y + pts[i].hw);
    c.closePath(); c.fill();
    // soft highlight along the back
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = Math.max(.6, s * .12); c.lineCap = 'round';
    c.beginPath(); for (i = 1; i <= 6; i++) c[i > 1 ? 'lineTo' : 'moveTo'](pts[i].x, pts[i].y - pts[i].hw * .55); c.stroke();
    // eye
    var h = pts[0], ex = L / 2 - s * .55, ey = h.y - s * .1;
    c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, s * .2, 0, TAU); c.fill();
    c.fillStyle = '#10222e'; c.beginPath(); c.arc(ex + s * .04, ey, s * .12, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + s * .08, ey - s * .05, s * .045, 0, TAU); c.fill();
    c.restore();
  }
  function kelp(c, x, h, t, ph, ht, par) {
    c.lineCap = 'round';
    for (var k = 0; k < 2; k++) {
      c.strokeStyle = kelpCols[k]; c.lineWidth = 2.6 - k * .8;
      var sw = Math.sin(t * 1.1 + ph + k) * 5, x0 = x + k * 3 + par * 3;
      c.beginPath(); c.moveTo(x0, h + 2);
      c.bezierCurveTo(x0 + sw, h - ht * .35, x0 - sw, h - ht * .7, x0 + sw * .6, h - ht * (1 - k * .15));
      c.stroke();
    }
  }

  // =====================================================================
  //  EFFECTS
  // =====================================================================
  var EFFECTS = {
    fish: {
      label: '🐠 Ocean', dark: true,
      tint: 'linear-gradient(180deg,#3ba4cc 0%,#16608a 55%,#0a3452 100%)',
      init: function (w, h) {
        if (!bubbleSprite) bubbleSprite = sprite(24, [[0, 'rgba(255,255,255,.05)'], [.7, 'rgba(255,255,255,.18)'], [.9, 'rgba(255,255,255,.85)'], [1, 'rgba(255,255,255,0)']]);
        var fish = [], i; for (i = 0; i < 8; i++) fish.push(newFish(w, h, true));
        fish.sort(function (a, b) { return a.z - b.z; });
        var kelps = []; for (i = 0; i < 5; i++) kelps.push({ x: rnd(8, w - 8), ph: rnd(0, 6), ht: rnd(14, 26) });
        var plankton = []; for (i = 0; i < 22; i++) plankton.push({ x: rnd(0, w), y: rnd(0, h), z: Math.random(), ph: rnd(0, 6) });
        return { fish: fish, kelps: kelps, plankton: plankton, bubbles: [], nb: 0 };
      },
      draw: function (c, w, h, t, dt, s, par) {
        var i;
        // light rays from the surface
        for (i = 0; i < 4; i++) {
          var x0 = w * (.12 + .25 * i) + Math.sin(t * .3 + i) * 10 + par * 6, g = c.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, 'rgba(255,255,255,' + (.22 + .08 * Math.sin(t * .8 + i * 2)) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = g; c.beginPath(); c.moveTo(x0, 0); c.lineTo(x0 + 16, 0); c.lineTo(x0 - 8, h); c.lineTo(x0 - 30, h); c.closePath(); c.fill();
        }
        // drifting plankton
        c.fillStyle = 'rgba(255,255,255,.35)';
        s.plankton.forEach(function (p) {
          p.x += (3 + p.z * 5) * dt; p.y += Math.sin(t + p.ph) * .15; if (p.x > w + 2) p.x = -2;
          c.globalAlpha = .15 + p.z * .3; c.fillRect(p.x + par * p.z * 5, p.y, .9 + p.z, .9 + p.z);
        });
        c.globalAlpha = 1;
        // far fish first, then kelp, then near fish
        s.fish.forEach(function (f) { if (f.z < .45) drawFish(c, f, t, par); });
        s.kelps.forEach(function (k) { kelp(c, k.x, h, t, k.ph, k.ht, par); });
        s.fish.forEach(function (f, idx) {
          f.x += f.v * f.dir * dt;
          if ((f.dir > 0 && f.x > w + 40) || (f.dir < 0 && f.x < -40)) { var n = newFish(w, h, false, f.dir); s.fish[idx] = n; }
          if (f.z >= .45) drawFish(c, f, t, par);
        });
        // bubbles with a glint
        s.nb -= dt; if (s.nb <= 0) { s.nb = rnd(.4, 1.3); s.bubbles.push({ x: rnd(10, w - 10), y: h + 4, r: rnd(2, 4.2), v: rnd(10, 22), ph: rnd(0, 6) }); }
        s.bubbles = s.bubbles.filter(function (b) { return b.y > -6; });
        s.bubbles.forEach(function (b) { b.y -= b.v * dt; var bx = b.x + Math.sin(t * 2 + b.ph) * 2 + par * 4; c.drawImage(bubbleSprite, bx - b.r, b.y - b.r, b.r * 2, b.r * 2); });
      }
    },

    snow: {
      label: '❄️ Snowfall', dark: true,
      tint: 'linear-gradient(180deg,#0d2545 0%,#2a5280 100%)',
      init: function (w, h) {
        var soft = sprite(32, [[0, 'rgba(255,255,255,1)'], [.35, 'rgba(255,255,255,.65)'], [1, 'rgba(255,255,255,0)']]);
        var fl = [], i;
        for (i = 0; i < 38; i++) { var z = Math.random(); fl.push({ x: rnd(0, w), y: rnd(0, h), z: z, r: 1 + z * 3.2, v: 8 + z * 26, ph: rnd(0, 6), rot: rnd(0, 6), vr: rnd(-1, 1), cr: z > .78 }); }
        fl.sort(function (a, b) { return a.z - b.z; });
        var st = []; for (i = 0; i < 14; i++) st.push({ x: rnd(0, w), y: rnd(0, h * .55), ph: rnd(0, 6), r: rnd(.5, 1.1) });
        return { soft: soft, fl: fl, st: st };
      },
      draw: function (c, w, h, t, dt, s, par) {
        var wind = Math.sin(t * .4) * 8 + par * 10;
        // stars
        s.st.forEach(function (q) { c.globalAlpha = .25 + .45 * (.5 + .5 * Math.sin(t * 1.6 + q.ph)); c.fillStyle = '#fff'; c.beginPath(); c.arc(q.x + par * 2, q.y, q.r, 0, TAU); c.fill(); });
        c.globalAlpha = 1;
        // rolling snow hills (two layers)
        [[.62, 'rgba(120,160,205,.85)', 5, .045, 1.2], [.78, 'rgba(236,244,255,.95)', 4, .06, 3.1]].forEach(function (L) {
          c.fillStyle = L[1]; c.beginPath(); c.moveTo(0, h);
          for (var x = 0; x <= w; x += 6) c.lineTo(x, h * L[0] + h * .22 - Math.sin(x * L[3] + L[4] + par * .4) * L[2]);
          c.lineTo(w, h); c.closePath(); c.fill();
        });
        // flakes: far = tiny + dim, near = big soft bokeh / crystals
        s.fl.forEach(function (f) {
          f.y += f.v * dt; f.x += (Math.sin(t * 1.1 + f.ph) * .4 + wind * dt * (.4 + f.z)); f.rot += f.vr * dt;
          if (f.y > h + 6) { f.y = -6; f.x = rnd(0, w); }
          if (f.x > w + 8) f.x = -8; if (f.x < -8) f.x = w + 8;
          var px = f.x + par * f.z * 9;
          if (f.cr) {
            c.save(); c.translate(px, f.y); c.rotate(f.rot); c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = .8; c.lineCap = 'round';
            for (var k = 0; k < 3; k++) { c.rotate(Math.PI / 3); c.beginPath(); c.moveTo(-f.r * 1.2, 0); c.lineTo(f.r * 1.2, 0); c.stroke(); }
            c.restore();
          } else { c.globalAlpha = .35 + f.z * .6; var d = f.r * 2.2; c.drawImage(s.soft, px - d / 2, f.y - d / 2, d, d); }
        });
        c.globalAlpha = 1;
      }
    },

    fire: {
      label: '🔥 Fire', dark: true,
      tint: 'linear-gradient(180deg,#140907 0%,#2d1008 100%)',
      init: function (w, h) {
        return {
          hot: sprite(64, [[0, 'rgba(255,245,190,1)'], [.35, 'rgba(255,200,80,.6)'], [1, 'rgba(255,160,30,0)']]),
          mid: sprite(64, [[0, 'rgba(255,170,50,1)'], [.4, 'rgba(255,110,20,.55)'], [1, 'rgba(255,70,10,0)']]),
          cool: sprite(64, [[0, 'rgba(230,70,20,.9)'], [.45, 'rgba(170,35,10,.45)'], [1, 'rgba(110,20,5,0)']]),
          p: [], sparks: [], acc: 0
        };
      },
      draw: function (c, w, h, t, dt, s, par) {
        var cx = w / 2 + par * 8;
        // glow at the base
        var g = c.createLinearGradient(0, h, 0, h * .1), fl = .82 + .18 * Math.sin(t * 9) * Math.sin(t * 5.3);
        g.addColorStop(0, 'rgba(255,110,25,' + (.5 * fl) + ')'); g.addColorStop(1, 'rgba(255,60,10,0)');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        // spawn flame particles (bell-shaped across the width → taller in the middle)
        s.acc += dt * 70;
        while (s.acc > 1) {
          s.acc -= 1;
          var x = cx + (Math.random() + Math.random() + Math.random() - 1.5) / 1.5 * w * .56, mid = 1 - Math.min(1, Math.abs(x - cx) / (w * .6));
          s.p.push({ x: x, y: h + 3, vx: rnd(-5, 5), vy: -(22 + 38 * mid + rnd(0, 18)), life: rnd(.55, 1.15), age: 0, r: rnd(8, 15) * (.7 + .5 * mid), ph: rnd(0, 6) });
        }
        if (Math.random() < dt * 9) s.sparks.push({ x: cx + rnd(-w * .3, w * .3), y: h, vx: rnd(-10, 10), vy: -rnd(45, 95), life: rnd(.7, 1.6), age: 0 });
        c.globalCompositeOperation = 'lighter';
        s.p = s.p.filter(function (q) { return q.age < q.life; });
        s.p.forEach(function (q) {
          q.age += dt; var u = q.age / q.life;
          q.x += (q.vx + Math.sin(t * 6 + q.ph) * 8 + par * 3) * dt; q.y += q.vy * dt;
          var d = q.r * (1 - u * .65) * 2;
          c.globalAlpha = Math.pow(1 - u, 1.15);
          c.drawImage(u < .22 ? s.hot : u < .6 ? s.mid : s.cool, q.x - d / 2, q.y - d / 2, d, d);
        });
        // sparks
        s.sparks = s.sparks.filter(function (q) { return q.age < q.life && q.y > -4; });
        c.fillStyle = '#ffd98a';
        s.sparks.forEach(function (q) {
          q.age += dt; q.x += (q.vx + Math.sin(t * 8 + q.y) * 6) * dt; q.y += q.vy * dt;
          c.globalAlpha = (1 - q.age / q.life) * (.6 + .4 * Math.sin(t * 40 + q.x));
          c.beginPath(); c.arc(q.x, q.y, 1.1, 0, TAU); c.fill();
        });
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      }
    },

    petals: {
      label: '🌸 Petals', dark: false,
      tint: 'linear-gradient(135deg,#ffe8ef 0%,#ffcfdf 100%)',
      init: function (w, h) {
        var a = []; for (var i = 0; i < 18; i++) a.push(newPetal(w, h, true));
        a.sort(function (x, y) { return x.z - y.z; });
        return { p: a };
      },
      draw: function (c, w, h, t, dt, s, par) {
        var wind = Math.sin(t * .5) * 7 + 5 + par * 8;
        s.p.forEach(function (p, i) {
          p.y += p.v * dt; p.x += (Math.sin(t * 1.2 + p.ph) * .5 + wind * dt * (.5 + p.z)); p.rot += p.vr * dt;
          if (p.y > h + 10 || p.x > w + 12) { var n = newPetal(w, h, false); n.z = p.z; s.p[i] = n; return; }
          var flip = Math.max(.18, Math.abs(Math.cos(t * p.fl + p.ph)));
          c.save(); c.translate(p.x + par * p.z * 8, p.y); c.rotate(p.rot); c.scale(1, flip);
          c.globalAlpha = .5 + p.z * .5;
          var r = p.r, g = c.createLinearGradient(0, -r, 0, r); g.addColorStop(0, p.c1); g.addColorStop(1, p.c2);
          c.fillStyle = g; c.beginPath();
          c.moveTo(0, -r); c.bezierCurveTo(r * .95, -r * .7, r * .85, r * .55, 0, r); c.bezierCurveTo(-r * .85, r * .55, -r * .95, -r * .7, 0, -r); c.fill();
          c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = .5; c.beginPath(); c.moveTo(0, -r * .7); c.lineTo(0, r * .6); c.stroke();
          c.restore();
        });
        c.globalAlpha = 1;
      }
    },

    off: { label: '🚫 Off', tint: '', dark: false }
  };
  var ORDER = ['fish', 'snow', 'fire', 'petals', 'off'];

  function newPetal(w, h, spread) {
    var z = Math.random(), pal = pick([['#ffb3cb', '#ff7fa8'], ['#ffd1dc', '#ff9db9'], ['#ff9ebd', '#ff5f90'], ['#ffe0ea', '#ffb0c8']]);
    return { x: rnd(-6, w), y: spread ? rnd(0, h) : -10, z: z, r: 2.6 + z * 3.6, v: 8 + z * 16, ph: rnd(0, 6), rot: rnd(0, 6), vr: rnd(-1.4, 1.4), fl: rnd(1.2, 2.6), c1: pal[0], c2: pal[1] };
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

    var st = { card: card, wrap: wrap, cv: cv, ctx: cv.getContext('2d'), w: 0, h: 0, eff: 'off', state: null, visible: false, t: 0, px: 0, tpx: 0 };
    cards.push(st);

    // parallax: finger / mouse position over the card shifts the depth layers
    function aim(e) { var r = card.getBoundingClientRect(), x = (e.touches ? e.touches[0].clientX : e.clientX); st.tpx = Math.max(-1, Math.min(1, ((x - r.left) / (r.width || 1)) * 2 - 1)); }
    card.addEventListener('pointermove', aim);
    card.addEventListener('touchmove', aim, { passive: true });
    card.addEventListener('pointerleave', function () { st.tpx = 0; });

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
      card.classList.toggle('lbfx-dark', !!EFFECTS[st.eff].dark);
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
        if (!prev || now - prev >= 32) {
          var dt = prev ? Math.min((now - prev) / 1000, .1) : 0;
          prev = now;
          cards.forEach(function (st) {
            if (!st.card.isConnected || st.eff === 'off' || !st.visible || !st.w) return;
            any = true; st.t += dt;
            st.px += (st.tpx - st.px) * Math.min(1, dt * 6);
            var par = st.px + Math.sin(st.t * .45) * .3;
            st.ctx.clearRect(0, 0, st.w, st.h);
            EFFECTS[st.eff].draw(st.ctx, st.w, st.h, st.t, dt, st.state, par);
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
      '.lb-menu-profile.lbfx-dark{color:#fff!important}' +
      '.lb-menu-profile.lbfx-dark .lb-menu-profile-name,.lb-menu-profile.lbfx-dark .lb-menu-profile-sub{color:#fff!important;text-shadow:0 1px 3px rgba(0,0,0,.55)}' +
      '.lb-menu-profile.lbfx-dark .lb-menu-profile-sub{opacity:.85}' +
      '.lb-menu-profile.lbfx-dark .lb-menu-avatar{box-shadow:0 0 0 2px rgba(255,255,255,.55)}' +
      '.lbfx-btn{position:absolute;top:5px;right:6px;z-index:3;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
        'font-size:12px;line-height:1;cursor:pointer;background:rgba(255,255,255,.75);box-shadow:0 1px 4px rgba(0,0,0,.25);-webkit-tap-highlight-color:transparent}' +
      '.lbfx-btn:active{transform:scale(.92)}' +
      '.lbfx-pop{position:absolute;top:32px;right:4px;z-index:5;display:flex;flex-direction:column;gap:2px;padding:5px;border-radius:12px;background:#fff;' +
        'box-shadow:0 8px 24px rgba(60,30,40,.25);border:1px solid rgba(0,0,0,.06);color:#3a2a2e;font-weight:600}' +
      '.lbfx-opt{display:block;padding:7px 12px;border-radius:8px;font-size:13px;white-space:nowrap;cursor:pointer;color:#3a2a2e}' +
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
