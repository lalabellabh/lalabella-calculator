/**
 * LALABELLA LOOK & FEEL — wallpaper, see-through boxes, glassy style, icon shape.
 *
 * Loaded by shared/nav.js on every page that has the menu. Choices live in
 * ⚙️ Settings → "Look & feel" and are saved on THIS DEVICE only:
 *   localStorage "lbLook"      = {wall, alpha, glass, icons}
 *   localStorage "lbLookWalls" = up to 3 wallpapers the person added (small JPEG data URLs)
 *
 *   wall   'off' | 'rose' | 'plum' | 'gold' | 'choco' | 'sage' | 'bloom' | 'u0'..'u2' (own photos)
 *   alpha  0..70  how see-through the white/dark boxes are (%)
 *   glass  true   frosted-glass blur behind the boxes
 *   icons  'plain' (as designed) | 'circle' | 'square'
 *   text   85..140  text / screen size in % (100 = as designed). Done with CSS zoom on the page.
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
  var DEF = { wall: 'off', alpha: 0, glass: false, icons: 'plain', text: 100 };
  var root = document.documentElement;

  function readSt() {
    var o = {};
    try { o = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
    var s = { wall: DEF.wall, alpha: DEF.alpha, glass: DEF.glass, icons: DEF.icons, text: DEF.text };
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
      'html.lb-wall{background:linear-gradient(var(--lb-scrim,rgba(255,255,255,.28)),var(--lb-scrim,rgba(255,255,255,.28))),var(--lb-wallimg) center/cover no-repeat fixed!important}',
      'html.lb-wall body{background:transparent!important;background-image:none!important}',
      'html.lb-wall #app{background:transparent!important}',
      'html[data-lb-glass] #app .glass{-webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3)}',
      '[data-lbglass]{-webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3)}',
      'html[data-lb-icons="circle"] :is(' + ICONS_ALL + '){border-radius:50%!important;overflow:hidden}',
      'html[data-lb-icons="square"] :is(' + ICONS_ALL + '){border-radius:24%!important;overflow:hidden}',
      'html[data-lb-icons="circle"] :is(' + ICONS_BARE + '),html[data-lb-icons="square"] :is(' + ICONS_BARE + '){display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:1.9em;height:1.9em;line-height:1;flex:0 0 auto;vertical-align:middle;background:rgba(158,47,74,.11)}',
      'html[data-lb-icons="circle"][data-lb-theme="dark"] :is(' + ICONS_BARE + '),html[data-lb-icons="square"][data-lb-theme="dark"] :is(' + ICONS_BARE + '){background:rgba(255,255,255,.12)}',
      '.lb-ic{margin-right:.55em;font-size:.95em}',
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
      if (pos === 'fixed' || pos === 'sticky') { res = true; break; }
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
    if (st.text === 100 || printingNow) root.style.removeProperty('zoom'); else root.style.zoom = String(st.text / 100);
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
  }
  function changed() {
    try { window.dispatchEvent(new CustomEvent('lb:look-changed', { detail: get() })); } catch (e) {}
  }

  function get() { return { wall: st.wall, alpha: st.alpha, glass: st.glass, icons: st.icons, text: st.text }; }
  function set(patch) {
    patch = patch || {};
    if (typeof patch.wall === 'string') st.wall = (patch.wall === 'off' || wallUrl(patch.wall)) ? patch.wall : 'off';
    if (typeof patch.alpha === 'number' && isFinite(patch.alpha)) st.alpha = Math.max(0, Math.min(70, Math.round(patch.alpha)));
    if (typeof patch.glass === 'boolean') {
      st.glass = patch.glass;
      if (st.glass && st.alpha === 0 && typeof patch.alpha !== 'number') st.alpha = 35;   // glass needs something to see through
    }
    if (typeof patch.text === 'number' && isFinite(patch.text)) st.text = Math.max(85, Math.min(140, Math.round(patch.text)));
    if (patch.icons === 'plain' || patch.icons === 'circle' || patch.icons === 'square') st.icons = patch.icons;
    // first wallpaper picked while boxes are solid → make them a little see-through so the wallpaper shows
    if (typeof patch.wall === 'string' && st.wall !== 'off' && st.alpha === 0 && typeof patch.alpha !== 'number') st.alpha = 25;
    save(); applyAll(); changed();
  }
  function reset() { st = { wall: DEF.wall, alpha: DEF.alpha, glass: DEF.glass, icons: DEF.icons, text: DEF.text }; save(); applyAll(); changed(); }

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
  window.addEventListener('afterprint', function () { printingNow = false; applyText(); applyBoxes(); });
})();
