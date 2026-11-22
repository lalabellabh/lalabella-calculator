/* LALABELLA — sticker label for arrangements (Nov 22 2026, Bench): same look as the Build a Display label —
 * name, price, what was used, barcode, code, date. A sample (SMP-/FSMP-) also prints "SAMPLE · not out of stock".
 *   LBArrLabel.print({ name, code, total, items:'Mia Pink 35pcs, …', note })
 */
(function () {
  if (window.LBArrLabel) return;
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function print(o) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), long = String(o.items || '').length > 110;
    try { JsBarcode(svg, o.code || '', { format: 'CODE128', width: 1.5, height: o.items ? (long ? 24 : 30) : 40, displayValue: false, margin: 0 }); } catch (e) {}
    var made = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(o.code) + '</title><style>@page{size:58mm auto;margin:0}*{box-sizing:border-box}' +
      'body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#000}.c{width:56mm;padding:4mm 2mm 1.5mm;text-align:center}' +
      '.n{font-weight:700;font-size:10pt;line-height:1.15}.p{font-weight:700;font-size:10pt;margin:1mm 0}.i{font-size:' + (long ? '4.8' : '5.5') + 'pt;line-height:1.25;margin:1mm 0}' +
      '.s{font-size:6.5pt;font-weight:700;border:1px solid #000;border-radius:2mm;padding:.5mm 1.5mm;display:inline-block;margin:.5mm 0}svg{max-width:100%;height:auto}.k{font-size:8pt;font-family:monospace}.d{font-size:6.5pt}</style></head><body><div class="c">' +
      '<div class="n">' + esc(o.name) + '</div><div class="p">' + (Number(o.total) || 0).toFixed(3) + ' BD</div>' + (o.items ? '<div class="i">' + esc(o.items) + '</div>' : '') +
      (o.note ? '<div class="s">' + esc(o.note) + '</div>' : '') + svg.outerHTML + '<div class="k">' + esc(o.code) + '</div><div class="d">Made ' + made + '</div></div></body></html>';
    var f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
    var d = f.contentWindow.document; d.open(); d.write(html); d.close();
    setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(function () { f.remove(); }, 60000); }, 200);
  }
  window.LBArrLabel = { print: print };
})();
