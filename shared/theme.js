/**
 * LALABELLA THEME — Light / Dark / Auto for every page.
 *
 * Load it early in <head> (right after shared/config.js):
 *   <script src="shared/theme.js"></script>
 *
 * The choice is saved on THIS DEVICE only (localStorage "lbTheme"):
 *   'light' (default) | 'dark' | 'auto' (follows the phone/computer setting)
 *
 * How dark mode works: every page has its own colours (some in :root
 * variables, many hardcoded). Instead of hand-editing 40+ pages, this file
 * reads the page's CSS at runtime and flips each colour's lightness while
 * keeping its hue (cream → deep brown-black, dark ink → light text, rose
 * stays rose). Inline style="" colours added later by page scripts are
 * converted too. Going back to Light restores the originals exactly.
 *
 * - Printing always uses the original (light) colours.
 * - Pages already designed dark, and the card/label designers (KEEP_AS_IS),
 *   are left alone. A page is also left alone if its background is already dark.
 * - Anything inside [data-lb-theme-skip] is never converted.
 *
 * Page code can use: LBTheme.get(), LBTheme.set('dark'), LBTheme.isDark(),
 * and listen for the 'lb:theme-changed' event.
 */
(function () {
  if (window.LBTheme) return;
  var KEY = 'lbTheme';
  // Pages that keep their own colours: already-dark designs, and print/label
  // designers where the on-screen preview must show the real colours.
  // (Other already-dark pages are detected automatically.)
  var KEEP_AS_IS = ['index.html', 'nova-command-center.html',
    'card-print.html', 'seeds-card.html', 'chocolate-barcode.html', 'flower-barcode.html'];
  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var native = KEEP_AS_IS.indexOf(page) !== -1 ? true : null;   // null = check the page once it loads
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function getMode() {
    try { var m = localStorage.getItem(KEY); return m === 'dark' || m === 'auto' ? m : 'light'; }
    catch (e) { return 'light'; }
  }
  function wantDark() {
    var m = getMode();
    return native !== true && (m === 'dark' || (m === 'auto' && !!(mq && mq.matches)));
  }

  // ---------------- colour maths ----------------
  var NAMED = { white: [255, 255, 255], black: [0, 0, 0] };
  function parse(tok) {
    var t = tok.toLowerCase(), m;
    if (NAMED[t]) return { r: NAMED[t][0], g: NAMED[t][1], b: NAMED[t][2], a: 1 };
    if (t[0] === '#') {
      var h = t.slice(1);
      if (h.length === 3 || h.length === 4) h = h.split('').map(function (c) { return c + c; }).join('');
      if (h.length !== 6 && h.length !== 8) return null;
      return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16),
        a: h.length === 8 ? parseInt(h.substr(6, 2), 16) / 255 : 1 };
    }
    m = t.match(/^(rgba?|hsla?)\(([^)]*)\)$/);
    if (!m) return null;
    var parts = m[2].replace(/\s*\/\s*/, ',').split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return null;
    var num = function (p, scale) { return /%$/.test(p) ? parseFloat(p) / 100 * scale : parseFloat(p); };
    var a = parts[3] != null ? num(parts[3], 1) : 1;
    if (m[1].indexOf('rgb') === 0) return { r: num(parts[0], 255), g: num(parts[1], 255), b: num(parts[2], 255), a: a };
    var rgb = hsl2rgb(parseFloat(parts[0]) / 360, num(parts[1], 1), num(parts[2], 1));
    return { r: rgb[0], g: rgb[1], b: rgb[2], a: a };
  }
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    if (!s) { var v = Math.round(l * 255); return [v, v, v]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    var f = function (t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }
  // Change lightness, keep hue. role:
  //   'text'   — text colours: dark text becomes light, light text stays
  //   'bg'     — backgrounds/borders/shadows: light becomes dark, dark stays
  //              (so already-dark cards and headers keep their look)
  //   'sym'    — page variables for surfaces/ink/lines: always flipped
  //   'accent' — brand variables (rose, teal, gold…): kept mid-tone so they
  //              read on dark AND still work as button backgrounds
  function flip(c, role) {
    if (c.a === 0) return null;
    var hsl = rgb2hsl(c.r, c.g, c.b), s = hsl[1], l = hsl[2], l2;
    if (role !== 'text' && c.a < 0.6 && l < 0.3) return null;   // shadows / dark overlays stay
    if (role === 'text') { if (l >= 0.5) return null; l2 = 0.08 + (1 - l) * 0.85; }
    else if (role === 'bg') { if (l <= 0.5) return null; l2 = 0.08 + (1 - l) * 0.85; }
    else if (role === 'accent') { l2 = Math.min(0.65, Math.max(0.45, l)); if (l2 === l) return null; }
    else l2 = 0.08 + (1 - l) * 0.85;
    if (l2 > 0.72) s *= 0.85;              // soften very bright results a little
    else if (l2 < 0.3) s *= 0.55;          // pastel surfaces → calm dark, not deep red/green
    var rgb = hsl2rgb(hsl[0], s, l2);
    var a = Math.round(c.a * 1000) / 1000;
    return a >= 1 ? 'rgb(' + rgb.join(', ') + ')' : 'rgba(' + rgb.join(', ') + ', ' + a + ')';
  }
  // Role of a page variable (--name), from its name and its colour.
  function varRole(name, c) {
    if (/ink|text|muted|dim|fg|line|border|shadow|bg|paper|cream|blush|white|black|surface|card|panel/i.test(name)) return 'sym';
    var l = rgb2hsl(c.r, c.g, c.b)[2];
    return l > 0.75 || l < 0.2 ? 'sym' : 'accent';
  }
  var TOKEN = /url\([^)]*\)|#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)|\b(?:white|black)\b/g;
  function convert(value, prop) {
    if (!value || !/[#(]|white|black/i.test(value)) return value;
    var fixed = prop.slice(0, 2) === '--' ? null : (TEXT_PROPS.test(prop) ? 'text' : 'bg');
    return value.replace(TOKEN, function (tok) {
      if (tok.slice(0, 4) === 'url(') return tok;
      var c = parse(tok);
      if (!c) return tok;
      return flip(c, fixed || varRole(prop, c)) || tok;
    });
  }

  var TEXT_PROPS = /^(color|text-decoration|caret-color|-webkit-text-fill-color|-webkit-text-stroke-color|text-decoration-color|text-emphasis-color|fill|stroke)$/;
  function colourish(p) {
    return p.slice(0, 2) === '--' || /color$/.test(p) ||
      p === 'background-image' || p === 'box-shadow' || p === 'text-shadow' || p === 'fill' || p === 'stroke' ||
      p === 'border-image-source';
  }

  // ---------------- converting declarations ----------------
  // Each converted declaration remembers { orig, applied } so it can be restored,
  // and so a later change by the page (inline styles) is never double-flipped.
  var sheetRecords = [];                       // [{style, prop, orig, applied, prio}]
  var seenSheets = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  var inlineMap = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  // Shorthands written with var() (e.g. "background:linear-gradient(#fff, var(--blush))")
  // keep their text only on the shorthand — the longhands read as empty.
  var SHORTHANDS = ['background', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
    'border-color', 'outline', 'text-decoration', 'column-rule'];
  function convertDecl(style, rec) {           // rec: per-prop map for inline styles, or null for sheets
    var props = [];
    for (var i = 0; i < style.length; i++) props.push(style[i]);
    SHORTHANDS.forEach(function (sh) {
      var v = style.getPropertyValue(sh);
      if (v && v.indexOf('var(') !== -1) props.push(sh);
    });
    props.forEach(function (p) {
      if (!colourish(p) && SHORTHANDS.indexOf(p) === -1) return;
      var cur = style.getPropertyValue(p);
      if (rec && rec[p] && rec[p].applied === cur) return;   // already ours
      var out = convert(cur, p);
      if (rec) rec[p] = { orig: cur, applied: out };
      if (out === cur) return;
      var prio = style.getPropertyPriority(p);
      style.setProperty(p, out, prio);
      var applied = style.getPropertyValue(p);
      if (rec) rec[p].applied = applied;
      else sheetRecords.push({ style: style, prop: p, orig: cur, applied: applied, prio: prio });
    });
  }
  function walkRules(rules) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.style) convertDecl(r.style, null);
      if (r.cssRules) walkRules(r.cssRules);
    }
  }
  function skipped(node) { return node && node.closest && node.closest('[data-lb-theme-skip]'); }
  function doSheet(sheet) {
    if (!sheet || (seenSheets && seenSheets.has(sheet))) return;
    var owner = sheet.ownerNode;
    if (owner && owner.hasAttribute && owner.hasAttribute('data-lb-theme-skip')) return;
    var rules;
    try { rules = sheet.cssRules; } catch (e) { return; }  // cross-origin (Google Fonts) — nothing to convert
    if (seenSheets) seenSheets.add(sheet);
    walkRules(rules);
  }
  function doElement(el) {
    if (!inlineMap || !el.getAttribute || !el.getAttribute('style') || skipped(el)) return;
    var rec = inlineMap.get(el);
    if (!rec) { rec = {}; inlineMap.set(el, rec); el.setAttribute('data-lbdk', ''); }
    convertDecl(el.style, rec);
  }
  function doTree(node) {
    if (node.nodeType !== 1) return;
    if (node.getAttribute('style') != null) doElement(node);
    var list = node.querySelectorAll('[style]');
    for (var i = 0; i < list.length; i++) doElement(list[i]);
  }

  var observer = null, active = false;
  function onMutations(muts) {
    if (!active) return;
    muts.forEach(function (m) {
      if (m.type === 'attributes') { doElement(m.target); return; }
      m.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.tagName === 'STYLE') doSheet(n.sheet);
        else if (n.tagName === 'LINK') { doSheet(n.sheet); n.addEventListener('load', function () { if (active) doSheet(n.sheet); }); }
        doTree(n);
      });
    });
  }

  // Pages whose own design is already dark (e.g. Chocolate Calculator) are
  // left alone: look at the page's real background before converting.
  function pageIsDark() {
    var ls = [];
    [document.body, root].forEach(function (el) {
      if (!el) return;
      var cs = getComputedStyle(el);
      ((cs.backgroundColor || '') + ' ' + (cs.backgroundImage || '')).replace(TOKEN, function (tok) {
        var c = tok.slice(0, 4) === 'url(' ? null : parse(tok);
        if (c && c.a >= 0.5) ls.push(rgb2hsl(c.r, c.g, c.b)[2]);
        return tok;
      });
    });
    if (!ls.length) return false;
    return ls.reduce(function (a, b) { return a + b; }, 0) / ls.length < 0.35;
  }

  function darkOn() {
    root.classList.remove('lb-theme-boot');   // so the check sees the page's own background
    if (native === null) native = pageIsDark();
    if (native) { root.setAttribute('data-lb-theme', 'light'); return false; }
    active = true;
    for (var i = 0; i < document.styleSheets.length; i++) doSheet(document.styleSheets[i]);
    doTree(root);
    if (!observer && window.MutationObserver) observer = new MutationObserver(onMutations);
    if (observer) observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
    return true;
  }
  function darkOff() {
    active = false;
    if (observer) observer.disconnect();
    sheetRecords.forEach(function (r) {
      if (r.style.getPropertyValue(r.prop) === r.applied) r.style.setProperty(r.prop, r.orig, r.prio);
    });
    sheetRecords = [];
    if (seenSheets) seenSheets = new WeakSet();
    document.querySelectorAll('[data-lbdk]').forEach(function (el) {
      var rec = inlineMap && inlineMap.get(el);
      if (rec) Object.keys(rec).forEach(function (p) {
        if (el.style.getPropertyValue(p) === rec[p].applied && rec[p].orig !== rec[p].applied) {
          el.style.setProperty(p, rec[p].orig, el.style.getPropertyPriority(p));
        }
      });
      if (inlineMap) inlineMap.delete(el);
      el.removeAttribute('data-lbdk');
    });
  }

  // Base bits that make browser-drawn parts (scrollbars, date pickers) dark too.
  var base = document.createElement('style');
  base.id = 'lb-theme-base';
  base.setAttribute('data-lb-theme-skip', '');
  base.textContent = 'html[data-lb-theme="dark"]{color-scheme:dark}' +
    'html.lb-theme-boot body{visibility:hidden!important}html.lb-theme-boot{background:#141113!important}';
  (document.head || root).appendChild(base);

  var isDarkNow = false, domReady = document.readyState !== 'loading', printing = false;
  function apply() {
    var dark = wantDark() && !printing;
    root.setAttribute('data-lb-theme', dark ? 'dark' : 'light');
    if (dark === isDarkNow) return;
    if (!domReady) {                          // first paint: hide until the page's CSS is converted
      if (dark) root.classList.add('lb-theme-boot');
      return;
    }
    if (dark && !darkOn()) dark = false; else if (!dark) darkOff();
    isDarkNow = dark;
    root.classList.remove('lb-theme-boot');
    try { window.dispatchEvent(new CustomEvent('lb:theme-changed', { detail: { mode: getMode(), dark: dark } })); } catch (e) {}
  }

  if (!domReady) {
    document.addEventListener('DOMContentLoaded', function () { domReady = true; apply(); });
    setTimeout(function () { root.classList.remove('lb-theme-boot'); }, 3000);   // failsafe
  }
  if (mq) {
    var onScheme = function () { if (getMode() === 'auto') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onScheme); else if (mq.addListener) mq.addListener(onScheme);
  }
  window.addEventListener('storage', function (e) { if (e.key === KEY) apply(); });
  window.addEventListener('beforeprint', function () { printing = true; apply(); });
  window.addEventListener('afterprint', function () { printing = false; apply(); });

  window.LBTheme = {
    get: getMode,
    set: function (m) {
      try { localStorage.setItem(KEY, m === 'dark' || m === 'auto' ? m : 'light'); } catch (e) {}
      apply();
    },
    isDark: function () { return isDarkNow; },
    isNativeDark: function () { return native === true; }
  };
  apply();
})();
