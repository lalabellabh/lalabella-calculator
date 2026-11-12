/* LALABELLA — Extras picker (Nov 2026).
 * Typing in the Extras name box (Flower Calc / Chocolate Calc) shows matching Item Inventory names (vase, box, ribbon…)
 * with their picture and code. Name only — the price stays manual (ask the admin). Anything not in the list can still be typed.
 * Use: LBExtrasPick.attach(inputElement, priceInputElement?)
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
    '.lbxp .c{font-size:10.5px;color:#8a7680}.lbxp .n{font-size:11.5px;color:#8a7680;padding:6px 8px}';
  document.head.appendChild(css);

  function attach(inp, priceInp) {
    if (!inp || inp.__lbxp) return; inp.__lbxp = 1; inp.setAttribute('autocomplete', 'off');
    var box = document.createElement('div'); box.className = 'lbxp'; box.style.display = 'none'; document.body.appendChild(box);
    var list = [], idx = -1;
    function place() { var r = inp.getBoundingClientRect(); box.style.left = (r.left + window.scrollX) + 'px'; box.style.top = (r.bottom + window.scrollY + 4) + 'px'; box.style.width = Math.max(240, r.width) + 'px'; }
    function hide() { box.style.display = 'none'; idx = -1; }
    function pick(i) { var it = list[i]; if (!it) return; inp.value = it.name + (it.size ? ' (' + it.size + ')' : ''); hide(); if (priceInp) { priceInp.focus(); priceInp.select && priceInp.select(); } }
    function show() {
      var q = inp.value.trim().toLowerCase(); if (q.length < 2) { hide(); return; }
      load().then(function (all) {
        var words = q.split(/\s+/);
        list = all.filter(function (it) { var h = (it.name + ' ' + it.code + ' ' + it.size).toLowerCase(); return words.every(function (w) { return h.indexOf(w) !== -1; }); }).slice(0, 40);
        box.innerHTML = list.length ? list.map(function (it, i) {
          return '<div class="o" data-i="' + i + '">' + (it.photo ? '<img loading="lazy" src="' + esc(it.photo) + '" alt="">' : '<span class="ph">📦</span>') +
            '<div><div>' + esc(it.name) + (it.size ? ' <span class="c">' + esc(it.size) + '</span>' : '') + '</div><div class="c">' + esc(it.code) + '</div></div></div>';
        }).join('') + '<div class="n">Price: type it yourself (ask the admin).</div>' : '<div class="n">Not in Item Inventory — just type the name.</div>';
        idx = -1; place(); box.style.display = 'block';
      });
    }
    inp.addEventListener('input', show);
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
  window.LBExtrasPick = { attach: attach };
})();
