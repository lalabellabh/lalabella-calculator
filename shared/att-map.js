/* Attendance mini map: a small drawn picture (no map service, nothing to load) showing the shop, its allowed
   circle, and where the phone is. LBAttMap.svg({lat,lng,acc}, branches, radius, nearName, w, h) -> SVG string.
   Green = inside the allowed circle, red = outside. */
(function () {
  'use strict';
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function svg(pos, branches, radius, nearName, w, h) {
    w = w || 320; h = h || 190; radius = num(radius) || 50;
    var shop = null, best = 1e12, i;
    (branches || []).forEach(function (b) {
      var d = dist(pos.lat, pos.lng, b.lat, b.lng);
      if (nearName ? String(b.name) === String(nearName) : d < best) { if (!nearName || !shop) { shop = b; best = d; } }
    });
    if (!shop) return '';
    var d0 = dist(pos.lat, pos.lng, shop.lat, shop.lng), acc = Math.min(num(pos.acc), 300);
    var inside = d0 <= radius;
    var dx = (pos.lng - shop.lng) * 111320 * Math.cos(shop.lat * Math.PI / 180);
    var dy = (pos.lat - shop.lat) * 110540;
    var extent = Math.max(radius * 1.7, Math.sqrt(dx * dx + dy * dy) + Math.max(acc, 10) + radius * 0.3);
    var s = (Math.min(w, h) / 2 - 16) / extent;           // pixels per metre
    var cx = w / 2, cy = h / 2;
    var ux = cx + dx * s, uy = cy - dy * s;
    var col = inside ? '#2e8b57' : '#c0392b';
    var rPx = radius * s, aPx = Math.max(acc * s, 3);
    var step = niceStep(extent) * s, g = '';
    for (i = -10; i <= 10; i++) {
      var gx = cx + i * step, gy = cy + i * step;
      g += '<line x1="' + gx.toFixed(1) + '" y1="0" x2="' + gx.toFixed(1) + '" y2="' + h + '" stroke="#e9e1dc" stroke-width="1"/>' +
           '<line x1="0" y1="' + gy.toFixed(1) + '" x2="' + w + '" y2="' + gy.toFixed(1) + '" stroke="#e9e1dc" stroke-width="1"/>';
    }
    var label = Math.round(d0) + ' m';
    var lx = (cx + ux) / 2, ly = (cy + uy) / 2 - 6;
    var line = d0 > 2 ? '<line x1="' + cx + '" y1="' + cy + '" x2="' + ux.toFixed(1) + '" y2="' + uy.toFixed(1) + '" stroke="' + col + '" stroke-width="2" stroke-dasharray="5 4"/>' +
      '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" font-size="12" font-weight="700" fill="' + col + '" text-anchor="middle" stroke="#fff" stroke-width="3" paint-order="stroke">' + label + '</text>' : '';
    var name = String(shop.name || '').replace(/[<>&"]/g, '');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="100%" style="display:block;border-radius:12px;background:#f7f2ee" role="img" aria-label="Location map">' +
      '<rect width="' + w + '" height="' + h + '" fill="#f7f2ee"/>' + g +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + rPx.toFixed(1) + '" fill="#2e8b57" fill-opacity=".13" stroke="#2e8b57" stroke-width="2" stroke-dasharray="6 4"/>' +
      line +
      '<circle cx="' + ux.toFixed(1) + '" cy="' + uy.toFixed(1) + '" r="' + aPx.toFixed(1) + '" fill="#2f80ed" fill-opacity=".16" stroke="#2f80ed" stroke-opacity=".5"/>' +
      '<circle cx="' + ux.toFixed(1) + '" cy="' + uy.toFixed(1) + '" r="6" fill="#2f80ed" stroke="#fff" stroke-width="2.5"/>' +
      '<path d="M' + cx + ' ' + (cy + 2) + ' c-9 -11 -12 -15 -12 -21 a12 12 0 1 1 24 0 c0 6 -3 10 -12 21z" fill="#d9486a" stroke="#fff" stroke-width="2"/>' +
      '<circle cx="' + cx + '" cy="' + (cy - 19) + '" r="4.5" fill="#fff"/>' +
      '<text x="' + cx + '" y="' + (cy + 17) + '" font-size="11" font-weight="700" fill="#3a2a2e" text-anchor="middle" stroke="#fff" stroke-width="3" paint-order="stroke">' + name + '</text>' +
      '<text x="8" y="' + (h - 8) + '" font-size="10" fill="#8a7078">● you   📍 shop   - - ' + radius + ' m allowed</text>' +
      '</svg>';
  }
  function niceStep(extent) {
    var raw = extent / 3, p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), n = raw / p;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
  }
  function dist(a, b, c, d) {
    var R = 6371000, r = Math.PI / 180, dLa = (c - a) * r, dLo = (d - b) * r;
    var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  window.LBAttMap = { svg: svg };
})();
