/* Chocolate pictures — loaded by shared/nav.js on the chocolate pages.
   Shows the picture of each chocolate so nobody has to guess what it looks like:
   1. Pick boxes (type-a-chocolate boxes and chocolate drop-downs): a small picture chip appears inside the box once a
      chocolate is chosen; typing shows a list with a picture next to every name.
   2. Everywhere else a chocolate name stands alone in a list or table (stock, history, dashboard...): a small picture
      is put in front of the name.
   Tap any picture to see it big. Pictures are uploaded in "Chocolate Photos" (Admin) and stored by chocphoto-fast.
   Safe by design: if there is no picture yet, no network, or no login, the pages are left exactly as they were. */
(function () {
  'use strict';
  if (window.LBChocPhotos) return;
  window.LBChocPhotos = true;
  var CFG = window.LB_CONFIG || {};
  var API = CFG.CHOC_PHOTO_FAST_API;
  if (!API) return;

  var CACHE_KEY = 'lbChocPhotosV1', CACHE_MS = 5 * 60 * 1000;
  var allNames = {};   // normalized name -> true   (every chocolate, with or without a picture)
  var photos = {};     // normalized name -> { name, url }
  var nPhotos = 0;

  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); }
  function token() { try { return sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; } }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // ---------- styles ----------
  var css = document.createElement('style');
  css.textContent =
    '.lbchoc-t{width:30px;height:30px;object-fit:cover;border-radius:7px;vertical-align:middle;margin-right:7px;cursor:zoom-in;background:#f6ecec;flex:none}' +
    '.lbchoc-chip{position:fixed;z-index:9390;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(60,20,35,.3);border:1px solid #fff;cursor:zoom-in;background:#f6ecec;display:none}' +
    '.lbchoc-chip img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.lbchoc-dd{position:fixed;z-index:9395;background:#fff;border:1px solid #ecd7da;border-radius:12px;box-shadow:0 14px 34px rgba(60,20,35,.25);overflow-y:auto;display:none;font-family:"Space Grotesk",Arial,sans-serif;-webkit-overflow-scrolling:touch}' +
    '.lbchoc-dd .r{display:flex;align-items:center;gap:10px;padding:6px 10px;cursor:pointer;color:#2f2024;font-size:14px;border-bottom:1px solid #f6e8ea}' +
    '.lbchoc-dd .r:last-child{border-bottom:0}.lbchoc-dd .r.on,.lbchoc-dd .r:hover{background:#fdf0f2}' +
    '.lbchoc-dd .ph{width:42px;height:42px;border-radius:9px;object-fit:cover;background:#f6ecec;flex:none;display:flex;align-items:center;justify-content:center;font-size:18px}' +
    '.lbchoc-dd .n{flex:1;min-width:0;line-height:1.25}' +
    '.lbchoc-lb{position:fixed;inset:0;z-index:2147483001;background:rgba(20,8,12,.82);display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:18px;cursor:zoom-out}' +
    '.lbchoc-lb.show{display:flex}.lbchoc-lb img{max-width:min(92vw,640px);max-height:76vh;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5);background:#fff}' +
    '.lbchoc-lb .cap{color:#fff;font:600 16px "Space Grotesk",Arial,sans-serif;text-align:center}' +
    '.lbchoc-lb .x{position:absolute;top:14px;right:16px;color:#fff;font-size:26px;line-height:1}';
  document.head.appendChild(css);

  // ---------- lightbox (big picture) ----------
  var lb = el('div', 'lbchoc-lb'); lb.setAttribute('data-lbchoc-skip', '1');
  var lbImg = el('img'); var lbCap = el('div', 'cap'); var lbX = el('div', 'x', '✕');
  lb.appendChild(lbX); lb.appendChild(lbImg); lb.appendChild(lbCap);
  function ensureLb() { if (!lb.parentNode && document.body) document.body.appendChild(lb); }
  function openBig(name) {
    var p = photos[norm(name)]; if (!p) return;
    ensureLb(); lbImg.src = p.url; lbCap.textContent = p.name; lb.classList.add('show');
  }
  function closeBig() { lb.classList.remove('show'); lbImg.removeAttribute('src'); }
  lb.addEventListener('click', closeBig);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && lb.classList.contains('show')) closeBig(); });
  // tapping any of our small pictures opens the big one (and does not trigger the row/button underneath)
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.classList && (t.classList.contains('lbchoc-t') || (t.parentNode && t.parentNode.classList && t.parentNode.classList.contains('lbchoc-chip')))) {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      openBig(t.getAttribute('data-name') || (t.parentNode.getAttribute && t.parentNode.getAttribute('data-name')) || '');
    }
  }, true);

  // ---------- load the picture list ----------
  function apply(items) {
    allNames = {}; photos = {}; nPhotos = 0;
    (items || []).forEach(function (it) {
      var k = norm(it.name); if (!k) return;
      allNames[k] = true;
      if (it.photo && /^https:\/\//.test(it.photo)) { photos[k] = { name: it.name, url: it.photo }; nPhotos++; }
    });
  }
  function load(cb) {
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) {}
    if (cached && Array.isArray(cached.items)) apply(cached.items);
    var fresh = cached && (Date.now() - cached.t) < CACHE_MS;
    if (cb) cb();
    if (fresh) return;
    var t = token(); if (!t) return;
    fetch(API + '?action=list&token=' + encodeURIComponent(t))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.success !== true || !Array.isArray(d.items)) return;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), items: d.items })); } catch (e) {}
        apply(d.items); if (cb) cb();
      }).catch(function () {});
  }

  // ---------- 1. pick boxes ----------
  var pickers = [];  // {box, kind:'input'|'select', chip, dd, rows, active, last, origPad}
  function optionTexts(box) {
    if (box.tagName === 'SELECT') return Array.prototype.map.call(box.options, function (o) { return (o.text || '').trim(); }).filter(Boolean);
    var dl = box.__lbList; if (!dl) return [];
    return Array.prototype.map.call(dl.options, function (o) { return (o.value || '').trim(); }).filter(Boolean);
  }
  function looksLikeChocolate(box) {
    var t = optionTexts(box); if (t.length < 3) return false;
    var hit = 0; t.forEach(function (x) { if (allNames[norm(x)]) hit++; });
    return hit >= 3 && hit / t.length >= 0.6;
  }
  function valueName(p) {
    if (p.kind === 'select') { var o = p.box.options[p.box.selectedIndex]; return o ? (o.text || '').trim() : ''; }
    return String(p.box.value || '').trim();
  }
  function placeChip(p) {
    var name = valueName(p), ph = photos[norm(name)];
    var r = p.box.getBoundingClientRect();
    var visible = ph && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && p.box.offsetParent !== null;
    if (!visible) { p.chip.style.display = 'none'; if (!ph) restorePad(p); return; }
    var size = Math.max(24, Math.min(36, Math.round(r.height - 8)));
    var off = p.kind === 'select' ? 30 : 6;
    p.chip.style.cssText = 'display:block;width:' + size + 'px;height:' + size + 'px;top:' + Math.round(r.top + (r.height - size) / 2) + 'px;left:' + Math.round(r.right - size - off) + 'px';
    p.chip.setAttribute('data-name', ph.name);
    if (p.img.getAttribute('src') !== ph.url) p.img.src = ph.url;
    if (!p.padded) { p.origPad = p.box.style.paddingRight; p.padded = true; }
    p.box.style.paddingRight = (size + off + 14) + 'px';
  }
  function restorePad(p) { if (p.padded) { p.box.style.paddingRight = p.origPad; p.padded = false; } }

  function ddRows(p) {
    var q = norm(p.box.value), all = optionTexts(p.box), out = [], seen = {};
    all.forEach(function (n) { var k = norm(n); if (seen[k]) return; seen[k] = 1; if (!q || k.indexOf(q) !== -1) out.push(n); });
    return out.slice(0, 40);
  }
  function renderDd(p) {
    var rows = ddRows(p); p.rows = rows; p.active = -1; p.dd.textContent = '';
    if (!rows.length) { hideDd(p); return; }
    rows.forEach(function (n, i) {
      var r = el('div', 'r'); r.setAttribute('data-i', String(i));
      var ph = photos[norm(n)], thumb;
      if (ph) { thumb = el('img', 'ph'); thumb.src = ph.url; thumb.alt = ''; thumb.loading = 'lazy'; thumb.onerror = function () { this.style.visibility = 'hidden'; }; }
      else thumb = el('div', 'ph', '🍫');
      r.appendChild(thumb); r.appendChild(el('div', 'n', n)); p.dd.appendChild(r);
    });
    placeDd(p); p.dd.style.display = 'block'; p.dd.scrollTop = 0;
  }
  function placeDd(p) {
    var r = p.box.getBoundingClientRect(), below = window.innerHeight - r.bottom, above = r.top;
    var w = Math.min(Math.max(r.width, 260), window.innerWidth - 12), left = Math.max(6, Math.min(r.left, window.innerWidth - w - 6));
    var useAbove = below < 200 && above > below, max = Math.max(120, Math.min(340, (useAbove ? above : below) - 12));
    p.dd.style.left = left + 'px'; p.dd.style.width = w + 'px'; p.dd.style.maxHeight = max + 'px';
    if (useAbove) { p.dd.style.top = 'auto'; p.dd.style.bottom = (window.innerHeight - r.top + 2) + 'px'; }
    else { p.dd.style.bottom = 'auto'; p.dd.style.top = (r.bottom + 2) + 'px'; }
  }
  function hideDd(p) { p.dd.style.display = 'none'; p.active = -1; }
  function setActive(p, i) {
    var rows = p.dd.querySelectorAll('.r'); if (!rows.length) return;
    p.active = (i + rows.length) % rows.length;
    Array.prototype.forEach.call(rows, function (r, k) { r.classList.toggle('on', k === p.active); });
    rows[p.active].scrollIntoView({ block: 'nearest' });
  }
  function choose(p, name) {
    p.box.value = name; p.choosing = true; hideDd(p);
    p.box.dispatchEvent(new Event('input', { bubbles: true }));
    p.box.dispatchEvent(new Event('change', { bubbles: true }));
    p.choosing = false; hideDd(p);
    p.last = name; placeChip(p);
  }

  function enhance(box) {
    var isSel = box.tagName === 'SELECT';
    var p = { box: box, kind: isSel ? 'select' : 'input', last: null, padded: false, origPad: '' };
    p.chip = el('div', 'lbchoc-chip'); p.img = el('img'); p.img.alt = ''; p.img.onerror = function () { p.chip.style.display = 'none'; };
    p.chip.appendChild(p.img); document.body.appendChild(p.chip);
    if (!isSel) {
      p.dd = el('div', 'lbchoc-dd'); p.dd.setAttribute('data-lbchoc-skip', '1'); document.body.appendChild(p.dd);
      box.removeAttribute('list'); // our list (with pictures) replaces the plain one
      p.dd.addEventListener('mousedown', function (e) { e.preventDefault(); });
      p.dd.addEventListener('click', function (e) {
        var r = e.target.closest ? e.target.closest('.r') : null; if (!r) return;
        var n = p.rows[Number(r.getAttribute('data-i'))]; if (n != null) choose(p, n);
      });
      box.addEventListener('focus', function () { renderDd(p); });
      box.addEventListener('input', function () { if (!p.choosing) renderDd(p); });
      box.addEventListener('blur', function () { setTimeout(function () { hideDd(p); }, 120); });
      box.addEventListener('keydown', function (e) {
        var open = p.dd.style.display === 'block';
        if (e.key === 'ArrowDown') { if (!open) renderDd(p); else { e.preventDefault(); setActive(p, p.active + 1); } if (open) return; }
        else if (e.key === 'ArrowUp' && open) { e.preventDefault(); setActive(p, p.active - 1); }
        else if (e.key === 'Enter' && open && p.active >= 0) { e.preventDefault(); choose(p, p.rows[p.active]); }
        else if (e.key === 'Escape' && open) { hideDd(p); }
      });
    }
    box.addEventListener('change', function () { placeChip(p); });
    box.addEventListener('input', function () { placeChip(p); });
    pickers.push(p); placeChip(p);
  }

  function scanPickers() {
    if (!nPhotos) return;
    Array.prototype.forEach.call(document.querySelectorAll('input[list], select'), function (box) {
      if (box.__lbChoc === 1) return;
      if (box.closest && box.closest('[data-lbchoc-skip]')) return;
      if (box.tagName === 'INPUT') {
        var dl = document.getElementById(box.getAttribute('list') || ''); if (!dl) return;
        box.__lbList = dl;
      }
      var n = optionTexts(box).length;
      if (box.__lbN === n) return;      // unchanged since the last look: not a chocolate box (or still empty)
      box.__lbN = n;
      if (looksLikeChocolate(box)) { box.__lbChoc = 1; enhance(box); }
    });
  }
  function refreshChips() {
    pickers.forEach(function (p) {
      if (!document.body.contains(p.box)) return;
      var v = valueName(p);
      if (v !== p.last) { p.last = v; placeChip(p); }
    });
  }
  window.addEventListener('scroll', function () { pickers.forEach(function (p) { placeChip(p); if (p.dd && p.dd.style.display === 'block') placeDd(p); }); }, true);
  window.addEventListener('resize', function () { pickers.forEach(function (p) { placeChip(p); if (p.dd && p.dd.style.display === 'block') placeDd(p); }); });

  // ---------- 2. names standing alone in lists / tables ----------
  var OK_TAGS = { DIV: 1, SPAN: 1, TD: 1, TH: 1, B: 1, STRONG: 1, LI: 1, LABEL: 1, A: 1, P: 1, H1: 1, H2: 1, H3: 1, H4: 1, SMALL: 1 };
  function skipZone(node) {
    for (var e = node; e && e.nodeType === 1; e = e.parentNode) {
      var t = e.tagName;
      if (t === 'SCRIPT' || t === 'STYLE' || t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA' || t === 'OPTION' || t === 'BUTTON' || t === 'DATALIST' || t === 'NOSCRIPT') return true;
      if (e.hasAttribute && e.hasAttribute('data-lbchoc-skip')) return true;
      if (e.id && /^(lbdock|lbnav|lbob|lalaBell)/.test(e.id)) return true;
    }
    return false;
  }
  function decorateLeaf(parent) {
    if (!parent || parent.nodeType !== 1 || !OK_TAGS[parent.tagName]) return;
    var mine = null, kids = parent.children;
    for (var i = 0; i < kids.length; i++) { if (kids[i].classList && kids[i].classList.contains('lbchoc-t')) mine = kids[i]; else return; } // only leaf elements
    var text = '';
    for (var n = parent.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) text += n.nodeValue;
    text = text.trim();
    var ph = (text && text.length <= 80) ? photos[norm(text)] : null;
    if (!ph || skipZone(parent)) { if (mine) mine.remove(); return; }
    if (mine) { if (mine.getAttribute('data-name') === ph.name) return; mine.remove(); }
    var img = el('img', 'lbchoc-t'); img.src = ph.url; img.alt = ''; img.loading = 'lazy'; img.setAttribute('data-name', ph.name);
    img.onerror = function () { this.remove(); };
    parent.insertBefore(img, parent.firstChild);
  }
  function decorateTree(root) {
    if (!nPhotos || !root) return;
    if (root.nodeType === 3) { decorateLeaf(root.parentNode); return; }
    if (root.nodeType !== 1 || (root.classList && root.classList.contains('lbchoc-t'))) return;
    if (skipZone(root)) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), seen = [], n;
    while ((n = w.nextNode())) { var v = n.nodeValue; if (v && v.trim() && v.length <= 120) seen.push(n.parentNode); }
    seen.forEach(decorateLeaf);
  }

  var timer = 0, pending = [];
  function flush() {
    timer = 0; var batch = pending; pending = [];
    scanPickers();
    batch.forEach(function (n) { try { decorateTree(n); } catch (e) {} });
  }
  function queue(n) { pending.push(n); if (!timer) timer = setTimeout(flush, 120); }
  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'characterData') { queue(m.target); continue; }
      for (var j = 0; j < m.addedNodes.length; j++) {
        var a = m.addedNodes[j];
        if (a.nodeType === 1 && a.classList && (a.classList.contains('lbchoc-t') || a.classList.contains('lbchoc-chip') || a.classList.contains('lbchoc-dd'))) continue;
        if (a.nodeType === 1 || a.nodeType === 3) queue(a);
      }
    }
  });

  function start() {
    load(function () {
      if (!nPhotos) return;
      queue(document.body);
      scanPickers();
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(function () { if (!document.hidden && nPhotos) { scanPickers(); refreshChips(); } }, 600);
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
