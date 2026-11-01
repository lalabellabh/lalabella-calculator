/**
 * LALABELLA SEASON THEMES — holiday look + sounds for every page.
 *
 * Loaded on every page by shared/config.js (never blocks the page).
 * Themes: 'default' (the normal Lalabella look and piano sounds),
 *         'undas' (All Saints / Halloween: candles, bats, ghosts, spooky organ),
 *         'christmas' (snow, twinkle lights, sleigh, Jingle Bells).
 * Choice per device in ⚙️ Settings → Season theme (key "lbSeason"):
 *   'auto' (default) = picks by the calendar: Oct 28 – Nov 3 → Undas, Dec 1 – Jan 6 → Christmas, else Default.
 *
 * Sounds (made in the browser, no files, free):
 *   - opening the ☰ menu plays the theme's jingle
 *   - tapping something inside the menu plays the theme's click
 *   - the pages that had the piano hover sound call lbSeason.take('hover'):
 *     in a holiday theme it plays the next note of the theme's song instead of the piano.
 * Default theme = nothing changes (the old piano / ring sounds stay).
 *
 *   lbSeason.get() / set(id)      'auto' | 'default' | 'undas' | 'christmas'
 *   lbSeason.active()             the theme in use right now
 *   lbSeason.anim() / setAnim(b)  animations on/off (this device)
 *   lbSeason.vol() / setVol(0..100)
 *   lbSeason.play(kind)           'open' | 'click' | 'hover'
 *   lbSeason.take(kind)           true when a holiday theme handled the sound (page skips its own)
 */
