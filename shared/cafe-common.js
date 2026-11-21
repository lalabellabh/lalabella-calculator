/* LALABELLA — Café pages common bits (Nov 21 2026): API, token, small helpers, item picture form, tabs.
   Used by cafe-inventory.html (items + stock), cafe-receiving.html, cafe-stock-count.html. Backend: cafe-fast. */
(function () {
  var API = (window.LB_CONFIG && LB_CONFIG.CAFE_API) || 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/cafe-fast';
  var esc = window.lbEsc || function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function token() { try { return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; } }
  function api(body) { body.token = token(); return fetch(API, { method: 'POST', body: new URLSearchParams(body) }).then(function (r) { return r.json(); }); }
  function today() { return new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10); }
  function n3(v) { return v == null || v === '' ? '' : String(Math.round(Number(v) * 1000) / 1000); }
  function fd(d) { if (!d) return ''; var p = String(d).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function me() { try { return JSON.parse(sessionStorage.getItem('lalabellaUser') || localStorage.getItem('lalabellaUser') || '{}') || {}; } catch (e) { return {}; } }
  var UNITS = ['pcs', 'kg', 'g', 'liters', 'ml', 'boxes', 'packs', 'bottles', 'sets'];
  // tabs on top of every café page
  function tabs(active) {
    var T = [['cafe-inventory.html', '☕', 'Café Items'], ['cafe-receiving.html', '🛒', 'Receiving'], ['cafe-stock-count.html', '📋', 'Stock Count'], ['cafe-dashboard.html', '📊', 'Dashboard']];
    return '<div class="cf-tabs">' + T.map(function (t) { return '<a href="' + t[0] + '"' + (t[0] === active ? ' class="on"' : '') + '>' + t[1] + ' ' + t[2] + '</a>'; }).join('') + '</div>';
  }
  function shrink(file) { return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { var im = new Image(); im.onload = function () {
    var m = 1000, k = Math.min(1, m / Math.max(im.width, im.height)); var c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .82)); }; im.onerror = function () { res(''); }; im.src = fr.result; }; fr.onerror = function () { res(''); }; fr.readAsDataURL(file); }); }
  function zoom(src) { var z = document.createElement('div'); z.className = 'cf-zoom'; z.innerHTML = '<img src="' + esc(src) + '" alt="">'; z.onclick = function () { z.remove(); }; document.body.appendChild(z); }
  // add / edit one café item (Admin) — name, group, unit, code, picture
  function itemForm(item, groups, after) {
    var it = item || { name: '', category: '', unit: 'pcs', photo: '', code: '' }, newPic = null;
    var bg = document.createElement('div'); bg.className = 'cf-bg';
    bg.innerHTML = '<div class="cf-ed"><h3>' + (item ? '✏️ Edit café item' : '＋ New café item') + '</h3>' +
      '<label>Name</label><input data-k="name" maxlength="120" value="' + esc(it.name) + '" placeholder="e.g. Monin Caramel Syrup">' +
      '<label>Group</label><input data-k="category" list="cfGroups" maxlength="60" value="' + esc(it.category) + '" placeholder="e.g. Syrups"><datalist id="cfGroups">' + (groups || []).map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
      '<label>Unit</label><select data-k="unit">' + UNITS.map(function (u) { return '<option' + (u === it.unit ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select>' +
      '<label>Item Inventory / Odoo code <span style="font-weight:400">(optional)</span></label><input data-k="code" maxlength="40" value="' + esc(it.code || '') + '" placeholder="e.g. OZH-00190">' +
      '<label>📷 Picture</label><input type="file" accept="image/*" data-k="file"><div class="cf-paste" tabindex="0">📋 …or click here and press <b>Ctrl+V</b> to paste a picture</div>' +
      '<img class="cf-prev" data-k="img"' + (it.photo ? ' src="' + esc(it.photo) + '" style="display:block"' : '') + '>' +
      (item && it.photo ? '<label style="font-weight:400"><input type="checkbox" data-k="nopic" style="width:auto"> Remove the picture</label>' : '') +
      '<div class="cf-row">' + (item ? '<button class="cf-btn" data-k="del" style="margin-right:auto;color:#c5483a">🗑️ Remove item</button>' : '') + '<button class="cf-btn" data-k="x">Cancel</button><button class="cf-btn ok" data-k="sv">Save</button></div></div>';
    document.body.appendChild(bg);
    var q = function (k) { return bg.querySelector('[data-k="' + k + '"]'); };
    var setPic = function (f) { if (!f) return; shrink(f).then(function (d) { if (!d) { alert('That is not a picture.'); return; } newPic = d; q('img').src = d; q('img').style.display = 'block'; }); };
    q('file').onchange = function () { setPic(this.files[0]); };
    bg.addEventListener('paste', function (e) { var f = [].slice.call((e.clipboardData || {}).items || []).map(function (x) { return x.kind === 'file' ? x.getAsFile() : null; }).filter(Boolean)[0]; if (f) { e.preventDefault(); setPic(f); } });
    bg.addEventListener('click', function (e) { if (e.target === bg || e.target === q('x')) bg.remove(); });
    if (q('del')) q('del').onclick = function () { if (!confirm('Remove "' + it.name + '" from the café list?\nIts receiving and counts are kept.')) return; api({ action: 'deleteItem', id: it.id }).then(function (d) { if (!d.success) { alert(d.error || 'Not removed.'); return; } bg.remove(); after && after(); }); };
    q('sv').onclick = function () {
      var name = q('name').value.trim(); if (!name) { alert('Type the item name.'); return; }
      var b = this; b.disabled = true; b.textContent = 'Saving…';
      var done = function (d) { if (!d || !d.success) { alert((d && d.error) || 'Not saved.'); b.disabled = false; b.textContent = 'Save'; return; } bg.remove(); after && after(); };
      if (!item) return api({ action: 'addItem', name: name, category: q('category').value.trim(), unit: q('unit').value, photo: newPic || '' }).then(function (d) {
        if (d && d.success && q('code').value.trim()) return api({ action: 'editItem', id: d.id, code: q('code').value.trim() }).then(function () { done(d); }); done(d); }).catch(function () { done(null); });
      api({ action: 'editItem', id: it.id, name: name, category: q('category').value.trim(), unit: q('unit').value, code: q('code').value.trim() }).then(function (d) {
        if (!d || !d.success) return done(d);
        if (newPic) return api({ action: 'setPhoto', id: it.id, photo: newPic }).then(done);
        if (q('nopic') && q('nopic').checked) return api({ action: 'setPhoto', id: it.id, photo: '' }).then(done);
        done(d);
      }).catch(function () { done(null); });
    };
    setTimeout(function () { q('name').focus(); }, 50);
  }
  var css = '.cf-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 12px}.cf-tabs a{padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.85);border:1px solid #ecdfe3;color:#5a3a46;font-weight:700;font-size:13px;text-decoration:none}.cf-tabs a.on{background:linear-gradient(135deg,#c9506b,#9e2f4a);color:#fff;border-color:transparent}' +
    '.cf-bg{position:fixed;inset:0;z-index:2147483000;background:rgba(40,20,30,.45);display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}' +
    '.cf-ed{background:#fff;border-radius:16px;width:min(460px,100%);padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.25);font-family:"Space Grotesk",Arial,sans-serif;color:#2a1c22}.cf-ed h3{margin:0 0 8px;font-size:17px}' +
    '.cf-ed label{display:block;font-size:12px;font-weight:700;color:#7a6670;margin:10px 0 4px}.cf-ed input,.cf-ed select{width:100%;box-sizing:border-box;font:inherit;font-size:14px;border:1px solid #ecdfe3;border-radius:10px;padding:8px 10px}' +
    '.cf-row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}.cf-btn{font:inherit;font-size:13px;border:1px solid #ecdfe3;border-radius:10px;padding:8px 14px;background:#fff;cursor:pointer}.cf-btn.ok{background:#2f7a4f;color:#fff;border:0;font-weight:700}' +
    '.cf-prev{display:none;max-width:100%;max-height:220px;border-radius:12px;margin-top:8px}.cf-paste{margin-top:6px;padding:9px;border:1px dashed #d9c7bd;border-radius:10px;font-size:12px;color:#7a6670;text-align:center}' +
    '.cf-zoom{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;cursor:zoom-out}.cf-zoom img{max-width:92vw;max-height:88vh;border-radius:12px}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  window.LBCafe = { api: api, esc: esc, today: today, n3: n3, fd: fd, me: me, tabs: tabs, itemForm: itemForm, zoom: zoom, UNITS: UNITS };
})();
