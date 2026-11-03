/**
 * LALABELLA EXPORT TO EXCEL — one shared helper for every page (free, runs in the browser).
 *
 *   <script src="shared/excel.js" data-auto></script>
 *     data-auto: puts a "📊 Excel" button next to the page's Print button(s) (#printBtn, or any button
 *     whose text says Print). Clicking it runs the page's own print code but, instead of printing, saves what
 *     would have printed (its tables) as a real .xlsx file. Buttons with data-no-excel are skipped.
 *
 *   lbExcel.save('Petty Cash.xlsx', [{ name: 'Entries', rows: [['Date','Amount'], ['2026-11-03', 1.5]] }])
 *   lbExcel.fromElement(el, 'Name.xlsx')   — every <table> inside el (or its text lines) → one sheet each
 *
 * Uses SheetJS (xlsx 0.18.5, loaded from cdnjs only when someone exports).
 */
(function () {
  if (window.lbExcel) return;
  var LIB = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', loading = null;
  function lib() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (loading) return loading;
    loading = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = LIB; s.async = true;
      s.onload = function () { window.XLSX ? res(window.XLSX) : rej(new Error('Excel tool did not load')); };
      s.onerror = function () { loading = null; rej(new Error('Could not load the Excel tool — check your internet and try again.')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  function safeName(n, used) {
    n = String(n || 'Sheet').replace(/[\\\/\?\*\[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
    var b = n, i = 2; while (used[n.toLowerCase()]) { n = (b.slice(0, 28) + ' ' + i++); } used[n.toLowerCase()] = 1; return n;
  }
  function stamp() { var d = new Date(Date.now() + 3 * 3600000); return d.toISOString().slice(0, 16).replace('T', ' ').replace(':', '-'); }
  // "+12.500 BD", "1,800", "−3.250" → numbers; everything else stays text (dates, codes, "1,800 g" etc.)
  function cell(v) {
    if (v == null) return '';
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    var t = String(v).replace(/\s+/g, ' ').trim();
    var m = t.match(/^([+\-−]?)\s*(\d{1,3}(?:,\d{3})+|\d+)?(\.\d+)?\s*(BD|BHD)?$/i);
    if (m && (m[2] || m[3]) && !/^0\d/.test(m[2] || '')) {
      var n = Number(((m[2] || '0').replace(/,/g, '')) + (m[3] || ''));
      if (isFinite(n)) return (m[1] === '-' || m[1] === '−') ? -n : n;
    }
    return t;
  }
  function save(filename, sheets) {
    return lib().then(function (X) {
      var wb = X.utils.book_new(), used = {};
      (sheets || []).forEach(function (sh) {
        var rows = (sh.rows || []).map(function (r) { return (r || []).map(function (c) { return sh.raw === false ? cell(c) : (c == null ? '' : c); }); });
        if (!rows.length) rows = [['(no data)']];
        var ws = X.utils.aoa_to_sheet(rows);
        var widths = [];
        rows.forEach(function (r) { r.forEach(function (c, i) { var l = String(c == null ? '' : c).length; widths[i] = Math.min(60, Math.max(widths[i] || 6, l + 2)); }); });
        ws['!cols'] = widths.map(function (w) { return { wch: w }; });
        if (sh.freeze !== false && rows.length > 1) ws['!freeze'] = { xSplit: 0, ySplit: sh.headerRow || 1 };
        X.utils.book_append_sheet(wb, ws, safeName(sh.name, used));
      });
      var fn = String(filename || 'Lalabella export').replace(/\.xlsx$/i, '') + ' ' + stamp() + '.xlsx';
      X.writeFile(wb, fn);
      return fn;
    });
  }
  function tableRows(t) {
    var out = [];
    t.querySelectorAll('tr').forEach(function (tr) {
      var r = []; tr.querySelectorAll('th,td').forEach(function (c) {
        var txt = (c.innerText || c.textContent || '').replace(/\n+/g, ' · ').trim();
        r.push(txt); var span = Number(c.getAttribute('colspan')) || 1; for (var i = 1; i < span; i++) r.push('');
      });
      if (r.some(function (x) { return x !== ''; })) out.push(r);
    });
    return out;
  }
  function titleOf(el) {
    var h = el.querySelector('h1,h2,h3'); var p = h && h.nextElementSibling && h.nextElementSibling.tagName === 'P' ? h.nextElementSibling : null;
    return [(h && h.textContent.trim()) || document.title.replace(/^Lalabella\s*[—-]\s*/, ''), p ? p.textContent.trim() : ''].filter(Boolean);
  }
  function fromElement(el, filename) {
    el = el || document.body;
    var tables = [].slice.call(el.querySelectorAll('table')).filter(function (t) { return !t.closest('table table') || t.parentElement.closest('table') === null; });
    var head = titleOf(el), sheets = [];
    if (tables.length) {
      tables.forEach(function (t, i) {
        var cap = t.querySelector('caption'), rows = tableRows(t);
        if (!rows.length) return;
        var top = (i === 0 ? head : [cap ? cap.textContent.trim() : '']).filter(Boolean).map(function (x) { return [x]; });
        sheets.push({ raw: false, name: (cap && cap.textContent) || (i === 0 ? head[0] : 'Table ' + (i + 1)), rows: top.concat(top.length ? [[]] : []).concat(rows), headerRow: top.length ? top.length + 2 : 1 });
      });
    }
    if (!sheets.length) {   // no tables: one row per printed line
      var lines = (el.innerText || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
      sheets.push({ name: head[0] || 'Export', rows: lines.map(function (l) { return l.split(/\t| {3,}/); }), freeze: false });
    }
    return save(filename || head[0] || document.title, sheets);
  }

  // ---- "📊 Excel" next to Print buttons: run the page's own print code, catch window.print(), export instead ----
  function printArea() {
    var c = document.querySelector('#printArea,#printView,#printBody,.print-area,.print-view,[data-print-area]');
    if (c && c.innerText.trim()) return c;
    var cands = [].slice.call(document.querySelectorAll('[id*="print" i],[class*="print" i]')).filter(function (e) { return e.querySelector && e.querySelector('table') && e.innerText.trim(); });
    return cands[0] || document.body;
  }
  function excelVia(btn, name) {
    var orig = window.print, done = false, t;
    function finish() {
      if (done) return; done = true; clearTimeout(t); window.print = orig;
      fromElement(printArea(), name).catch(function (e) { alert(e && e.message || 'Could not make the Excel file.'); });
    }
    window.print = function () { finish(); };
    try { btn.click(); } catch (e) {}
    t = setTimeout(function () { if (!done) { window.print = orig; done = true; } }, 9000);   // the page refused (e.g. "nothing to print") — do nothing
  }
  function attach() {
    var btns = [].slice.call(document.querySelectorAll('#printBtn, button')).filter(function (b, i, a) {
      if (a.indexOf(b) !== i || b.hasAttribute('data-no-excel') || b.getAttribute('data-lb-excel')) return false;
      var tx = (b.textContent || '').trim();
      return b.id === 'printBtn' || /^(🖨️?\s*)?print\b/i.test(tx);   // only real Print buttons (some pages reuse the print-btn style for Clear/Cancel)
    });
    btns.forEach(function (b) {
      b.setAttribute('data-lb-excel', '1');
      var x = document.createElement('button'); x.type = 'button'; x.className = b.className; x.setAttribute('data-lb-excel', 'btn'); x.setAttribute('data-no-excel', '');
      x.textContent = '📊 Excel'; x.title = 'Save what would print as an Excel file';
      x.style.marginLeft = '6px';
      x.addEventListener('click', function (e) { e.preventDefault(); excelVia(b, (document.title || 'Lalabella').replace(/^Lalabella\s*[—-]\s*/, '')); });
      b.insertAdjacentElement('afterend', x);
    });
  }

  window.lbExcel = { save: save, fromElement: fromElement, attach: attach, load: lib };
  var me = document.currentScript;
  if (me && me.hasAttribute('data-auto')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(attach, 300); }); else setTimeout(attach, 300);
  }
})();