(function () {
  if (window.lbSeason) return;
  var K = 'lbSeason', KA = 'lbSeasonAnim', KV = 'lbSeasonVol';
  var THEMES = {
    'default':   { label: '🌸 Default' },
    'undas':     { label: '🕯️ Undas' },
    'christmas': { label: '🎄 Christmas' }
  };
  function ls(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function byDate() {
    var d = new Date(Date.now() + 3 * 3600000), m = d.getUTCMonth() + 1, day = d.getUTCDate();  // Bahrain date
    if ((m === 10 && day >= 28) || (m === 11 && day <= 3)) return 'undas';
    if (m === 12 || (m === 1 && day <= 6)) return 'christmas';
    return 'default';
  }
  function get() { var v = ls(K, 'auto'); return v === 'auto' || THEMES[v] ? v : 'auto'; }
  function active() { var v = get(); return v === 'auto' ? byDate() : v; }
  function anim() { return ls(KA, 'on') !== 'off'; }
  function vol() { var v = parseInt(ls(KV, '60'), 10); return isFinite(v) ? Math.max(0, Math.min(100, v)) : 60; }

  // ---------------- sounds ----------------
  var AC = null, last = 0, step = 0;
  function ctx() {
    try {
      if (!AC) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; AC = new C(); }
      if (AC.state === 'suspended') AC.resume();
      return AC;
    } catch (e) { return null; }
  }
  function master(c) { var g = c.createGain(); g.gain.value = Math.pow(vol() / 100, 1.5) * 0.9; g.connect(c.destination); return g; }
  function bell(c, out, f, t, dur, v) {
    [[1, 1], [2.76, .32], [5.4, .12]].forEach(function (p) {
      var o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f * p[0];
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * p[1], t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (p[0] === 1 ? 1 : .5));
      o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .05);
    });
  }
  var NB = null;
  function noise(c) { if (NB) return NB; var b = c.createBuffer(1, c.sampleRate * .25, c.sampleRate), d = b.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return NB = b; }
  function sleigh(c, out, t, v) {
    for (var i = 0; i < 4; i++) {
      var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), ti = t + i * 0.035;
      s.buffer = noise(c); f.type = 'highpass'; f.frequency.value = 6500 + Math.random() * 2000;
      g.gain.setValueAtTime(0.0001, ti); g.gain.linearRampToValueAtTime(v * (1 - i * .18), ti + .004); g.gain.exponentialRampToValueAtTime(0.0001, ti + .09);
      s.connect(f); f.connect(g); g.connect(out); s.start(ti, Math.random() * .1); s.stop(ti + .1);
    }
  }
  function organ(c, out, f, t, dur, v) {
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(out);
    [0, -7, 7].forEach(function (det) {
      var o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v / 3, t + .05); g.gain.setValueAtTime(v / 3, t + dur - .12); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(lp); o.start(t); o.stop(t + dur + .05);
    });
  }
  function ghost(c, out, t, v) {
    var o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(260, t + 1.1);
    lfo.frequency.value = 6; lg.gain.value = 14; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + .25); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(g); g.connect(out); o.start(t); lfo.start(t); o.stop(t + 1.25); lfo.stop(t + 1.25);
  }
  function pluck(c, out, f, t, v) {
    var o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * .97, t + .2);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + .004); g.gain.exponentialRampToValueAtTime(0.0001, t + .28);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + .3);
  }
  // Jingle Bells (chorus) and a spooky music-box tune, one note per hover
  var N = { C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A4: 440, B4: 493.88, C6: 1046.5, GS4: 415.3, E4: 329.63, D4: 293.66, F4: 349.23, A3: 220, D3: 146.83, CS5: 554.37, A5: 880 };
  var JINGLE = ['E5','E5','E5','E5','E5','E5','E5','G5','C5','D5','E5','F5','F5','F5','F5','F5','E5','E5','E5','E5','D5','D5','E5','D5','G5'];
  var SPOOKY = ['A4','C5','E5','D5','C5','B4','A4','GS4','A4','E4','F4','E4','D4','E4','A4'];

  function play(kind) {
    var th = active(); if (th === 'default' || vol() === 0) return false;
    var c = ctx(); if (!c) return false;
    var out = master(c), t = c.currentTime + 0.02; last = Date.now();
    if (th === 'christmas') {
      if (kind === 'open') {
        var notes = ['E5','E5','E5','E5','E5','E5','E5','G5','C5','D5','E5'], dur = [1, 1, 2, 1, 1, 2, 1, 1, 1.5, .5, 3], q = .15, x = t;
        notes.forEach(function (n, i) { bell(c, out, N[n], x, Math.max(.35, dur[i] * q * 1.6), .22); if (i % 2 === 0) sleigh(c, out, x, .05); x += dur[i] * q; });
      } else if (kind === 'click') { sleigh(c, out, t, .09); bell(c, out, N.C6, t + .02, .5, .16); }
      else { bell(c, out, N[JINGLE[step++ % JINGLE.length]], t, .6, .14); }
    } else if (th === 'undas') {
      if (kind === 'open') {
        organ(c, out, N.D3, t, 1.6, .10);
        ['D4','F4','A4','D5','CS5'].forEach(function (n, i) { organ(c, out, N[n], t + i * .16, .5, .07); });
        ghost(c, out, t + .7, .07);
      } else if (kind === 'click') { pluck(c, out, [N.A4, N.C5, N.D5, N.E5, N.A3 * 2][Math.floor(Math.random() * 5)], t, .16); pluck(c, out, N.A3, t + .01, .06); }
      else {
        var f = N[SPOOKY[step++ % SPOOKY.length]] * 2;   // music box (high, glassy)
        bell(c, out, f, t, .7, .09);
      }
    }
    return true;
  }
  function take(kind) { if (active() === 'default') return false; if (Date.now() - last < 260) return true; play(kind); return true; }

  // ☰ buttons and things inside the menus, on every page
  var TOGGLES = '.lbnav-btn,.choco-nav-toggle,.nav-toggle,.burger';
  var INSIDE = '.lbnav-drawer a,.lbnav-drawer button,.choco-drawer a,.choco-drawer button,.side-drawer a,.side-drawer button,.drawer a,.drawer button,[data-lb-menu] a';
  document.addEventListener('click', function (e) {
    if (active() === 'default' || !e.target || !e.target.closest) return;
    if (e.target.closest(TOGGLES)) { play('open'); return; }
    var a = e.target.closest(INSIDE); if (!a) return;
    play('click');
    // let the click sound be heard before a menu link leaves the page
    if (a.tagName === 'A' && vol() > 0 && !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0 && (!a.target || a.target === '_self')) {
      var href = a.getAttribute('href') || '';
      if (href && href.charAt(0) !== '#' && !/^javascript:/i.test(href) && !a.hasAttribute('download')) {
        e.preventDefault(); setTimeout(function () { location.href = a.href; }, 230);
      }
    }
  }, true);

  // ---------------- animations ----------------
  var layer = null, css = null;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function paint() {
    if (layer) { layer.remove(); layer = null; }
    document.documentElement.removeAttribute('data-lbseason');
    var th = active();
    if (th === 'default') return;
    document.documentElement.setAttribute('data-lbseason', th);
    var reduce = false; try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    if (!anim() || reduce || !document.body) return;
    if (!css) {
      css = document.createElement('style'); css.id = 'lbSeasonCss';
      css.textContent = [
        '.lbsea{position:fixed;inset:0;pointer-events:none;z-index:99985;overflow:hidden}',
        '.lbsea i{position:absolute;font-style:normal;will-change:transform;line-height:1;user-select:none}',
        '@media print{.lbsea{display:none!important}}',
        // christmas
        '.lbsea .sn{top:-6%;color:#fff;text-shadow:0 0 2px #4a6a98,0 0 6px #9cc8ff;animation:lbsnow linear infinite}',
        '@keyframes lbsnow{0%{transform:translate3d(0,0,0) rotate(0)}100%{transform:translate3d(var(--dx),112vh,0) rotate(220deg)}}',
        '.lbsea .lights{position:absolute;left:0;right:0;top:0;height:16px;display:flex;justify-content:space-around;align-items:flex-start;border-top:2px solid #2d4a2a}',
        '.lbsea .lights b{width:7px;height:10px;border-radius:50% 50% 45% 45%;margin-top:1px;animation:lbtw 1.6s ease-in-out infinite alternate}',
        '@keyframes lbtw{0%{opacity:.35;filter:none}100%{opacity:1;filter:drop-shadow(0 0 5px currentColor)}}',
        '.lbsea .sleigh{top:7%;font-size:26px;animation:lbsleigh 34s linear infinite}',
        '@keyframes lbsleigh{0%{transform:translateX(-30vw)}55%{transform:translateX(130vw)}100%{transform:translateX(130vw)}}',
        // undas
        '.lbsea .bat{top:10%;font-size:20px;animation:lbbat linear infinite}',
        '@keyframes lbbat{0%{transform:translate(-12vw,0) scale(.9)}25%{transform:translate(25vw,-5vh) scale(1)}50%{transform:translate(55vw,4vh) scale(.85)}75%{transform:translate(85vw,-3vh) scale(1)}100%{transform:translate(115vw,2vh) scale(.9)}}',
        '.lbsea .gh{bottom:-10%;font-size:26px;opacity:.7;animation:lbghost ease-in-out infinite}',
        '@keyframes lbghost{0%{transform:translate(0,0);opacity:0}15%{opacity:.55}50%{transform:translate(4vw,-55vh)}85%{opacity:.4}100%{transform:translate(-3vw,-115vh);opacity:0}}',
        '.lbsea .cd{bottom:6px;font-size:24px;filter:drop-shadow(0 0 8px #ffb347);animation:lbflick 2.2s ease-in-out infinite alternate}',
        '@keyframes lbflick{0%{transform:scale(1);filter:drop-shadow(0 0 6px #ffb347)}50%{transform:scale(1.04) rotate(-1deg);filter:drop-shadow(0 0 12px #ff8a2a)}100%{transform:scale(.98) rotate(1deg);filter:drop-shadow(0 0 7px #ffb347)}}',
        '.lbsea .sp{top:0;right:18%;font-size:18px;animation:lbspider 7s ease-in-out infinite}',
        '.lbsea .sp::before{content:"";position:absolute;left:50%;bottom:90%;width:1px;height:60vh;background:#ffffff55}',
        '@keyframes lbspider{0%,100%{transform:translateY(-4vh)}50%{transform:translateY(14vh)}}',
        '.lbsea .glow{position:absolute;bottom:-60px;width:260px;height:160px;border-radius:50%;background:radial-gradient(closest-side,#ff9a3c33,#ff9a3c00)}'
      ].join('\n');
      document.head.appendChild(css);
    }
    layer = document.createElement('div'); layer.className = 'lbsea'; layer.setAttribute('aria-hidden', 'true');
    var h = '', small = window.innerWidth < 700;
    if (th === 'christmas') {
      var cols = ['#ff4d4d', '#ffd84d', '#4dff88', '#4db8ff', '#ff7ad9'], n = small ? 14 : 24;
      h += '<div class="lights">'; for (var i = 0; i < n; i++) h += '<b style="background:' + cols[i % 5] + ';color:' + cols[i % 5] + ';animation-delay:' + (i % 5 * .3).toFixed(1) + 's"></b>'; h += '</div>';
      for (var s = 0; s < (small ? 10 : 18); s++) h += '<i class="sn" style="left:' + rnd(0, 100).toFixed(1) + '%;font-size:' + rnd(9, 18).toFixed(0) + 'px;opacity:' + rnd(.45, .9).toFixed(2) + ';--dx:' + rnd(-8, 8).toFixed(1) + 'vw;animation-duration:' + rnd(10, 20).toFixed(1) + 's;animation-delay:-' + rnd(0, 20).toFixed(1) + 's">' + (s % 3 ? '•' : '❄') + '</i>';
      h += '<i class="sleigh">🛷🦌</i>';
    } else if (th === 'undas') {
      h += '<div class="glow" style="left:-80px"></div><div class="glow" style="right:-80px"></div>';
      h += '<i class="cd" style="left:8px">🕯️</i><i class="cd" style="right:8px;animation-delay:.7s">🕯️</i>';
      for (var b = 0; b < (small ? 2 : 3); b++) h += '<i class="bat" style="animation-duration:' + rnd(14, 22).toFixed(1) + 's;animation-delay:-' + rnd(0, 20).toFixed(1) + 's;top:' + rnd(6, 22).toFixed(0) + '%">🦇</i>';
      for (var g = 0; g < (small ? 2 : 3); g++) h += '<i class="gh" style="left:' + rnd(10, 85).toFixed(0) + '%;animation-duration:' + rnd(16, 26).toFixed(1) + 's;animation-delay:-' + rnd(0, 24).toFixed(1) + 's">👻</i>';
      h += '<i class="sp">🕷️</i>';
    }
    layer.innerHTML = h; document.body.appendChild(layer);
  }
  document.addEventListener('visibilitychange', function () { if (layer) layer.style.display = document.hidden ? 'none' : ''; });

  window.lbSeason = {
    themes: function () { return Object.keys(THEMES).map(function (k) { return { id: k, label: THEMES[k].label }; }); },
    get: get, active: active, auto: byDate,
    set: function (id) { if (id === 'auto' || THEMES[id]) { lset(K, id); paint(); } },
    anim: anim, setAnim: function (on) { lset(KA, on ? 'on' : 'off'); paint(); },
    vol: vol, setVol: function (v) { lset(KV, String(Math.max(0, Math.min(100, parseInt(v, 10) || 0)))); },
    play: play, take: take
  };
  if (document.body) paint(); else document.addEventListener('DOMContentLoaded', paint);
})();
