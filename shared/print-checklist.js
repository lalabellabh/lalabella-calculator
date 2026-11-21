/* LALABELLA — Print an inventory checklist (Nov 21 2026, Bench).
 * One printable sheet for counting the shelf by hand: ☐ tick box, item (+ picture), code, unit, optional system qty,
 * a blank "Counted" box and an Expiry / Wastage / Notes column, grouped by category, with Counted by / Checked by lines.
 * Used by Chocolate Stock Count, Flower Stock Count, Item Inventory (Stock Count) and the Café Stock Room.
 *
 * LBChecklist.open({ title:'Chocolate', branch:'ModaMall', extra:'Expiry'|'Wastage'|'Notes',
 *                    rows:[{ name, code, group, unit, system, photo }] })
 */
(function () {
  if (window.LBChecklist) return;
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function today() { var d = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10).split('-'); return d[2] + '/' + d[1] + '/' + d[0]; }
  function n3(v) { return v == null || v === '' || isNaN(Number(v)) ? '' : String(Math.round(Number(v) * 1000) / 1000); }
  function get(k, d) { try { var v = localStorage.getItem('lbCk:' + k); return v == null ? d : v; } catch (e) { return d; } }
  function put(k, v) { try { localStorage.setItem('lbCk:' + k, v); } catch (e) {} }
  var css = '.lbck-bg{position:fixed;inset:0;z-index:2147483000;background:rgba(30,20,25,.5);display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto;font-family:"Space Grotesk",system-ui,sans-serif}' +
    '.lbck{background:#fff;color:#2a2024;border-radius:18px;width:min(460px,100%);padding:20px;box-shadow:0 24px 60px rgba(0,0,0,.3)}.lbck h3{margin:0 0 2px;font-size:18px}.lbck .s{color:#8c7c82;font-size:12.5px;margin-bottom:12px}' +
    '.lbck label{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid #f1e9ec;font-size:14px;cursor:pointer}.lbck label:first-of-type{border-top:0}.lbck input[type=checkbox]{width:18px;height:18px;accent-color:#9e2f4a;flex:none}' +
    '.lbck select,.lbck input[type=number]{margin-left:auto;font:inherit;font-size:13px;border:1px solid #eadfe3;border-radius:9px;padding:6px 8px;background:#fff;color:inherit;max-width:55%}' +
    '.lbck .row{display:flex;gap:8px;margin-top:14px}.lbck button{flex:1;border:1px solid #eadfe3;border-radius:11px;padding:11px;font:inherit;font-weight:600;font-size:14px;background:#fff;cursor:pointer;color:inherit}.lbck button.go{background:linear-gradient(135deg,#c9506b,#9e2f4a);color:#fff;border:0}';
  function sheet(o, opt) {
    var rows = o.rows.filter(function (r) { return r && r.name && (!opt.group || (r.group || 'Other') === opt.group); });
    if (opt.sort === 'name') rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    else rows.sort(function (a, b) { return String(a.group || 'Other').localeCompare(String(b.group || 'Other')) || String(a.name).localeCompare(String(b.name)); });
    var cols = '<th class="c">✓</th><th class="n">#</th><th>Item</th><th>Code</th><th>Unit</th>' + (opt.sys ? '<th class="q">System</th>' : '') + '<th class="q">Counted</th>' + (o.extra ? '<th class="x">' + esc(o.extra) + '</th>' : '') + '<th class="x">Notes</th>';
    var span = 7 + (opt.sys ? 1 : 0) + (o.extra ? 1 : 0), last = null, no = 0, body = '';
    rows.forEach(function (r) {
      var g = r.group || 'Other';
      if (opt.sort !== 'name' && g !== last) { body += '<tr class="g"><td colspan="' + span + '">' + esc(g) + '</td></tr>'; last = g; }
      no++;
      body += '<tr><td class="c"><span class="bx"></span></td><td class="n">' + no + '</td><td>' + (opt.pics && r.photo ? '<img src="' + esc(r.photo) + '" alt="">' : '') + '<b>' + esc(r.name) + '</b></td><td class="m">' + esc(r.code || '') + '</td><td>' + esc(r.unit || '') + '</td>' +
        (opt.sys ? '<td class="q">' + esc(n3(r.system)) + '</td>' : '') + '<td class="q w"></td>' + (o.extra ? '<td class="x"></td>' : '') + '<td class="x"></td></tr>';
    });
    for (var i = 0; i < opt.blank; i++) body += '<tr><td class="c"><span class="bx"></span></td><td class="n">＋</td><td></td><td></td><td></td>' + (opt.sys ? '<td></td>' : '') + '<td class="w"></td>' + (o.extra ? '<td></td>' : '') + '<td></td></tr>';
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(o.title) + ' checklist · ' + esc(o.branch || '') + '</title><style>' +
      '@page{size:A4;margin:12mm 10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;font-size:11.5px}' +
      'h1{font-size:19px;margin:0}.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:6px}.meta{font-size:12px;line-height:1.7}' +
      '.lines{display:flex;gap:18px;font-size:12px;margin:6px 0 10px}.lines span{flex:1;border-bottom:1px solid #000;padding-bottom:2px}' +
      'table{width:100%;border-collapse:collapse}thead{display:table-header-group}th,td{border:1px solid #555;padding:4px 5px;vertical-align:middle}th{background:#eee;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em}' +
      'tr{page-break-inside:avoid}td{height:' + (opt.pics ? 15 : 8.5) + 'mm}.g td{background:#f4f4f4;font-weight:700;height:auto;padding:5px;font-size:11px;letter-spacing:.04em;text-transform:uppercase}' +
      '.c{width:8mm;text-align:center}.n{width:8mm;text-align:center;color:#555}.q{width:19mm;text-align:center}.w{background:#fffdf2}.x{width:24mm}.m{font-family:monospace;font-size:10.5px;width:24mm}' +
      '.bx{display:inline-block;width:4.2mm;height:4.2mm;border:1.4px solid #000;border-radius:1mm}img{width:13mm;height:13mm;object-fit:cover;float:left;margin-right:6px;border:1px solid #999}' +
      '.foot{display:flex;gap:30px;margin-top:16px;font-size:12px}.foot div{flex:1}.foot span{display:block;border-bottom:1px solid #000;height:20px;margin-top:4px}' +
      '@media screen{body{padding:14mm;max-width:210mm;margin:0 auto}}' +
      '</style></head><body><div class="top"><div><h1>Lalabella — ' + esc(o.title) + ' inventory checklist</h1><div class="meta">Branch: <b>' + esc(o.branch || '—') + '</b> · ' + no + ' items' + (opt.group ? ' · ' + esc(opt.group) : '') + (opt.sys ? '' : ' · blind count (system qty hidden)') + '</div></div>' +
      '<div class="meta" style="text-align:right">Printed ' + today() + '</div></div>' +
      '<div class="lines"><span>Count date:</span><span>Counted by:</span><span>Checked by:</span></div>' +
      '<table><thead><tr>' + cols + '</tr></thead><tbody>' + body + '</tbody></table>' +
      '<div class="foot"><div>Counted by (sign)<span></span></div><div>Checked by (sign)<span></span></div><div>Entered in the system on<span></span></div></div>' +
      '<script>window.onload=function(){var im=[].slice.call(document.images),n=im.length,go=function(){setTimeout(function(){window.focus();window.print();},150)};if(!n)return go();var k=0;im.forEach(function(i){if(i.complete){if(++k===n)go();}else i.onload=i.onerror=function(){if(++k===n)go();};});setTimeout(go,4000);};<\/script></body></html>';
  }
  function printDoc(html) {
    var w = null; try { w = window.open('', '_blank'); } catch (e) {}
    if (w && w.document) { w.document.open(); w.document.write(html); w.document.close(); return; }
    var f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close(); setTimeout(function () { f.remove(); }, 60000);
  }
  function open(o) {
    o = o || {}; var rows = (o.rows || []).filter(function (r) { return r && r.name; });
    if (!rows.length) { alert('No items to print yet' + (o.hint ? ' — ' + o.hint : '.')); return; }
    if (!document.getElementById('lbckCss')) { var s = document.createElement('style'); s.id = 'lbckCss'; s.textContent = css; document.head.appendChild(s); }
    var groups = rows.map(function (r) { return r.group || 'Other'; }).filter(function (g, i, a) { return a.indexOf(g) === i; }).sort();
    var hasSys = rows.some(function (r) { return r.system != null && r.system !== ''; }), hasPic = rows.some(function (r) { return r.photo; }), key = o.title || 'x';
    var bg = document.createElement('div'); bg.className = 'lbck-bg';
    bg.innerHTML = '<div class="lbck" role="dialog" aria-modal="true"><h3>🧾 ' + esc(o.title) + ' checklist</h3><div class="s">' + esc(o.branch || '') + ' · ' + rows.length + ' items · prints on A4 with tick boxes and blank "Counted" boxes</div>' +
      (groups.length > 1 ? '<label>Category<select data-k="group"><option value="">All categories</option>' + groups.map(function (g) { return '<option>' + esc(g) + '</option>'; }).join('') + '</select></label>' : '') +
      '<label>Order<select data-k="sort"><option value="group">By category</option><option value="name">A → Z</option></select></label>' +
      (hasSys ? '<label><input type="checkbox" data-k="sys"' + (get(key + ':sys', '0') === '1' ? ' checked' : '') + '> Show system qty <span style="color:#8c7c82;font-size:12px">(off = blind count)</span></label>' : '') +
      (hasPic ? '<label><input type="checkbox" data-k="pics"' + (get(key + ':pics', '0') === '1' ? ' checked' : '') + '> Show pictures</label>' : '') +
      '<label>Blank lines for extra items<input type="number" data-k="blank" min="0" max="30" value="' + esc(get(key + ':blank', '5')) + '"></label>' +
      '<div class="row"><button data-k="x">Cancel</button><button class="go" data-k="go">🖨️ Print</button></div></div>';
    document.body.appendChild(bg);
    var q = function (k) { return bg.querySelector('[data-k="' + k + '"]'); };
    bg.addEventListener('click', function (e) { if (e.target === bg || e.target === q('x')) bg.remove(); });
    q('go').onclick = function () {
      var opt = { group: q('group') ? q('group').value : '', sort: q('sort').value, sys: !!(q('sys') && q('sys').checked), pics: !!(q('pics') && q('pics').checked), blank: Math.max(0, Math.min(30, Number(q('blank').value) || 0)) };
      put(key + ':sys', opt.sys ? '1' : '0'); put(key + ':pics', opt.pics ? '1' : '0'); put(key + ':blank', String(opt.blank));
      printDoc(sheet({ title: o.title, branch: o.branch, extra: o.extra, rows: rows }, opt)); bg.remove();
    };
  }
  window.LBChecklist = { open: open };
})();
