/* LALABELLA — "✓ Sold" for the Flower Calc and Chocolate Calc (Nov 2026).
 * While Odoo is not live, a sale made with the calc is taken out of the chosen branch's stock.
 * The page tells us how to read its list:  LBCalcSale.mount({ kind, anchor, branchSelect?, get })
 *   get() -> { items:[...], extrasTotal:number, customer:string }
 * Server: calcsale-fast (saveFlowerSale / saveChocolateSale). Admin can cancel a sale in calc-sales.html.
 */
(function () {
  'use strict';
  var API = (window.LB_CONFIG && LB_CONFIG.CALC_SALE_API) || 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/calcsale-fast';
  var BR = ['ModaMall', 'Hamala', 'Galali'];
  var SOURCES = [['Walk-in', '🚶'], ['Pick-up', '🛍️'], ['Website order', '🌐'], ['WhatsApp', '💬'], ['Corporate', '🏢'], ['Others', '📝']];
  function token() { try { return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; } }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brKey(b) { b = String(b || '').toLowerCase().replace(/[^a-z]/g, ''); return b === 'qalali' ? 'galali' : b; }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  function mount(o) {
    var css = document.createElement('style');
    css.textContent = '.lbcs{margin-top:14px;border:2px dashed #2f7a4f;border-radius:14px;padding:12px;background:rgba(240,250,244,.9)}' +
      '.lbcs h4{margin:0 0 4px;font-size:14px;color:#1f5a38}.lbcs .s{font-size:11.5px;color:#5a6a60;margin-bottom:8px}' +
      '.lbcs .row{display:flex;gap:8px;flex-wrap:wrap}.lbcs select,.lbcs input{flex:1;min-width:120px;font:inherit;font-size:13px;padding:8px 10px;border:1px solid #b9d6c4;border-radius:9px;background:#fff;color:#1f2a24}' +
      '.lbcs button.go{width:100%;margin-top:8px;border:0;border-radius:11px;padding:11px;font:inherit;font-weight:800;font-size:15px;background:linear-gradient(135deg,#2f7a4f,#3f9a65);color:#fff;cursor:pointer}' +
      '.lbcs button.go:disabled{opacity:.6;cursor:wait}.lbcs .res{margin-top:8px;font-size:12.5px;line-height:1.45}.lbcs .res .ok{color:#1f5a38;font-weight:700}.lbcs .res .warn{color:#a8560b}' +
      '.lbcs .off{font-size:12px;color:#7a6670}';
    document.head.appendChild(css);
    var box = document.createElement('div'); box.className = 'lbcs';
    var ownBranch = !o.branchSelect;
    box.innerHTML = '<h4>✓ Sold — take out of stock</h4><div class="s">Press only when the customer is <b>sure</b> and it is sold. For a quotation or if they are only looking, just <b>Print</b> — nothing leaves the stock.</div>' +
      '<div class="row">' + (ownBranch ? '<select data-br><option value="">— branch —</option>' + BR.map(function (b) { return '<option>' + b + '</option>'; }).join('') + '</select>' : '') +
      '<select data-src style="flex:0 1 170px"><option value="">Source — pick —</option>' + SOURCES.map(function (x) { return '<option value="' + x[0] + '">' + x[1] + ' ' + x[0] + '</option>'; }).join('') + '</select>' +
      '<input data-ref placeholder="Invoice no. or customer name / phone" maxlength="60"></div>' +
      '<button class="go" type="button">✓ Sold</button><div class="res"></div>';
    o.anchor.parentNode.insertBefore(box, o.anchor.nextSibling);
    var brSel = o.branchSelect || box.querySelector('[data-br]'), btn = box.querySelector('.go'), res = box.querySelector('.res');
    // branch: remembered, else the staff's own branch
    var saved = ls('lbCalcSaleBranch');
    function pick(v) { if (!v || brSel.value) return; for (var i = 0; i < brSel.options.length; i++) { if (brKey(brSel.options[i].value) === brKey(v)) { brSel.value = brSel.options[i].value; return; } } }
    pick(saved);
    brSel.addEventListener('change', function () { ls('lbCalcSaleBranch', brSel.value); });
    var srcSel = box.querySelector('[data-src]');
    var lastSig = '', lastNo = '';
    fetch(API + '?action=getMode&token=' + encodeURIComponent(token())).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.success) return;
      pick(d.userBranch);
      if (d.mode === 'odoo') box.innerHTML = '<div class="off">🔗 Odoo now takes sales out of stock — this calc is for quotes and printing only.</div>';
    }).catch(function () {});

    btn.addEventListener('click', function () {
      var g = o.get() || {}, items = g.items || [];
      var branch = brSel.value;
      var src = srcSel.value;
      var g0 = o.get() || {}; var refVal = (box.querySelector('[data-ref]').value || '').trim() || String(g0.customer || '').trim() || src;
      if (!branch) { alert('Choose the branch first.'); brSel.focus(); return; }
      if (!src) { alert('Choose the source first (Walk-in, Pick-up, Website order, WhatsApp, Corporate or Others).'); srcSel.focus(); return; }
      if (!items.length) { alert('The list is empty.'); return; }
      var sig = JSON.stringify([branch, items]);
      if (sig === lastSig && !confirm('This same list was already sold (' + lastNo + '). Take it out of stock again?')) return;
      var lines = items.map(function (it) { return '• ' + it.name + ' — ' + (o.kind === 'flower' ? it.qty + ' stem(s)' : (it.mode === 'pieces' ? it.amount + ' pcs' : (Number(it.kg) || 0).toFixed(3) + ' kg')); }).join('\n');
      if (!confirm('Source: ' + src + (refVal !== src ? '\nSold to: ' + refVal : '') + '\nTake this out of ' + branch + ' stock?\n\n' + lines)) return;
      btn.disabled = true; btn.textContent = 'Saving…'; res.innerHTML = '';
      var body = new URLSearchParams({ action: o.kind === 'flower' ? 'saveFlowerSale' : 'saveChocolateSale', token: token(), branch: branch, source: src, ref: refVal, customer: g.customer || (refVal === src ? src : ''), extras: String(g.extrasTotal || 0), items: JSON.stringify(items) });
      fetch(API, { method: 'POST', body: body }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.success) { res.innerHTML = '<span class="warn">⚠ ' + esc((d && d.error) || 'Not saved.') + '</span>'; return; }
        lastSig = sig; lastNo = d.saleNo;
        var sh = (d.short || []).map(function (s) { return '<div class="warn">⚠ ' + esc(s.name) + ': needed ' + esc(s.need) + ', the system has only ' + esc(s.have) + '</div>'; }).join('');
        res.innerHTML = '<div class="ok">✓ ' + esc(src) + (refVal !== src ? ' · sold to ' + esc(refVal) : '') + ' — taken out of ' + esc(d.branch) + ' stock · ' + esc(d.saleNo) + (d.releaseNo ? ' · ' + esc(d.releaseNo) : '') + '</div>' + (sh ? sh + '<div class="s" style="margin:4px 0 0">Saved anyway. The next stock count will show the difference.</div>' : '');
        box.querySelector('[data-ref]').value = ''; srcSel.value = '';
      }).catch(function () { res.innerHTML = '<span class="warn">⚠ Connection problem. Please try again.</span>'; })
        .then(function () { btn.disabled = false; btn.textContent = '✓ Sold'; });
    });
  }
  window.LBCalcSale = { mount: mount };
})();
