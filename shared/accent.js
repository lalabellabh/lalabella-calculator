/* LALABELLA — Color theme (Nov 23 2026, Bench: "pag nagsawa ako, gusto ko makulay").
 * ⚙️ Settings → Look & feel → Color theme. Saved on THIS DEVICE (localStorage "lbAccent").
 * The pages are designed in Lalabella rose. A theme swaps that rose (the CSS variables --rose / --rose-deep / --blush …
 * and the same colours written straight into styles) for another palette. "Rose" = as designed (nothing changed).
 * Loaded by shared/nav.js. API: LBAccent.get(), LBAccent.set(id), LBAccent.list()
 */
(function () {
  if (window.LBAccent) return;
  var KEY = 'lbAccent', root = document.documentElement;
  var LIST = [
    { id: 'rose', name: 'Lalabella Rose', a: '#c9506b', d: '#9e2f4a', b: '#fdf1f0', b2: '#f6e0da' },
    { id: 'ocean', name: 'Ocean Blue', a: '#2f7fd1', d: '#1c4f8f', b: '#eef5fd', b2: '#d9e8f8' },
    { id: 'emerald', name: 'Emerald', a: '#25996a', d: '#17674a', b: '#edf9f3', b2: '#d3efe2' },
    { id: 'sunset', name: 'Sunset Orange', a: '#e8713a', d: '#ad4517', b: '#fff3ec', b2: '#fadccb' },
    { id: 'lavender', name: 'Lavender', a: '#8a5cd6', d: '#5c37a3', b: '#f5f0fd', b2: '#e4daf8' },
    { id: 'teal', name: 'Teal', a: '#1c9ea8', d: '#126970', b: '#ebf8f9', b2: '#cfedef' },
    { id: 'candy', name: 'Candy Pop', a: '#ff4f9e', d: '#c0187a', b: '#fff0f8', b2: '#ffd6ec' },
    { id: 'gold', name: 'Royal Gold', a: '#c8901e', d: '#8a5c08', b: '#fdf8ec', b2: '#f6e7c4' },
    { id: 'mono', name: 'Classic Black', a: '#4a4a4a', d: '#161616', b: '#f6f6f6', b2: '#e6e6e6' }
  ];
  var BASE = LIST[0];
  function byId(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return BASE; }
  function rgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  var cur = 'rose'; try { cur = localStorage.getItem(KEY) || 'rose'; } catch (e) {}
  if (/office\.html$/i.test(location.pathname)) cur = 'rose';   // the HQ has its own night look
  var pairs = [], RX = null;
  function build(p) {
    var A = rgb(BASE.a), D = rgb(BASE.d), a = rgb(p.a), d = rgb(p.d);
    pairs = [[BASE.a, p.a], [BASE.d, p.d], [BASE.b, p.b], [BASE.b2, p.b2], ['#8f2944', p.d], ['#e48aa0', p.a], ['#b83d5a', p.d], ['#d77b91', p.a],
      ['rgba(' + D.join(',') + ',', 'rgba(' + d.join(',') + ','], ['rgba(' + A.join(',') + ',', 'rgba(' + a.join(',') + ','],
      ['rgba(' + D.join(', ') + ',', 'rgba(' + d.join(', ') + ','], ['rgba(' + A.join(', ') + ',', 'rgba(' + a.join(', ') + ',']];
    RX = new RegExp(pairs.map(function (x) { return x[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|'), 'gi');
  }
  function swap(t) { return t.replace(RX, function (m) { var l = m.toLowerCase(); for (var i = 0; i < pairs.length; i++) if (pairs[i][0].toLowerCase() === l) return pairs[i][1]; return m; }); }
  var origCss = new WeakMap(), origAttr = new WeakMap(), touched = [];
  function doStyle(el) {
    if (el.id === 'lbAccentVars') return;
    var o = origCss.has(el) ? origCss.get(el) : el.textContent;
    if (!origCss.has(el)) { if (!RX.test(o)) { RX.lastIndex = 0; return; } RX.lastIndex = 0; origCss.set(el, o); touched.push(el); }
    var n = swap(o); if (el.textContent !== n) el.textContent = n;
  }
  function doAttr(el) {
    var o = origAttr.has(el) ? origAttr.get(el) : el.getAttribute('style');
    if (!o) return;
    if (!origAttr.has(el)) { if (!RX.test(o)) { RX.lastIndex = 0; return; } RX.lastIndex = 0; origAttr.set(el, o); touched.push(el); }
    var n = swap(o); if (el.getAttribute('style') !== n) el.setAttribute('style', n);
  }
  // same-site stylesheet files (shared/glass-skin.css …): load the text, swap the colours into a <style>, switch the file off
  var linkMap = [];
  function doLink(l) {
    if (l.__lbAcc || !l.href || l.rel !== 'stylesheet' || l.href.indexOf(location.origin) !== 0) return;
    l.__lbAcc = 1;
    fetch(l.href).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
      if (!t || cur === 'rose') { l.__lbAcc = 0; return; }
      RX.lastIndex = 0; if (!RX.test(t)) { RX.lastIndex = 0; return; } RX.lastIndex = 0;
      var base = l.href.replace(/[^/]*$/, '');
      t = t.replace(/url\((['"]?)(?!data:|https?:|\/)([^'")]+)\1\)/g, function (m, q, u) { return 'url(' + q + base + u + q + ')'; });
      var st = document.createElement('style'); st.setAttribute('data-lb-acc-link', '1'); st.textContent = swap(t);
      l.parentNode.insertBefore(st, l.nextSibling); l.disabled = true; linkMap.push([l, st]);
    }).catch(function () { l.__lbAcc = 0; });
  }
  function sweep(node) {
    if (!node || node.nodeType !== 1 || cur === 'rose') return;
    if (node.tagName === 'STYLE') { if (!node.hasAttribute('data-lb-acc-link')) doStyle(node); return; }
    if (node.tagName === 'LINK') { doLink(node); return; }
    if (node.hasAttribute && node.hasAttribute('style')) doAttr(node);
    if (node.querySelectorAll) { [].forEach.call(node.querySelectorAll('link[rel="stylesheet"]'), doLink); [].forEach.call(node.querySelectorAll('style:not([data-lb-acc-link])'), doStyle); [].forEach.call(node.querySelectorAll('[style]'), doAttr); }
  }
  function restore() {
    touched.forEach(function (el) { if (origCss.has(el)) el.textContent = origCss.get(el); if (origAttr.has(el)) el.setAttribute('style', origAttr.get(el)); });
    touched = []; origCss = new WeakMap(); origAttr = new WeakMap();
    linkMap.forEach(function (x) { x[0].disabled = false; x[0].__lbAcc = 0; x[1].remove(); }); linkMap = [];
  }
  // the pink Lalabella wallpapers follow the theme colour (own photos are never changed)
  function mix(h, w) { var c = rgb(h); return 'rgb(' + c.map(function (v) { return Math.round(v + (255 - v) * w); }).join(',') + ')'; }
  function wallSvg(p) {
    var fl = function (cx, cy, r, op) { var o = ''; for (var i = 0; i < 5; i++) { var a = i * 72 * Math.PI / 180; o += '<ellipse cx="' + (cx + Math.cos(a) * r * .5).toFixed(1) + '" cy="' + (cy + Math.sin(a) * r * .5).toFixed(1) + '" rx="' + (r * .42).toFixed(1) + '" ry="' + (r * .3).toFixed(1) + '" transform="rotate(' + (i * 72) + ' ' + (cx + Math.cos(a) * r * .5).toFixed(1) + ' ' + (cy + Math.sin(a) * r * .5).toFixed(1) + ')" fill="#fff" opacity="' + op + '"/>'; } return o + '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * .16) + '" fill="#fff" opacity="' + (op + .1) + '"/>'; };
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="' + mix(p.a, .86) + '"/><stop offset="1" stop-color="' + mix(p.a, .5) + '"/></linearGradient></defs>' +
      '<rect width="1600" height="1000" fill="url(#g)"/>' + fl(260, 220, 190, .35) + fl(1330, 150, 150, .3) + fl(1180, 760, 260, .28) + fl(380, 800, 130, .32) + fl(760, 470, 90, .22) + fl(1520, 480, 100, .25) + '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }
  var wallTag = null;
  function wallTint() {
    if (wallTag) { wallTag.remove(); wallTag = null; }
    if (cur === 'rose') return;
    var w = ''; try { w = window.LBLook ? window.LBLook.get().wall : ''; } catch (e) {}
    if (w !== 'rose' && w !== 'bloom') return;
    wallTag = document.createElement('style'); wallTag.id = 'lbAccentWall';
    wallTag.textContent = 'html[data-lb-accent].lb-wall{--lb-wallimg:url("' + wallSvg(byId(cur)) + '")!important}';
    (document.head || root).appendChild(wallTag);
  }
  window.addEventListener('lb:look-changed', function () { wallTint(); });
  var varsTag = null;
  function apply() {
    restore();
    if (varsTag) { varsTag.remove(); varsTag = null; }
    if (cur === 'rose') { root.removeAttribute('data-lb-accent'); wallTint(); return; }
    var p = byId(cur); build(p); root.setAttribute('data-lb-accent', p.id);
    varsTag = document.createElement('style'); varsTag.id = 'lbAccentVars';
    varsTag.textContent = 'html[data-lb-accent]{--rose:' + p.a + ';--rose-deep:' + p.d + ';--rose-dark:' + p.d + ';--blush:' + p.b + ';--blush-2:' + p.b2 + ';--lb-accent:' + p.a + ';--lb-accent-deep:' + p.d + '}' +
      'html[data-lb-accent] ::selection{background:' + p.b2 + '}';
    (document.head || root).appendChild(varsTag);
    sweep(document.head); sweep(document.body); wallTint(); setTimeout(wallTint, 800);
  }
  var obs = null;
  function watch() {
    if (obs) return;
    obs = new MutationObserver(function (ms) { if (cur === 'rose') return; ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) sweep(n); }); }); });
    obs.observe(root, { childList: true, subtree: true });
  }
  function start() { apply(); watch(); }
  window.LBAccent = {
    get: function () { return cur; }, list: function () { return LIST.slice(); },
    set: function (id) { cur = byId(id).id; try { localStorage.setItem(KEY, cur); } catch (e) {} apply(); try { window.dispatchEvent(new CustomEvent('lb:accent-changed', { detail: cur })); } catch (e) {} }
  };
  if (cur !== 'rose') { if (document.readyState === 'loading') { apply(); document.addEventListener('DOMContentLoaded', start); } else start(); }
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
