/* LALABELLA — "✓ Benta na" for the Flower Calc and Chocolate Calc (Nov 2026).
 * While Odoo is not live, a sale made with the calc is taken out of the chosen branch's stock.
 * The page tells us how to read its list:  LBCalcSale.mount({ kind, anchor, branchSelect?, get })
 *   get() -> { items:[...], extrasTotal:number, customer:string }
 * Server: calcsale-fast (saveFlowerSale / saveChocolateSale). Admin can cancel a sale in calc-sales.html.
 */
(function () {
  'use strict';
  var API = (window.LB_CONFIG && LB_CONFIG.CALC_SALE_API) || 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/calcsale-fast';
  var BR = ['ModaMall', 'Hamala', 'Galali'];
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
    box.innerHTML = '<h4>✓ Benta na — ibawas sa stock</h4><div class="s">Pindutin lang kapag nabenta na talaga (hindi sa quote). Mababawas ang lahat ng nasa listahan sa stock ng branch.</div>' +
      '<div class="row">' + (ownBranch ? '<select data-br><option value="">— branch —</option>' + BR.map(function (b) { return '<option>' + b + '</option>'; }).join('') + '</select>' : '') +
      '<input data-ref placeholder="Invoice / order no. (optional)" maxlength="60"></div>' +
      '<button class="go" type="button">✓ Benta na</button><div class="res"></div>';
    o.anchor.parentNode.insertBefore(box, o.anchor.nextSibling);
    var brSel = o.branchSelect || box.querySelector('[data-br]'), btn = box.querySelector('.go'), res = box.querySelector('.res');
    // branch: remembered, else the staff's own branch
    var saved = ls('lbCalcSaleBranch');
    function pick(v) { if (!v || brSel.value) return; for (var i = 0; i < brSel.options.length; i++) { if (brKey(brSel.options[i].value) === brKey(v)) { brSel.value = brSel.options[i].value; return; } } }
    pick(saved);
    brSel.addEventListener('change', function () { ls('lbCalcSaleBranch', brSel.value); });
    var lastSig = '', lastNo = '';
    fetch(API + '?action=getMode&token=' + encodeURIComponent(token())).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.success) return;
      pick(d.userBranch);
      if (d.mode === 'odoo') box.innerHTML = '<div class="off">🔗 Odoo ang nagbabawas ng stock ngayon — pang-quote na lang ang calc.</div>';
    }).catch(function () {});

    btn.addEventListener('click', function () {
      var g = o.get() || {}, items = g.items || [];
      var branch = brSel.value;
      if (!branch) { alert('Piliin muna ang branch.'); brSel.focus(); return; }
      if (!items.length) { alert('Walang laman ang listahan.'); return; }
      var sig = JSON.stringify([branch, items]);
      if (sig === lastSig && !confirm('Na-benta mo na ang listahang ito (' + lastNo + '). Ibawas ulit?')) return;
      var lines = items.map(function (it) { return '• ' + it.name + ' — ' + (o.kind === 'flower' ? it.qty + ' stem(s)' : (it.mode === 'pieces' ? it.amount + ' pcs' : (Number(it.kg) || 0).toFixed(3) + ' kg')); }).join('\n');
      if (!confirm('Ibawas sa stock ng ' + branch + '?\n\n' + lines)) return;
      btn.disabled = true; btn.textContent = 'Ibinabawas…'; res.innerHTML = '';
      var body = new URLSearchParams({ action: o.kind === 'flower' ? 'saveFlowerSale' : 'saveChocolateSale', token: token(), branch: branch, ref: box.querySelector('[data-ref]').value, customer: g.customer || '', extras: String(g.extrasTotal || 0), items: JSON.stringify(items) });
      fetch(API, { method: 'POST', body: body }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.success) { res.innerHTML = '<span class="warn">⚠ ' + esc((d && d.error) || 'Hindi na-save.') + '</span>'; return; }
        lastSig = sig; lastNo = d.saleNo;
        var sh = (d.short || []).map(function (s) { return '<div class="warn">⚠ ' + esc(s.name) + ': kailangan ' + esc(s.need) + ', ' + esc(s.have) + ' lang sa system</div>'; }).join('');
        res.innerHTML = '<div class="ok">✓ Nabawas sa ' + esc(d.branch) + ' — ' + esc(d.saleNo) + (d.releaseNo ? ' · ' + esc(d.releaseNo) : '') + '</div>' + (sh ? sh + '<div class="s" style="margin:4px 0 0">Na-save pa rin. Lalabas ito sa susunod na stock count.</div>' : '');
        box.querySelector('[data-ref]').value = '';
      }).catch(function () { res.innerHTML = '<span class="warn">⚠ Connection problem. Subukan ulit.</span>'; })
        .then(function () { btn.disabled = false; btn.textContent = '✓ Benta na'; });
    });
  }
  window.LBCalcSale = { mount: mount };
})();
