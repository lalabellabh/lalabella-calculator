/* Flower item-code lookup: type a code OR scan the flower's barcode (camera), see the flower's picture.
 * Used on Flower Receiving, Flower Stock Count and Flower Transfer. Safe: if anything is missing
 * (no network, no login, no camera) the page keeps working exactly as before.
 *
 * Barcodes on flower labels are the flower's Item Code (CODE128), e.g. ROS-00009.
 * New flowers are added in Flower Admin (with picture) and get their code + barcode there.
 *
 * Exposes window.LBFlowerScan = { thumb(name), ready(cb) }  (thumb returns small <img> html or '')
 */
(function () {
  'use strict';
  if (window.LBFlowerScan) return;
  var CFG = window.LB_CONFIG || {};
  var page = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
  var items = [];            // flower_item rows (mapped: Flowers, Item Code, Origin, Unit, Stems per Bunch, Status)
  var photos = {};           // normalized flower name -> url
  var readyCbs = [], loaded = false;

  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function token() { try { return sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; } }
  function byId(id) { return document.getElementById(id); }

  // ---------- data ----------
  function loadPhotos(done) {
    var API = CFG.FLOWER_PHOTO_API, t = token();
    if (!API || !t) return done();
    try {
      var c = JSON.parse(localStorage.getItem('lbFlowerPhotosV1') || 'null');
      if (c && Array.isArray(c.items)) c.items.forEach(function (g) { if (g && g.name && g.photo) photos[norm(g.name)] = g.photo; });
    } catch (e) {}
    fetch(API + '?action=names&token=' + encodeURIComponent(t)).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.success === true && Array.isArray(d.items)) {
        photos = {};
        d.items.forEach(function (g) { if (g && g.name && g.photo) photos[norm(g.name)] = g.photo; });
        try { localStorage.setItem('lbFlowerPhotosV1', JSON.stringify({ t: Date.now(), items: d.items })); } catch (e) {}
      }
      done();
    }).catch(done);
  }
  function loadItems(done) {
    var API = CFG.FLOWER_FAST_API;
    if (!API) return done();
    fetch(API + '?action=getFlowerItems&_ts=' + Date.now()).then(function (r) { return r.json(); }).then(function (rows) {
      if (Array.isArray(rows)) items = rows;
      done();
    }).catch(done);
  }
  function loadAll() {
    var left = 2;
    function one() { if (--left) return; loaded = true; readyCbs.splice(0).forEach(function (f) { try { f(); } catch (e) {} }); }
    loadItems(one); loadPhotos(one);
  }
  function ready(cb) { if (loaded) cb(); else readyCbs.push(cb); }

  function findByCode(code) {
    var c = norm(code); if (!c) return null;
    for (var i = 0; i < items.length; i++) if (norm(items[i]['Item Code']) === c) return items[i];
    return null;
  }
  function findByName(name) {
    var n = norm(name); if (!n) return null;
    for (var i = 0; i < items.length; i++) if (norm(items[i]['Flowers']) === n) return items[i];
    return null;
  }
  function photoOf(name) { return photos[norm(name)] || ''; }

  // ---------- styles ----------
  var css = document.createElement('style');
  css.textContent =
    '.lbfs{margin:8px 0 4px}' +
    '.lbfs-row{display:flex;gap:8px;align-items:stretch}' +
    '.lbfs-row input{flex:1;min-width:0}' +
    '.lbfs-btn{border:0;border-radius:10px;padding:0 16px;font-size:18px;cursor:pointer;background:#2f2024;color:#fff;white-space:nowrap}' +
    '.lbfs-card{display:none;align-items:center;gap:12px;margin-top:8px;padding:8px 10px;border:1px dashed #d9bfc4;border-radius:12px;background:rgba(255,255,255,.55)}' +
    '.lbfs-card.show{display:flex}' +
    '.lbfs-card img{width:64px;height:64px;border-radius:12px;object-fit:cover;background:#f6ecec;cursor:zoom-in;flex:none}' +
    '.lbfs-card .ph{width:64px;height:64px;border-radius:12px;background:#f6ecec;display:flex;align-items:center;justify-content:center;font-size:26px;flex:none}' +
    '.lbfs-card .t{font-weight:700;font-size:14px;line-height:1.25}' +
    '.lbfs-card .s{font-size:12px;opacity:.75;margin-top:2px;line-height:1.3}' +
    '.lbfs-msg{font-size:12px;margin-top:4px;color:#b0413e;display:none}' +
    '.lbfs-th{width:34px;height:34px;border-radius:8px;object-fit:cover;vertical-align:middle;margin-right:8px;background:#f6ecec;cursor:zoom-in}' +
    '.lbfs-modal{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;flex-direction:column;padding:20px}' +
    '.lbfs-modal.show{display:flex}.lbfs-modal video{width:100%;max-width:400px;border-radius:8px}' +
    '.lbfs-modal .h{color:#fff;font-size:12px;margin-top:10px;text-align:center}' +
    '.lbfs-modal button{margin-top:16px;background:#b0413e;color:#fff;border:0;padding:10px 24px;border-radius:20px;font-weight:700;cursor:pointer}' +
    '.lbfs-lb{position:fixed;inset:0;z-index:2147483001;background:rgba(20,8,12,.82);display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:18px;cursor:zoom-out}' +
    '.lbfs-lb.show{display:flex}.lbfs-lb img{max-width:min(92vw,640px);max-height:76vh;border-radius:14px;background:#fff}' +
    '.lbfs-lb div{color:#fff;font-weight:600;font-size:16px;text-align:center}';
  document.head.appendChild(css);

  // ---------- big picture ----------
  var lb = document.createElement('div'); lb.className = 'lbfs-lb'; lb.setAttribute('data-lbflw-skip', '1');
  lb.innerHTML = '<img alt=""><div></div>';
  lb.addEventListener('click', function () { lb.classList.remove('show'); });
  function bigPic(src, cap) { if (!src) return; if (!lb.parentNode && document.body) document.body.appendChild(lb); /* Nov 2026: was never added to the page, so the big picture never showed */ lb.querySelector('img').src = src; lb.querySelector('div').textContent = cap || ''; lb.classList.add('show'); }
  document.addEventListener('click', function (e) {
    var t = e.target; if (t && t.tagName === 'IMG' && t.classList.contains('lbfs-th')) { e.stopPropagation(); bigPic(t.getAttribute('src'), t.getAttribute('data-n')); }
  }, true);

  // ---------- camera scanner ----------
  var modal = null, stopFn = null;
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div'); modal.className = 'lbfs-modal'; modal.setAttribute('data-lbflw-skip', '1');
    modal.innerHTML = '<video autoplay playsinline muted></video><div class="h">Point the camera at the flower\'s barcode</div><button type="button">Cancel</button>';
    modal.querySelector('button').addEventListener('click', stopScan);
    document.body.appendChild(modal);
    return modal;
  }
  function stopScan() {
    if (stopFn) { try { stopFn(); } catch (e) {} stopFn = null; }
    if (modal) modal.classList.remove('show');
  }
  function withScanner(cb) {
    if (window.LBScan) return cb();
    var s = document.createElement('script'); s.src = 'shared/scanner.js'; s.onload = cb;
    s.onerror = function () { alert('Scanner could not be loaded. Please type the item code instead.'); };
    document.head.appendChild(s);
  }
  function scan(onCode) {
    withScanner(function () {
      if (!window.LBScan) { alert('Scanner is not available. Please type the item code instead.'); return; }
      var m = ensureModal(), video = m.querySelector('video');
      m.classList.add('show');
      LBScan.start(video, function (raw) { stopFn = null; stopScan(); onCode(String(raw || '').trim()); },
        function (e) { alert(LBScan.message(e)); stopScan(); })
        .then(function (stop) { stopFn = stop; })
        .catch(function (e) { alert(LBScan.message(e)); stopScan(); });
    });
  }

  // ---------- the code box + picture card ----------
  function attach(o) {
    var anchor = byId(o.anchorId); if (!anchor || anchor.__lbfs) return; anchor.__lbfs = 1;
    var box = document.createElement('div'); box.className = 'lbfs'; box.setAttribute('data-lbflw-skip', '1'); box.setAttribute('data-lbitm-skip', '1');
    box.innerHTML =
      '<div class="lbfs-row"><input type="text" class="lbfs-code" placeholder="Item code (e.g. ROS-00009) - type or scan" autocomplete="off" autocapitalize="characters">' +
      '<button type="button" class="lbfs-btn" title="Scan barcode">📷</button></div>' +
      '<div class="lbfs-msg"></div>' +
      '<div class="lbfs-card"><div class="pic"></div><div><div class="t"></div><div class="s"></div></div></div>';
    anchor.parentNode.insertBefore(box, anchor.nextSibling);
    var inp = box.querySelector('.lbfs-code'), msg = box.querySelector('.lbfs-msg'), card = box.querySelector('.lbfs-card');

    function showCard(it, name) {
      var nm = it ? it['Flowers'] : name;
      if (!nm) { card.classList.remove('show'); return; }
      var ph = photoOf(nm), pic = card.querySelector('.pic');
      pic.innerHTML = ph ? '<img src="' + esc(ph) + '" alt="" data-n="' + esc(nm) + '">' : '<div class="ph">🌸</div>';
      var img = pic.querySelector('img');
      if (img) { img.onerror = function () { pic.innerHTML = '<div class="ph">🌸</div>'; }; img.addEventListener('click', function () { bigPic(ph, nm); }); }
      card.querySelector('.t').textContent = nm;
      card.querySelector('.s').textContent = it ? [it['Item Code'], it['Origin'], it['Unit']].filter(Boolean).join(' · ') : (ph ? '' : 'No picture yet');
      card.classList.add('show');
    }
    function lookup(code) {
      msg.style.display = 'none';
      if (!String(code || '').trim()) { return; }
      var it = findByCode(code);
      if (!it) { msg.textContent = 'No flower found for code: ' + code; msg.style.display = 'block'; card.classList.remove('show'); return; }
      inp.value = it['Item Code'];
      showCard(it);
      try { o.onPick(it); } catch (e) { console.error(e); }
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); lookup(inp.value); } });
    inp.addEventListener('change', function () { lookup(inp.value); });
    box.querySelector('.lbfs-btn').addEventListener('click', function () { scan(function (code) { inp.value = code; ready(function () { lookup(code); }); }); });

    // keep the picture card in step with the name box (picked from the list, typed, etc.)
    var nm = o.nameId ? byId(o.nameId) : null;
    if (nm) nm.setAttribute('data-lbflw-nochip', '1');   // the card shows the picture, so no second one inside the box
    function follow() {
      if (!nm) return;
      var v = nm.value.trim(); if (!v) { card.classList.remove('show'); return; }
      var it = findByName(v) || findByCode(v);
      if (it) showCard(it);
    }
    if (nm) { nm.addEventListener('input', function () { ready(follow); }); nm.addEventListener('change', function () { ready(follow); }); }
  }

  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }
  function setVal(id, v) { var el = byId(id); if (!el) return null; el.value = v; return el; }

  function init() {
    if (page === 'flower-receiving') {
      attach({
        anchorId: 'flowerList', nameId: 'fFlowerName',
        onPick: function (it) {
          var fb = document.querySelector('#typeToggle .type-btn[data-type="Flower"]');
          if (fb && !fb.classList.contains('active')) fb.click();
          var n = setVal('fFlowerName', it['Flowers']); if (n) { fire(n, 'input'); fire(n, 'change'); }
          var o = setVal('fOrigin', it['Origin'] || ''); if (o) { fire(o, 'input'); fire(o, 'change'); }
          var u = byId('fUnit');
          if (u && it['Unit']) { for (var i = 0; i < u.options.length; i++) if (norm(u.options[i].value) === norm(it['Unit'])) { u.value = u.options[i].value; fire(u, 'change'); break; } }
          var s = setVal('fStemsPerBunch', it['Stems per Bunch'] || 1); if (s) { fire(s, 'input'); fire(s, 'change'); }
          var q = byId('fQty'); if (q) q.focus();
        }
      });
    } else if (page === 'flower-transfer') {
      attach({
        anchorId: 'flowerList', nameId: 'fFlower',
        onPick: function (it) {
          var n = setVal('fFlower', it['Flowers']); if (n) { fire(n, 'input'); fire(n, 'change'); }
          var q = byId('fQty'); if (q) q.focus();
        }
      });
    } else if (page === 'flower-stock-count') {
      attach({
        anchorId: 'searchFlower', nameId: null,
        onPick: function (it) {
          var s = setVal('searchFlower', it['Item Code'] || it['Flowers']); if (s) fire(s, 'input');
          setTimeout(function () { var c = document.querySelector('#flowerList input[data-field="physicalCount"]'); if (c) c.focus(); }, 60);
        }
      });
    }
    loadAll();
  }

  window.LBFlowerScan = {
    ready: ready,
    thumb: function (name) {
      var p = photoOf(name);
      return p ? '<img class="lbfs-th" src="' + esc(p) + '" alt="" loading="lazy" data-n="' + esc(name) + '" onerror="this.style.display=\'none\'">' : '';
    }
  };
  // stock count: draw the pictures in the rows as soon as they are known
  if (page === 'flower-stock-count') {
    ready(function () {
      var a = document.activeElement;
      if (a && a.closest && a.closest('.flower-row')) return;
      if (typeof window.renderFlowerList === 'function') { try { window.renderFlowerList(); } catch (e) {} }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
