/**
 * LALABELLA LOOK & FEEL — wallpaper, see-through boxes, glassy style, icon shape.
 *
 * Loaded by shared/nav.js on every page that has the menu. Choices live in
 * ⚙️ Settings → "Look & feel" and are saved on THIS DEVICE only:
 *   localStorage "lbLook"      = {wall, alpha, glass, icons}
 *   localStorage "lbLookWalls" = up to 3 wallpapers the person added (small JPEG data URLs)
 *
 *   wall   'off' | 'rose' | 'plum' | 'gold' | 'choco' | 'sage' | 'bloom' | seasonal ('christmas' 'valentines' 'bahrain' 'halloween' 'ramadan' 'eid' 'newyear') | 'u0'..'u2' (own photos)
 *   alpha  0..70  how see-through the white/dark boxes are (%)
 *   glass  true   frosted-glass blur behind the boxes
 *   icons  'plain' (as designed) | 'circle' | 'square'
 *   text   85..140  text / screen size in % (100 = as designed). Done with CSS zoom on the page.
 *   auto   true  (default) text that would be hard to read on the wallpaper switches to dark/white by itself, per spot on the screen.
 *
 * How the boxes work: the page keeps its own CSS. This file looks for big
 * plain-coloured boxes (cards, panels — white/cream in Light, dark in Dark),
 * and gives each one a see-through version of ITS OWN colour. Coloured
 * buttons, banners, pop-ups and anything fixed on screen are left alone.
 * Everything is undone when the setting goes back to 0 / None, and while printing.
 *
 * Pages that are always dark (Nova, chocolate calculator) keep their own background;
 * they only get the icon shape. The home page is included (it has its own Light/Dark switch).
 *
 * Page code can use: LBLook.get(), LBLook.set({...}), LBLook.reset(),
 * and listen for the 'lb:look-changed' event.
 */
