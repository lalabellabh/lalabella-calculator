/* LALABELLA — Extras picker (Nov 2026).
 * Typing in the Extras name box (Flower Calc / Chocolate Calc) shows matching Item Inventory names (vase, box, ribbon…)
 * with their picture, code and sale price. Picking one fills the price (Nov 15 2026); staff can still change it — a changed price is logged
 * (extra_price_log) when the extra is added. No stock is taken out. Anything not in the list can still be typed.
 * Use: LBExtrasPick.attach(inputElement, priceInputElement?) · LBExtrasPick.noteAdd(inputElement, usedPrice, 'flower'|'chocolate') before clearing
 */
(function () {
  'use strict';
  var API = (window.LB_CONFIG && LB_CONFIG.CALC_SALE_API) || 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/calcsale-fast';
  var ITEMS = null, loading = null;
  function token() { try { return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; } }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load() {
    if (ITEMS) return Promise.resolve(ITEMS);
    if (!loading) loading = fetch(API + '?action=itemNames&token=' + encodeURIComponent(token())).then(function (r) { return r.json(); })
      .then(function (d) { ITEMS = (d && d.success && d.items) || []; return ITEMS; }).catch(function () { loading = null; return []; });
    return loading;
  }
  var css = document.createElement('style');
  css.textContent = '.lbxp{position:absolute;z-index:9999;background:#fff;border:1px solid #e3cfd6;border-radius:12px;box-shadow:0 12px 30px rgba(60,20,40,.18);max-height:290px;overflow:auto;padding:4px;font-family:inherit}' +
    '.lbxp .o{display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:9px;cursor:pointer;font-size:13px;color:#2a1c22}.lbxp .o:hover,.lbxp .o.on{background:#fbeef2}' +
    '.lbxp img,.lbxp .ph{width:34px;height:34px;border-radius:7px;object-fit:cover;background:#f3e8ec;flex:0 0 34px;display:flex;align-items:center;justify-content:center;font-size:16px}' +
    '.lbxp .c{font-size:10.5px;color:#8a7680}.lbxp .n{font-size:11.5px;color:#8a7680;padding:6px 8px}' +
    '.lbxp-pic{position:absolute;width:30px;height:30px;border-radius:7px;object-fit:cover;cursor:zoom-in;display:none;z-index:2;background:#f3e8ec}' +
    '.lbxp-x{position:absolute;width:26px;height:26px;border-radius:50%;border:0;background:#e9d6dc;color:#7a3a4e;font-size:14px;font-weight:700;line-height:1;cursor:pointer;display:none;z-index:2;padding:0}' +
    '.lbxp-lb{position:fixed;inset:0;z-index:10050;background:rgba(20,10,15,.82);display:none;align-items:center;justify-content:center;flex-direction:column;gap:10px;cursor:zoom-out;padding:16px}' +
    '.lbxp-lb.show{display:flex}.lbxp-lb img{max-width:92vw;max-height:80vh;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.5);background:#fff}.lbxp-lb div{color:#fff;font-size:15px;font-weight:600;text-align:center}';
  // big view for an item picture (tap anywhere to close)
  var lb = null;
  function openBig(url, name) {
    if (!lb) { lb = document.createElement('div'); lb.className = 'lbxp-lb'; lb.innerHTML = '<img alt=""><div></div>'; document.body.appendChild(lb);
      lb.addEventListener('click', function () { lb.classList.remove('show'); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && lb) lb.classList.remove('show'); }); }
    lb.querySelector('img').src = url; lb.querySelector('div').textContent = name || ''; lb.classList.add('show');
  }
  document.head.appendChild(css);

  function attach(inp, priceInp) {
    if (!inp || inp.__lbxp) return; inp.__lbxp = 1; inp.setAttribute('autocomplete', 'off');
    var box = document.createElement('div'); box.className = 'lbxp'; box.style.display = 'none'; document.body.appendChild(box);
    var list = [], idx = -1;
    // Nov 2026: picture of the picked item + ✕ inside the box (same as the calc search box)
    var host = inp.parentNode; if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var pic = document.createElement('img'); pic.className = 'lbxp-pic'; pic.alt = ''; pic.title = 'Tap to view';
    var xb = document.createElement('button'); xb.type = 'button'; xb.className = 'lbxp-x'; xb.title = 'Clear'; xb.setAttribute('aria-label', 'Clear'); xb.textContent = '✕';
    host.appendChild(pic); host.appendChild(xb);
    var basePad = parseFloat(getComputedStyle(inp).paddingRight) || 10;
    function paint() {
      var has = !!inp.value, sel = inp.__lbxpSel, showPic = !!(sel && sel.photo && inp.value.trim() === sel.label);
      var top = inp.offsetTop + inp.offsetHeight / 2, right = inp.offsetLeft + inp.offsetWidth;
      xb.style.display = has ? 'block' : 'none'; xb.style.left = (right - 34) + 'px'; xb.style.top = (top - 13) + 'px';
      if (showPic) { pic.src = sel.photo; pic.style.display = 'block'; pic.style.left = (right - 70) + 'px'; pic.style.top = (top - 15) + 'px'; }
      else { pic.style.display = 'none'; }
      inp.style.paddingRight = (showPic ? 78 : has ? 40 : basePad) + 'px';
    }
    pic.addEventListener('mousedown', function (e) { e.preventDefault(); });
    pic.addEventListener('click', function () { var sel = inp.__lbxpSel; if (sel && sel.photo) openBig(sel.photo, sel.label); });
    pic.onerror = function () { pic.style.display = 'none'; };
    xb.addEventListener('mousedown', function (e) { e.preventDefault(); });
    xb.addEventListener('click', function () { inp.value = ''; inp.__lbxpSel = null; inp.__lbxpPick = null; if (priceInp) priceInp.value = ''; hide(); paint(); inp.focus(); });
    window.addEventListener('resize', paint);
    setInterval(function () { if (!inp.value && (xb.style.display !== 'none' || pic.style.display !== 'none')) paint(); }, 500);   // page cleared the box after Add
    function place() { var r = inp.getBoundingClientRect(); box.style.left = (r.left + window.scrollX) + 'px'; box.style.top = (r.bottom + window.scrollY + 4) + 'px'; box.style.width = Math.max(240, r.width) + 'px'; }
    function hide() { box.style.display = 'none'; idx = -1; }
    function pick(i) { var it = list[i]; if (!it) return; inp.value = it.name + (it.size ? ' (' + it.size + ')' : ''); hide();
      inp.__lbxpPick = it.price > 0 ? { code: it.code, name: inp.value, price: it.price } : null;
      inp.__lbxpSel = { label: inp.value, photo: it.photo || '' }; paint();
      if (priceInp) { if (it.price > 0) priceInp.value = it.price.toFixed(3); priceInp.focus(); priceInp.select && priceInp.select(); } }
    function show() {
      var q = inp.value.trim().toLowerCase(); if (q.length < 2) { hide(); return; }
      load().then(function (all) {
        var words = q.split(/\s+/);
        list = all.filter(function (it) { var h = (it.name + ' ' + it.code + ' ' + it.size).toLowerCase(); return words.every(function (w) { return h.indexOf(w) !== -1; }); }).slice(0, 40);
        box.innerHTML = list.length ? list.map(function (it, i) {
          return '<div class="o" data-i="' + i + '">' + (it.photo ? '<img loading="lazy" src="' + esc(it.photo) + '" alt="">' : '<span class="ph">📦</span>') +
            '<div style="flex:1"><div>' + esc(it.name) + (it.size ? ' <span class="c">' + esc(it.size) + '</span>' : '') + '</div><div class="c">' + esc(it.code) + '</div></div>' +
            (it.price > 0 ? '<b style="font-size:12px;white-space:nowrap">' + it.price.toFixed(3) + ' BD</b>' : '<span class="c">no price</span>') + '</div>';
        }).join('') + '<div class="n">Price is filled in — you can change it (a changed price is saved in the log).</div>' : '<div class="n">Not in Item Inventory — just type the name.</div>';
        idx = -1; place(); box.style.display = 'block';
      });
    }
    inp.addEventListener('input', function () { inp.__lbxpPick = null; paint(); show(); });
    inp.addEventListener('focus', function () { load(); if (inp.value.trim().length >= 2) show(); });
    inp.addEventListener('keydown', function (e) {
      if (box.style.display === 'none') return;
      var os = box.querySelectorAll('.o');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, Math.min(os.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1))); os.forEach(function (o, i) { o.classList.toggle('on', i === idx); }); if (os[idx]) os[idx].scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); pick(idx); }
      else if (e.key === 'Escape') hide();
    });
    box.addEventListener('mousedown', function (e) { var o = e.target.closest('.o'); if (o) { e.preventDefault(); pick(Number(o.getAttribute('data-i'))); } });
    inp.addEventListener('blur', function () { setTimeout(hide, 150); });
    window.addEventListener('resize', function () { if (box.style.display !== 'none') place(); });
    window.addEventListener('scroll', function () { if (box.style.display !== 'none') place(); }, true);
  }
  // call when the extra is added: logs it only if the price was changed from the Item Inventory sale price
  function noteAdd(inp, usedPrice, kind) {
    var pk = inp && inp.__lbxpPick; if (inp) inp.__lbxpPick = null;
    if (!pk || inp.value.trim() !== pk.name) return;
    var used = Number(usedPrice) || 0; if (Math.abs(used - pk.price) < 0.0005) return;
    var br = ''; try { var s = document.querySelector('.lbcs select'); br = (s && s.value) || ''; } catch (e) {}
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logExtraPrice', token: token(), kind: kind, branch: br,
      itemCode: pk.code, itemName: pk.name, listPrice: pk.price, usedPrice: used }) }).catch(function () {});
  }
  window.LBExtrasPick = { attach: attach, noteAdd: noteAdd };
})();
