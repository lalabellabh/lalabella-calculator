/* LALABELLA HQ — Daily Stand-up (Nov 21 2026, Bench)
 * A Zoom-style meeting of the HQ workers. Every "webcam" is a live 3D set (shared/office3d.js → LBOffice3D.meet):
 * the chibi animal sits at a desk in its own room, breathes, blinks, looks around, and talks (mouth, head, hand).
 * Flow: lobby → Join → BOSS opens → each desk reports (caption follows the voice word by word, shared screen when
 * there is something to check, reactions from the others) → BOSS closes → meeting notes (copy for WhatsApp).
 * Data = the same live status the HQ shows (window.LBStandupData). Nothing is changed or sent.
 */
(function () {
  if (window.LBStandup) return;
  var ST_COL = { working:'#4fb3ff', ok:'#3ddc84', warn:'#ffc24f', alert:'#ff6b6b' };
  var ST_TXT = { working:['Working', 'Nagtatrabaho'], ok:['All good', 'Ayos'], warn:['Check', 'Tingnan'], alert:['Problem', 'Problema'] };
  var EMO = { boss:'🐻', dispatcher:'🦊', shopify:'🐸', bleems:'🐰', abandoned:'🦝', hr:'🐱', timekeeper:'🦉', delivery:'🐶', driver:'🐶', watcher:'🐱', doctor:'🐼', scribe:'🐭', auditor:'🦉', archivist:'🐻', janitor:'🦝', saudi:'🦊', secretary:'🐱', barista:'🐰', keeper:'🐭', odoo:'🦉' };
  var REACT = ['👍', '👏', '🙌', '💯', '😂', '❤️', '🔥', '☕'];
  var css = [
    '#lbsu{position:fixed;inset:0;z-index:2147482000;background:#121317;color:#eceef3;font-family:"Space Grotesk",system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;overflow:hidden;-webkit-font-smoothing:antialiased}',
    '#lbsu *{box-sizing:border-box}',
    /* top bar */
    '#lbsu .top{display:flex;align-items:center;gap:12px;padding:10px 16px;flex:none;font-size:12.5px;color:#aeb3bf}',
    '#lbsu .shield{width:22px;height:22px;border-radius:7px;background:linear-gradient(135deg,#3ddc84,#1f9d5a);display:flex;align-items:center;justify-content:center;font-size:12px;color:#06210f;font-weight:800}',
    '#lbsu .ttl{color:#fff;font-weight:600;font-size:13.5px}#lbsu .tm{font-variant-numeric:tabular-nums}',
    '#lbsu .rec{display:flex;align-items:center;gap:6px;color:#ff7a7a;font-weight:600;background:rgba(255,77,77,.1);padding:3px 9px;border-radius:999px}#lbsu .rec:before{content:"";width:7px;height:7px;border-radius:50%;background:#ff4d4d;animation:lbsuB 1.4s infinite}',
    '@keyframes lbsuB{50%{opacity:.25}}',
    '#lbsu .ppl{margin-left:auto;display:flex;align-items:center;gap:6px;background:#1e2026;border:1px solid #2a2d35;border-radius:999px;padding:4px 12px}',
    /* stage */
    '#lbsu .stage{flex:1;min-height:0;display:flex;gap:12px;padding:0 14px 10px;position:relative}',
    '#lbsu .main{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px}',
    '#lbsu .spk{flex:1;min-height:0;position:relative;border-radius:18px;overflow:hidden;background:#1b1d22;box-shadow:0 0 0 2px #3ddc84,0 20px 50px rgba(0,0,0,.45);transition:box-shadow .3s}',
    '#lbsu .spk.quiet{box-shadow:0 0 0 1px #2a2d35,0 20px 50px rgba(0,0,0,.45)}',
    '#lbsu .spk canvas{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '#lbsu .spk .emo{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:min(26vw,220px);background:linear-gradient(180deg,#f6e6d4,#efe0cf)}',
    '#lbsu .vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 90% at 50% 40%,transparent 60%,rgba(0,0,0,.28))}',
    '#lbsu .np{position:absolute;left:14px;bottom:14px;display:flex;align-items:center;gap:8px;background:rgba(14,15,18,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-radius:10px;padding:7px 12px;font-size:13px}',
    '#lbsu .np b{color:#fff;font-weight:600}#lbsu .np span{color:#aeb3bf}',
    '#lbsu .eq{display:inline-flex;gap:2px;align-items:flex-end;height:12px}#lbsu .eq i{width:3px;background:#3ddc84;border-radius:2px;height:30%;animation:lbsuEq .9s ease-in-out infinite}#lbsu .eq i:nth-child(2){animation-delay:.15s}#lbsu .eq i:nth-child(3){animation-delay:.3s}',
    '#lbsu .quiet .eq i{animation:none;height:25%;background:#6b7080}@keyframes lbsuEq{0%,100%{height:25%}50%{height:100%}}',
    '#lbsu .chip{position:absolute;left:14px;top:14px;display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;border-radius:999px;padding:5px 11px;background:rgba(14,15,18,.66);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}#lbsu .chip i{width:8px;height:8px;border-radius:50%}',
    '#lbsu .cap{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);width:min(760px,88%);text-align:center;font-size:clamp(14px,1.55vw,19px);line-height:1.45;font-weight:500}',
    '#lbsu .cap span{background:rgba(10,10,12,.74);-webkit-box-decoration-break:clone;box-decoration-break:clone;padding:3px 10px;border-radius:6px}',
    '#lbsu.nocc .cap{display:none}#lbsu .cap em{font-style:normal;color:#7d828f;transition:color .15s}#lbsu .cap em.s{color:#fff}',
    /* shared screen */
    '#lbsu .share{position:absolute;right:14px;top:14px;width:min(42%,400px);background:#fff;color:#2a2420;border-radius:14px;overflow:hidden;box-shadow:0 18px 44px rgba(0,0,0,.4);transform-origin:top right;animation:lbsuIn .35s ease both}',
    '@keyframes lbsuIn{from{opacity:0;transform:scale(.92) translateY(-6px)}}',
    '#lbsu .share .bar2{display:flex;align-items:center;gap:6px;padding:8px 12px;background:#f2f2f4;border-bottom:1px solid #e6e6ea;font-size:11px;color:#6b6f7a}#lbsu .share .bar2 i{width:9px;height:9px;border-radius:50%}',
    '#lbsu .share .sh{background:#3ddc84;color:#06210f;font-size:10.5px;font-weight:700;padding:4px 12px}',
    '#lbsu .share .bd{padding:12px 14px;max-height:42vh;overflow:auto}#lbsu .share h4{margin:0 0 8px;font-size:14px}',
    '#lbsu .share .kv{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid #f0eeea;font-size:12.5px}#lbsu .share .kv:first-of-type{border-top:0}#lbsu .share .kv span{color:#8c8279}#lbsu .share .kv b{text-align:right;font-weight:600}',
    /* agenda progress */
    '#lbsu .agenda{flex:none;display:flex;gap:3px;height:6px}#lbsu .agenda i{flex:1;border-radius:3px;background:#2a2d35;transition:background .3s,opacity .3s}#lbsu .agenda i.d{opacity:.95}#lbsu .agenda i.c{animation:lbsuB 1.2s infinite}',
    /* gallery */
    '#lbsu .side{flex:0 0 clamp(300px,31vw,470px);display:flex;flex-direction:column;min-height:0;gap:8px}',
    '#lbsu .sideh{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:#8c91a0;padding:0 2px}',
    '#lbsu .grid{flex:1;min-height:0;overflow-y:auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;align-content:start;padding:2px;scrollbar-width:thin;scrollbar-color:#2f323a transparent}',
    '#lbsu .tile{position:relative;aspect-ratio:16/11;border-radius:11px;overflow:hidden;background:#1d1f25;cursor:pointer;outline:2px solid transparent;transition:outline-color .25s,transform .2s,opacity .3s}',
    '#lbsu .tile:hover{transform:translateY(-1px)}#lbsu .tile.on{outline-color:#3ddc84}#lbsu .tile.done{opacity:.6}',
    '#lbsu .tile canvas{width:100%;height:100%;display:block}#lbsu .tile .emo{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:34px;background:#efe0cf}',
    '#lbsu .tile .lab{position:absolute;left:5px;bottom:5px;right:5px;display:flex;align-items:center;gap:5px;font-size:10.5px}',
    '#lbsu .tile .lab span{background:rgba(14,15,18,.7);border-radius:5px;padding:2px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}#lbsu .tile .lab i{width:7px;height:7px;border-radius:50%;flex:none;margin-right:4px;display:inline-block}',
    '#lbsu .tile .mk{position:absolute;right:5px;top:5px;font-size:10px;background:rgba(14,15,18,.65);border-radius:5px;padding:2px 5px}',
    '#lbsu .rx{position:absolute;left:50%;top:40%;font-size:30px;pointer-events:none;animation:lbsuRx 1.8s ease-out forwards}@keyframes lbsuRx{0%{opacity:0;transform:translate(-50%,10px) scale(.6)}15%{opacity:1;transform:translate(-50%,0) scale(1.1)}100%{opacity:0;transform:translate(-50%,-46px) scale(1)}}',
    /* controls */
    '#lbsu .ctl{flex:none;display:flex;align-items:center;gap:4px;padding:8px 14px 12px;background:#0d0e11;border-top:1px solid #1d1f25}',
    '#lbsu .ctl button{background:transparent;border:0;color:#d5d8e0;font:inherit;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 12px;border-radius:10px;cursor:pointer;min-width:62px}',
    '#lbsu .ctl button i{font-style:normal;font-size:19px;line-height:1}#lbsu .ctl button:hover{background:#1e2027}#lbsu .ctl button.off i{opacity:.5}',
    '#lbsu .ctl .mid{display:flex;gap:2px;margin:0 auto}#lbsu .ctl .leave{background:#e5484d;color:#fff;font-size:12.5px;font-weight:600;padding:9px 18px;flex-direction:row;min-width:0}#lbsu .ctl .leave:hover{background:#d13b40}',
    /* lobby */
    '#lbsu .lobby{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:18px;background:radial-gradient(80% 70% at 50% 20%,#1f2a24,#121317 70%)}',
    '#lbsu .lob{width:min(560px,100%);text-align:center}#lbsu .lob .k{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#3ddc84;font-weight:700}',
    '#lbsu .lob h2{font-size:clamp(26px,4vw,38px);margin:8px 0 6px;font-weight:700;letter-spacing:-.02em}#lbsu .lob p{color:#aeb3bf;margin:0 0 20px;font-size:14px}',
    '#lbsu .stack{display:flex;justify-content:center;margin:0 0 22px}#lbsu .stack span{width:46px;height:46px;border-radius:50%;background:#efe0cf;border:3px solid #121317;margin-left:-12px;display:flex;align-items:center;justify-content:center;font-size:22px;overflow:hidden}#lbsu .stack span:first-child{margin-left:0}#lbsu .stack span canvas{width:100%;height:100%}',
    '#lbsu .stack .more{background:#2a2d35;color:#fff;font-size:12px;font-weight:700}',
    '#lbsu .lob .row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}#lbsu .lob button{border:0;border-radius:12px;padding:13px 22px;font:inherit;font-weight:600;font-size:14.5px;cursor:pointer}',
    '#lbsu .lob .go{background:#3ddc84;color:#06210f;min-width:220px}#lbsu .lob .go:hover{background:#4ff096}#lbsu .lob .alt{background:#22252c;color:#e2e5ec}',
    '#lbsu .lob .sm{margin-top:14px;font-size:12px;color:#7d828f}',
    '#lbsu .sum{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,10,12,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:5}',
    '#lbsu .sum .card{background:#fff;color:#2a2420;border-radius:18px;width:min(580px,100%);max-height:92%;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.5)}',
    '#lbsu .sum .hd{padding:18px 22px 12px}#lbsu .sum h3{margin:0;font-size:20px}#lbsu .sum .meta{color:#8c8279;font-size:12.5px;margin-top:3px}',
    '#lbsu .sum .pills{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}#lbsu .sum .pills span{font-size:11.5px;font-weight:600;border-radius:999px;padding:4px 10px;background:#f4f1ec}',
    '#lbsu .sum .bd{padding:0 22px;overflow:auto;flex:1 1 auto;min-height:120px}#lbsu .sum .sec{font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8c8279;margin:12px 0 4px}',
    '#lbsu .sum .su-it{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid #f0ece6;font-size:13px}#lbsu .sum .su-it:first-of-type{border-top:0}#lbsu .sum .su-it>i{width:9px;height:9px;border-radius:50%;margin-top:5px;flex:none}',
    '#lbsu .sum .su-it b{font-weight:700}#lbsu .sum .su-it .su-r{color:#8c8279}#lbsu .sum .su-it .su-t{display:block;margin-top:1px}',
    '#lbsu .sum .ft{display:flex;gap:8px;padding:14px 22px 18px;border-top:1px solid #f0ece6}#lbsu .sum .ft button{flex:1;border:1px solid #e4dfd7;background:#fff;border-radius:11px;padding:11px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;color:#2a2420}#lbsu .sum .ft .p{background:#2b211b;color:#fff;border-color:#2b211b}',
    '#lbsu .toast{position:absolute;left:50%;bottom:90px;transform:translateX(-50%);background:#2a2d35;color:#fff;border-radius:10px;padding:8px 14px;font-size:12.5px;z-index:9;animation:lbsuIn .25s}',
    /* phone */
    '@media(max-width:820px){#lbsu .stage{flex-direction:column;padding:0 10px 8px}#lbsu .side{flex:none;height:auto}#lbsu .sideh{display:none}',
    '#lbsu .grid{display:flex;overflow-x:auto;overflow-y:hidden;gap:6px;padding-bottom:2px}#lbsu .tile{flex:0 0 108px}',
    '#lbsu .share{left:10px;right:10px;width:auto;top:48px;bottom:auto}#lbsu .share .bd{max-height:17vh;padding:8px 12px}#lbsu .share h4{font-size:13px;margin-bottom:4px}#lbsu .share .kv{padding:4px 0;font-size:12px}#lbsu .cap{bottom:54px;width:92%}',
    '#lbsu .ctl{padding:6px 6px 10px}#lbsu .ctl button{min-width:0;padding:6px 8px;font-size:10px}#lbsu .ctl .lbl{display:none}#lbsu .top{padding:8px 10px;gap:8px}#lbsu .top .tm,#lbsu .top .rec{display:none}}'
  ].join('');

  var el = null, D = null, order = [], uniq = [], idx = -1, paused = false, muted = false, run = 0, timer = null, raf = 0, t0 = 0, started = 0, live = false;
  var talking = false, words = [], spoken = 0, tileCv = {}, rr = 0;
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function L(en, tl) { return D && D.tl ? tl : en; }
  function $(s) { return el && el.querySelector(s); }
  function E(k) { return (D && D.EMP[k]) || {}; }
  function bh() { return new Date(Date.now() + 3 * 3600000); }
  function clock() { var t = bh(), h = t.getUTCHours(); return (h % 12 || 12) + ':' + String(t.getUTCMinutes()).padStart(2, '0') + (h < 12 ? ' AM' : ' PM'); }
  function elapsed() { var s = Math.max(0, Math.floor((Date.now() - started) / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function bad(k) { var s = E(k).st; return s === 'warn' || s === 'alert'; }

  function line(k, i) {
    var e = E(k), ks = uniq.filter(function (x) { return x !== 'boss'; }), bd = ks.filter(bad);
    if (k === 'boss' && i === 0) return L(D.greet + ', ' + D.me.name + '! Welcome to the daily stand-up. ' + ks.length + ' desks will report. ' + (bd.length ? bd.length + ' have something for you today.' : 'Looks like a calm day.') + ' Let\'s start.',
      D.greet + ', ' + D.me.name + '! Simulan na natin ang daily stand-up. ' + ks.length + ' desk ang mag-uulat. ' + (bd.length ? bd.length + ' ang may kailangan sa inyo ngayon.' : 'Mukhang tahimik ang araw.') + ' Tara na po.');
    if (k === 'boss') return bd.length ? L('That\'s the round. Needs your attention: ' + bd.map(function (x) { return E(x).name; }).join(', ') + '. The notes are ready, ' + D.me.sir + '.', 'Yan po ang round. Kailangan ng atensyon ninyo: ' + bd.map(function (x) { return E(x).name; }).join(', ') + '. Handa na po ang notes, ' + D.me.sir + '.')
      : L('That\'s the round — every desk is fine. Have a great day, ' + D.me.sir + '!', 'Yan po ang round — ayos ang lahat ng desk. Magandang araw po, ' + D.me.sir + '!');
    var hi = e.st === 'alert' ? L('Heads up. ', 'Paalala po. ') : e.st === 'warn' ? L('One thing to check. ', 'May isang titingnan po. ') : '';
    return L(e.name + ' here' + (e.role ? ', ' + e.role.split('·')[0].trim() : '') + '. ', 'Si ' + e.name + ' po' + (e.role ? ', ' + e.role.split('·')[0].trim() : '') + '. ') + hi + (e.say || '') + '.';
  }
  function kv(out) {
    return String(out || '').split(' · ').map(function (p) { var i = p.indexOf(': '); return i > 0 ? '<div class="kv"><span>' + esc(p.slice(0, i)) + '</span><b>' + esc(p.slice(i + 2)) + '</b></div>' : '<div class="kv"><span></span><b>' + esc(p) + '</b></div>'; }).join('');
  }

  /* ---------- painting ---------- */
  function paintTiles() {
    var g = $('.grid'); if (!g) return;
    if (!g.children.length) {
      g.innerHTML = uniq.map(function (k) { return '<div class="tile" data-k="' + k + '">' + (live ? '<canvas width="256" height="176"></canvas>' : '<div class="emo">' + (EMO[k] || '🙂') + '</div>') + '<div class="mk">🔇</div><div class="lab"><span><i></i>' + esc(E(k).name) + '</span></div></div>'; }).join('');
      tileCv = {}; [].forEach.call(g.querySelectorAll('.tile'), function (t) { var c = t.querySelector('canvas'); if (c) tileCv[t.getAttribute('data-k')] = c.getContext('2d'); });
    }
    var cur = order[idx], seen = order.slice(0, Math.max(0, idx));
    [].forEach.call(g.children, function (t) { var k = t.getAttribute('data-k'), on = k === cur;
      t.classList.toggle('on', on); t.classList.toggle('done', !on && seen.indexOf(k) >= 0 && k !== 'boss');
      t.querySelector('.mk').textContent = on ? '🎙️' : '🔇'; t.querySelector('.lab i').style.background = ST_COL[E(k).st] || '#999'; });
    $('.ppl').innerHTML = '👥 ' + uniq.length;
    var ag = $('.agenda'); ag.innerHTML = order.map(function (k, i) { return '<i class="' + (i < idx ? 'd' : i === idx ? 'c' : '') + '" style="' + (i <= idx ? 'background:' + (ST_COL[E(k).st] || '#3ddc84') : '') + '" title="' + esc(E(k).name) + '"></i>'; }).join('');
  }
  function paintSpeaker() {
    var k = order[idx], e = E(k), box = $('.spk'); if (!k) return;
    var share = k !== 'boss' && e.out && (bad(k) || idx % 3 === 1) ? '<div class="share"><div class="bar2"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span style="margin-left:6px">' + esc(e.role) + '</span></div><div class="sh">' + L('You are viewing ' + e.name + '\'s screen', 'Nakikita mo ang screen ni ' + e.name) + '</div><div class="bd"><h4>' + esc(e.say) + '</h4>' + kv(e.out) + '</div></div>' : '';
    box.querySelectorAll('.share,.chip,.np,.cap').forEach(function (n) { n.remove(); });
    box.insertAdjacentHTML('beforeend', '<div class="chip"><i style="background:' + (ST_COL[e.st] || '#999') + '"></i>' + esc(L(ST_TXT[e.st] ? ST_TXT[e.st][0] : '', ST_TXT[e.st] ? ST_TXT[e.st][1] : '')) + '</div>' + share +
      '<div class="cap"><span></span></div><div class="np"><span class="eq"><i></i><i></i><i></i></span><b>' + esc(e.name) + '</b><span>· ' + esc(e.role) + '</span></div>');
    if (!live) { var em = box.querySelector('.emo'); if (em) em.textContent = EMO[k] || '🙂'; }
    words = line(k, idx).split(/\s+/).filter(Boolean); spoken = 0; paintCap();
  }
  function paintCap() {
    var c = $('.cap span'); if (!c) return;
    var n = words.length, from = Math.max(0, Math.min(n - 22, spoken - 10));   // a moving window, like live captions
    c.innerHTML = words.slice(from, from + 24).map(function (w, i) { return '<em class="' + (from + i < spoken ? 's' : '') + '">' + esc(w) + '</em>'; }).join(' ');
  }
  function setTalk(on) { talking = on; var s = $('.spk'); if (s) s.classList.toggle('quiet', !on); }
  function react() {
    var others = uniq.filter(function (k) { return k !== order[idx]; }); if (!others.length) return;
    var n = 1 + Math.floor(Math.random() * 2);
    for (var i = 0; i < n; i++) { var k = others[Math.floor(Math.random() * others.length)], t = el.querySelector('.tile[data-k="' + k + '"]'); if (!t) continue;
      var r = document.createElement('div'); r.className = 'rx'; r.textContent = bad(order[idx]) ? ['👀', '📝', '👍'][i % 3] : REACT[Math.floor(Math.random() * REACT.length)]; t.appendChild(r); setTimeout(function (x) { x.remove(); }.bind(null, r), 1900); }
  }

  /* ---------- the live render loop ---------- */
  function loop(ts) {
    if (!el) return; raf = requestAnimationFrame(loop);
    if (!live || document.hidden) return;
    var t = (ts - t0) / 1000, M = window.LBOffice3D.meet, s = $('.spk'), cur = order[idx] || 'boss';
    if (s && !$('.lobby')) { var w = s.clientWidth, h = s.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 1.6); M.big(cur, Math.round(w * dpr), Math.round(h * dpr), t, talking); }
    // tiles: the speaker every frame, the others a few per frame (they only breathe and blink)
    if (tileCv[cur]) M.tile(cur, tileCv[cur], t, talking);
    for (var i = 0; i < 3; i++) { rr = (rr + 1) % uniq.length; var k = uniq[rr]; if (k !== cur && tileCv[k]) M.tile(k, tileCv[k], t, false); }
  }

  /* ---------- flow ---------- */
  function go(step) {
    clearTimeout(timer); stopVoice();
    idx += step == null ? 1 : step; if (idx < 0) idx = 0;
    if (idx >= order.length) { setTalk(false); return notes(); }
    var my = ++run; paintTiles(); paintSpeaker(); setTalk(false);
    var k = order[idx], text = words.join(' ');
    var finish = function () { if (my !== run) return; spoken = words.length; paintCap(); setTalk(false); if (idx > 0) react(); if (paused) return; timer = setTimeout(function () { if (my === run && !paused) go(); }, 1300); };
    var fake = function () { setTalk(true); var n = 0, tick = function () { if (my !== run || paused) return; n++; spoken = n; paintCap(); if (n >= words.length) return finish(); timer = setTimeout(tick, 240); }; timer = setTimeout(tick, 240); };
    timer = setTimeout(function () {
      if (my !== run || paused) return;
      var ok = !muted && window.LBOfficeSpeakReport && window.LBOfficeSpeakReport(k, text, {
        start: function () { if (my === run) setTalk(true); },
        progress: function (f) { if (my !== run) return; spoken = Math.max(spoken, Math.round(f * words.length)); paintCap(); },
        end: finish });
      if (!ok) fake();
      else timer = setTimeout(function () { if (my === run && !talking && spoken === 0) { stopVoice(); fake(); } }, 2500);   // voice engine silent → captions carry on
    }, 450);
  }
  function stopVoice() { try { if (window.LBOfficeStopVoice) window.LBOfficeStopVoice(); } catch (e) {} }
  function toast(t) { var x = document.createElement('div'); x.className = 'toast'; x.textContent = t; el.appendChild(x); setTimeout(function () { x.remove(); }, 1800); }
  function notesText() {
    var ks = uniq.filter(function (k) { return k !== 'boss'; }), b = ks.filter(bad), d = bh().toISOString().slice(0, 10).split('-').reverse().join('/');
    return '🎥 *Lalabella HQ — Daily Stand-up* ' + d + ' ' + clock() + '\n' + (b.length ? '\n⚠️ *Needs attention*\n' + b.map(function (k) { return '• ' + E(k).name + ' (' + E(k).role + '): ' + E(k).say; }).join('\n') + '\n' : '\n✅ All desks good\n') +
      '\n📋 *All desks*\n' + ks.filter(function (k) { return !bad(k); }).map(function (k) { return '• ' + E(k).name + ': ' + E(k).say; }).join('\n');
  }
  function notes() {
    clearTimeout(timer); run++; stopVoice(); setTalk(false); idx = order.length; paintTiles();
    var ks = uniq.filter(function (k) { return k !== 'boss'; }), b = ks.filter(bad), g = ks.filter(function (k) { return !bad(k); });
    var it = function (k) { var e = E(k); return '<div class="su-it"><i style="background:' + ST_COL[e.st] + '"></i><div><b>' + esc(e.name) + '</b> <span class="su-r">· ' + esc(e.role) + '</span><span class="su-t">' + esc(e.say) + '</span></div></div>'; };
    var o = document.createElement('div'); o.className = 'sum';
    o.innerHTML = '<div class="card"><div class="hd"><h3>📋 ' + L('Meeting notes', 'Notes ng meeting') + '</h3><div class="meta">' + bh().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', timeZone:'UTC' }) + ' · ' + clock() + ' · ' + elapsed() + ' min</div>' +
      '<div class="pills"><span>👥 ' + ks.length + L(' desks', ' desk') + '</span><span style="background:#fff4dc;color:#8a5a00">⚠️ ' + b.length + L(' to check', ' titingnan') + '</span><span style="background:#e6f7ee;color:#17693d">✅ ' + g.length + L(' good', ' ayos') + '</span></div></div>' +
      '<div class="bd">' + (b.length ? '<div class="sec">' + L('Needs your attention', 'Kailangan ng atensyon') + '</div>' + b.map(it).join('') : '') + '<div class="sec">' + L('All good', 'Ayos') + '</div>' + g.map(it).join('') + '<div style="height:8px"></div></div>' +
      '<div class="ft"><button data-a="copy">📋 ' + L('Copy for WhatsApp', 'Kopyahin (WhatsApp)') + '</button><button data-a="again">↺ ' + L('Replay', 'Ulitin') + '</button><button class="p" data-a="leave">' + L('Leave', 'Umalis') + '</button></div></div>';
    el.appendChild(o);
  }
  function close() { clearTimeout(timer); run++; stopVoice(); cancelAnimationFrame(raf); try { window.LBOffice3D && window.LBOffice3D.meet && window.LBOffice3D.meet.stop(); } catch (e) {} if (el) el.remove(); el = null; document.removeEventListener('keydown', onKey); clearInterval(clk); }
  function onKey(e) { if (!el || $('.lobby')) { if (e.key === 'Escape') close(); return; } if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === ' ') { e.preventDefault(); togglePause(); } }
  function togglePause() { paused = !paused; var b = el.querySelector('[data-a=pause]'); b.querySelector('i').textContent = paused ? '▶️' : '⏸️'; b.querySelector('.lbl').textContent = paused ? L('Resume', 'Ituloy') : 'Pause';
    if (paused) { clearTimeout(timer); run++; stopVoice(); setTalk(false); } else { idx--; go(); } }
  var clk = 0;
  function start() {
    D = window.LBStandupData && window.LBStandupData();
    if (!D || !D.EMP || !D.KEYS) { alert('The team is still loading — try again in a few seconds.'); return; }
    if (!document.getElementById('lbsuCss')) { var s = document.createElement('style'); s.id = 'lbsuCss'; s.textContent = css; document.head.appendChild(s); }
    close();
    var ks = D.KEYS.filter(function (k) { return D.EMP[k] && k !== 'boss'; });
    ks.sort(function (a, b) { return (bad(b) ? 1 : 0) - (bad(a) ? 1 : 0); });   // the ones with something to check go first
    uniq = (D.EMP.boss ? ['boss'] : []).concat(ks); order = D.EMP.boss ? ['boss'].concat(ks, ['boss']) : ks.slice();
    live = !!(window.LBOffice3D && window.LBOffice3D.meet && window.LBOffice3D.meet.start(uniq));
    el = document.createElement('div'); el.id = 'lbsu'; el.setAttribute('data-lb-look-skip', ''); el.setAttribute('data-lb-theme-skip', ''); el.setAttribute('data-lb-text-skip', '');
    el.innerHTML = '<div class="top"><span class="shield">✓</span><span class="ttl">' + L('Daily Stand-up', 'Daily Stand-up') + ' · Lalabella HQ</span><span class="tm">' + clock() + '</span><span class="rec">REC</span><span class="ppl"></span></div>' +
      '<div class="stage"><div class="main"><div class="spk quiet">' + (live ? '' : '<div class="emo">🐻</div>') + '<div class="vig"></div></div><div class="agenda"></div></div>' +
      '<div class="side"><div class="sideh"><span>' + L('Participants', 'Mga kasali') + '</span><span class="tm2"></span></div><div class="grid"></div></div></div>' +
      '<div class="ctl"><button data-a="mute"><i>🔊</i><span class="lbl">' + L('Sound', 'Tunog') + '</span></button><button data-a="cc" class=""><i>💬</i><span class="lbl">' + L('Captions', 'Captions') + '</span></button>' +
      '<div class="mid"><button data-a="prev"><i>⏮</i><span class="lbl">' + L('Back', 'Bumalik') + '</span></button><button data-a="pause"><i>⏸️</i><span class="lbl">Pause</span></button><button data-a="next"><i>⏭</i><span class="lbl">' + L('Next', 'Susunod') + '</span></button><button data-a="notes"><i>📋</i><span class="lbl">Notes</span></button></div>' +
      '<button class="leave" data-a="leave">' + L('Leave', 'Umalis') + '</button></div>' +
      '<div class="lobby"><div class="lob"><div class="k">Lalabella HQ</div><h2>' + L('Daily Stand-up', 'Daily Stand-up') + '</h2><p>' + bh().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', timeZone:'UTC' }) + ' · ' + clock() + ' · ' + ks.length + L(' desks are waiting for you', ' desk ang naghihintay sa inyo') + '</p>' +
      '<div class="stack">' + uniq.slice(0, 7).map(function (k) { return '<span data-k="' + k + '">' + (live ? '<canvas width="96" height="96"></canvas>' : EMO[k] || '🙂') + '</span>'; }).join('') + (uniq.length > 7 ? '<span class="more">+' + (uniq.length - 7) + '</span>' : '') + '</div>' +
      '<div class="row"><button class="go" data-a="join">' + L('Join with sound', 'Sumali (may tunog)') + '</button><button class="alt" data-a="joinq">' + L('Join muted', 'Sumali nang tahimik') + '</button></div>' +
      '<div class="sm">' + L('Space = pause · ← → = back / next · Esc = leave', 'Space = pause · ← → = bumalik / susunod · Esc = umalis') + '</div></div></div>';
    document.body.appendChild(el);
    started = Date.now(); t0 = performance.now(); idx = -1; paused = false; run++; talking = false;
    clk = setInterval(function () { var a = $('.top .tm'), b = $('.tm2'); if (a) a.textContent = clock(); if (b) b.textContent = elapsed(); }, 1000);
    if (live) { var M = window.LBOffice3D.meet; [].forEach.call(el.querySelectorAll('.stack span[data-k] canvas'), function (c) { M.tile(c.parentNode.getAttribute('data-k'), c.getContext('2d'), 0, false); });
      var bc = M.bigCanvas(); if (bc) $('.spk').insertBefore(bc, $('.spk').firstChild); }
    paintTiles(); raf = requestAnimationFrame(loop);
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'), t = e.target.closest('.tile[data-k]');
      if (t && !b) { var i = order.indexOf(t.getAttribute('data-k')); if (i >= 0 && !$('.lobby')) { var sm = $('.sum'); if (sm) sm.remove(); paused = false; idx = i - 1; go(); } return; }
      if (!b) return; var a = b.getAttribute('data-a');
      if (a === 'join' || a === 'joinq') { muted = a === 'joinq'; el.querySelector('[data-a=mute]').classList.toggle('off', muted); el.querySelector('[data-a=mute] i').textContent = muted ? '🔇' : '🔊'; $('.lobby').remove(); started = Date.now(); idx = -1; return go(); }
      if (a === 'leave') return close();
      if (a === 'next') { if ($('.sum')) return; paused = false; return go(); }
      if (a === 'prev') { var s2 = $('.sum'); if (s2) s2.remove(); paused = false; return go(-1); }
      if (a === 'notes') { var s3 = $('.sum'); if (s3) { s3.remove(); return; } return notes(); }
      if (a === 'again') { var s4 = $('.sum'); if (s4) s4.remove(); paused = false; idx = -1; started = Date.now(); return go(); }
      if (a === 'copy') { var txt = notesText(); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast(L('Copied — paste it in WhatsApp', 'Nakopya na — i-paste sa WhatsApp')); }).catch(function () { window.prompt('Copy:', txt); }); return; }
      if (a === 'cc') { b.classList.toggle('off'); el.classList.toggle('nocc'); return; }
      if (a === 'mute') { muted = !muted; b.classList.toggle('off', muted); b.querySelector('i').textContent = muted ? '🔇' : '🔊'; if (!paused && !$('.sum')) { idx--; go(); } return; }
      if (a === 'pause') togglePause();
    });
    document.addEventListener('keydown', onKey);
  }
  window.LBStandup = { start: start, close: close };
})();
