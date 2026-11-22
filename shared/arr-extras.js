/* LALABELLA — Extras rows for the Arrangement Catalogs (Nov 22 2026, Bench).
 * Box / vase / wrapping / ribbon / hand work… picked from the Item Inventory (LBExtrasPick: picture + price) or typed.
 *   var X = LBArrExtras.mount(containerEl, onChange)  →  X.get() [{desc, price}] · X.set(list) · X.total() · X.add()
 * Needs shared/extras-pick.js loaded first (falls back to plain inputs without it).
 */
(function () {
  if (window.LBArrExtras) return;
  var css = '.axr{display:grid;grid-template-columns:minmax(0,1fr) 96px 34px;gap:8px;margin-bottom:8px;align-items:center;position:relative}' +
    '.axr input{margin:0!important}.axr .x{background:none;border:0;color:#c0392b;font-size:18px;cursor:pointer;padding:4px}' +
    '.ax-add{font-size:12.5px;color:#8a5a2b;background:none;border:1px dashed #d9a441;border-radius:9px;padding:8px 14px;cursor:pointer;margin-bottom:14px}';
  function mount(box, onChange) {
    if (!document.getElementById('axCss')) { var s = document.createElement('style'); s.id = 'axCss'; s.textContent = css; document.head.appendChild(s); }
    var rows = document.createElement('div'), add = document.createElement('button');
    add.type = 'button'; add.className = 'ax-add'; add.textContent = '+ Add extra (box, vase, wrapping…)';
    box.appendChild(rows); box.appendChild(add);
    function fire() { try { onChange && onChange(); } catch (e) {} }
    function addRow(desc, price) {
      var r = document.createElement('div'); r.className = 'axr';
      r.innerHTML = '<input type="text" class="ax-d" placeholder="Extra — type to search Item Inventory" autocomplete="off"><input type="number" class="ax-p" placeholder="Price" min="0" step="0.001"><button type="button" class="x" aria-label="Remove">✕</button>';
      var d = r.querySelector('.ax-d'), p = r.querySelector('.ax-p');
      d.value = desc || ''; p.value = price ? Number(price).toFixed(3) : '';
      r.querySelector('.x').onclick = function () { r.remove(); fire(); };
      d.addEventListener('input', fire); p.addEventListener('input', fire); d.addEventListener('change', fire);
      rows.appendChild(r);
      try { LBExtrasPick.attach(d, p); } catch (e) {}
      fire(); return d;
    }
    add.onclick = function () { addRow().focus(); };
    var api = {
      add: addRow,
      get: function () { return [].slice.call(rows.querySelectorAll('.axr')).map(function (r) { return { desc: r.querySelector('.ax-d').value.trim(), price: Math.round((parseFloat(r.querySelector('.ax-p').value) || 0) * 1000) / 1000 }; }).filter(function (x) { return x.desc; }); },
      set: function (list) { rows.innerHTML = ''; (list || []).forEach(function (x) { addRow(x.desc, x.price); }); fire(); },
      total: function () { return api.get().reduce(function (a, x) { return a + x.price; }, 0); }
    };
    return api;
  }
  window.LBArrExtras = { mount: mount };
})();
