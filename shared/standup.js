/* LALABELLA HQ — Daily Stand-up (Nov 21 2026, Bench)
 * A Zoom-style meeting of the HQ workers: gallery of "webcams" (3D portraits of the chibi animals),
 * then each worker takes a turn — big tile, caption, voice — and shows what they watch ("shared screen").
 * Data comes from office.html (window.LBStandupData) — the same live status the HQ shows. Nothing is changed or sent.
 */
(function () {
  if (window.LBStandup) return;
  var ST_COL = { working:'#4fb3ff', ok:'#5be29a', warn:'#ffc24f', alert:'#ff6b6b' };
  var BG = { orders:'#f2b880', hr:'#f5a3c0', boss:'#9fd3f5', tech:'#a8e6a1', records:'#d4b8ff', deliv:'#8fe3d0', cafe:'#ffd68a', saudi:'#8fe3a8' };
  var ROOM_OF = { dispatcher:'orders', shopify:'orders', bleems:'orders', abandoned:'orders', hr:'hr', timekeeper:'hr', boss:'boss', secretary:'boss', watcher:'tech', doctor:'tech', odoo:'tech',
    scribe:'records', auditor:'records', archivist:'records', keeper:'records', delivery:'deliv', driver:'deliv', barista:'cafe', janitor:'cafe', saudi:'saudi' };
  var EMO = { boss:'🐻', dispatcher:'🦊', shopify:'🐸', bleems:'🐰', abandoned:'🦝', hr:'🐱', timekeeper:'🦉', delivery:'🐶', driver:'🐶', watcher:'🐱', doctor:'🐼', scribe:'🐭', auditor:'🦉', archivist:'🐻', janitor:'🦝', saudi:'🦊', secretary:'🐱', barista:'🐰', keeper:'🐭', odoo:'🦉' };
  var css =
    '#lbsu{position:fixed;inset:0;z-index:2147482000;background:#1a1c21;color:#e9eaee;font-family:"Space Grotesk",system-ui,sans-serif;display:flex;flex-direction:column}' +
    '#lbsu .top{display:flex;align-items:center;gap:10px;padding:9px 14px;font-size:12px;color:#c9ccd4;flex:none}' +
    '#lbsu .top .g{width:8px;height:8px;border-radius:50%;background:#3ddc84}#lbsu .top b{color:#fff;font-weight:600}#lbsu .rec{color:#ff6b6b;font-weight:600}#lbsu .rec:before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:#ff4d4d;margin-right:5px;animation:lbsuB 1.4s infinite}' +
    '@keyframes lbsuB{50%{opacity:.25}}#lbsu .top .sp{margin-left:auto;background:#2a2d34;border-radius:6px;padding:3px 9px}' +
    '#lbsu .stage{flex:1;min-height:0;display:flex;gap:8px;padding:0 10px 8px}' +
    '#lbsu .grid{flex:1;display:grid;gap:6px;align-content:center;grid-template-columns:repeat(var(--c,5),minmax(0,1fr))}' +
    '#lbsu.spk .grid{flex:0 0 min(42%,520px);grid-template-columns:repeat(4,minmax(0,1fr));align-content:start;overflow-y:auto}' +
    '#lbsu .big{display:none;flex:1;min-width:0;position:relative;border-radius:12px;overflow:hidden}#lbsu.spk .big{display:block}' +
    '#lbsu .tile{position:relative;aspect-ratio:16/11;border-radius:9px;overflow:hidden;border:2px solid transparent;transition:border-color .2s}' +
    '#lbsu .tile.on{border-color:#3ddc84}#lbsu .tile.done{opacity:.72}' +
    '#lbsu .cam{position:absolute;inset:0;background:var(--bg);display:flex;align-items:flex-end;justify-content:center;overflow:hidden}' +
    '#lbsu .cam:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.55) 0 8%,transparent 8% 100%),linear-gradient(90deg,transparent 0 12%,rgba(255,255,255,.45) 12% 30%,transparent 30% 70%,rgba(255,255,255,.35) 70% 86%,transparent 86%),linear-gradient(180deg,transparent 55%,rgba(60,40,30,.18) 55%);filter:blur(3px)}' +
    '#lbsu .cam img{position:relative;height:108%;width:auto;max-width:none;transform:translateY(6%);filter:drop-shadow(0 6px 10px rgba(0,0,0,.25))}#lbsu .cam .emo{position:relative;font-size:min(9vw,74px);margin-bottom:6%}' +
    '#lbsu .big .cam img{height:100%;transform:translateY(3%)}#lbsu .big .cam .emo{font-size:min(22vw,200px)}' +
    '#lbsu .lab{position:absolute;left:5px;bottom:5px;display:flex;align-items:center;gap:5px;background:rgba(20,22,26,.72);border-radius:5px;padding:2px 7px;font-size:10.5px;color:#fff;max-width:92%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#lbsu .lab i{width:7px;height:7px;border-radius:50%;flex:none}#lbsu .big .lab{font-size:13px;padding:4px 10px;left:10px;bottom:10px}' +
    '#lbsu .mic{position:absolute;right:6px;top:6px;font-size:11px;background:rgba(20,22,26,.6);border-radius:5px;padding:1px 5px}' +
    '#lbsu .cap{position:absolute;left:50%;bottom:46px;transform:translateX(-50%);max-width:86%;background:rgba(10,10,12,.78);color:#fff;border-radius:8px;padding:8px 14px;font-size:clamp(13px,1.6vw,17px);line-height:1.35;text-align:center}' +
    '#lbsu .share{position:absolute;right:12px;top:12px;width:min(46%,380px);background:#fff;color:#2a2420;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.35);overflow:hidden;font-size:12.5px}' +
    '#lbsu .share .h{background:#3ddc84;color:#08311b;font-weight:700;font-size:11px;padding:5px 10px}#lbsu .share .b{padding:10px 12px;line-height:1.45;max-height:38vh;overflow:auto}#lbsu .share .b b{display:block;font-size:13px;margin-bottom:4px}' +
    '#lbsu .bar{flex:none;display:flex;align-items:center;justify-content:center;gap:4px;padding:6px 10px 10px;background:#15171b}' +
    '#lbsu .bar button{background:transparent;border:0;color:#d5d7de;font:inherit;font-size:10.5px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:5px 12px;border-radius:8px;cursor:pointer}' +
    '#lbsu .bar button i{font-style:normal;font-size:18px}#lbsu .bar button:hover{background:#262931}#lbsu .bar .leave{margin-left:auto;background:#e5484d;color:#fff;padding:8px 16px;font-size:12px;font-weight:600}' +
    '#lbsu .sum{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px}#lbsu .sum .card{background:#fff;color:#2a2420;border-radius:16px;max-width:560px;width:100%;padding:20px 22px;max-height:90%;overflow:auto}' +
    '#lbsu .sum h3{margin:0 0 4px;font-size:20px}#lbsu .sum .row{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-top:1px solid #eee;font-size:13px}#lbsu .sum .row i{width:9px;height:9px;border-radius:50%;margin-top:5px;flex:none}' +
    '#lbsu .sum .row b,#lbsu .sum .row span{all:unset;font:inherit}#lbsu .sum .row b{font-weight:700;color:#2a2420}#lbsu .sum .row .r{color:#8c8279}#lbsu .sum .row .t{display:block;margin-top:2px;color:#2a2420}' +
    '#lbsu .sum .btns{display:flex;gap:8px;margin-top:14px}#lbsu .sum button{flex:1;border:1px solid #ddd;background:#fff;border-radius:10px;padding:10px;font:inherit;font-weight:600;cursor:pointer}#lbsu .sum button.p{background:#2b211b;color:#fff;border-color:#2b211b}' +
    '@media(max-width:760px){#lbsu.spk .stage{flex-direction:column}#lbsu.spk .grid{flex:none;order:2;grid-template-columns:repeat(6,minmax(0,1fr));max-height:24vh}#lbsu .grid{--c:3 !important}#lbsu.spk .big{min-height:0}' +
    '#lbsu .share{position:absolute;left:10px;right:10px;top:auto;bottom:96px;width:auto}#lbsu .share .b{max-height:20vh}#lbsu .cap{bottom:10px}#lbsu .bar button{padding:5px 7px}#lbsu .lab{font-size:9px}}';

  var el = null, run = 0, idx = -1, order = [], paused = false, muted = false, timer = null, PICS = {}, D = null;
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function L(en, tl) { return D && D.tl ? tl : en; }
  function cam(k, big) {
    var bg = BG[ROOM_OF[k]] || '#d9d9e0';
    return '<div class="cam" style="--bg:linear-gradient(180deg,' + bg + ',#f6efe6)">' + (PICS[k] ? '<img src="' + PICS[k] + '" alt="">' : '<span class="emo">' + (EMO[k] || '🙂') + '</span>') + '</div>';
  }
  function tile(k) {
    var e = D.EMP[k] || {};
    return '<div class="tile" data-k="' + k + '">' + cam(k) + '<div class="mic">' + (k === order[idx] ? '🎙️' : '🔇') + '</div><div class="lab"><i style="background:' + (ST_COL[e.st] || '#999') + '"></i>' + esc(e.name || k) + ' · ' + esc(e.role || '') + '</div></div>';
  }
  function clock() { var t = new Date(Date.now() + 3 * 3600000), h = t.getUTCHours(); return (h % 12 || 12) + ':' + String(t.getUTCMinutes()).padStart(2, '0') + (h < 12 ? ' AM' : ' PM'); }
  function day() { return new Date(Date.now() + 3 * 3600000).toLocaleDateString('en-GB', { weekday:'long', timeZone:'UTC' }); }
  function line(k) {
    var e = D.EMP[k] || {};
    if (k === 'boss' && idx === 0) {
      var n = order.length - 2;
      return L(D.greet + ', ' + D.me.name + '! Quick round today — ' + n + ' desks reporting. Let\'s go.', D.greet + ', ' + D.me.name + '! Mabilis na round lang — ' + n + ' desk ang mag-uulat. Simulan na natin.');
    }
    if (k === 'boss') {
      var bad = order.filter(function (x) { var s = (D.EMP[x] || {}).st; return x !== 'boss' && (s === 'warn' || s === 'alert'); });
      return bad.length ? L('That\'s everyone. ' + bad.length + ' need your attention: ' + bad.map(function (x) { return D.EMP[x].name; }).join(', ') + '. Over to you, ' + D.me.sir + '.', 'Yan na po lahat. ' + bad.length + ' ang kailangan ng atensyon ninyo: ' + bad.map(function (x) { return D.EMP[x].name; }).join(', ') + '. Kayo na po, ' + D.me.sir + '.')
        : L('That\'s everyone. All desks are good today. Have a great day, ' + D.me.sir + '!', 'Yan na po lahat. Ayos ang lahat ng desk ngayon. Magandang araw po, ' + D.me.sir + '!');
    }
    var opener = e.st === 'alert' ? L('Heads up — ', 'Paalala po — ') : e.st === 'warn' ? L('One thing — ', 'Isang bagay po — ') : '';
    return opener + (e.say || '');
  }
  function paint() {
    if (!el) return;
    var k = order[idx], e = (k && D.EMP[k]) || {};
    el.className = idx >= 0 && idx < order.length ? 'spk' : '';
    var grid = el.querySelector('.grid'), big = el.querySelector('.big');
    grid.style.setProperty('--c', 5);
    var uniq = order.filter(function (x, i) { return order.indexOf(x) === i; }), cur = order[idx], seen = order.slice(0, Math.max(0, idx));
    grid.innerHTML = uniq.map(tile).join('');
    [].forEach.call(grid.children, function (t) { var kk = t.getAttribute('data-k'); if (kk === cur) t.classList.add('on'); else if (seen.indexOf(kk) >= 0) t.classList.add('done'); });
    el.querySelector('.who').textContent = idx >= 0 && idx < order.length ? (idx + 1) + ' / ' + order.length + ' · ' + (e.name || '') : order.length + L(' participants', ' kasali');
    if (idx >= 0 && idx < order.length) {
      var share = k !== 'boss' && (e.st === 'warn' || e.st === 'alert' || e.out) ? '<div class="share"><div class="h">' + L('You are viewing ' + e.name + '\'s screen', 'Screen ni ' + e.name) + '</div><div class="b"><b>' + esc(e.role) + '</b>' + esc(e.out || e.now || '') + '</div></div>' : '';
      big.innerHTML = cam(k, true) + share + '<div class="cap">' + esc(line(k)) + '</div><div class="lab"><i style="background:' + (ST_COL[e.st] || '#999') + '"></i>' + esc(e.name) + ' · ' + esc(e.role) + '</div>';
    }
    el.querySelector('[data-a=pause] i').textContent = paused ? '▶️' : '⏸️';
    el.querySelector('[data-a=pause] span').textContent = paused ? L('Resume', 'Ituloy') : L('Pause', 'Pause');
    el.querySelector('[data-a=mute] i').textContent = muted ? '🔇' : '🔊';
  }
  function next(step) {
    clearTimeout(timer); try { if (window.LBOfficeStopVoice) window.LBOfficeStopVoice(); } catch (e) {}
    idx += step == null ? 1 : step; if (idx < 0) idx = 0;
    if (idx >= order.length) return summary();
    var my = ++run; paint();
    var k = order[idx], text = line(k), done = function () { if (my !== run || paused) return; timer = setTimeout(function () { if (my === run && !paused) next(); }, 900); };
    var spoke = !muted && window.LBOfficeSpeakReport && window.LBOfficeSpeakReport(k, text, { end: done });
    if (!spoke) timer = setTimeout(done, Math.max(3500, Math.min(9000, text.length * 65)));
  }
  function summary() {
    clearTimeout(timer); run++; idx = order.length; paint(); el.className = '';
    var ks = order.filter(function (x) { return x !== 'boss'; }), bad = ks.filter(function (x) { var s = D.EMP[x].st; return s === 'warn' || s === 'alert'; });
    var box = document.createElement('div'); box.className = 'sum';
    box.innerHTML = '<div class="card"><h3>📋 ' + L('Stand-up notes', 'Notes ng stand-up') + ' · ' + day() + '</h3><div style="color:#8c8279;font-size:12.5px;margin-bottom:8px">' + clock() + ' · ' + ks.length + L(' desks · ', ' desk · ') + bad.length + L(' need attention', ' kailangang tingnan') + '</div>' +
      (bad.length ? bad : []).concat(ks.filter(function (x) { return bad.indexOf(x) < 0; })).map(function (x) { var e = D.EMP[x]; return '<div class="row"><i style="background:' + ST_COL[e.st] + '"></i><div><b>' + esc(e.name) + '</b> <span class="r">· ' + esc(e.role) + '</span><span class="t">' + esc(e.say) + '</span></div></div>'; }).join('') +
      '<div class="btns"><button data-a="again">↺ ' + L('Again', 'Ulitin') + '</button><button class="p" data-a="leave">' + L('Leave meeting', 'Umalis sa meeting') + '</button></div></div>';
    el.querySelector('.stage').appendChild(box);
  }
  function close() { clearTimeout(timer); run++; try { if (window.LBOfficeStopVoice) window.LBOfficeStopVoice(); } catch (e) {} if (el) el.remove(); el = null; document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (!el) return; if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') next(-1); else if (e.key === ' ') { e.preventDefault(); el.querySelector('[data-a=pause]').click(); } }
  function start(opts) {
    D = window.LBStandupData && window.LBStandupData();
    if (!D || !D.EMP || !D.KEYS) { alert('The team is still loading — try again in a few seconds.'); return; }
    if (!document.getElementById('lbsuCss')) { var s = document.createElement('style'); s.id = 'lbsuCss'; s.textContent = css; document.head.appendChild(s); }
    close();
    var ks = D.KEYS.filter(function (k) { return D.EMP[k] && k !== 'boss'; });
    order = ['boss'].concat(ks).concat(['boss']).filter(function (k) { return D.EMP[k]; });
    order = order.length > 1 ? order : ks;
    try { PICS = (window.LBOffice3D && window.LBOffice3D.portraits && window.LBOffice3D.portraits(D.KEYS.filter(function (k) { return D.EMP[k]; }), 520)) || {}; } catch (e) { PICS = {}; }
    el = document.createElement('div'); el.id = 'lbsu'; el.setAttribute('data-lb-look-skip', ''); el.setAttribute('data-lb-theme-skip', '');
    el.innerHTML = '<div class="top"><span class="g"></span><b>' + L('Daily Stand-up', 'Daily Stand-up') + ' · Lalabella HQ</b><span>' + clock() + '</span><span class="rec">LIVE</span><span class="sp who"></span></div>' +
      '<div class="stage"><div class="big"></div><div class="grid"></div></div>' +
      '<div class="bar"><button data-a="mute"><i>🔊</i><span>' + L('Sound', 'Tunog') + '</span></button><button data-a="prev"><i>⏮️</i><span>' + L('Back', 'Bumalik') + '</span></button><button data-a="pause"><i>⏸️</i><span>Pause</span></button>' +
      '<button data-a="next"><i>⏭️</i><span>' + L('Next', 'Susunod') + '</span></button><button data-a="notes"><i>📋</i><span>' + L('Notes', 'Notes') + '</span></button><button class="leave" data-a="leave">' + L('Leave', 'Umalis') + '</button></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'), t = e.target.closest('.tile[data-k]');
      if (t && !b) { var i = order.indexOf(t.getAttribute('data-k')); if (i >= 0) { var sm = el.querySelector('.sum'); if (sm) sm.remove(); paused = false; idx = i - 1; next(); } return; }
      if (!b) return; var a = b.getAttribute('data-a');
      if (a === 'leave') return close();
      if (a === 'next') { var s1 = el.querySelector('.sum'); if (s1) return; paused = false; return next(); }
      if (a === 'prev') { var s2 = el.querySelector('.sum'); if (s2) s2.remove(); paused = false; return next(-1); }
      if (a === 'notes') { var s3 = el.querySelector('.sum'); if (s3) { s3.remove(); return; } return summary(); }
      if (a === 'again') { var s4 = el.querySelector('.sum'); if (s4) s4.remove(); paused = false; idx = -1; return next(); }
      if (a === 'mute') { muted = !muted; if (muted) { try { window.LBOfficeStopVoice && window.LBOfficeStopVoice(); } catch (x) {} } paint(); if (!paused) { idx--; next(); } return; }
      if (a === 'pause') { paused = !paused; if (paused) { clearTimeout(timer); run++; try { window.LBOfficeStopVoice && window.LBOfficeStopVoice(); } catch (x) {} paint(); } else { idx--; next(); } }
    });
    document.addEventListener('keydown', onKey);
    paused = false; idx = -1; paint();
    timer = setTimeout(function () { next(); }, (opts && opts.delay) || 1600);
  }
  window.LBStandup = { start: start, close: close };
})();
