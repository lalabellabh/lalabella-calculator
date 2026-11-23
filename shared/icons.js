/* LALABELLA — real icons instead of emoji (Nov 23 2026, Bench: "parang hindi gawang AI, premium na logo").
 * A leading emoji in a button, tab, link, label or title (📷 🎤 🖼️ 🖨️ 🏷️ ✏️ 🔍 …) is drawn as a duotone SVG icon instead.
 * The emoji stays in the page as hidden text, so nothing that reads the button text breaks. Works on content added later.
 * Loaded on every page by shared/nav.js (skipped on the HQ office, which uses its own characters).
 */
(function () {
  if (window.LBIcons || /office\.html$/i.test(location.pathname)) return;
  // 24×24 · d = soft fill (duotone), s = outline. Drawn for Lalabella, Lucide-like proportions.
  var I = {
    camera: { d: 'M4 8.5h3l1.6-2.3h6.8L17 8.5h3v10H4z', s: 'M4 8.5h3l1.6-2.3h6.8L17 8.5h3a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z M12 16.4a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z M17.6 11h.01' },
    mic: { d: 'M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0z', s: 'M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0z M5.5 10.5a6.5 6.5 0 0 0 13 0 M12 17v3.5 M9 20.5h6' },
    image: { d: 'M4 5h16v14H4z', s: 'M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5z M3.8 16.5l4.7-4.7 3.5 3.5 2.5-2.5 5.7 5.7 M15.5 9.2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8z' },
    printer: { d: 'M4 10h16v6H4z', s: 'M7 9V4h10v5 M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2 M7 14h10v6H7z M17 12h.01' },
    tag: { d: 'M3.5 4.5v7l9 9 8-8-9-9z', s: 'M3.5 4.5a1 1 0 0 1 1-1h6.6l9.4 9.4a1.2 1.2 0 0 1 0 1.7l-6.4 6.4a1.2 1.2 0 0 1-1.7 0L3.5 11.1z M8 9.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z' },
    pencil: { d: 'M15.5 4.5l4 4L9 19l-5 1 1-5z', s: 'M15.5 4.5a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L9 19l-5 1 1-5z M13.5 6.5l4 4' },
    search: { d: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z', s: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M15.3 15.3L20.5 20.5' },
    log: { d: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z', s: 'M3.6 12a8.4 8.4 0 1 0 2.5-6 M3.5 3.8v4h4 M12 7.5V12l3 2' },
    trash: { d: 'M6 7h12l-1 13H7z', s: 'M4 7h16 M9.5 7V4.5h5V7 M6 7l1 12.5a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9L18 7 M10 11v6 M14 11v6' },
    save: { d: 'M5 4h11l3 3v13H5z', s: 'M5 3.5h11l3.5 3.5v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5z M8 3.5v5h7v-5 M7.5 20.5v-6h9v6' },
    clipboard: { d: 'M5.5 5h13v16h-13z', s: 'M8.5 4.5H7a1.5 1.5 0 0 0-1.5 1.5v13.5A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 17 4.5h-1.5 M9 3h6v3H9z M9 11h6 M9 15h4' },
    cart: { d: 'M6 6h14l-2 8H7.5z', s: 'M2.5 3.5h2.3l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.4-1.1L20.5 7H5.6 M9.5 20.5h.01 M17 20.5h.01' },
    chart: { d: 'M5 13h3v7H5z M10.5 8h3v12h-3z M16 4h3v16h-3z', s: 'M5 13h3v7H5z M10.5 8h3v12h-3z M16 4h3v16h-3z M3 20.5h18' },
    receipt: { d: 'M5.5 3h13v18l-2.2-1.5-2.1 1.5-2.2-1.5-2.2 1.5-2.1-1.5-2.2 1.5z', s: 'M5.5 3h13v18l-2.2-1.5-2.1 1.5-2.2-1.5-2.2 1.5-2.1-1.5-2.2 1.5z M9 8h6 M9 12h6 M9 16h3' },
    box: { d: 'M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z', s: 'M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z M3.5 7.5 12 12l8.5-4.5 M12 12v9 M7.8 5.2l8.4 4.6' },
    star: { d: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z', s: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z' },
    pin: { d: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z', s: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z M12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z' },
    flower: { d: 'M12 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.5 13a3 3 0 1 0-3-5 M15.5 13a3 3 0 1 1 3-5', s: 'M12 7.5c0-2 1.3-3.5 3-3.5s2.6 2 1.5 3.8C18.6 7.4 20 9 19 10.8s-3 1.6-4 .7 M12 7.5c0-2-1.3-3.5-3-3.5S6.4 6 7.5 7.8C5.4 7.4 4 9 5 10.8s3 1.6 4 .7 M12 9.3a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z M12 13v8 M12 18c-1.6-2-3.7-2.4-5.5-1.7 1 1.8 3.2 2.5 5.5 1.7z' },
    choc: { d: 'M5 4h14v16H5z', s: 'M6 3.5h12A1.5 1.5 0 0 1 19.5 5v14a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5z M4.5 9h15 M4.5 14.5h15 M12 3.5v17' },
    gift: { d: 'M4 10h16v10H4z', s: 'M3.5 7.5h17v3.5h-17z M5 11v8.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V11 M12 7.5V21 M12 7.5S10.8 3.5 8.3 3.5a2 2 0 0 0 0 4z M12 7.5s1.2-4 3.7-4a2 2 0 0 1 0 4z' },
    coffee: { d: 'M4.5 9h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z', s: 'M4.5 9h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z M16.5 10.5h1.3a2.7 2.7 0 0 1 0 5.4h-1.6 M8 3.5c-.8 1 .8 2-.1 3 M11.5 3.5c-.8 1 .8 2-.1 3' },
    plus: { d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', s: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 8v8 M8 12h8' },
    bell: { d: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z', s: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z M10 20.5a2 2 0 0 0 4 0' },
    calendar: { d: 'M4 6h16v14H4z', s: 'M5 5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 5z M3.5 10h17 M8 3v4 M16 3v4' },
    user: { d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', s: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20.5a7.5 7.5 0 0 1 15 0' },
    truck: { d: 'M3 6h11v10H3z', s: 'M3 6h11v10H3z M14 9.5h3.8L21 13v3h-7 M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z' },
    home: { d: 'M4.5 10 12 4l7.5 6v10h-15z', s: 'M3.5 10.5 12 3.8l8.5 6.7 M5.5 9v11h13V9 M10 20v-5.5h4V20' },
    lock: { d: 'M5 11h14v10H5z', s: 'M6 10.5h12a1.5 1.5 0 0 1 1.5 1.5v7.5A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5V12A1.5 1.5 0 0 1 6 10.5z M8 10.5V7.5a4 4 0 0 1 8 0v3' },
    gear: { d: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z', s: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z M19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-1.8 1l-.3 2h-4l-.3-2a7 7 0 0 1-1.8-1l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-3L2.9 9.3l2-3.4 1.9.7a7 7 0 0 1 1.8-1l.3-2h4l.3 2a7 7 0 0 1 1.8 1l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 3z' },
    money: { d: 'M3 7h18v10H3z', s: 'M4 6.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z M12 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z M6 9.5v5 M18 9.5v5' },
    warn: { d: 'M12 4 21 19.5H3z', s: 'M10.3 4.9a2 2 0 0 1 3.4 0l7.3 12.6a2 2 0 0 1-1.7 3H4.7a2 2 0 0 1-1.7-3z M12 9.5v4.5 M12 17.2h.01' },
    sparkle: { d: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z', s: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z M19 3.5v3 M17.5 5h3' },
    upload: { d: 'M4 15h16v5H4z', s: 'M12 15V4 M7.5 8.5 12 4l4.5 4.5 M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15' },
    phone: { d: 'M7 3h10v18H7z', s: 'M8 2.5h8A1.5 1.5 0 0 1 17.5 4v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5z M11 18.5h2' },
    calc: { d: 'M5 3.5h14v17H5z', s: 'M6.5 3h11A1.5 1.5 0 0 1 19 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3z M8 6.5h8v3H8z M8.5 13h.01 M12 13h.01 M15.5 13h.01 M8.5 16.5h.01 M12 16.5h.01 M15.5 16.5h.01' },
    chat: { d: 'M4 5h16v11H9l-5 4z', s: 'M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 16H9l-4.5 4v-4H5a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 5 4.5z M8 9h8 M8 12h5' }
  };
  var MAP = {
    '📷': 'camera', '📸': 'camera', '🎤': 'mic', '🎙': 'mic', '🖼': 'image', '🖨': 'printer', '🏷': 'tag', '✏': 'pencil', '🖊': 'pencil', '📝': 'pencil',
    '🔍': 'search', '🔎': 'search', '📜': 'log', '🕘': 'log', '🗑': 'trash', '💾': 'save', '📋': 'clipboard', '🛒': 'cart', '📊': 'chart', '📈': 'chart',
    '🧾': 'receipt', '📦': 'box', '⭐': 'star', '📍': 'pin', '🌷': 'flower', '🌸': 'flower', '💐': 'flower', '🌹': 'flower', '🍫': 'choc', '🎀': 'gift', '🎁': 'gift',
    '☕': 'coffee', '🆕': 'plus', '➕': 'plus', '🔔': 'bell', '📅': 'calendar', '🗓': 'calendar', '👤': 'user', '🚚': 'truck', '🛵': 'truck', '🏠': 'home',
    '🔒': 'lock', '⚙': 'gear', '💰': 'money', '💵': 'money', '⚠': 'warn', '✨': 'sparkle', '📤': 'upload', '📱': 'phone', '💬': 'chat', '🧮': 'calc', '🫖': 'coffee'
  };
  // colours for the "Colorful" icon pack (each icon its own little glossy tile)
  var COL = { camera: ['#5b8cff', '#3a5bd9'], mic: ['#ff6b8b', '#d93a63'], image: ['#36c48f', '#1c9467'], printer: ['#7b8aa3', '#4f5d75'], tag: ['#ffb547', '#e98a10'],
    pencil: ['#ffcf4a', '#f0a500'], search: ['#4fc3f7', '#1e88e5'], log: ['#a78bfa', '#7c3aed'], trash: ['#ff7a6b', '#e5484d'], save: ['#3ecf8e', '#16a36a'],
    clipboard: ['#8d9cf8', '#5b6be0'], cart: ['#ff9f43', '#ee6c12'], chart: ['#34d1bf', '#0e9f8f'], receipt: ['#c0a6ff', '#8b5cf6'], box: ['#d9a066', '#b3763a'],
    star: ['#ffd54a', '#f5a400'], pin: ['#ff6b6b', '#d93a3a'], flower: ['#ff7eb6', '#e0457f'], choc: ['#a0673d', '#6b3e1f'], gift: ['#ff6fa1', '#d63a76'],
    coffee: ['#c08a5a', '#8a5a33'], plus: ['#4ade80', '#16a34a'], bell: ['#ffc145', '#f08c00'], calendar: ['#ff8a65', '#e5533d'], user: ['#64b5f6', '#1e88e5'],
    truck: ['#26c6da', '#00838f'], home: ['#81c784', '#43a047'], lock: ['#90a4ae', '#546e7a'], gear: ['#9e9e9e', '#616161'], money: ['#66bb6a', '#2e7d32'],
    warn: ['#ffb300', '#ef6c00'], sparkle: ['#ffd54a', '#ff8f00'], upload: ['#4dd0e1', '#0097a7'], phone: ['#7986cb', '#3949ab'], chat: ['#4fc3f7', '#0288d1'], calc: ['#a1887f', '#6d4c41'] };
  var PKEY = 'lbIconPack', PACKS = [['duo', 'Duotone'], ['line', 'Line'], ['bold', 'Bold'], ['color', 'Colorful'], ['emoji', 'Emoji']];
  var pack = 'duo'; try { pack = localStorage.getItem(PKEY) || 'duo'; } catch (e) {}
  function setPackAttr() { if (pack === 'duo') document.documentElement.removeAttribute('data-lbi-pack'); else document.documentElement.setAttribute('data-lbi-pack', pack); }
  setPackAttr();
  var keys = Object.keys(MAP).sort(function (a, b) { return b.length - a.length; });
  var RX = new RegExp('^(\\s*)(' + keys.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')\\uFE0F?(\\s*)');
  var SKIP = 'script,style,textarea,input,select,option,svg,code,pre,title,noscript,[contenteditable],.lbi-skip,.lbi-w,#lbsu,[class^="o3-"],.o3,iframe';
  var HOSTS = 'button,a,label,summary,h1,h2,h3,h4,h5,th,legend,.tab,.pill,.chip,[role="tab"],[role="button"],[class*="btn"],[class*="tab"],[class*="title"],[class*="head"]';
  function svg(n) {
    var p = I[n]; return '<svg class="lbi" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="lbi-d" d="' + p.d + '"/><path class="lbi-s" d="' + p.s + '"/></svg>';
  }
  function fix(node) {
    var t = node.nodeValue; if (!t || t.length > 140) return;
    var m = RX.exec(t); if (!m) return;
    var el = node.parentNode; if (!el || el.nodeType !== 1 || el.closest(SKIP)) return;
    if (!el.closest(HOSTS)) return;
    var name = MAP[m[2]]; if (!name) return;
    var only = !t.slice(m[0].length).trim() && !node.previousSibling && !node.nextSibling;
    var w = document.createElement('span'); w.className = 'lbi-w' + (only ? ' lbi-only' : '');
    w.innerHTML = svg(name) + '<span class="lbi-e">' + m[2] + '</span>';
    var cc = COL[name]; if (cc) { w.style.setProperty('--c1', cc[0]); w.style.setProperty('--c2', cc[1]); }
    var rest = t.slice(m[0].length);
    var cs = getComputedStyle(el), flex = /flex|grid/.test(cs.display) && rest.trim();
    if (flex) {   // keep the icon and its words together as ONE item in a flex/grid parent (titles with space-between etc.)
      var g = document.createElement('span'); g.className = 'lbi-g'; el.insertBefore(g, node); g.appendChild(w); node.nodeValue = rest; g.appendChild(node);
    } else {
      el.insertBefore(w, node);
      if (rest) node.nodeValue = rest; else el.removeChild(node);
    }
    if (only) {   // an icon-only button: make sure the icon shows on a dark button (the emoji had its own colours)
      var host = el.closest('button,a,label,[role="button"]') || el, hs = getComputedStyle(host);
      if (lum(hs.backgroundColor) < .35 && lum(hs.color) < .45 && !/gradient|url/.test(hs.backgroundImage)) w.style.color = '#fff';
    }
  }
  function lum(c) { var m = String(c).match(/[\d.]+/g); if (!m || (m.length > 3 && +m[3] < .5)) return 1; return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; }
  function scan(root) {
    if (!root) return;
    if (root.nodeType === 3) { fix(root); return; }
    if (root.nodeType !== 1 || (root.closest && root.closest(SKIP))) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), list = [], n;
    while ((n = w.nextNode())) if (RX.test(n.nodeValue || '')) list.push(n);
    list.forEach(fix);
  }
  var css = document.createElement('style'); css.id = 'lbiCss';
  css.textContent = '.lbi-w{display:inline-flex;align-items:center;justify-content:center;vertical-align:-.2em;margin-right:.38em;line-height:0}' +
    '.lbi-w.lbi-only{margin-right:0;vertical-align:middle}.lbi-g{display:inline-flex;align-items:center;white-space:nowrap}' +
    'button:has(> .lbi-w:not(.lbi-only)),a:has(> .lbi-w:not(.lbi-only)){white-space:nowrap}' +
    '.lbi{width:1.2em;height:1.2em;flex:none;overflow:visible;filter:drop-shadow(0 .6px .4px rgba(0,0,0,.12))}' +
    '.lbi-only .lbi{width:1.45em;height:1.45em}' +
    '.lbi .lbi-d{fill:currentColor;opacity:.2;stroke:none}.lbi .lbi-s{fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}' +
    // icon packs (⚙️ Settings → Look & feel → Icon style)
    'html[data-lbi-pack="line"] .lbi .lbi-d{opacity:0}' +
    'html[data-lbi-pack="bold"] .lbi .lbi-s{stroke-width:2.5}html[data-lbi-pack="bold"] .lbi .lbi-d{opacity:.38}' +
    'html[data-lbi-pack="color"] .lbi-w{background:linear-gradient(150deg,var(--c1,#8aa0ff),var(--c2,#5a6fe0));color:#fff!important;border-radius:.45em;padding:.2em;' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 -2px 3px rgba(0,0,0,.12),0 2px 6px rgba(0,0,0,.2)}' +
    'html[data-lbi-pack="color"] .lbi{width:1.02em;height:1.02em;filter:drop-shadow(0 1px 0 rgba(0,0,0,.18))}html[data-lbi-pack="color"] .lbi .lbi-d{fill:#fff;opacity:.28}' +
    'html[data-lbi-pack="color"] .lbi-only .lbi{width:1.2em;height:1.2em}' +
    'html[data-lbi-pack="emoji"] .lbi{display:none}html[data-lbi-pack="emoji"] .lbi-e{position:static!important;width:auto!important;height:auto!important;overflow:visible!important;clip:auto!important}' +
    '.lbi-e{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important}';
  (document.head || document.documentElement).appendChild(css);
  var queued = [], timer = 0;
  function flush() { timer = 0; var q = queued; queued = []; q.forEach(function (n) { if (n.isConnected) scan(n); }); }
  function start() {
    scan(document.body);
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.type === 'characterData') { queued.push(m.target); return; }
        m.addedNodes.forEach(function (n) { if (n.nodeType === 1 && n.classList && n.classList.contains('lbi-w')) return; queued.push(n); });
      });
      if (!timer && queued.length) timer = setTimeout(flush, 60);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  window.LBIcons = { scan: scan, svg: svg, packs: function () { return PACKS.slice(); }, pack: function (v) {
    if (v === undefined) return pack; pack = PACKS.some(function (p) { return p[0] === v; }) ? v : 'duo'; try { localStorage.setItem(PKEY, pack); } catch (e) {} setPackAttr(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
