/* LALABELLA — History Tools (shared)
 * Adds to any history list: date range filter (From / To), text search (invoice no, name, batch…),
 * optional dropdown filters, a result summary, and a Print button with a PREVIEW before printing.
 *
 *   const HT = HistoryTools.create({
 *     listEl: document.getElementById('historyList'),   // toolbar is inserted right above this element
 *     title: 'Chocolate Receiving',
 *     getDate: r => r['Receive Date'],
 *     getText: r => [r['Chocolate Name'], r['Supplier'], r['Batch No.']].join(' '),
 *     columns: [{h:'Date', v:r=>...}, {h:'Item', v:r=>...}, {h:'Qty', v:r=>..., right:true, sum:true}],
 *     selects: [{label:'Branch', get:r=>r.Branch}],     // optional, options built from the data
 *     subtitle: () => 'Muharraq',                       // optional extra line on the print
 *     limit: 40,                                        // rows shown when NO filter is active (print always prints all matches)
 *     onChange: () => renderHistory()
 *   });
 *   const rows = HT.apply(allRows);   // inside your render function: filtered (+limited) rows, newest first
 *   HT.setRows(allRows)               // optional: keeps the select options up to date
 *
 * Nothing here talks to the server — it only filters the rows the page already loaded.
 */
(function(){
  'use strict';
  if (window.HistoryTools) return;

  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  // any date value -> 'YYYY-MM-DD' (local day), or '' when unreadable
  function ymd(v){
    if (v == null || v === '') return '';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    var d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fmtDay(s){
    if (!s) return '—';
    var d = new Date(s + 'T00:00:00');
    return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  var CSS = '' +
  '.ht-bar{background:rgba(255,255,255,.55);border:1px solid rgba(201,80,107,.18);border-radius:14px;padding:10px 10px 8px;margin:0 0 12px;}' +
  '.ht-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:8px;align-items:end;}' +
  '.ht-grid label{display:block;font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:#8a6f76;font-weight:700;margin:0 0 3px;}' +
  '.ht-grid input,.ht-grid select{width:100%;box-sizing:border-box;margin:0;padding:8px 9px;border:1px solid #eadbdd;border-radius:10px;font:inherit;font-size:12.5px;background:#fffaf9;color:#3a2530;}' +
  '.ht-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px;}' +
  '.ht-btn{font:inherit;font-size:11.5px;font-weight:700;padding:7px 12px;border-radius:10px;border:1px solid rgba(201,80,107,.28);background:#fff;color:#9e2f4a;cursor:pointer;}' +
  '.ht-btn:hover{box-shadow:0 5px 13px rgba(158,47,74,.10);}' +
  '.ht-btn.main{background:linear-gradient(135deg,#c9506b,#9e2f4a);color:#fff;border-color:transparent;}' +
  '.ht-sum{font-size:11.5px;color:#8a6f76;font-weight:600;margin-left:auto;}' +
  '#htPrevModal{position:fixed;inset:0;z-index:9600;background:rgba(40,20,28,.55);display:none;align-items:center;justify-content:center;padding:14px;}' +
  '#htPrevModal.open{display:flex;}' +
  '#htPrevModal .box{background:#fff;border-radius:16px;width:100%;max-width:980px;height:100%;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35);}' +
  '#htPrevModal .head{display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid #eee;font-weight:700;color:#3a2530;font-size:13px;}' +
  '#htPrevModal .head span{flex:1;}' +
  '#htPrevModal iframe{flex:1;border:0;width:100%;background:#fff;}';

  function injectCss(){
    if (document.getElementById('htCss')) return;
    var s = document.createElement('style'); s.id = 'htCss'; s.textContent = CSS; document.head.appendChild(s);
  }

  var modalReady = false, frame = null;
  function ensureModal(){
    if (modalReady) return;
    var m = document.createElement('div'); m.id = 'htPrevModal';
    m.innerHTML = '<div class="box"><div class="head"><span>🖨️ Print preview</span>' +
      '<button type="button" class="ht-btn main" id="htDoPrint">🖨️ Print</button>' +
      '<button type="button" class="ht-btn" id="htClosePrev">✕ Close</button></div>' +
      '<iframe id="htPrevFrame" title="Print preview"></iframe></div>';
    document.body.appendChild(m);
    frame = m.querySelector('#htPrevFrame');
    m.addEventListener('click', function(e){ if (e.target === m) m.classList.remove('open'); });
    m.querySelector('#htClosePrev').addEventListener('click', function(){ m.classList.remove('open'); });
    m.querySelector('#htDoPrint').addEventListener('click', function(){
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { alert('Could not open the print dialog.'); }
    });
    modalReady = true;
  }

  function create(opt){
    injectCss();
    var rowsAll = [];
    var selEls = [];
    var bar = document.createElement('div'); bar.className = 'ht-bar';
    var h = '<div class="ht-grid">' +
      '<div><label>From</label><input type="date" class="ht-from"></div>' +
      '<div><label>To</label><input type="date" class="ht-to"></div>' +
      '<div><label>Search</label><input type="text" class="ht-q" placeholder="' + esc(opt.placeholder || 'name, invoice no, batch…') + '"></div>';
    (opt.selects || []).forEach(function(s, i){
      h += '<div><label>' + esc(s.label) + '</label><select class="ht-sel" data-i="' + i + '"><option value="">All</option></select></div>';
    });
    h += '</div><div class="ht-row"><button type="button" class="ht-btn ht-clear">Clear filter</button>' +
         '<button type="button" class="ht-btn main ht-print">🖨️ Print / Preview</button><span class="ht-sum"></span></div>';
    bar.innerHTML = h;
    opt.listEl.parentNode.insertBefore(bar, opt.listEl);

    var fromEl = bar.querySelector('.ht-from'), toEl = bar.querySelector('.ht-to'), qEl = bar.querySelector('.ht-q');
    var sumEl = bar.querySelector('.ht-sum');
    selEls = [].slice.call(bar.querySelectorAll('.ht-sel'));

    function active(){ return !!(fromEl.value || toEl.value || qEl.value.trim() || selEls.some(function(s){ return s.value; })); }
    function dateOf(r){ return ymd(opt.getDate(r)); }
    function match(r){
      var d = dateOf(r);
      if (fromEl.value && (!d || d < fromEl.value)) return false;
      if (toEl.value && (!d || d > toEl.value)) return false;
      var q = qEl.value.trim().toLowerCase();
      if (q && String(opt.getText(r) || '').toLowerCase().indexOf(q) === -1) return false;
      for (var i = 0; i < selEls.length; i++) {
        if (selEls[i].value && String(opt.selects[i].get(r) == null ? '' : opt.selects[i].get(r)) !== selEls[i].value) return false;
      }
      return true;
    }
    function sorted(rows){
      return rows.slice().sort(function(a, b){ return dateOf(b).localeCompare(dateOf(a)); });
    }
    function matches(){ return sorted(rowsAll.filter(match)); }

    function refreshSelects(){
      (opt.selects || []).forEach(function(s, i){
        var el = selEls[i], cur = el.value, seen = {}, vals = [];
        rowsAll.forEach(function(r){ var v = s.get(r); v = v == null ? '' : String(v); if (v && !seen[v]) { seen[v] = 1; vals.push(v); } });
        vals.sort();
        el.innerHTML = '<option value="">All</option>' + vals.map(function(v){ return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join('');
        if (cur && seen[cur]) el.value = cur;
      });
    }

    var api = {
      setRows: function(rows){ rowsAll = rows || []; refreshSelects(); },
      // filtered rows, newest first. Without a filter, only the newest `limit` are returned (keeps the list light).
      apply: function(rows){
        if (rows) { rowsAll = rows; refreshSelects(); }
        var m = matches();
        var shown = (active() || !opt.limit) ? m : m.slice(0, opt.limit);
        sumEl.textContent = active()
          ? (m.length + ' of ' + rowsAll.length + ' match')
          : (rowsAll.length > shown.length ? ('Showing newest ' + shown.length + ' of ' + rowsAll.length + ' — use the filter to find older ones') : (rowsAll.length + ' entries'));
        return shown;
      },
      isActive: active,
      matches: matches,
      clear: function(){ fromEl.value = ''; toEl.value = ''; qEl.value = ''; selEls.forEach(function(s){ s.value = ''; }); if (opt.onChange) opt.onChange(); }
    };

    function changed(){ if (opt.onChange) opt.onChange(); }
    fromEl.addEventListener('change', changed);
    toEl.addEventListener('change', changed);
    qEl.addEventListener('input', changed);
    selEls.forEach(function(s){ s.addEventListener('change', changed); });
    bar.querySelector('.ht-clear').addEventListener('click', api.clear);

    bar.querySelector('.ht-print').addEventListener('click', function(){
      var list = matches();
      if (!list.length) { alert('Nothing to print — no entries match this filter.'); return; }
      var cols = opt.columns;
      var parts = [];
      if (fromEl.value || toEl.value) parts.push((fromEl.value ? fmtDay(fromEl.value) : 'start') + ' – ' + (toEl.value ? fmtDay(toEl.value) : 'today'));
      else parts.push('All dates');
      selEls.forEach(function(s, i){ if (s.value) parts.push(opt.selects[i].label + ': ' + s.value); });
      if (qEl.value.trim()) parts.push('Search: "' + qEl.value.trim() + '"');
      if (opt.subtitle) { var st = opt.subtitle(); if (st) parts.unshift(st); }

      var thead = '<tr>' + cols.map(function(c){ return '<th style="text-align:' + (c.right ? 'right' : 'left') + ';">' + esc(c.h) + '</th>'; }).join('') + '</tr>';
      var sums = cols.map(function(){ return 0; });
      var tbody = list.map(function(r){
        return '<tr>' + cols.map(function(c, i){
          var v = c.v(r);
          if (c.sum) sums[i] += Number(c.sumVal ? c.sumVal(r) : v) || 0;
          return '<td style="text-align:' + (c.right ? 'right' : 'left') + ';">' + esc(v == null || v === '' ? '—' : v) + '</td>';
        }).join('') + '</tr>';
      }).join('');
      var hasSum = cols.some(function(c){ return c.sum; });
      var tfoot = hasSum ? '<tr class="tot">' + cols.map(function(c, i){
        if (c.sum) return '<td style="text-align:right;">' + (c.fmtSum ? c.fmtSum(sums[i]) : sums[i].toFixed(c.dec == null ? 3 : c.dec)) + '</td>';
        return '<td>' + (i === 0 ? 'TOTAL (' + list.length + ')' : '') + '</td>';
      }).join('') + '</tr>' : '';

      var doc = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(opt.title) + '</title><style>' +
        'body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:18px;}' +
        'h2{margin:0 0 2px;font-size:18px;}p.s{margin:0 0 12px;font-size:11.5px;color:#555;}' +
        'table{width:100%;border-collapse:collapse;font-size:11px;}th{border-bottom:2px solid #000;padding:5px 6px;}' +
        'td{border-bottom:1px solid #ddd;padding:4px 6px;vertical-align:top;}tr.tot td{border-top:2px solid #000;font-weight:700;}' +
        'p.f{margin-top:12px;font-size:10px;color:#777;}@page{margin:12mm;}' +
        '</style></head><body><h2>Lalabella — ' + esc(opt.title) + '</h2><p class="s">' + esc(parts.join(' · ')) + '</p>' +
        '<table><thead>' + thead + '</thead><tbody>' + tbody + tfoot + '</tbody></table>' +
        '<p class="f">Printed ' + esc(new Date().toLocaleString('en-GB')) + ' · ' + list.length + ' entries</p></body></html>';

      ensureModal();
      frame.srcdoc = doc;
      document.getElementById('htPrevModal').classList.add('open');
    });

    return api;
  }

  window.HistoryTools = { create: create, ymd: ymd };
})();