(function () {
  if (window.LBLook) return;
  var KEY = 'lbLook', WKEY = 'lbLookWalls', MAX_WALLS = 3;
  // Default look = glassy, see-through boxes over the Rose Blush wallpaper (a device that never chose anything). Anyone can switch it off in Settings.
  var DEF = { wall: 'rose', alpha: 48, glass: true, icons: 'plain', text: 100, auto: true };
  var root = document.documentElement;

  function readSt() {
    var o = {};
    var stored = null;
    try { stored = localStorage.getItem(KEY); o = JSON.parse(stored || '{}') || {}; } catch (e) {}
    if (stored === null) return { wall: DEF.wall, alpha: DEF.alpha, glass: DEF.glass, icons: DEF.icons, text: DEF.text, auto: DEF.auto };
    var s = { wall: DEF.wall, alpha: DEF.alpha, glass: DEF.glass, icons: DEF.icons, text: DEF.text, auto: o.auto !== false };
    if (typeof o.wall === 'string') s.wall = o.wall;
    if (typeof o.alpha === 'number' && isFinite(o.alpha)) s.alpha = Math.max(0, Math.min(70, Math.round(o.alpha)));
    s.glass = o.glass === true;
    if (o.icons === 'circle' || o.icons === 'square') s.icons = o.icons;
    if (typeof o.text === 'number' && isFinite(o.text)) s.text = Math.max(85, Math.min(140, Math.round(o.text)));
    return s;
  }
  var st = readSt();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  // ---------------- own wallpapers (device only) ----------------
  function readWalls() {
    try { var a = JSON.parse(localStorage.getItem(WKEY) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string' && x.indexOf('data:image/') === 0; }).slice(0, MAX_WALLS) : []; }
    catch (e) { return []; }
  }
  function writeWalls(a) { try { localStorage.setItem(WKEY, JSON.stringify(a)); return true; } catch (e) { return false; } }

  // ---------------- Lalabella's own wallpaper designs (drawn here, no image files) ----------------
  function flower(cx, cy, r, fill, op, rot, mid) {
    var s = '<g transform="translate(' + cx + ' ' + cy + ') rotate(' + (rot || 0) + ')" opacity="' + op + '">';
    for (var i = 0; i < 5; i++) s += '<ellipse cx="0" cy="' + (-r * 0.55) + '" rx="' + (r * 0.36) + '" ry="' + (r * 0.55) + '" fill="' + fill + '" transform="rotate(' + (i * 72) + ')"/>';
    return s + '<circle r="' + (r * 0.2) + '" fill="' + (mid || '#fff') + '"/></g>';
  }
  function leaf(cx, cy, l, rot, fill, op) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (l * 0.28) + '" ry="' + l + '" fill="' + fill + '" opacity="' + op + '" transform="rotate(' + rot + ' ' + cx + ' ' + cy + ')"/>';
  }
  function wrap(inner, defs) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs>' + (defs || '') + '</defs>' + inner + '</svg>';
  }
  function grad(id, a, b, x2, y2) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (x2 || 1) + '" y2="' + (y2 || 1) + '"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>';
  }

  // ---- small shapes for the seasonal wallpapers ----
  function heart(cx, cy, sz, fill, op, rot) {
    return '<path transform="translate(' + cx + ' ' + cy + ') rotate(' + (rot || 0) + ') scale(' + (sz / 60) + ')" d="M0,-18 C-12,-52 -64,-40 -58,-2 C-54,28 -14,46 0,64 C14,46 54,28 58,-2 C64,-40 12,-52 0,-18Z" fill="' + fill + '" opacity="' + op + '"/>';
  }
  function star(cx, cy, r, fill, op) {
    var pts = [], k;
    for (k = 0; k < 10; k++) { var a = Math.PI / 5 * k - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; pts.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1)); }
    return '<polygon points="' + pts.join(' ') + '" fill="' + fill + '" opacity="' + op + '"/>';
  }
  function tree(cx, base, sc) {
    var g = '<g transform="translate(' + cx + ' ' + base + ') scale(' + sc + ')" opacity=".9"><rect x="-10" y="-30" width="20" height="40" fill="#5b3a1e"/>';
    g += '<polygon points="0,-210 -70,-110 70,-110" fill="#1f6b3f"/><polygon points="0,-160 -90,-60 90,-60" fill="#24814b"/><polygon points="0,-100 -110,-20 110,-20" fill="#2b9a58"/>';
    g += '<circle cx="-30" cy="-70" r="7" fill="#ff5a6e"/><circle cx="35" cy="-40" r="7" fill="#ffd86b"/><circle cx="-5" cy="-130" r="6" fill="#ffd86b"/><polygon points="0,-232 6,-216 22,-216 9,-206 14,-190 0,-200 -14,-190 -9,-206 -22,-216 -6,-216" fill="#ffd86b"/></g>';
    return g;
  }
  function bat(cx, cy, sc, op) {
    return '<path transform="translate(' + cx + ' ' + cy + ') scale(' + sc + ')" d="M0,0 C-10,-12 -30,-14 -56,2 C-42,-4 -34,4 -28,16 C-18,6 -8,8 0,18 C8,8 18,6 28,16 C34,4 42,-4 56,2 C30,-14 10,-12 0,0Z" fill="#0b0414" opacity="' + op + '"/>';
  }
  function crescent(cx, cy, r, fill, op) {
    return '<path transform="translate(' + cx + ' ' + cy + ')" d="M0,' + (-r) + ' A' + r + ',' + r + ' 0 1 0 0,' + r + ' A' + (r * 1.3) + ',' + (r * 1.3) + ' 0 0 1 0,' + (-r) + 'Z" fill="' + fill + '" opacity="' + op + '"/>';
  }
  function lantern(cx, top, sc) {
    return '<g transform="translate(' + cx + ' ' + top + ') scale(' + sc + ')" opacity=".85"><line x1="0" y1="0" x2="0" y2="120" stroke="#f6d37a" stroke-width="3"/><rect x="-18" y="120" width="36" height="12" fill="#f6d37a"/><path d="M-30,132 L30,132 L40,215 L-40,215Z" fill="#e6a93f"/><path d="M-12,132 L12,132 L16,215 L-16,215Z" fill="#fff0b3" opacity=".6"/><rect x="-20" y="215" width="40" height="10" fill="#f6d37a"/></g>';
  }
  function burst(cx, cy, r, fill) {
    var g = '', k;
    for (k = 0; k < 16; k++) { var a = Math.PI * 2 / 16 * k; g += '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + r * Math.cos(a)).toFixed(1) + '" y2="' + (cy + r * Math.sin(a)).toFixed(1) + '" stroke="' + fill + '" stroke-width="4" stroke-linecap="round" opacity=".55"/><circle cx="' + (cx + r * Math.cos(a)).toFixed(1) + '" cy="' + (cy + r * Math.sin(a)).toFixed(1) + '" r="6" fill="' + fill + '" opacity=".8"/>'; }
    return g + '<circle cx="' + cx + '" cy="' + cy + '" r="10" fill="#fff" opacity=".9"/>';
  }
  var BLUR = '<filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="60"/></filter>';
  var PRESETS = [
    { id: 'rose', name: 'Rose Blush', svg: function () {
      return wrap('<rect width="1600" height="1000" fill="url(#g)"/>' +
        flower(260, 220, 190, '#fff', .35, 10) + flower(1330, 150, 150, '#fff', .3, 40) + flower(1180, 760, 260, '#fff', .28, 70) +
        flower(380, 800, 130, '#fff', .32, 20) + flower(760, 470, 90, '#fff', .22, 0) + flower(60, 520, 80, '#fff', .25, 30) + flower(1520, 480, 100, '#fff', .25, 15),
        grad('g', '#ffe6ec', '#f2a7bc', 1, 1));
    } },
    { id: 'plum', name: 'Midnight Bloom', svg: function () {
      return wrap('<rect width="1600" height="1000" fill="url(#g)"/><g filter="url(#bl)"><circle cx="320" cy="260" r="260" fill="#d6527a" opacity=".55"/><circle cx="1300" cy="740" r="320" fill="#7b3fa8" opacity=".5"/><circle cx="1180" cy="140" r="170" fill="#e0a94f" opacity=".35"/></g>' +
        flower(1330, 700, 120, '#f6b3c8', .18, 20) + flower(260, 760, 90, '#f6b3c8', .15, 50) + flower(820, 300, 70, '#f6b3c8', .12, 0),
        grad('g', '#1f0c26', '#4a1a45') + BLUR);
    } },
    { id: 'gold', name: 'Gold Dust', svg: function () {
      var d = ''; for (var i = 0; i < 70; i++) d += '<circle cx="' + ((i * 197) % 1600) + '" cy="' + ((i * 311) % 1000) + '" r="' + (1.5 + (i % 4)) + '" fill="#f2c96b" opacity="' + (0.15 + (i % 5) * 0.08) + '"/>';
      return wrap('<rect width="1600" height="1000" fill="url(#g)"/><g filter="url(#bl)"><circle cx="1250" cy="220" r="300" fill="#d9a441" opacity=".45"/><circle cx="300" cy="820" r="260" fill="#a8641f" opacity=".4"/></g>' + d,
        grad('g', '#17100a', '#3a2912') + BLUR);
    } },
    { id: 'choco', name: 'Chocolate', svg: function () {
      var l = ''; for (var i = -10; i < 40; i++) l += '<line x1="' + (i * 80) + '" y1="0" x2="' + (i * 80 + 700) + '" y2="1000" stroke="#fff" stroke-opacity=".05" stroke-width="2"/>';
      return wrap('<rect width="1600" height="1000" fill="url(#g)"/>' + l + '<g filter="url(#bl)"><circle cx="1350" cy="800" r="280" fill="#c98a5a" opacity=".3"/></g>',
        grad('g', '#2c1810', '#6b4330') + BLUR);
    } },
    { id: 'sage', name: 'Sage Garden', svg: function () {
      return wrap('<rect width="1600" height="1000" fill="url(#g)"/>' +
        leaf(220, 260, 170, 30, '#fff', .3) + leaf(330, 190, 120, 70, '#fff', .25) + leaf(1400, 780, 200, -30, '#fff', .28) + leaf(1290, 880, 130, 20, '#fff', .22) +
        leaf(900, 140, 110, 50, '#fff', .2) + leaf(700, 860, 140, -50, '#fff', .22) + leaf(80, 760, 120, 10, '#fff', .24) + leaf(1500, 200, 100, -20, '#fff', .22),
        grad('g', '#e6f2e4', '#86b894'));
    } },
    { id: 'bloom', name: 'Lalabella Blossoms', svg: function () {
      var t = '<pattern id="p" width="260" height="260" patternUnits="userSpaceOnUse">' +
        flower(65, 65, 46, '#e58aa6', .55, 0, '#fff3f6') + flower(195, 195, 46, '#e58aa6', .55, 36, '#fff3f6') +
        '<circle cx="195" cy="65" r="5" fill="#e58aa6" opacity=".4"/><circle cx="65" cy="195" r="5" fill="#e58aa6" opacity=".4"/></pattern>';
      return wrap('<rect width="1600" height="1000" fill="#fdeef2"/><rect width="1600" height="1000" fill="url(#p)"/>', t);
    } },
    // ---- seasonal ----
    { id: 'christmas', name: '🎄 Christmas', svg: function () {
      var d = '', i;
      for (i = 0; i < 90; i++) d += '<circle cx="' + ((i * 173) % 1600) + '" cy="' + ((i * 257) % 1000) + '" r="' + (2 + (i % 5)) + '" fill="#fff" opacity="' + (0.25 + (i % 4) * 0.12) + '"/>';
      d += tree(240, 760, 1.5) + tree(1380, 800, 1.9) + tree(820, 840, 1.1);
      d += star(1250, 150, 38, '#ffd86b', .85) + star(330, 170, 26, '#ffd86b', .7) + star(780, 90, 20, '#ffd86b', .6);
      return wrap('<rect width="1600" height="1000" fill="url(#g)"/><g filter="url(#bl)"><circle cx="1300" cy="200" r="280" fill="#d8344f" opacity=".45"/><circle cx="260" cy="860" r="300" fill="#e6b84a" opacity=".22"/></g>' + d,
        grad('g', '#103a27', '#7d1a2a') + BLUR);
    } },
    { id: 'valentines', name: '💖 Valentine\'s', svg: function () {
      var d = '', i, cols = ['#fff', '#ffd1dc', '#ff9db5'];
      for (i = 0; i < 26; i++) d += heart((i * 617 + 90) % 1560 + 20, (i * 389 + 40) % 940 + 20, 26 + (i % 5) * 16, cols[i % 3], 0.22 + (i % 4) * 0.08, ((i * 37) % 50) - 25);
      d += heart(1250, 300, 170, '#fff', .22, 12) + heart(300, 720, 130, '#fff', .2, -14);
      return wrap('<rect width="1600" height="1000" fill="url(#g)"/>' + d, grad('g', '#ff9db5', '#c8274f'));
    } },
    { id: 'bahrain', name: '🇧🇭 Bahrain National Day', svg: function () {
      var path = 'M0,0 L470,0', y;
      for (y = 0; y < 5; y++) path += ' L630,' + (y * 200 + 100) + ' L470,' + ((y + 1) * 200);
      path += ' L0,1000 Z';
      var d = '<path d="' + path + '" fill="#fff" opacity=".93"/>';
      var dots = ''; for (var i = 0; i < 40; i++) dots += '<circle cx="' + (700 + (i * 211) % 880) + '" cy="' + ((i * 137) % 1000) + '" r="' + (2 + i % 4) + '" fill="#fff" opacity="' + (0.1 + (i % 4) * 0.05) + '"/>';
      return wrap('<rect width="1600" height="1000" fill="#c8102e"/><rect width="1600" height="1000" fill="url(#g)"/>' + d + dots,
        grad('g', '#e23a52', '#8e0a20'));
    } },
    { id: 'halloween', name: '🎃 Halloween', svg: function () {
      var d = '', i;
      d += '<circle cx="1230" cy="250" r="170" fill="#ffb347" opacity=".9"/><circle cx="1180" cy="210" r="30" fill="#e8923a" opacity=".5"/><circle cx="1290" cy="300" r="42" fill="#e8923a" opacity=".4"/>';
      d += bat(1040, 200, 1.3, .8) + bat(1420, 120, 1, .7) + bat(1330, 470, 1.6, .75) + bat(260, 230, 1.4, .6) + bat(520, 120, .9, .55) + bat(150, 520, 1.1, .5);
      for (i = 0; i < 60; i++) d += '<circle cx="' + ((i * 211) % 1600) + '" cy="' + ((i * 127) % 1000) + '" r="' + (1.5 + i % 3) + '" fill="#ffd9a0" opacity="' + (0.15 + (i % 4) * 0.08) + '"/>';
      d += '<path d="M0,1000 L0,880 Q200,800 400,880 T800,860 T1200,890 T1600,850 L1600,1000Z" fill="#12061c" opacity=".7"/>';
      return wrap('<rect width="1600" height="1000" fill="url(#g)"/>' + d, grad('g', '#1b0b2e', '#5a1f4d', 0, 1));
    } },
    { id: 'ramadan', name: '🌙 Ramadan', svg: function () {
      var d = '<g filter="url(#bl)"><circle cx="1200" cy="230" r="300" fill="#e6b84a" opacity=".28"/></g>' + crescent(1200, 240, 130, '#f6d37a', .95);
      d += star(1010, 170, 24, '#f6d37a', .9) + star(1400, 430, 18, '#f6d37a', .75) + star(240, 190, 20, '#f6d37a', .7) + star(560, 90, 14, '#f6d37a', .65);
      for (var i = 0; i < 70; i++) d += '<circle cx="' + ((i * 233) % 1600) + '" cy="' + ((i * 151) % 1000) + '" r="' + (1 + i % 3) + '" fill="#fff" opacity="' + (0.15 + (i % 4) * 0.1) + '"/>';
      d += lantern(260, 0, 1.2) + lantern(430, 0, .8) + lantern(1500, 0, 1);
      return wrap('<rect width="1600" height="1000" fill="url(#g)"/>' + d, grad('g', '#0d1b3d', '#33266b', 0, 1) + BLUR);
    } },
    { id: 'eid', name: '✨ Eid', svg: function () {
      var d = '<g filter="url(#bl)"><circle cx="300" cy="200" r="300" fill="#f6d37a" opacity=".3"/><circle cx="1350" cy="820" r="320" fill="#0c6b57" opacity=".4"/></g>';
      d += crescent(1280, 230, 110, '#fff3c4', .95) + star(1100, 160, 22, '#fff3c4', .9) + star(1430, 420, 16, '#fff3c4', .75) + star(240, 640, 18, '#fff3c4', .6);
      for (var i = 0; i < 80; i++) d += '<circle cx="' + ((i * 197) % 1600) + '" cy="' + ((i * 263) % 1000) + '" r="' + (2 + i % 4) + '" fill="#f6d37a" opacity="' + (0.15 + (i % 5) * 0.07) + '"/>';
      return wrap('<rect width="1600" height="1000" fill="url(#g)"/>' + d, grad('g', '#0f6a58', '#073a4a') + BLUR);
    } },
    { id: 'newyear', name: '🎆 New Year', svg: function () {
      var d = '', i, cols = ['#ffd86b', '#ff7aa8', '#7ad8ff', '#fff'];
      for (i = 0; i < 110; i++) d += '<rect x="' + ((i * 241) % 1600) + '" y="' + ((i * 163) % 1000) + '" width="' + (6 + i % 6) + '" height="' + (12 + i % 8) + '" fill="' + cols[i % 4] + '" opacity="' + (0.25 + (i % 4) * 0.12) + '" transform="rotate(' + ((i * 47) % 180) + ' ' + ((i * 241) % 1600) + ' ' + ((i * 163) % 1000) + ')"/>';
      d += burst(380, 280, 190, '#ffd86b') + burst(1250, 230, 150, '#ff7aa8') + burst(900, 560, 110, '#7ad8ff');
      return wrap('<rect width="1600" height="1000" fill="url(#g)"/>' + d, grad('g', '#0b1230', '#2a1760'));
    } }
  ];
  var uriCache = {};
  function presetUri(p) {
    if (!uriCache[p.id]) uriCache[p.id] = 'data:image/svg+xml;utf8,' + encodeURIComponent(p.svg());
    return uriCache[p.id];
  }
  function presetById(id) { for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i]; return null; }
  function wallUrl(id) {
    if (!id || id === 'off') return null;
    var p = presetById(id); if (p) return presetUri(p);
    var m = /^u(\d)$/.exec(id); if (m) return readWalls()[+m[1]] || null;
    return null;
  }

  // ---------------- colours ----------------
  function parseRgb(s) {
    var m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(s || '');
    if (!m) return null;
    var a = m[4] == null ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return { r: +m[1], g: +m[2], b: +m[3], a: a };
  }
  function lightness(c) { return (Math.max(c.r, c.g, c.b) + Math.min(c.r, c.g, c.b)) / 510; }
  // Pages that are always dark (Nova, chocolate calculator) keep their own background. The HOME page is included:
  // it has its own Light/Dark switch (class idx-dark-ui) instead of the shared one.
  var isHome = /^(index\.html)?$/i.test(location.pathname.split('/').pop() || '');
  function nativeDark() { return !isHome && !!(window.LBTheme && window.LBTheme.isNativeDark && window.LBTheme.isNativeDark()); }
  function themeDark() { return root.getAttribute('data-lb-theme') === 'dark' || root.classList.contains('idx-dark-ui'); }

  // ---------------- injected CSS ----------------
  var ICONS_ALL = '.card-icon,.hub-icon,.nav-icon,.stat-icon,.desktop-tool-icon,.group-icon,.head-icon,.pxv-ico,.lb-ic';
  var ICONS_BARE = '.card-icon,.hub-icon,.nav-icon,.lb-ic';
  function css() {
    if (document.getElementById('lb-look-css')) return;
    var s = document.createElement('style');
    s.id = 'lb-look-css';
    s.setAttribute('data-lb-theme-skip', '');
    s.textContent = [
      'html.lb-wall{background:linear-gradient(var(--lb-scrim,rgba(255,255,255,.28)),var(--lb-scrim,rgba(255,255,255,.28))) fixed,var(--lb-wallimg) center/cover no-repeat fixed!important}',
      'html.lb-wall body{background:transparent!important;background-image:none!important}',
      'html.lb-wall #app{background:transparent!important}',
      // the side menu (hamburger drawer) turns into frosted glass too, so the wallpaper shows through it
      'html.lb-wall .choco-drawer,html[data-lb-glass] .choco-drawer,html.lb-wall .lbnav-drawer,html[data-lb-glass] .lbnav-drawer{background:rgba(255,255,255,.5)!important;-webkit-backdrop-filter:blur(30px) saturate(1.8)!important;backdrop-filter:blur(30px) saturate(1.8)!important;border-right:1px solid rgba(255,255,255,.6)!important}',
      'html.lb-wall .choco-drawer a,html[data-lb-glass] .choco-drawer a,html.lb-wall .lbnav-drawer .lbnav-hub a,html[data-lb-glass] .lbnav-drawer .lbnav-hub a{background:rgba(255,255,255,.42)!important}',
      'html[data-lb-theme="dark"].lb-wall .choco-drawer,html[data-lb-theme="dark"][data-lb-glass] .choco-drawer,html[data-lb-theme="dark"].lb-wall .lbnav-drawer,html[data-lb-theme="dark"][data-lb-glass] .lbnav-drawer{background:rgba(22,15,20,.52)!important;border-right-color:rgba(255,255,255,.14)!important}',
      'html[data-lb-theme="dark"].lb-wall .choco-drawer a,html[data-lb-theme="dark"][data-lb-glass] .choco-drawer a,html[data-lb-theme="dark"].lb-wall .lbnav-drawer .lbnav-hub a,html[data-lb-theme="dark"][data-lb-glass] .lbnav-drawer .lbnav-hub a{background:rgba(255,255,255,.08)!important}',
      'html[data-lb-glass] #app .glass{-webkit-backdrop-filter:blur(26px) saturate(1.8);backdrop-filter:blur(26px) saturate(1.8)}',
      // iPhone-style glass: strong blur + vivid colours, bright rim light on top/left, soft depth shadow
      '[data-lbglass]{-webkit-backdrop-filter:blur(26px) saturate(1.8) brightness(1.04);backdrop-filter:blur(26px) saturate(1.8) brightness(1.04);border:1px solid rgba(255,255,255,.55)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.85),inset 1px 0 0 rgba(255,255,255,.35),inset 0 -1px 0 rgba(255,255,255,.12),0 8px 28px rgba(60,20,40,.14)!important}',
      'html[data-lb-theme="dark"] [data-lbglass]{border-color:rgba(255,255,255,.2)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 8px 28px rgba(0,0,0,.35)!important}',
      'html[data-lb-icons="circle"] :is(' + ICONS_ALL + '){border-radius:50%!important;overflow:hidden}',
      'html[data-lb-icons="square"] :is(' + ICONS_ALL + '){border-radius:24%!important;overflow:hidden}',
      'html[data-lb-icons="circle"] :is(' + ICONS_BARE + '),html[data-lb-icons="square"] :is(' + ICONS_BARE + '){display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:1.9em;height:1.9em;line-height:1;flex:0 0 auto;vertical-align:middle;background:rgba(158,47,74,.11)}',
      'html[data-lb-icons="circle"][data-lb-theme="dark"] :is(' + ICONS_BARE + '),html[data-lb-icons="square"][data-lb-theme="dark"] :is(' + ICONS_BARE + '){background:rgba(255,255,255,.12)}',
      '.lb-ic{margin-right:.55em;font-size:.95em}',
      // menu shortcut tiles (Chocolate / Flower / Item Inv.): equal width, icon centred with room above it
      'html[data-lb-icons] :is(.nav-hub-grid,.choco-hub-grid,.hub-grid,.hub){grid-template-columns:repeat(3,minmax(0,1fr))}',
      'html[data-lb-icons] a:has(>.hub-icon){padding-top:9px;padding-bottom:9px;gap:4px;justify-content:center;align-items:center}',
      'html[data-lb-icons] a>.hub-icon{width:1.75em;height:1.75em;margin:0 auto}',
      '@media print{html.lb-wall{background:none!important}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ---------------- see-through boxes ----------------
  var tracked = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var fixedCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var SKIP_TAG = /^(HTML|BODY|HEAD|SCRIPT|STYLE|LINK|META|IMG|SVG|CANVAS|VIDEO|IFRAME|INPUT|SELECT|TEXTAREA|BUTTON|OPTION|TR|TD|TH|THEAD|TBODY|BR|HR|PATH|CIRCLE|RECT|G)$/i;
  var SKIP_SEL = '[data-lb-look-skip],[data-lb-theme-skip],.lbset-back,#lbcb-panel,#joyboy-bubble-btn';
  var observer = null, sweepCap = 6000;

  function inFixed(el) {
    var chain = [], cur = el, res = false;
    while (cur && cur !== document.body && cur !== root) {
      if (fixedCache.has(cur)) { res = fixedCache.get(cur); break; }
      chain.push(cur);
      var pos = getComputedStyle(cur).position;
      // an element that is itself sticky is skipped (see consider()), but cards INSIDE a sticky layout column are ordinary boxes
      if (pos === 'fixed' || (pos === 'sticky' && cur === el)) { res = true; break; }
      cur = cur.parentElement;
    }
    chain.forEach(function (n) { fixedCache.set(n, res); });
    return res;
  }
  function eff() { return Math.max(0, Math.min(70, st.alpha)); }
  function boxesWanted() { return !nativeDark() && (eff() > 0 || st.glass); }

  function consider(el) {
    if (!tracked || el.nodeType !== 1 || tracked.has(el) || SKIP_TAG.test(el.tagName)) return false;
    if (el.offsetWidth < 110 || el.offsetHeight < 36) return false;
    if (el.closest(SKIP_SEL)) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.position === 'fixed' || cs.position === 'sticky') return false;
    var dark = themeDark(), keepRatio = 1 - eff() / 100;
    var tooColoured = function (c) { var l = lightness(c); return dark ? l > 0.3 : l < 0.78; };
    var scale = function (c) { return 'rgba(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ',' + (Math.round(c.a * keepRatio * 1000) / 1000) + ')'; };
    // gradient cards (frosted panels): fade every colour stop, but only if they are all light (Light) / dark (Dark)
    var bgi = cs.backgroundImage, grad = null;
    if (bgi && bgi !== 'none') {
      if (/url\(/.test(bgi) || !/gradient\(/.test(bgi)) return false;
      var cols = bgi.match(/rgba?\([^)]*\)/g) || [], any = false, ok = true;
      cols.forEach(function (t) { var c = parseRgb(t); if (!c || c.a < 0.3) return; any = true; if (tooColoured(c)) ok = false; });
      if (!any || !ok) return false;
      grad = bgi.replace(/rgba?\([^)]*\)/g, function (t) { var c = parseRgb(t); return c ? scale(c) : t; });
    }
    var c = parseRgb(cs.backgroundColor), solid = null;
    if (c && c.a >= 0.3) { if (tooColoured(c)) return false; solid = c; }        // coloured boxes stay as they are
    if (!solid && !grad) return false;
    if (inFixed(el)) return false;
    tracked.set(el, { v: el.style.getPropertyValue('background-color'), p: el.style.getPropertyPriority('background-color'),
      gv: el.style.getPropertyValue('background-image'), gp: el.style.getPropertyPriority('background-image') });
    el.setAttribute('data-lblk', '');
    if (solid) el.style.setProperty('background-color', scale(solid), 'important');
    if (grad) el.style.setProperty('background-image', grad, 'important');
    if (st.glass && !(el.parentElement && el.parentElement.closest('[data-lblk]'))) el.setAttribute('data-lbglass', '');
    return true;
  }
  function release(el) {
    var o = tracked && tracked.get(el);
    el.style.removeProperty('background-color'); el.style.removeProperty('background-image');
    if (o && o.v) el.style.setProperty('background-color', o.v, o.p);
    if (o && o.gv) el.style.setProperty('background-image', o.gv, o.gp);
    el.removeAttribute('data-lblk'); el.removeAttribute('data-lbglass');
    if (tracked) tracked.delete(el);
    if (!el.getAttribute('style')) el.removeAttribute('style');
  }
  // Glass dashboards (flower / item / chocolate) colour their boxes with the CSS variables --glass / --glass-strong on #app.
  var appTouched = false;
  function appVarsRelease() {
    var app = document.getElementById('app');
    if (app && appTouched) { app.style.removeProperty('--glass'); app.style.removeProperty('--glass-strong'); }
    appTouched = false;
  }
  function appVarsApply() {
    var app = document.getElementById('app');
    if (!app || eff() === 0) return;
    var cs = getComputedStyle(app), k = 1 - eff() / 100;
    ['--glass', '--glass-strong'].forEach(function (n) {
      var c = parseRgb(cs.getPropertyValue(n).trim());
      if (c) { app.style.setProperty(n, 'rgba(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ',' + (Math.round(c.a * k * 1000) / 1000) + ')'); appTouched = true; }
    });
  }
  function releaseAll() {
    textRestore();
    appVarsRelease();
    Array.prototype.forEach.call(document.querySelectorAll('[data-lblk]'), release);
    if (fixedCache) fixedCache = new WeakMap();
  }
  function sweepTree(node) {
    if (!node || node.nodeType !== 1) return;
    var n = 0;
    if (consider(node)) n++;
    var w = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, null);
    var cur;
    while ((cur = w.nextNode()) && n < sweepCap) { consider(cur); n++; }
  }
  function pause(fn) { try { fn(); } finally { if (observer) observer.takeRecords(); } }

  var pending = [], timer = 0;
  function queue(node) { pending.push(node); if (!timer) timer = setTimeout(flush, 140); }
  function flush() {
    timer = 0;
    var list = pending; pending = [];
    if (!boxesWanted()) return;
    pause(function () {
      list.forEach(function (n) {
        if (n.nodeType !== 1 || !document.body.contains(n)) return;
        if (tracked.has(n)) release(n);        // its classes changed: look again
        sweepTree(n);
      });
    });
  }
  function onMut(muts) {
    if (!boxesWanted()) return;
    muts.forEach(function (m) {
      if (m.type === 'attributes') { if (m.target.hasAttribute && m.target.hasAttribute('data-lblk')) queue(m.target); return; }
      Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) queue(n); });
    });
  }
  function startObserver() {
    if (observer || !window.MutationObserver || !document.body) return;
    observer = new MutationObserver(onMut);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }


  // ---------------- readable text on wallpapers ----------------
  // With a wallpaper (and see-through boxes) the page's own text colour can land on a background it was never designed for
  // (white text on a light wallpaper). For every piece of text on screen we work out what is really behind it (the boxes
  // under it, then the wallpaper pixel at that spot) and, only when the contrast is poor, switch that text to dark or white.
  var txtList = [], txtTimer = 0, txtObs = null, thumb = null, thumbUrl = '';
  function lum(c) {
    function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }
  function ratio(a, b) { var l1 = lum(a), l2 = lum(b); if (l1 < l2) { var t = l1; l1 = l2; l2 = t; } return (l1 + 0.05) / (l2 + 0.05); }
  function over(top, base) {
    var a = top.a;
    return { r: top.r * a + base.r * (1 - a), g: top.g * a + base.g * (1 - a), b: top.b * a + base.b * (1 - a), a: 1 };
  }
  function textRestore() {
    txtList.forEach(function (it) {
      var el = it.el;
      el.style.removeProperty('color');
      if (it.v) el.style.setProperty('color', it.v, it.p);
      el.removeAttribute('data-lbtx');
      if (!el.getAttribute('style')) el.removeAttribute('style');
    });
    txtList = [];
  }
  function loadThumb(cb) {
    var url = nativeDark() ? null : wallUrl(st.wall);
    if (!url) { thumb = null; thumbUrl = ''; return cb(false); }
    if (thumb && thumbUrl === url) return cb(true);
    var im = new Image();
    im.onload = function () {
      try {
        var sw = 48, sh = Math.max(1, Math.round(48 * im.naturalHeight / Math.max(1, im.naturalWidth)));
        var c = document.createElement('canvas'); c.width = sw; c.height = sh;
        var x = c.getContext('2d'); x.drawImage(im, 0, 0, sw, sh);
        thumb = { w: sw, h: sh, iw: im.naturalWidth, ih: im.naturalHeight, d: x.getImageData(0, 0, sw, sh).data };
        thumbUrl = url; cb(true);
      } catch (e) { thumb = null; cb(false); }
    };
    im.onerror = function () { thumb = null; cb(false); };
    im.src = url;
  }
  function wallPixel(x, y) {
    var base = { r: themeDark() ? 25 : 255, g: themeDark() ? 20 : 255, b: themeDark() ? 25 : 255, a: 1 };
    if (!thumb) return base;
    var vw = window.innerWidth, vh = window.innerHeight, k = Math.max(vw / thumb.iw, vh / thumb.ih);
    var ox = (vw - thumb.iw * k) / 2, oy = (vh - thumb.ih * k) / 2;
    var u = Math.min(0.999, Math.max(0, (x - ox) / k / thumb.iw)), v = Math.min(0.999, Math.max(0, (y - oy) / k / thumb.ih));
    var i = (Math.floor(v * thumb.h) * thumb.w + Math.floor(u * thumb.w)) * 4;
    var px = { r: thumb.d[i], g: thumb.d[i + 1], b: thumb.d[i + 2], a: 1 };
    var sc = parseRgb(root.style.getPropertyValue('--lb-scrim').trim());
    return sc ? over(sc, px) : px;
  }
  function textPass() {
    txtTimer = 0;
    if (!document.body) return;
    pause(function () {
      // remember what each piece of text was switched to last time: it keeps that colour while it is still readable
      // (stops text flipping black <-> white when it moves over the wallpaper while scrolling)
      var prevPick = new Map();
      txtList.forEach(function (it) { if (it.el.hasAttribute('data-lbtx')) prevPick.set(it.el, it.el.style.getPropertyValue('color')); });
      textRestore();
      if (!st.auto || printingNow || nativeDark() || !root.classList.contains('lb-wall')) return;
      var vw = window.innerWidth, vh = window.innerHeight, layerCache = new Map(), seen = new Set(), n = 0;
      function layer(el) {
        if (layerCache.has(el)) return layerCache.get(el);
        var cs = getComputedStyle(el), c = parseRgb(cs.backgroundColor), res = { c: null, stop: false };
        var bgi = cs.backgroundImage;
        if (bgi && bgi !== 'none') {
          if (/gradient\(/.test(bgi)) { var li = bgi.lastIndexOf('gradient('), cols = bgi.slice(li).match(/rgba?\([^)]*\)/g) || [], g = cols.length ? parseRgb(cols[Math.floor(cols.length / 2)]) : null; if (g && g.a > 0 && (!c || c.a < g.a)) c = g; }
          else if (/url\(/.test(bgi)) res.stop = true;      // a picture behind the text: leave this text alone
        }
        if (c && c.a > 0) res.c = c;
        layerCache.set(el, res); return res;
      }
      var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), node;
      while ((node = w.nextNode()) && n < 2500) {
        var el = node.parentElement;
        if (!el || seen.has(el) || !/\S/.test(node.nodeValue)) continue;
        seen.add(el);
        if (/^(SCRIPT|STYLE|NOSCRIPT|OPTION|TEXTAREA|SELECT|INPUT|SVG|TITLE|TEXT|TSPAN)$/i.test(el.tagName)) continue;
        if (el.closest(SKIP_SEL + ',[data-lb-text-skip]')) continue;
        var r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
        var cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || (parseFloat(cs.opacity) || 1) < 0.2) continue;
        var tc = parseRgb(cs.color); if (!tc) continue;
        n++;
        var cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
        var chain = [], cur = el, stop = false, opaque = false;
        while (cur && cur !== root) {
          var L = layer(cur);
          if (L.stop) { stop = true; break; }
          if (L.c) { chain.push(L.c); if (L.c.a >= 0.97) { opaque = true; break; } }
          cur = cur.parentElement;
        }
        if (stop) continue;
        var bg = opaque ? { r: chain[chain.length - 1].r, g: chain[chain.length - 1].g, b: chain[chain.length - 1].b, a: 1 } : wallPixel(cx, cy);
        for (var i = chain.length - (opaque ? 2 : 1); i >= 0; i--) bg = over(chain[i], bg);
        var fg = tc.a < 1 ? over(tc, bg) : tc;
        var cur1 = ratio(fg, bg);
        var pp = prevPick.get(el), ppc = pp ? parseRgb(pp) : null;
        if (ppc && cur1 < 4.5 && ratio(ppc, bg) >= 3.2) {   // keep the colour it already had (hysteresis)
          txtList.push({ el: el, v: el.style.getPropertyValue('color'), p: el.style.getPropertyPriority('color') });
          el.style.setProperty('color', pp, 'important');
          el.setAttribute('data-lbtx', '');
          continue;
        }
        if (cur1 >= 3.6) continue;
        var dark = { r: 33, g: 22, b: 27, a: 1 }, light = { r: 255, g: 255, b: 255, a: 1 };
        var rd = ratio(dark, bg), rl = ratio(light, bg);
        var pick = rd >= rl ? dark : light, pr = Math.max(rd, rl);
        if (pr < cur1 + 1.2) continue;
        txtList.push({ el: el, v: el.style.getPropertyValue('color'), p: el.style.getPropertyPriority('color') });
        el.style.setProperty('color', 'rgb(' + pick.r + ',' + pick.g + ',' + pick.b + ')', 'important');
        el.setAttribute('data-lbtx', '');
      }
    });
  }
  function textSchedule() { if (!txtTimer) txtTimer = setTimeout(textPass, 220); }
  // while scrolling, wait until the scrolling has stopped before looking at the colours again (no flicker while moving)
  var scrollTimer = 0;
  function textScrollSchedule() { clearTimeout(scrollTimer); scrollTimer = setTimeout(function () { clearTimeout(txtTimer); txtTimer = 0; textSchedule(); }, 450); }
  function textStart() {
    if (!st.auto || nativeDark() || !wallUrl(st.wall)) { textRestore(); thumb = null; return; }
    loadThumb(function () { textSchedule(); });
    if (!txtObs && window.MutationObserver && document.body) {
      txtObs = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i], t = m.target;
          if (m.type === 'characterData') { textSchedule(); return; }
          for (var j = 0; j < m.addedNodes.length; j++) { var a = m.addedNodes[j]; if (a.nodeType === 1 && a.hasAttribute && a.hasAttribute('data-lbtx')) continue; textSchedule(); return; }
        }
      });
      txtObs.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }
  window.addEventListener('scroll', function () { if (txtList.length || root.classList.contains('lb-wall')) textScrollSchedule(); }, true);
  window.addEventListener('resize', textSchedule);

  // ---------------- apply everything ----------------
  function applyWall() {
    var url = nativeDark() ? null : wallUrl(st.wall);
    if (url) {
      root.style.setProperty('--lb-wallimg', 'url("' + url + '")');
      root.style.setProperty('--lb-scrim', themeDark() ? 'rgba(12,7,10,.50)' : 'rgba(255,250,250,.30)');
      root.classList.add('lb-wall');
    } else {
      root.classList.remove('lb-wall');
      root.style.removeProperty('--lb-wallimg'); root.style.removeProperty('--lb-scrim');
    }
  }
  var printingNow = false;
  function applyText() {
    // --lb-zoom lets full-height layouts divide 100vh by the zoom (with CSS zoom, 100vh grows with it and the page overflows)
    if (st.text === 100 || printingNow) { root.style.removeProperty('zoom'); root.style.removeProperty('--lb-zoom'); }
    else { root.style.zoom = String(st.text / 100); root.style.setProperty('--lb-zoom', String(st.text / 100)); }
  }
  function applyIcons() {
    if (st.icons === 'circle' || st.icons === 'square') root.setAttribute('data-lb-icons', st.icons);
    else root.removeAttribute('data-lb-icons');
  }
  function applyBoxes() {
    if (!document.body) return;
    pause(function () {
      releaseAll();
      if (boxesWanted()) { startObserver(); appVarsApply(); sweepTree(document.body); }
    });
  }
  function applyAll() {
    css(); applyWall(); applyIcons(); applyText();
    if (st.glass && !nativeDark()) root.setAttribute('data-lb-glass', '1'); else root.removeAttribute('data-lb-glass');
    applyBoxes();
    textStart();
  }
  function changed() {
    try { window.dispatchEvent(new CustomEvent('lb:look-changed', { detail: get() })); } catch (e) {}
  }

  function get() { return { wall: st.wall, alpha: st.alpha, glass: st.glass, icons: st.icons, text: st.text, auto: st.auto }; }
  function set(patch) {
    patch = patch || {};
    if (typeof patch.wall === 'string') st.wall = (patch.wall === 'off' || wallUrl(patch.wall)) ? patch.wall : 'off';
    if (typeof patch.alpha === 'number' && isFinite(patch.alpha)) st.alpha = Math.max(0, Math.min(70, Math.round(patch.alpha)));
    if (typeof patch.glass === 'boolean') {
      st.glass = patch.glass;
      if (st.glass && st.alpha === 0 && typeof patch.alpha !== 'number') st.alpha = 48;   // glass needs something to see through
    }
    if (typeof patch.auto === 'boolean') st.auto = patch.auto;
    if (typeof patch.text === 'number' && isFinite(patch.text)) st.text = Math.max(85, Math.min(140, Math.round(patch.text)));
    if (patch.icons === 'plain' || patch.icons === 'circle' || patch.icons === 'square') st.icons = patch.icons;
    // first wallpaper picked while boxes are solid → make them a little see-through so the wallpaper shows
    if (typeof patch.wall === 'string' && st.wall !== 'off' && st.alpha === 0 && typeof patch.alpha !== 'number') st.alpha = 25;
    save(); applyAll(); changed();
  }
  function reset() { st = { wall: DEF.wall, alpha: DEF.alpha, glass: DEF.glass, icons: DEF.icons, text: DEF.text, auto: true }; save(); applyAll(); changed(); }

  // Add a wallpaper from a photo the person picks (shrunk so it fits on the device).
  function addWall(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || '')) return reject(new Error('Please choose a picture.'));
      var walls = readWalls();
      if (walls.length >= MAX_WALLS) return reject(new Error('You can keep up to ' + MAX_WALLS + ' of your own wallpapers. Remove one first.'));
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('Could not read that picture.')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('That picture could not be opened.')); };
        img.onload = function () {
          function shrink(max, q) {
            var k = Math.min(1, max / Math.max(img.width, img.height));
            var cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
            var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
            cx.drawImage(img, 0, 0, cv.width, cv.height);
            return cv.toDataURL('image/jpeg', q);
          }
          var tries = [[1400, 0.72], [1000, 0.62], [700, 0.55]];
          for (var i = 0; i < tries.length; i++) {
            var data = shrink(tries[i][0], tries[i][1]);
            var next = walls.concat([data]);
            if (writeWalls(next)) { resolve(next.length - 1); return; }
          }
          reject(new Error('Not enough space on this device for that picture.'));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function removeWall(i) {
    var walls = readWalls();
    if (i < 0 || i >= walls.length) return;
    var cur = /^u(\d)$/.exec(st.wall);
    walls.splice(i, 1); writeWalls(walls);
    if (cur) {
      var ci = +cur[1];
      if (ci === i) st.wall = 'off'; else if (ci > i) st.wall = 'u' + (ci - 1);
    }
    save(); applyAll(); changed();
  }

  window.LBLook = {
    _wallPixel: function (x, y) { return wallPixel(x, y); },
    get: get, set: set, reset: reset,
    presets: function () { return PRESETS.map(function (p) { return { id: p.id, name: p.name, uri: presetUri(p) }; }); },
    walls: readWalls, addWall: addWall, removeWall: removeWall,
    maxWalls: MAX_WALLS
  };

  // ---------------- wiring ----------------
  function start() { applyAll(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.addEventListener('load', function () { applyAll(); });                    // after the page finished its own styling
  window.addEventListener('lb:theme-changed', function () { applyWall(); applyAll(); });         // Light/Dark switched
  // the home page flips its own dark class: follow it
  if (window.MutationObserver) {
    var lastDark = null;
    new MutationObserver(function () {
      var d = themeDark();
      if (lastDark === null) { lastDark = d; return; }
      if (d !== lastDark) { lastDark = d; applyWall(); applyBoxes(); }
    }).observe(root, { attributes: true, attributeFilter: ['class', 'data-lb-theme'] });
  }
  window.addEventListener('storage', function (e) {
    if (e.key === KEY || e.key === WKEY) { st = readSt(); applyAll(); changed(); }
  });
  window.addEventListener('beforeprint', function () { printingNow = true; applyText(); pause(releaseAll); });
  window.addEventListener('afterprint', function () { printingNow = false; applyText(); applyBoxes(); textSchedule(); });
})();
