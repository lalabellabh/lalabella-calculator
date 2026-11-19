// Lalabella voice input (Nov 19 2026, Bench). Uses the browser's own speech recognition (free, Chrome / Edge / Safari).
// LBVoice.listen({ hint, lang }) -> Promise<string[]> (best guesses first, [] if nothing heard / cancelled)
// LBVoice.parse(text, names) -> { name, nameScore, choices, qty, unit, pack, expiry, add, rest }
// Nothing is ever saved by voice: pages only fill their form, the person still checks and presses the button.
(function () {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var esc = window.lbEsc || function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  function supported() { return !!SR; }

  var css = '.lbv-ov{position:fixed;inset:0;z-index:2147483100;background:rgba(30,15,20,.55);display:flex;align-items:flex-end;justify-content:center;padding:16px;font-family:"Space Grotesk",system-ui,sans-serif}'
    + '.lbv-box{background:#fff;color:#2f2024;border-radius:20px;width:100%;max-width:440px;padding:18px 18px 14px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.3);margin-bottom:6vh}'
    + '.lbv-mic{width:72px;height:72px;border-radius:50%;margin:4px auto 10px;display:flex;align-items:center;justify-content:center;font-size:32px;background:linear-gradient(135deg,#c9506b,#9e2f4a);color:#fff;animation:lbvP 1.2s ease-in-out infinite}'
    + '@keyframes lbvP{0%,100%{box-shadow:0 0 0 0 rgba(201,80,107,.5)}50%{box-shadow:0 0 0 16px rgba(201,80,107,0)}}'
    + '.lbv-t{font-weight:700;font-size:15px}.lbv-h{font-size:12.5px;color:#8a7078;margin-top:4px;line-height:1.4}'
    + '.lbv-live{min-height:22px;margin-top:10px;font-size:15px;color:#9e2f4a;font-weight:600}'
    + '.lbv-x{margin-top:12px;padding:10px 22px;border-radius:999px;border:1px solid #efdfde;background:#fff;font:700 14px inherit;cursor:pointer;color:#2f2024}';
  function addCss() { if (document.getElementById('lbvCss')) return; var s = document.createElement('style'); s.id = 'lbvCss'; s.textContent = css; document.head.appendChild(s); }

  function listen(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!SR) { alert('Voice is not available on this browser. Please use Chrome, Edge or Safari.'); resolve([]); return; }
      addCss();
      var ov = document.createElement('div'); ov.className = 'lbv-ov';
      ov.innerHTML = '<div class="lbv-box" role="dialog" aria-modal="true"><div class="lbv-mic">🎤</div><div class="lbv-t">Listening…</div>'
        + '<div class="lbv-h">' + esc(opts.hint || 'Speak now') + '</div><div class="lbv-live"></div><button type="button" class="lbv-x">Cancel</button></div>';
      document.body.appendChild(ov);
      var live = ov.querySelector('.lbv-live'), done = false, best = [];
      var r = new SR();
      r.lang = opts.lang || 'en-US'; r.interimResults = true; r.maxAlternatives = 3; r.continuous = false;
      function finish(list) { if (done) return; done = true; try { r.abort(); } catch (e) {} ov.remove(); resolve(list || []); }
      ov.querySelector('.lbv-x').onclick = function () { finish([]); };
      r.onresult = function (e) {
        var txt = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var res = e.results[i]; txt += res[0].transcript;
          if (res.isFinal) { best = []; for (var j = 0; j < res.length; j++) best.push(res[j].transcript.trim()); }
        }
        live.textContent = '“' + txt.trim() + '”';
      };
      r.onerror = function (e) {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') alert('Microphone is blocked. Please allow the microphone for this site, then try again.');
        else if (e.error === 'network') alert('Voice needs internet. Please check the connection.');
        finish([]);
      };
      r.onend = function () { finish(best); };
      try { r.start(); } catch (e) { finish([]); }
    });
  }

  // ---------- understanding what was said ----------
  var ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, a: 1, an: 1,
    isa: 1, dalawa: 2, tatlo: 3, apat: 4, lima: 5, anim: 6, pito: 7, walo: 8, siyam: 9, sampu: 10 };
  var TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  // "two point five" -> "2.5", "twenty five" -> "25", "half" -> "0.5", "one and a half" -> "1.5"
  function wordsToDigits(t) {
    t = ' ' + t.toLowerCase().replace(/-/g, ' ') + ' ';
    t = t.replace(/\b(\d+) and a half\b/g, function (m, n) { return String(Number(n) + .5); });
    t = t.replace(/\bhalf\b/g, '0.5');
    var w = t.split(/\s+/), out = [], i = 0;
    function num(k) { var x = w[k]; if (x in TENS) { var v = TENS[x]; if (w[k + 1] in ONES && ONES[w[k + 1]] < 10 && w[k + 1] !== 'a' && w[k + 1] !== 'an') return [v + ONES[w[k + 1]], 2]; return [v, 1]; }
      if (x in ONES && x !== 'a' && x !== 'an') { var v2 = ONES[x]; if (w[k + 1] === 'hundred') { v2 *= 100; var r = num(k + 2); if (r && w[k + 2] !== 'point') return [v2 + r[0], 2 + r[1]]; return [v2, 2]; } return [v2, 1]; }
      if (/^\d+(\.\d+)?$/.test(x)) return [Number(x), 1];
      return null; }
    while (i < w.length) {
      var n = num(i);
      if (n) {
        var v = n[0], k = i + n[1];
        if (w[k] === 'point' || w[k] === '.') { var dec = ''; k++; while (w[k] in ONES || /^\d$/.test(w[k])) { dec += (w[k] in ONES ? ONES[w[k]] : w[k]); k++; } if (dec) v = Number(v + '.' + dec); }
        out.push(String(v)); i = k; continue;
      }
      out.push(w[i]); i++;
    }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }

  var MONTHS = { jan: 1, january: 1, enero: 1, feb: 2, february: 2, pebrero: 2, mar: 3, march: 3, marso: 3, apr: 4, april: 4, abril: 4, may: 5, mayo: 5, jun: 6, june: 6, hunyo: 6,
    jul: 7, july: 7, hulyo: 7, aug: 8, august: 8, agosto: 8, sep: 9, sept: 9, september: 9, setyembre: 9, oct: 10, october: 10, oktubre: 10, nov: 11, november: 11, nobyembre: 11, dec: 12, december: 12, disyembre: 12 };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function mkDate(y, m, d) { y = Number(y); if (y < 100) y += 2000; m = Number(m); d = Number(d || 1);
    if (!(y >= 2020 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return ''; return y + '-' + pad(m) + '-' + pad(d); }
  function parseDate(t) {
    t = t.toLowerCase().replace(/(\d+)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ').replace(/\bof\b/g, ' ').replace(/\s+/g, ' ').trim();
    var m;
    if ((m = t.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return mkDate(m[1], m[2], m[3]);
    if ((m = t.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))) return mkDate(m[3], m[2], m[1]);     // day/month/year (Bahrain)
    var mon = null, monAt = -1, words = t.split(' ');
    for (var i = 0; i < words.length; i++) if (words[i] in MONTHS) { mon = MONTHS[words[i]]; monAt = i; break; }
    if (mon) {
      var nums = []; words.forEach(function (x, k) { if (/^\d+$/.test(x)) nums.push({ v: Number(x), k: k }); });
      var year = nums.filter(function (n) { return n.v >= 2020 || (n.v >= 24 && n.v <= 99 && n.k > monAt); }).pop();
      var day = nums.filter(function (n) { return n !== year && n.v >= 1 && n.v <= 31; })[0];
      if (year) return mkDate(year.v, mon, day ? day.v : 1);
      if (day) return mkDate(new Date().getFullYear(), mon, day.v);
    }
    return '';
  }

  var UNITS = [
    { re: /^(kilos?|kilograms?|kgs?|kilo)$/, unit: 'Kg' },
    { re: /^(grams?|grammes?|gms?|g|gramo)$/, unit: 'g' },
    { re: /^(pieces?|pcs?|pc|piraso|pirasos?|piece)$/, unit: 'Piece' },
    { re: /^(box(es)?|kahon)$/, unit: 'Box' },
    { re: /^(cans?|lata)$/, unit: 'Can' },
    { re: /^(stems?|tangkay)$/, unit: 'Stem' },
    { re: /^(bunch(es)?|bundles?)$/, unit: 'Bunch' }
  ];

  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function lev(a, b) { if (a === b) return 0; var m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    var p = [], c, i, j; for (j = 0; j <= n; j++) p[j] = j;
    for (i = 1; i <= m; i++) { c = [i]; for (j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; }
    return p[n]; }
  function sim(a, b) { var l = Math.max(a.length, b.length) || 1; return 1 - lev(a, b) / l; }
  // Score 0..1: whole-string likeness mixed with how many spoken words match a word of the name.
  function score(said, name) {
    var one = function (w) { return w.length > 3 ? w.replace(/ies$/, 'y').replace(/([^s])s$/, '$1') : w; };   // "lilies" = "lily", "roses" = "rose"
    var s = norm(said).split(' ').map(one).join(' '), n = norm(name).split(' ').map(one).join(' '); if (!s || !n) return 0;
    if (s === n) return 1;
    var sw = s.split(' '), nw = n.split(' '), hit = 0;
    if (sw.slice().sort().join(' ') === nw.slice().sort().join(' ')) return 1;   // same words, other order ("oriental lily" = "Lily Oriental")
    nw.forEach(function (x) { var b = 0; sw.forEach(function (y) { b = Math.max(b, sim(x, y)); }); hit += b; });
    var words = hit / nw.length;
    var extra = Math.max(0, sw.length - nw.length) * .04;
    var whole = Math.max(sim(s, n), sim(sw.slice().sort().join(' '), nw.slice().sort().join(' ')));
    return Math.max(0, Math.min(1, .65 * words + .35 * whole - extra));
  }
  // How a name is said out loud: "S-Rose" = "spray rose", "Stelitzia(BOP)" = "bird of paradise" / "strelitzia" (Bench, Nov 19)
  function spoken(n) {
    n = String(n || ''); var out = [];
    var a = n.replace(/\bS[-.\s]+(?=[a-z])/gi, 'spray ').replace(/\s+/g, ' ').trim(); if (a !== n) out.push(a);
    if (/\bBOP\b/i.test(n)) { out.push('bird of paradise'); out.push('bird paradise'); }
    if (/stelitzia|strelitzia/i.test(n)) out.push('strelitzia');
    return out;
  }
  function match(said, names) {
    var list = (names || []).map(function (n) { var s0 = score(said, n); spoken(n).forEach(function (x) { s0 = Math.max(s0, score(said, x)); }); return { name: n, s: s0 }; }).sort(function (a, b) { return b.s - a.s; });
    return list.slice(0, 4);
  }

  function parse(text, names) {
    var out = { raw: text, name: '', nameScore: 0, choices: [], qty: null, unit: '', pack: '', expiry: '', add: false, rest: '' };
    var t = ' ' + wordsToDigits(String(text || '')) + ' ';
    // "… add" / "add to list" / "next" at the end
    var addRe = /\b(add to (the )?list|add it|add|next|idagdag|sunod)\s*\.?\s*$/i;
    if (addRe.test(t.trim())) { out.add = true; t = ' ' + t.trim().replace(addRe, '') + ' '; }
    // expiry: everything after the expiry word
    var ex = t.match(/\b(expiry( date)?|expiration( date)?|expires?( on)?|exp|best before|use by|until|hanggang)\b(.*)$/i);
    if (ex) { out.expiry = parseDate(ex[ex.length - 1]); t = t.slice(0, ex.index) + ' '; }
    // qty + unit ("10 kilo", "500 grams", "2 boxes", "12")
    // A number followed by a unit wins; otherwise the LAST plain number (names like "Dark 70" keep their own number).
    var w = t.trim().split(/\s+/), found = -1, len = 0;
    for (var i = 0; i < w.length && found < 0; i++) {
      var g = w[i].toLowerCase().match(/^(\d+(?:\.\d+)?)(kg|kgs|g|gms|pcs|pc)$/);
      if (g) { out.qty = Number(g[1]); out.unit = /^k/.test(g[2]) ? 'Kg' : /^g/.test(g[2]) ? 'g' : 'Piece'; found = i; len = 1; break; }
      if (/^\d+(\.\d+)?$/.test(w[i])) {
        var nx = (w[i + 1] || '').toLowerCase().replace(/[^a-z]/g, ''), u = '';
        UNITS.forEach(function (x) { if (!u && x.re.test(nx)) u = x.unit; });
        if (u) { out.qty = Number(w[i]); out.unit = u; found = i; len = 2; }
      }
    }
    if (found < 0) for (var j = w.length - 1; j >= 0; j--) if (/^\d+(\.\d+)?$/.test(w[j]) && j > 0) { out.qty = Number(w[j]); found = j; len = 1; break; }
    if (found >= 0) w.splice(found, len);
    if (out.unit === 'Box' || out.unit === 'Can') { out.pack = out.unit; }
    out.rest = w.join(' ').replace(/\b(of|na|ng|ang|yung|ung|the|please|po)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    if (out.rest && names && names.length) {
      out.choices = match(out.rest, names);
      if (out.choices.length) { out.name = out.choices[0].name; out.nameScore = out.choices[0].s; }
    }
    return out;
  }

  // Pick the alternative that matches a name best (speech gives up to 3 guesses).
  function parseBest(alts, names) {
    var best = null;
    (alts || []).forEach(function (a) { var p = parse(a, names); if (!best || p.nameScore > best.nameScore + .02 || (!best.qty && p.qty)) best = p; });
    return best;
  }

  // ---------- whole-form commands: "supplier Lebanon", "storage chiller", "received by Joy", "price 24" ----------
  // Short lists (suppliers, places, people): one spoken word that matches one word of the name is enough ("Lebanon").
  function pick(said, options, aliases) {
    var s = norm(String(said).replace(/&/g, ' and ')).split(' ').filter(function (w) { return w && !/^(and|at|the|sa|si|ni|kay)$/.test(w); });
    if (!s.length) return null;
    var best = null;
    (options || []).forEach(function (o) {
      var words = norm(String(o).replace(/&/g, ' ')).split(' ').concat(((aliases || {})[o] || []).map(norm));
      var cov = 0; s.forEach(function (w) { var b = 0; words.forEach(function (x) { b = Math.max(b, x.indexOf(' ') > -1 ? sim(s.join(' '), x) : sim(w, x)); }); cov += b; });
      var sc = cov / s.length * .85 + sim(s.join(' '), norm(o)) * .15;
      if (!best || sc > best.s) best = { name: o, s: sc };
    });
    return best && best.s >= .72 ? best.name : null;
  }
  var KEYS = [
    ['clear', /\b(cancel all|clear all|clear everything|reset( all| form)?|renew|start over|bura lahat|ulitin)\b/],
    ['receivedBy', /\b(received by|receiver|tinanggap ni|tinanggap)\b/],
    ['receiveDate', /\b(receive date|received date|date received|received on|received|arrived( on)?|dumating( noong)?)\b/],
    ['expiry', /\b(expiry( date)?|expiration( date)?|expires?( on)?|best before|use by)\b/],
    ['supplier', /\b(supplier|galing sa|from)\b/],
    ['storage', /\b(storage location|location|put (it )?in|store (it )?in|ilagay sa|lagay sa|storage(?=\s+\S))\b/],
    ['delivery', /\b(delivery note( number| no\.?)?|delivery( number| no\.?)?)\b/],
    ['batch', /\b(batch( number| no\.?)?)\b/],
    ['qty', /\b(quantity|qty|dami)\b/],
    ['price', /\b(price( per (kilo|kg|box|piece|can))?|presyo|cost)\b/],
    ['weight', /\b(weight( per (piece|box|can))?|bigat)\b/],
    ['tray', /\b(tray( code)?|colou?r code)\b/],
    ['remarks', /\b(remarks?|note)\b/]
  ];
  function parseForm(text, lists) {
    lists = lists || {};
    var t = ' ' + wordsToDigits(String(text || '')).toLowerCase() + ' ';
    var out = { raw: text, fields: {}, item: null, add: false, clear: false };
    var addRe = /\b(add to (the )?list|add it|add|idagdag)\s*\.?\s*$/i;
    if (addRe.test(t.trim())) { out.add = true; t = ' ' + t.trim().replace(addRe, '') + ' '; }
    var hits = [];
    KEYS.forEach(function (k) { var re = new RegExp(k[1].source, 'gi'), m; while ((m = re.exec(t))) hits.push({ k: k[0], at: m.index, end: m.index + m[0].length }); });
    hits.sort(function (a, b) { return a.at - b.at || (b.end - b.at) - (a.end - a.at); });
    var cut = []; hits.forEach(function (h) { if (!cut.length || h.at >= cut[cut.length - 1].end) cut.push(h); });   // no overlaps
    var head = (cut.length ? t.slice(0, cut[0].at) : t).trim();
    cut.forEach(function (h, i) {
      var val = t.slice(h.end, i + 1 < cut.length ? cut[i + 1].at : t.length).replace(/^[\s:,.-]+|[\s,.]+$/g, '').trim();
      var f = out.fields;
      if (h.k === 'clear') { out.clear = true; return; }
      if (h.k === 'expiry') { var d = parseDate(val); if (d) f.expiry = d; return; }
      if (h.k === 'receiveDate') {
        if (/\b(today|ngayon)\b/.test(val) || !val) { f.receiveDate = iso(new Date()); return; }
        if (/\b(yesterday|kahapon)\b/.test(val)) { var y = new Date(); y.setDate(y.getDate() - 1); f.receiveDate = iso(y); return; }
        var d2 = parseDate(val); if (d2) f.receiveDate = d2; return;
      }
      if (h.k === 'supplier') { var sp = pick(val, lists.suppliers, lists.supplierAliases); if (sp) f.supplier = sp; else f.supplierHeard = val; return; }
      if (h.k === 'storage') { var lc = pick(val, lists.locations); if (lc) f.storage = lc; return; }
      if (h.k === 'receivedBy') { var pp = pick(val, lists.people); f.receivedBy = pp || val.replace(/\b\w/g, function (c) { return c.toUpperCase(); }); return; }
      if (h.k === 'qty') { var q = val.match(/\d+(\.\d+)?/); if (q) { f.qty = Number(q[0]); var uu = val.match(/\b(kilos?|kg|grams?|pieces?|pcs|box(es)?)\b/); if (uu) f.qtyUnit = /^k/.test(uu[1]) ? 'Kg' : /^g/.test(uu[1]) ? 'g' : /^b/.test(uu[1]) ? 'Box' : 'Piece'; } return; }
      if (h.k === 'price' || h.k === 'weight') { var n = val.match(/\d+(\.\d+)?/); if (n) f[h.k] = Number(n[0]); return; }
      if (h.k === 'delivery' || h.k === 'batch' || h.k === 'tray') { if (val) f[h.k] = val.replace(/\s+(?=\d)/g, '').toUpperCase(); return; }
      if (h.k === 'remarks') { if (val) f.remarks = val.charAt(0).toUpperCase() + val.slice(1); }
    });
    // "storage" / "display" / "chiller" said alone also picks the place
    if (!out.fields.storage && lists.locations) {
      lists.locations.forEach(function (l) { if (new RegExp('\\b(in|sa|to) (the )?' + norm(l) + '\\b').test(head)) { out.fields.storage = l; head = head.replace(new RegExp('\\b(in|sa|to) (the )?' + norm(l) + '\\b'), ' ').trim(); } });
    }
    if (head && !out.fields.storage && lists.locations) { var only = lists.locations.filter(function (l) { return norm(l) === norm(head); })[0]; if (only) { out.fields.storage = only; head = ''; } }
    if (head) out.item = parse(head, lists.names);
    return out;
  }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  // Talk back (free, built into the browser)
  // Returns a promise that ends when the talking is done (or after a safe time), so hands-free pages can listen again after.
  function speak(text) {
    return new Promise(function (resolve) {
      var t = setTimeout(resolve, Math.min(15000, 900 + String(text || '').length * 75));
      try {
        if (!window.speechSynthesis || !text) { clearTimeout(t); resolve(); return; }
        speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 1;
        u.onend = u.onerror = function () { clearTimeout(t); setTimeout(resolve, 150); };
        speechSynthesis.speak(u);
      } catch (e) { clearTimeout(t); resolve(); }
    });
  }

  window.LBVoice = { supported: supported, listen: listen, parse: parse, parseBest: parseBest, parseForm: parseForm, pick: pick, speak: speak, parseDate: parseDate, wordsToDigits: wordsToDigits, match: match };
})();
