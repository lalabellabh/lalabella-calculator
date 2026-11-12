/* LALABELLA — AI OFFICE 3D (Nov 2026)
 * Isometric 3D office for the AI workers of office.html. Free: Three.js from cdnjs, no paid service.
 * office.html keeps all the data logic (compute / EMP); it calls:
 *   LBOffice3D.update({ EMP, KEYS, LBL, tl, S })   after every data load (every 30 s)
 *   LBOffice3D.say(k, text, ms, tone)              when a worker talks
 * Tap a worker = zoom in and follow (the computer screen is live). Drag = move, wheel / pinch / + − = zoom.
 */
(function(){
  'use strict';
  var THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var root = document.getElementById('o3d'); if(!root) return;
  var stage = root.querySelector('.o3-stage'), tags = root.querySelector('.o3-tags'), side = root.querySelector('.o3-side');
  var esc = function(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };

  // ---------- who sits where ----------
  var ROOMS = [
    { id:'orders',  en:'Orders & Dispatch', tl:'Orders at Dispatch', x:0,  z:0,  w:12, d:9, floor:['#e08a52','#d1773f'], rug:'#f2b880', agents:['dispatcher','shopify','bleems','abandoned'] },
    { id:'hr',      en:'HR & Attendance',   tl:'HR at Attendance',   x:13, z:0,  w:8,  d:9, floor:['#e3a06a','#d48b55'], rug:'#f5a3c0', agents:['hr','timekeeper'] },
    { id:'boss',    en:"Boss's Office",     tl:'Opisina ni Boss',    x:22, z:0,  w:9,  d:9, floor:['#c97a4a','#b8693c'], rug:'#9fd3f5', agents:['boss'] },
    { id:'tech',    en:'Tech & Health',     tl:'Tech at Health',     x:0,  z:12, w:8,  d:8, floor:['#d9925c','#c97f4a'], rug:'#a8e6a1', agents:['watcher','doctor'] },
    { id:'records', en:'Records & Brain',   tl:'Records at Brain',   x:9,  z:12, w:10, d:8, floor:['#e09862','#cf854f'], rug:'#d4b8ff', agents:['scribe','auditor','archivist'] },
    { id:'deliv',   en:'Delivery',          tl:'Delivery',           x:20, z:12, w:6,  d:8, floor:['#e3a06a','#d48b55'], rug:'#8fe3d0', agents:['delivery','driver'] },
    { id:'cafe',    en:'Café & Break',      tl:'Café at Pahinga',    x:27, z:12, w:7,  d:8, floor:['#c98656','#b87545'], rug:'#ffd68a', agents:['janitor'] }
  ];
  var LOOKS = {
    boss:{ a:'bear', fur:'#c98b4f', shirt:'#2f3a8f', crown:1 },  dispatcher:{ a:'fox', fur:'#e8762c', shirt:'#1fb5a5' },
    shopify:{ a:'frog', fur:'#7cc243', shirt:'#2f5a1f' },        bleems:{ a:'bunny', fur:'#f4e9f0', shirt:'#c2185b' },
    abandoned:{ a:'raccoon', fur:'#8a8a96', shirt:'#ff8f00' },    hr:{ a:'cat', fur:'#f2b36b', shirt:'#f06292' },
    timekeeper:{ a:'owl', fur:'#9a7a5a', shirt:'#5e6bd8' },       delivery:{ a:'dog', fur:'#d9a066', shirt:'#26a69a' },
    driver:{ a:'dog', fur:'#6b4a2f', shirt:'#ffb300', cap:'#d32f2f' }, watcher:{ a:'cat', fur:'#3a3a48', shirt:'#e0467e' },
    doctor:{ a:'bear', fur:'#f4f4f4', shirt:'#e8eef5', panda:1 }, scribe:{ a:'mouse', fur:'#b9b2c8', shirt:'#a77bf0' },
    auditor:{ a:'owl', fur:'#c9a26b', shirt:'#e0a03a' },          archivist:{ a:'bear', fur:'#7a5233', shirt:'#4f8ee0' },
    janitor:{ a:'raccoon', fur:'#6f6f7a', shirt:'#58b84f', cap:'#2f6a2c' }
  };
  var ST_COL = { working:'#4fb3ff', ok:'#5be29a', warn:'#ffc24f', alert:'#ff6b6b' };

  var T = null, renderer, scene, camera, clock, W = 1, H = 1;
  var LAMPS = [], WINS = [], SKY = { hemi:null, sun:null, fill:null, rain:null, wx:null, flash:0 };
  var target = null, viewSize = 26, follow = '', AG = {}, ROOMOBJ = {}, LED = [], SCOREBOARD = null, DATA = null, LOADED_AT = 0, NEXT_AT = 0;
  var lastSay = {}, lastChange = {}, roomTags = [], firstData = true;

  // ---------- small helpers ----------
  function mat(c, o){ o = o || {}; return new T.MeshStandardMaterial({ color:c, roughness:o.r == null ? .85 : o.r, metalness:o.m || 0, emissive:o.e || '#000000', emissiveIntensity:o.ei || 1 }); }
  function box(w, h, d, c, x, y, z, parent, o){ var m = new T.Mesh(new T.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c, o) : c); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (parent || scene).add(m); return m; }
  function ball(r, c, x, y, z, parent, sx, sy, sz){ var m = new T.Mesh(new T.SphereGeometry(r, 18, 14), typeof c === 'string' ? mat(c) : c); m.position.set(x, y, z); if(sx) m.scale.set(sx, sy, sz); m.castShadow = true; (parent || scene).add(m); return m; }
  function cyl(rt, rb, h, c, x, y, z, parent, seg){ var m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 20), typeof c === 'string' ? mat(c) : c); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (parent || scene).add(m); return m; }
  function tileTex(a, b, n){ var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d'), s = 256 / n;
    for(var i = 0; i < n; i++) for(var j = 0; j < n; j++){ g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * s, j * s, s, s); }
    g.strokeStyle = 'rgba(70,30,10,.35)'; g.lineWidth = 3; for(var k = 0; k <= n; k++){ g.beginPath(); g.moveTo(k * s, 0); g.lineTo(k * s, 256); g.stroke(); g.beginPath(); g.moveTo(0, k * s); g.lineTo(256, k * s); g.stroke(); }
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t; }
  function plankTex(){ var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d');
    for(var i = 0; i < 8; i++){ g.fillStyle = ['#9b6a43','#8f603b','#a5744b','#946540'][i % 4]; g.fillRect(0, i * 32, 256, 32); g.fillStyle = 'rgba(40,20,5,.35)'; g.fillRect(0, i * 32, 256, 2); g.fillRect((i * 97) % 256, i * 32, 2, 32); }
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t; }
  function TL(){ return !!(DATA && DATA.tl); }
  function L(en, tl){ return TL() ? tl : en; }
  function ago(ms){ var s = Math.max(0, Math.round((Date.now() - ms) / 1000)); if(s < 60) return s + 's'; if(s < 3600) return Math.round(s / 60) + ' min'; return Math.round(s / 3600) + ' h'; }

  // ---------- the building ----------
  function buildRoom(R){
    var g = new T.Group(); scene.add(g); ROOMOBJ[R.id] = g;
    var tex = tileTex(R.floor[0], R.floor[1], 4); tex.repeat.set(R.w / 2, R.d / 2);
    var fl = new T.Mesh(new T.BoxGeometry(R.w, .2, R.d), new T.MeshStandardMaterial({ map:tex, roughness:.9 })); fl.position.set(R.x + R.w / 2, -.1, R.z + R.d / 2); fl.receiveShadow = true; g.add(fl);
    var wc = '#efdcbc', trim = '#7a4a2a', back = R.z, left = R.x, wh = 2.4;
    if(R.z === 0){ box(R.w, wh, .25, wc, R.x + R.w / 2, wh / 2, back, g); box(R.w, .12, .3, trim, R.x + R.w / 2, wh + .06, back, g); }
    else { var gap = 1.8, half = (R.w - gap) / 2;      // front-row rooms: door to the hallway
      box(half, wh, .25, wc, R.x + half / 2, wh / 2, back, g); box(half, wh, .25, wc, R.x + R.w - half / 2, wh / 2, back, g);
      box(half, .12, .3, trim, R.x + half / 2, wh + .06, back, g); box(half, .12, .3, trim, R.x + R.w - half / 2, wh + .06, back, g); }
    box(.25, wh, R.d, wc, left, wh / 2, R.z + R.d / 2, g); box(.3, .12, R.d, trim, left, wh + .06, R.z + R.d / 2, g);
    // windows on the back wall
    for(var i = 0; i < Math.floor(R.w / 4); i++){ var wx = R.x + 2 + i * 4; if(R.z !== 0 && Math.abs(wx - (R.x + R.w / 2)) < 1.4) continue;
      var wm = mat('#bfe3ff', { e:'#7fb8e8', ei:.35, r:.2 }); WINS.push(wm); box(1.2, 1, .05, wm, wx, 1.45, back + .14, g); box(1.3, .08, .08, trim, wx, .93, back + .17, g); box(.06, 1, .06, '#f5ebd8', wx, 1.45, back + .17, g); }
    // round rug per desk
    R.slots = [];
    var n = R.agents.length, cols = n >= 3 ? 2 : n, rows = Math.ceil(n / cols);
    R.agents.forEach(function(k, i){ var c = i % cols, r = Math.floor(i / cols);
      var x = R.x + (c + .5) * R.w / cols, z = R.z + 1.2 + (r + .5) * (R.d - 1.6) / rows;
      if(R.id === 'cafe'){ x = R.x + 1.6; z = R.z + R.d - 1.8; }
      R.slots.push([x, z]); });
    return g;
  }
  function plant(x, z, s, g){ s = s || 1; cyl(.22 * s, .17 * s, .35 * s, '#b4593a', x, .17 * s, z, g); ball(.32 * s, '#4f9a3a', x, .55 * s, z, g); ball(.22 * s, '#62b048', x + .12 * s, .78 * s, z - .05, g); }
  function lamp(x, z, g){ cyl(.03, .03, 1.3, '#3a2a1a', x, .65, z, g, 6); var lm = mat('#fff1c9', { e:'#ffd27a', ei:.9 }); LAMPS.push(lm); var sh = cyl(.18, .28, .3, lm, x, 1.35, z, g); sh.castShadow = false; }
  function shelf(x, z, g, rot){ var s = new T.Group(); s.position.set(x, 0, z); s.rotation.y = rot || 0; g.add(s); box(1.4, 1.9, .4, '#6b4226', 0, .95, 0, s);
    var cols = ['#e05a5a','#5a8be0','#e0c35a','#6bc26b','#a77bf0','#f0a35a']; for(var r = 0; r < 3; r++) for(var b = 0; b < 6; b++) box(.16, .38, .3, cols[(r * 3 + b) % 6], -.5 + b * .2, .35 + r * .55, .06, s); }
  function buildDecor(){
    var hall = plankTex(); hall.repeat.set(9, 1);
    var hw = new T.Mesh(new T.BoxGeometry(34, .18, 3), new T.MeshStandardMaterial({ map:hall, roughness:.9 })); hw.position.set(17, -.09, 10.5); hw.receiveShadow = true; scene.add(hw);
    var base = new T.Mesh(new T.BoxGeometry(35, .6, 21.4), mat('#3a2a4a')); base.position.set(17, -.5, 10); scene.add(base);
    var o = ROOMOBJ;
    plant(.8, .8, 1.1, o.orders); plant(11.3, .8, 1, o.orders); lamp(6, .7, o.orders);
    plant(20.3, .8, 1, o.hr); lamp(13.7, .7, o.hr);
    plant(30.3, .8, 1.2, o.boss); plant(22.7, 8.2, .9, o.boss); shelf(29.6, 4, o.boss, -Math.PI / 2);
    // scoreboard on the Boss wall (live numbers)
    var sc = document.createElement('canvas'); sc.width = 512; sc.height = 256; SCOREBOARD = { c:sc, t:new T.CanvasTexture(sc) };
    var sb = new T.Mesh(new T.PlaneGeometry(4, 2), new T.MeshBasicMaterial({ map:SCOREBOARD.t })); sb.position.set(26.5, 1.45, .15); o.boss.add(sb); box(4.2, 2.2, .06, '#2e5d33', 26.5, 1.45, .1, o.boss);
    // tech: server racks with blinking lights
    [[1.2, 13], [2.4, 13]].forEach(function(p){ box(1, 2, .8, '#1f2638', p[0], 1, p[1], o.tech); for(var i = 0; i < 6; i++){ var l = box(.08, .08, .02, mat('#5be29a', { e:'#5be29a', ei:1.5 }), p[0] - .3 + (i % 3) * .3, .5 + Math.floor(i / 3) * .9 + (i % 2) * .3, p[1] + .41, o.tech); l.castShadow = false; LED.push(l); } });
    plant(7.3, 19.2, 1, o.tech);
    shelf(10.2, 12.4, o.records); shelf(12, 12.4, o.records); shelf(17.8, 12.4, o.records); lamp(18.4, 19.3, o.records);
    // delivery: parcels + the door to the street
    [[25, 19, '#c8925a'], [25.3, 18.4, '#b07a45'], [24.6, 18.5, '#d9a066']].forEach(function(p, i){ box(.6, .45, .5, p[2], p[0], .23 + (i === 1 ? .45 : 0), p[1], o.deliv); });
    box(1.2, 2, .1, '#6b4226', 25.8, 1, 12.15, o.deliv);
    // café: counter, machine, tables, stools, sofa
    box(4, 1, .8, '#7a4a2a', 31, .5, 13.2, o.cafe); box(4.1, .08, .9, '#d9b48a', 31, 1.04, 13.2, o.cafe);
    box(.5, .6, .4, '#2e2e38', 30, 1.38, 13.1, o.cafe); var cup = cyl(.08, .07, .14, '#ffffff', 30.5, 1.15, 13.4, o.cafe); cup.castShadow = false;
    [[30, 16.5], [32.5, 17.5]].forEach(function(p){ cyl(.6, .6, .07, '#d9b48a', p[0], .75, p[1], o.cafe); cyl(.06, .1, .72, '#5a3a24', p[0], .37, p[1], o.cafe, 8);
      ['#e05a7a','#5a9be0','#6bc26b'].forEach(function(cc, i){ var a = i * 2.1; cyl(.22, .2, .42, cc, p[0] + Math.cos(a) * .95, .21, p[1] + Math.sin(a) * .95, o.cafe); }); });
    box(2.4, .5, .9, '#b85c5c', 31.5, .25, 19.3, o.cafe); box(2.4, .7, .25, '#a04848', 31.5, .6, 19.75, o.cafe); plant(33.4, 13.2, .9, o.cafe); lamp(27.6, 19.3, o.cafe);
  }

  // ---------- a desk with a live computer ----------
  function buildDesk(k, x, z, big){
    var g = new T.Group(); g.position.set(x, 0, z); scene.add(g);
    var rug = cyl(1.55, 1.55, .03, '#f2b880', 0, .02, .35, g, 40); rug.castShadow = false;
    var ring = new T.Mesh(new T.TorusGeometry(.62, .05, 8, 40), new T.MeshBasicMaterial({ color:'#5be29a' })); ring.rotation.x = -Math.PI / 2; ring.position.set(0, .05, .85); g.add(ring);
    var dw = big ? 2.2 : 1.6;
    box(dw, .1, .8, '#b98a5c', 0, .78, 0, g); box(dw - .1, .7, .7, '#8f6440', 0, .4, -.02, g);
    var c = document.createElement('canvas'); c.width = 160; c.height = 100; var tex = new T.CanvasTexture(c);
    box(1.02, .66, .06, '#22202e', 0, 1.25, -.18, g); var scr = new T.Mesh(new T.PlaneGeometry(.94, .58), new T.MeshBasicMaterial({ map:tex, toneMapped:false })); scr.position.set(0, 1.25, -.12); g.add(scr);
    box(.08, .3, .08, '#22202e', 0, .98, -.2, g); box(.5, .03, .18, '#e8e8f0', 0, .845, .18, g);
    var mug = cyl(.06, .05, .12, ['#e05a7a','#5a9be0','#ffd24a'][x % 3 | 0], dw / 2 - .25, .9, .1, g); mug.castShadow = false;
    // chair
    box(.6, .08, .6, '#3d4577', 0, .5, .85, g); box(.6, .6, .08, '#3d4577', 0, .82, 1.15, g); cyl(.04, .04, .45, '#222', 0, .25, .85, g, 6);
    return { g:g, ring:ring, rug:rug, scr:{ c:c, x:c.getContext('2d'), t:tex, lines:[], off:0 } };
  }
  function drawScreen(a, st, t){
    var s = a.desk.scr, g = s.x, w = 160, h = 100;
    if(st === 'alert'){ g.fillStyle = (Math.floor(t * 3) % 2) ? '#5a0f18' : '#2a0810'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff6b6b'; g.font = 'bold 22px monospace'; g.fillText('ERROR', 42, 50); g.font = '11px monospace'; g.fillText('needs you', 50, 72); s.t.needsUpdate = true; return; }
    g.fillStyle = '#1e2c66'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a3770'; g.fillRect(0, 0, w, 12);
    ['#ff6b6b','#ffc24f','#5be29a'].forEach(function(c, i){ g.fillStyle = c; g.beginPath(); g.arc(7 + i * 9, 6, 3, 0, 7); g.fill(); });
    if(st === 'working'){
      var newLine = function(){ var ind = (Math.random() * 3 | 0) * 10, segs = [], x = 6 + ind, n = 1 + (Math.random() * 3 | 0);
        for(var q = 0; q < n; q++){ var len = 14 + Math.random() * 40; segs.push([x, len, ['#7ff0e0','#c3a6ff','#ffd24a','#5be29a','#ff9fc4','#8fd0ff'][Math.random() * 6 | 0]]); x += len + 6; if(x > 140) break; } return segs; };
      if(!s.lines.length) for(var q0 = 0; q0 < 7; q0++) s.lines.push(newLine());
      s.off += 1; if(s.off >= 4){ s.off = 0; s.lines.push(newLine()); if(s.lines.length > 8) s.lines.shift(); }
      s.lines.forEach(function(segs, i){ segs.forEach(function(sg){ g.fillStyle = sg[2]; g.fillRect(sg[0], 17 + i * 10, sg[1], 6); }); });
      if(Math.floor(t * 3) % 2){ g.fillStyle = '#ffffff'; g.fillRect(6, 17 + s.lines.length * 10, 7, 6); }
    } else if(st === 'warn'){
      g.fillStyle = (Math.floor(t * 2) % 2) ? '#ffc24f' : '#c98a1a'; g.font = 'bold 40px sans-serif'; g.fillText('!', 72, 64); g.font = '11px monospace'; g.fillText('please check', 40, 86);
    } else {
      // idle: a small live chart
      // Nov 2026: the chart moves (bars breathe, a line scrolls, a dot blinks) so the screen never looks frozen
      for(var i = 0; i < 7; i++){ var bh = 10 + ((Math.sin(i * 1.7 + a.seed + t * 1.6) + 1) * 18) + Math.sin(t * 4.3 + i) * 3; g.fillStyle = i === 6 ? '#5be29a' : '#4fb3ff'; g.fillRect(14 + i * 19, 92 - bh, 12, bh); }
      g.strokeStyle = '#ffd24a'; g.lineWidth = 2; g.beginPath();
      for(var px = 0; px <= 150; px += 6){ var py = 46 + Math.sin(px * .08 + t * 2.4 + a.seed) * 9 + Math.sin(px * .21 - t * 1.3) * 4; if(px) g.lineTo(5 + px, py); else g.moveTo(5, py); } g.stroke();
      g.fillStyle = '#9a90b8'; g.font = '9px monospace'; g.fillText('all good', 6, 24);
      if(Math.floor(t * 2) % 2){ g.fillStyle = '#5be29a'; g.beginPath(); g.arc(150, 21, 3, 0, 7); g.fill(); }
    }
    s.t.needsUpdate = true;
  }

  // ---------- chibi animals ----------
  function buildAgent(k){
    var lk = LOOKS[k] || { a:'bear', fur:'#c98b4f', shirt:'#888' }, g = new T.Group(); scene.add(g);
    var body = new T.Group(); g.add(body);
    cyl(.27, .33, .5, lk.shirt, 0, .55, 0, body);
    var legs = new T.Group(); body.add(legs); var l1 = cyl(.09, .09, .35, '#3a3348', -.12, .2, 0, legs, 8), l2 = cyl(.09, .09, .35, '#3a3348', .12, .2, 0, legs, 8);
    var hL = ball(.1, lk.fur, -.3, .62, -.12, body), hR = ball(.1, lk.fur, .3, .62, -.12, body);
    var head = new T.Group(); head.position.y = 1.08; body.add(head);
    var furM = mat(lk.fur), white = mat('#ffffff'), black = mat('#1b1535');
    ball(.36, furM, 0, 0, 0, head, 1, .92, .95);
    // face looks to -z (towards the monitor)
    ball(.055, black, -.13, .04, -.31, head); ball(.055, black, .13, .04, -.31, head); ball(.02, white, -.11, .07, -.355, head); ball(.02, white, .15, .07, -.355, head);
    ball(.13, lk.a === 'frog' ? furM : mat('#fff3e6'), 0, -.11, -.27, head, 1, .7, .8); ball(.045, black, 0, -.07, -.37, head);
    ball(.05, mat('#ff9fb0'), -.22, -.08, -.26, head); ball(.05, mat('#ff9fb0'), .22, -.08, -.26, head);
    var a = lk.a;
    if(a === 'bear' || a === 'mouse' || a === 'raccoon'){ var er = a === 'mouse' ? .17 : .12; ball(er, lk.panda ? black : furM, -.25, .28, 0, head, 1, 1, .5); ball(er, lk.panda ? black : furM, .25, .28, 0, head, 1, 1, .5);
      if(lk.panda){ ball(.08, black, -.13, .05, -.29, head, 1.2, 1, .5); ball(.08, black, .13, .05, -.29, head, 1.2, 1, .5); ball(.055, black, -.13, .04, -.32, head); ball(.055, black, .13, .04, -.32, head); }
      if(a === 'raccoon'){ ball(.09, mat('#2a2a34'), -.13, .05, -.28, head, 1.4, .8, .5); ball(.09, mat('#2a2a34'), .13, .05, -.28, head, 1.4, .8, .5); ball(.05, black, -.13, .05, -.33, head); ball(.05, black, .13, .05, -.33, head); } }
    if(a === 'cat' || a === 'fox'){ [-1, 1].forEach(function(s){ var e = new T.Mesh(new T.ConeGeometry(.12, .26, 4), furM); e.position.set(s * .2, .33, 0); e.rotation.z = -s * .25; e.castShadow = true; head.add(e); }); }
    if(a === 'fox'){ var tail = ball(.16, furM, 0, .45, .38, body, .8, .8, 1.6); ball(.08, white, 0, .48, .6, body); }
    if(a === 'bunny'){ [-1, 1].forEach(function(s){ var e = ball(.08, furM, s * .12, .45, 0, head, 1, 3.2, .7); e.rotation.z = -s * .15; }); }
    if(a === 'dog'){ [-1, 1].forEach(function(s){ ball(.11, mat(k === 'driver' ? '#3a2412' : '#a5703a'), s * .33, .02, 0, head, .6, 1.6, 1); }); }
    if(a === 'owl'){ ball(.1, white, -.13, .05, -.27, head); ball(.1, white, .13, .05, -.27, head); ball(.055, black, -.13, .05, -.35, head); ball(.055, black, .13, .05, -.35, head);
      [-1, 1].forEach(function(s){ var e = new T.Mesh(new T.ConeGeometry(.07, .2, 4), furM); e.position.set(s * .2, .33, 0); head.add(e); }); }
    if(a === 'frog'){ ball(.11, furM, -.15, .28, -.1, head); ball(.11, furM, .15, .28, -.1, head); ball(.06, black, -.15, .3, -.2, head); ball(.06, black, .15, .3, -.2, head); }
    if(lk.crown){ var cr = cyl(.2, .2, .12, mat('#ffd24a', { m:.6, r:.3 }), 0, .4, 0, head, 5); }
    if(lk.cap){ ball(.37, mat(lk.cap), 0, .1, 0, head, 1, .55, 1); box(.4, .03, .25, lk.cap, 0, .1, -.32, head); }
    var hit = new T.Mesh(new T.CylinderGeometry(.55, .55, 1.7, 8), new T.MeshBasicMaterial({ visible:false })); hit.position.y = .85; g.add(hit); hit.userData.k = k;
    return { k:k, g:g, body:body, head:head, legs:legs, l1:l1, l2:l2, hL:hL, hR:hR, hit:hit, seed:Math.random() * 10,
      pos:new T.Vector3(), mode:'sit', path:[], wait:0, nextWander:8 + Math.random() * 30, st:'ok', face:0, hidden:false };
  }

  // ---------- scene ----------
  function init(){
    T = window.THREE;
    renderer = new T.WebGLRenderer({ antialias:true, alpha:true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; if('outputEncoding' in renderer) renderer.outputEncoding = T.sRGBEncoding;
    stage.appendChild(renderer.domElement);
    scene = new T.Scene(); clock = new T.Clock();
    camera = new T.OrthographicCamera(-1, 1, 1, -1, .1, 400); target = new T.Vector3(17, 0, 10);
    var hemi = new T.HemisphereLight('#fff4e0', '#5a3a6a', .75); scene.add(hemi); SKY.hemi = hemi;
    var sun = new T.DirectionalLight('#ffe2b8', .95); sun.position.set(-14, 30, 18); sun.target.position.set(17, 0, 10); sun.castShadow = true; sun.shadow.mapSize.set(innerWidth < 700 ? 1024 : 2048, innerWidth < 700 ? 1024 : 2048);
    var sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 90; sun.shadow.bias = -.0008; scene.add(sun); scene.add(sun.target);
    var fill = new T.PointLight('#ffb36b', .35, 60); fill.position.set(17, 8, 24); scene.add(fill);
    SKY.sun = sun; SKY.fill = fill; buildRain();
    ROOMS.forEach(buildRoom); buildDecor();
    ROOMS.forEach(function(R){
      R.agents.forEach(function(k, i){ var s = R.slots[i], a = buildAgent(k); a.room = R; a.desk = buildDesk(k, s[0], s[1], k === 'boss'); a.desk.rug.material.color.set(R.rug);
        a.home = new T.Vector3(s[0], 0, s[1] + .85); a.pos.copy(a.home); AG[k] = a;
        var tag = document.createElement('div'); tag.className = 'o3-tag'; tag.innerHTML = '<span class="d"></span><b></b><i class="bub"></i><em class="pop">✨</em>'; tags.appendChild(tag); a.tag = tag;
        tag.addEventListener('click', function(e){ e.stopPropagation(); select(k); }); });
      var rt = document.createElement('div'); rt.className = 'o3-room'; tags.appendChild(rt); roomTags.push({ el:rt, R:R, v:new T.Vector3(R.x + 1.2, 2.75, R.z + .3) });
      rt.addEventListener('click', function(e){ e.stopPropagation(); zoomRoom(R); });
    });
    resize(); window.addEventListener('resize', resize); bindControls();
    checkTurn(); wholeOffice(); target.copy(targetGoal); camera.zoom = zoomGoal; if(DATA){ paintTags(); apply(); } renderSide(); loop();
  }
  function resize(){
    W = stage.clientWidth || 600; H = stage.clientHeight || 400; renderer.setSize(W, H, false);
    var asp = W / H, vs = viewSize; camera.left = -vs * asp / 2; camera.right = vs * asp / 2; camera.top = vs / 2; camera.bottom = -vs / 2; camera.updateProjectionMatrix();
  }
  var DIR = null;
  function placeCam(){ if(!DIR) DIR = new T.Vector3(1, 1.18, 1.05).normalize(); camera.position.copy(target).addScaledVector(DIR, 80); camera.lookAt(target); }
  var zoomGoal = 1, targetGoal = null;
  function setZoom(z){ zoomGoal = Math.max(.6, Math.min(6, z)); }
  function wholeOffice(){ follow = ''; targetGoal = new T.Vector3(17, 0, 10); setZoom(W / H < 1 ? .62 : W / H > 1.8 ? 1.55 : W / H > 1.4 ? 1.25 : 1); renderSide(); }
  function zoomRoom(R){ follow = ''; targetGoal = new T.Vector3(R.x + R.w / 2, 0, R.z + R.d / 2); setZoom(Math.min(3, 22 / Math.max(R.w, R.d) * (W / H < 1 ? .7 : 1))); renderSide(R.id); }
  function select(k){ if(!AG[k]) return; follow = k; setZoom(W / H < 1 ? 3.8 : 5); renderSide(); apply(); if(root.classList.contains('full')) drawer(true); }
  function drawer(on){ root.classList.toggle('dopen', on); root.classList.remove('menu-open'); }

  // ---------- controls ----------
  function bindControls(){
    var el = renderer.domElement, ptrs = {}, start = null, moved = 0, pinch0 = 0, z0 = 1;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', function(e){ var rr = el.getBoundingClientRect(); if(root.classList.contains('full') && e.pointerType === 'touch' && e.clientX > rr.right - 34) return; ptrs[e.pointerId] = [e.clientX, e.clientY]; el.setPointerCapture(e.pointerId); moved = 0;
      var ids = Object.keys(ptrs); if(ids.length === 2){ var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); z0 = zoomGoal; } start = [e.clientX, e.clientY]; });
    el.addEventListener('pointermove', function(e){ if(!ptrs[e.pointerId]) return; var p = ptrs[e.pointerId], dx = e.clientX - p[0], dy = e.clientY - p[1]; ptrs[e.pointerId] = [e.clientX, e.clientY];
      var ids = Object.keys(ptrs);
      if(ids.length === 2){ var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if(pinch0) setZoom(z0 * d / pinch0); moved += 10; return; }
      moved += Math.abs(dx) + Math.abs(dy); if(moved < 6) return;
      if(follow){ follow = ''; renderSide(); }
      var s = viewSize / H / camera.zoom, right = new T.Vector3(1, 0, -1).normalize(), fwd = new T.Vector3(-1, 0, -1).normalize();
      var base = targetGoal || target.clone(); base.addScaledVector(right, -dx * s).addScaledVector(fwd, dy * s * 1.35); targetGoal = base; });
    function up(e){ var was = !!ptrs[e.pointerId]; delete ptrs[e.pointerId]; if(Object.keys(ptrs).length < 2) pinch0 = 0;
      if(was && moved < 6 && e.type === 'pointerup'){ var r = el.getBoundingClientRect(), m = new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), rc = new T.Raycaster(); rc.setFromCamera(m, camera);
        var hits = rc.intersectObjects(Object.keys(AG).map(function(k){ return AG[k].hit; })); if(hits.length) select(hits[0].object.userData.k); } }
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', function(e){ e.preventDefault(); setZoom(zoomGoal * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive:false });
    root.querySelector('[data-o3=in]').onclick = function(){ setZoom(zoomGoal * 1.35); };
    root.querySelector('[data-o3=out]').onclick = function(){ setZoom(zoomGoal / 1.35); };
    root.querySelector('[data-o3=all]').onclick = wholeOffice;
    root.querySelector('[data-o3=full]').onclick = function(){ goFull(!root.classList.contains('full')); };
    document.addEventListener('fullscreenchange', function(){ if(!document.fullscreenElement && root.classList.contains('full') && !autoFull) goFull(false, true); });
    root.querySelector('[data-o3=team]').onclick = function(e){ e.stopPropagation(); drawer(!root.classList.contains('dopen')); };
    root.querySelector('[data-o3=set]').onclick = function(e){ e.stopPropagation(); root.classList.toggle('menu-open'); };
    root.querySelector('[data-o3=exit]').onclick = function(e){ e.stopPropagation(); autoFull = false; noAuto = true; goFull(false); };
    root.querySelector('.o3-menu').addEventListener('click', function(e){ var b = e.target.closest('[data-m]'); if(!b) return; e.stopPropagation(); var m = b.getAttribute('data-m'); root.classList.remove('menu-open');
      if(m === 'snd'){ root.classList.toggle('snd-open'); var sn = document.getElementById('snd'); if(sn && root.classList.contains('snd-open')) sn.classList.add('open'); }
      if(m === 'names') root.classList.toggle('nonames');
      if(m === 'all'){ drawer(false); wholeOffice(); }
      if(m === 'exit'){ autoFull = false; noAuto = true; goFull(false); }
      if(m === 'classic'){ autoFull = false; noAuto = true; goFull(false); var vb = document.getElementById('v3dBtn'); if(vb) vb.click(); } });
    document.addEventListener('click', function(e){ if(!e.target.closest('.o3-tr')) root.classList.remove('menu-open'); if(!e.target.closest('.snd') && !e.target.closest('.o3-menu')) root.classList.remove('snd-open'); });
    // swipe: from the right edge to the left = open the panel; swipe the panel to the right = close it
    var sw = null;
    root.addEventListener('touchstart', function(e){ if(!root.classList.contains('full')) return; var t = e.touches[0], r = root.getBoundingClientRect();
      sw = { x:t.clientX, y:t.clientY, edge:t.clientX > r.right - 34, inSide:!!e.target.closest('.o3-side') }; }, { passive:true });
    root.addEventListener('touchmove', function(e){ if(!sw) return; var t = e.touches[0], dx = t.clientX - sw.x, dy = Math.abs(t.clientY - sw.y);
      if(sw.edge && dx < -40 && dy < 60){ drawer(true); sw = null; } else if(sw.inSide && dx > 60 && dy < 50){ drawer(false); sw = null; } }, { passive:true });
    root.addEventListener('touchend', function(){ sw = null; }, { passive:true });
    side.addEventListener('click', function(e){ var b = e.target.closest('[data-pick]'); if(b){ select(b.getAttribute('data-pick')); return; }
      var r = e.target.closest('[data-room]'); if(r){ var R = ROOMS.filter(function(x){ return x.id === r.getAttribute('data-room'); })[0]; if(R) zoomRoom(R); return; }
      if(e.target.closest('[data-stop]')) wholeOffice();
      if(e.target.closest('[data-more]')){ var k = e.target.closest('[data-more]').getAttribute('data-more'); var rw = document.querySelector('#roster .rw[data-k="' + k + '"]'); if(rw) rw.click(); } });
  }

  // Full screen + turn the phone sideways (landscape). Same as the Classic view's Landscape button.
  function goFull(on, fromEvent){
    root.classList.toggle('full', on); document.body.classList.toggle('o3full', on);
    var b = root.querySelector('[data-o3=full]'); if(b){ b.textContent = on ? '✕' : '⛶'; b.title = on ? 'Exit' : 'Landscape / full screen'; }
    try{
      if(on){ var el = document.documentElement, rq = el.requestFullscreen || el.webkitRequestFullscreen;
        if(rq) Promise.resolve(rq.call(el)).then(function(){ try{ screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(function(){}); }catch(e){} }).catch(function(){}); }
      else if(!fromEvent){ if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function(){}); try{ screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); }catch(e){} }
    }catch(e){}
    if(!on){ root.classList.remove('dopen', 'menu-open', 'snd-open'); }
    setTimeout(resize, 80); setTimeout(resize, 600);
  }
  var autoFull = false, noAuto = false;
  function checkTurn(){
    if(!document.body.classList.contains('v3d')) return;
    var phoneSideways = innerWidth > innerHeight && innerHeight < 520;
    if(!phoneSideways) noAuto = false;
    if(phoneSideways && !noAuto && !root.classList.contains('full')){ autoFull = true; root.classList.add('full'); document.body.classList.add('o3full'); setTimeout(resize, 80); }
    else if(!phoneSideways && autoFull && root.classList.contains('full') && !document.fullscreenElement){ autoFull = false; goFull(false, true); }
  }
  window.addEventListener('resize', function(){ setTimeout(checkTurn, 120); });
  if(screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', function(){ setTimeout(checkTurn, 200); });
  // ---------- behaviour ----------
  var CAFE = function(i){ return new T.Vector3(29.5 + (i % 3) * 1.2, 0, 15 + (i % 2) * 1.4); };
  function hallPath(from, to, a){
    var pts = [], hz = 10.5;
    var exit = function(R, p){ return R.z === 0 ? new T.Vector3(p.x, 0, R.z + R.d + .2) : new T.Vector3(R.x + R.w / 2, 0, R.z - .2); };
    var R = a.room, cafeR = ROOMS[6];
    if(to === 'cafe'){ var c = CAFE(Object.keys(AG).indexOf(a.k)); if(R !== cafeR){ pts.push(exit(R, from), new T.Vector3(exit(R, from).x, 0, hz)); pts.push(new T.Vector3(cafeR.x + cafeR.w / 2, 0, hz), new T.Vector3(cafeR.x + cafeR.w / 2, 0, cafeR.z + .6)); } pts.push(c); }
    else if(to === 'home'){ if(R !== cafeR){ pts.push(new T.Vector3(cafeR.x + cafeR.w / 2, 0, cafeR.z + .6), new T.Vector3(cafeR.x + cafeR.w / 2, 0, hz)); var ex = exit(R, a.home); pts.push(new T.Vector3(ex.x, 0, hz), ex); } pts.push(a.home.clone()); }
    else if(to === 'street'){ pts.push(exit(R, from), new T.Vector3(exit(R, from).x, 0, hz), new T.Vector3(34.5, 0, hz)); }
    else if(to === 'back'){ var ex2 = exit(R, a.home); pts.push(new T.Vector3(ex2.x, 0, hz), ex2, a.home.clone()); }
    else if(to === 'patrol'){ pts.push(exit(R, from), new T.Vector3(exit(R, from).x, 0, hz), new T.Vector3(2 + Math.random() * 28, 0, hz), new T.Vector3(exit(R, from).x, 0, hz), exit(R, from), a.home.clone()); }
    return pts;
  }
  function walk(a, to){ a.path = hallPath(a.pos.clone(), to, a); a.mode = 'walk'; a.dest = to; }
  function think(a, dt){
    if(a.mode === 'walk') return;
    var st = a.st;
    if(a.k === 'driver'){ if(st === 'working' && a.mode !== 'out'){ walk(a, 'street'); return; } if(st !== 'working' && a.mode === 'out'){ a.g.visible = true; a.hidden = false; a.pos.set(34.5, 0, 10.5); walk(a, 'back'); return; } }
    if(a.mode === 'cafe'){ a.wait -= dt; if(a.wait <= 0 || st === 'alert' || st === 'warn' || follow === a.k) walk(a, 'home'); return; }
    if(a.mode === 'sit'){ a.nextWander -= dt;
      if(a.nextWander <= 0 && follow !== a.k && (st === 'ok') && a.k !== 'boss'){ a.nextWander = 40 + Math.random() * 70; if(a.k === 'janitor') walk(a, 'patrol'); else walk(a, 'cafe'); } }
  }
  function step(a, dt, t){
    if(a.mode === 'walk'){
      var nx = a.path[0];
      if(!nx){ a.mode = a.dest === 'cafe' ? 'cafe' : a.dest === 'street' ? 'out' : 'sit'; if(a.mode === 'cafe') a.wait = 10 + Math.random() * 12; if(a.mode === 'out'){ a.g.visible = false; a.hidden = true; } return; }
      var d = nx.clone().sub(a.pos); d.y = 0; var len = d.length(), sp = 2.1 * dt;
      if(len < sp){ a.pos.copy(nx); a.path.shift(); } else { a.pos.addScaledVector(d.normalize(), sp); a.face = Math.atan2(d.x, d.z) + Math.PI; }
      a.l1.position.z = Math.sin(t * 12) * .1; a.l2.position.z = -Math.sin(t * 12) * .1; a.body.position.y = Math.abs(Math.sin(t * 12)) * .06;
      a.hL.position.z = -.12 + Math.sin(t * 12) * .12; a.hR.position.z = -.12 - Math.sin(t * 12) * .12;
      return;
    }
    a.l1.position.z = a.l2.position.z = 0;
    var sit = a.mode === 'sit', st = a.st;
    if(sit && (st === 'working' || st === 'ok')){
      a.body.position.y = .24 + (st === 'working' ? Math.abs(Math.sin(t * 9 + a.seed)) * .015 : Math.sin(t * 1.5 + a.seed) * .01);
      a.face = 0; a.legs.rotation.x = -Math.PI / 2; a.legs.position.set(0, .3, 0);
      a.hL.position.set(-.27, .62 + (st === 'working' ? Math.max(0, Math.sin(t * 16 + a.seed)) * .06 : 0), -.3); a.hR.position.set(.27, .62 + (st === 'working' ? Math.max(0, Math.sin(t * 16 + a.seed + 2)) * .06 : 0), -.3);
      a.head.rotation.x = st === 'working' ? .08 + Math.sin(t * 2 + a.seed) * .04 : Math.sin(t * .7 + a.seed) * .05; a.head.rotation.y = st === 'ok' ? Math.sin(t * .4 + a.seed) * .35 : 0;
    } else {
      a.legs.rotation.x = 0; a.legs.position.set(0, 0, 0);
      var jump = st === 'alert' ? Math.abs(Math.sin(t * 6)) * .25 : 0;
      a.body.position.y = jump; a.head.rotation.x = 0; a.head.rotation.y = 0;
      var wave = st === 'alert' || st === 'warn' || follow === a.k;
      a.hL.position.set(-.3, .62, -.1); a.hR.position.set(.3, wave ? 1.0 + Math.sin(t * 8) * .08 : .62, -.1);
      if(st === 'warn' || st === 'alert' || (sit && follow === a.k)) a.face = Math.atan2(-1, -1.05);   // turn to the camera
      // "check": walks back and forth next to the desk (thinking), stops now and then to face you
      a.paceX = 0;
      if(sit && st === 'warn'){ var ph = Math.sin(t * .6 + a.seed), vel = Math.cos(t * .6 + a.seed);
        a.paceX = ph * .7;
        if(Math.abs(vel) > .25){ a.face = vel > 0 ? -Math.PI / 2 : Math.PI / 2; a.l1.position.z = Math.sin(t * 10) * .09; a.l2.position.z = -Math.sin(t * 10) * .09; a.body.position.y = Math.abs(Math.sin(t * 10)) * .04; a.hR.position.y = .62; }
        else { a.head.rotation.z = Math.sin(t * 3) * .12; } }
    }
    if(sit && (st === 'warn' || st === 'alert')){ /* stand beside the desk */ }
  }
  function apply(){
    if(!T || !DATA) return;
    var E = DATA.EMP;
    Object.keys(AG).forEach(function(k){ var a = AG[k], e = E[k]; if(!e) return;
      var prev = a.st; a.st = e.st; a.desk.ring.material.color.set(ST_COL[e.st] || '#5be29a');
      if(a.mode === 'sit' && (e.st === 'warn' || e.st === 'alert')){ a.pos.copy(a.home).add(new T.Vector3(.95, 0, .2)); }
      if(a.mode === 'sit' && !(e.st === 'warn' || e.st === 'alert')) a.pos.copy(a.home);
      a.tag.className = 'o3-tag st-' + e.st + (follow === k ? ' sel' : ''); a.tag.querySelector('b').textContent = e.name; });
    drawBoard();
  }
  function drawBoard(){
    if(!SCOREBOARD || !DATA) return; var S = DATA.S || {}, so = S.shop || {}, h = S.hr || {}, dv = S.delivery || {}, g = SCOREBOARD.c.getContext('2d');
    g.fillStyle = '#2e5d33'; g.fillRect(0, 0, 512, 256); g.fillStyle = '#f5f0d8'; g.font = 'bold 26px sans-serif'; g.fillText(L('TODAY', 'NGAYON'), 20, 38);
    var bars = [['Shopify', +so.shopify_today || 0], ['Bleems', +so.bleems_today || 0], [L('In', 'Pasok'), +h.in_today || 0], [L('Deliv.', 'Deliv.'), +dv.delivered_today || 0], [L('Carts', 'Cart'), +so.aband_open_today || 0]];
    var mx = Math.max.apply(null, bars.map(function(b){ return b[1]; }).concat([5]));
    bars.forEach(function(b, i){ var x = 30 + i * 96, bh = 150 * b[1] / mx; g.fillStyle = ['#95bf47','#ff8ab3','#8fd9ff','#7ff0c8','#ffc24f'][i]; g.fillRect(x, 220 - bh, 60, bh); g.fillStyle = '#f5f0d8'; g.font = 'bold 20px sans-serif'; g.fillText(String(b[1]), x + 18, 212 - bh); g.font = '15px sans-serif'; g.fillText(b[0], x, 246); });
    SCOREBOARD.t.needsUpdate = true;
  }

  // ---------- side panel ----------
  function renderSide(roomId){
    if(!DATA){ side.innerHTML = '<div class="o3-muted">' + 'Loading…' + '</div>'; return; }
    var E = DATA.EMP, LB = DATA.LBL || {};
    if(follow && E[follow]){
      var e = E[follow], a = AG[follow], lc = lastChange[follow];
      side.innerHTML = '<button class="o3-back" data-stop>← ' + L('Whole office', 'Buong opisina') + '</button>' +
        '<div class="o3-who"><div class="o3-av" style="background:' + (LOOKS[follow] || {}).fur + '">' + emoji(follow) + '</div><div><b>' + esc(e.name) + '</b><div class="o3-muted">' + esc(e.role) + ' · ' + esc(TL() ? a.room.tl : a.room.en) + '</div></div>' +
        '<span class="o3-chip st-' + e.st + '">' + esc(LB[e.st] || e.st) + '</span></div>' +
        '<div class="o3-sec"><h5>' + L('NOW', 'NGAYON') + '</h5><div>' + esc(e.say) + '</div><div class="o3-bar"><i class="st-' + e.st + '"></i></div></div>' +
        '<div class="o3-sec"><h5>' + L('LATEST', 'PINAKABAGO') + '</h5><div class="o3-muted">' + esc(e.out) + '</div></div>' +
        '<div class="o3-sec"><h5>' + L('LIVE CHECK', 'LIVE CHECK') + '</h5><div class="o3-live" data-livek="' + follow + '"></div></div>' +
        '<div class="o3-sec"><h5>' + L('WHAT I DO', 'TRABAHO KO') + '</h5><div class="o3-muted">' + esc(e.now) + '</div></div>' +
        '<button class="o3-btn" data-more="' + follow + '">' + L('Full details', 'Buong detalye') + '</button>';
      liveTick(); return;
    }
    var counts = { working:0, ok:0, warn:0, alert:0 }; DATA.KEYS.forEach(function(k){ if(E[k]) counts[E[k].st]++; });
    side.innerHTML = '<h4>' + L('Today in your office', 'Ngayon sa opisina mo') + '</h4><div class="o3-muted">' + DATA.KEYS.length + L(' AI workers in ', ' AI worker sa ') + ROOMS.length + L(' rooms. Tap a room or a worker.', ' kwarto. Pindutin ang kwarto o worker.') + '</div>' +
      '<div class="o3-sum"><span class="st-working">' + counts.working + ' ' + esc(LB.working || 'working') + '</span><span class="st-ok">' + counts.ok + ' ' + esc(LB.ok || 'ok') + '</span><span class="st-warn">' + counts.warn + ' ' + esc(LB.warn || 'check') + '</span><span class="st-alert">' + counts.alert + ' ' + esc(LB.alert || 'problem') + '</span></div>' +
      '<div class="o3-live" data-livek=""></div>' +
      ROOMS.map(function(R){ return '<div class="o3-roomrow' + (roomId === R.id ? ' on' : '') + '"><button class="o3-rn" data-room="' + R.id + '">' + esc(TL() ? R.tl : R.en) + '</button>' +
        R.agents.map(function(k){ var e = E[k]; return e ? '<button class="o3-ag st-' + e.st + '" data-pick="' + k + '" title="' + esc(e.name) + '"><span>' + emoji(k) + '</span>' + esc(e.name) + '</button>' : ''; }).join('') + '</div>'; }).join('');
    liveTick();
  }
  function emoji(k){ return { bear:'🐻', fox:'🦊', frog:'🐸', bunny:'🐰', raccoon:'🦝', cat:'🐱', owl:'🦉', dog:'🐶', mouse:'🐭' }[(LOOKS[k] || {}).a] || '🙂'; }
  function liveTick(){
    var el = side.querySelector('.o3-live'); if(!el || !LOADED_AT) return;
    var k = el.getAttribute('data-livek'), nx = Math.max(0, Math.round((NEXT_AT - Date.now()) / 1000));
    var html = '<span class="o3-dot"></span>' + L('Live — data checked ', 'Live — na-check ang data ') + ago(LOADED_AT) + L(' ago · next check in ', ' na · susunod na check sa ') + nx + 's';
    if(k){ html += '<br>' + (lastChange[k] ? L('Last change in this desk: ', 'Huling pagbabago sa desk: ') + ago(lastChange[k]) + L(' ago', ' na') : L('No change since you opened the page', 'Walang pagbabago mula nang buksan mo')); }
    el.innerHTML = html;
  }

  // ---------- loop ----------
  var vtmp = null, scrT = 0, lastFrame = 0, perf = [], lowMode = false;
  function loop(){
    requestAnimationFrame(loop);
    if(document.hidden || !root.offsetWidth || document.documentElement.classList.contains('lbgate-locked')) return;
    var nowMs = performance.now(); if(nowMs - lastFrame < 30) return;            // ~30 fps is enough and saves battery
    var spent = nowMs - lastFrame; lastFrame = nowMs;
    if(spent < 1000){ perf.push(spent); if(perf.length > 40) perf.shift(); }
    if(!lowMode && perf.length >= 40 && perf.reduce(function(a, b){ return a + b; }, 0) / perf.length > 70){ lowMode = true; renderer.shadowMap.enabled = false; renderer.setPixelRatio(1); scene.traverse(function(o){ if(o.material) o.material.needsUpdate = true; }); resize(); }
    var dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
    if(stage.clientWidth !== W || stage.clientHeight !== H) resize();
    Object.keys(AG).forEach(function(k){ var a = AG[k]; think(a, dt); step(a, dt, t);
      a.g.position.copy(a.pos); if(a.paceX) a.g.position.x += a.paceX; var dr = a.face - a.g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); a.g.rotation.y += dr * Math.min(1, dt * 8);
      a.desk.ring.scale.setScalar(a.st === 'alert' ? 1 + Math.sin(t * 6) * .12 : 1); });
    scrT += dt; if(scrT > .12){ scrT = 0; Object.keys(AG).forEach(function(k){ var a = AG[k]; var near = !follow || follow === k || camera.zoom < 2.5; if(near) drawScreen(a, a.st, t); }); }
    LED.forEach(function(l, i){ l.visible = Math.sin(t * (3 + i % 4) + i) > -.3; });
    stepRain(dt);
    if(follow && AG[follow]){ targetGoal = AG[follow].pos.clone().add(new T.Vector3(0, .7, -.3));
      if(root.classList.contains('dopen')){ var pw = Math.min(320, W * .86) / 2; targetGoal.addScaledVector(new T.Vector3(1, 0, -1).normalize(), pw * viewSize / H / camera.zoom); } }
    if(targetGoal) target.lerp(targetGoal, Math.min(1, dt * 4));
    camera.zoom += (zoomGoal - camera.zoom) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); placeCam();
    renderer.render(scene, camera);
    // HTML tags follow the 3D world
    vtmp = vtmp || new T.Vector3();
    Object.keys(AG).forEach(function(k){ var a = AG[k]; if(a.hidden){ a.tag.style.display = 'none'; return; }
      vtmp.copy(a.pos); vtmp.y += 2; vtmp.project(camera); var x = (vtmp.x + 1) / 2 * W, y = (1 - vtmp.y) / 2 * H;
      var show = x > -40 && x < W + 40 && y > -20 && y < H + 20; a.tag.style.display = show ? '' : 'none';
      if(show){ a.tag.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%)'; a.tag.classList.toggle('mini', camera.zoom < .9 && follow !== k); } });
    roomTags.forEach(function(r){ vtmp.copy(r.v).project(camera); var x = (vtmp.x + 1) / 2 * W, y = (1 - vtmp.y) / 2 * H; r.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)'; r.el.style.display = (follow || x < -100 || x > W + 50 || y < -20 || y > H) ? 'none' : ''; });
  }
  setInterval(function(){ if(!root.offsetWidth) return; liveTick();
    var c = root.querySelector('.o3-clock'); if(c){ var d = new Date(Date.now() + 3 * 3600000); c.textContent = String(d.getUTCHours() % 12 || 12).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ':' + String(d.getUTCSeconds()).padStart(2, '0') + ' ' + (d.getUTCHours() < 12 ? 'AM' : 'PM'); } }, 1000);


  // ---------- Nov 2026: real time of day (Bahrain) + live weather (Open-Meteo, free, no key) ----------
  var WX = { code:-1, temp:null, isDay:null, cloud:0, at:0 };
  function buildRain(){
    var N = 700, pos = new Float32Array(N * 6), geo = new T.BufferGeometry();
    for(var i = 0; i < N; i++){ var x = -3 + Math.random() * 40, y = Math.random() * 16, z = -3 + Math.random() * 27; pos.set([x, y, z, x - .05, y - .55, z + .05], i * 6); }
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    var rain = new T.LineSegments(geo, new T.LineBasicMaterial({ color:'#a9c8ff', transparent:true, opacity:.55 })); rain.visible = false; rain.frustumCulled = false; scene.add(rain); SKY.rain = rain;
  }
  function stepRain(dt){
    var r = SKY.rain; if(!r || !r.visible) return;
    var p = r.geometry.attributes.position.array, sp = (WX.code >= 95 ? 24 : WX.code >= 63 ? 20 : 14) * dt;
    for(var i = 0; i < p.length; i += 6){ p[i + 1] -= sp; p[i + 4] -= sp; p[i] -= sp * .08; p[i + 3] -= sp * .08;
      if(p[i + 4] < 0){ var x = -3 + Math.random() * 40, y = 13 + Math.random() * 4, z = -3 + Math.random() * 27; p[i] = x; p[i + 1] = y; p[i + 2] = z; p[i + 3] = x - .05; p[i + 4] = y - .55; p[i + 5] = z + .05; } }
    r.geometry.attributes.position.needsUpdate = true;
    if(WX.code >= 95){ SKY.flash = Math.max(0, SKY.flash - dt * 3); if(Math.random() < dt * .08) SKY.flash = 1; if(SKY.hemi) SKY.hemi.intensity = SKY.baseHemi + SKY.flash * 1.4; }
  }
  function wxInfo(c){
    if(c < 0) return ['', ''];
    if(c === 0) return ['clear', 'Clear']; if(c <= 2) return ['part', 'Partly cloudy']; if(c === 3) return ['cloud', 'Cloudy'];
    if(c === 45 || c === 48) return ['fog', 'Foggy / hazy']; if(c >= 51 && c <= 57) return ['drizzle', 'Drizzle'];
    if((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return ['rain', 'Rain']; if(c >= 71 && c <= 77) return ['cloud', 'Cold']; if(c >= 95) return ['storm', 'Thunderstorm'];
    return ['cloud', 'Cloudy'];
  }
  function lerpC(a, b, f){ return new T.Color(a).lerp(new T.Color(b), Math.max(0, Math.min(1, f))); }
  function applySky(){
    if(!T || !SKY.hemi) return;
    var d = new Date(Date.now() + 3 * 3600000), h = SKY.forceHour != null ? SKY.forceHour : d.getUTCHours() + d.getUTCMinutes() / 60;
    var rise = 6, set = 17;                                            // Bahrain, roughly all year
    var day = h <= rise - .7 || h >= set + .9 ? 0 : h < rise + .8 ? (h - (rise - .7)) / 1.5 : h > set - .6 ? 1 - (h - (set - .6)) / 1.5 : 1;
    day = Math.max(0, Math.min(1, day));
    var gold = Math.max(0, 1 - Math.min(Math.abs(h - rise), Math.abs(h - set)) / 1.2);   // sunrise / sunset glow
    var kind = wxInfo(WX.code)[0], wet = kind === 'rain' || kind === 'storm' || kind === 'drizzle';
    var cloud = kind === 'clear' ? 0 : kind === 'part' ? .25 : kind === 'fog' ? .5 : wet ? .75 : kind === 'storm' ? .9 : kind ? .55 : 0;
    var hemi = SKY.hemi, sun = SKY.sun, fill = SKY.fill;
    SKY.baseHemi = .28 + .5 * day * (1 - .35 * cloud); hemi.intensity = SKY.baseHemi;
    hemi.color.copy(lerpC('#7d8fd6', '#fff4e0', day)); hemi.groundColor.copy(lerpC('#1a1432', '#5a3a6a', day));
    sun.intensity = .14 + .82 * day * (1 - .6 * cloud);
    var sc = lerpC('#9db4ff', '#ffe2b8', day); sc.lerp(new T.Color('#ff9a5a'), gold * .7 * (1 - cloud)); sun.color.copy(sc);
    fill.intensity = .35 + .65 * (1 - day);
    LAMPS.forEach(function(m){ m.emissiveIntensity = .5 + 1.6 * (1 - day) + .4 * cloud; });
    var wc = lerpC('#1c2456', '#bfe3ff', day); wc.lerp(new T.Color('#ffb37a'), gold * .6); wc.lerp(new T.Color('#8a94a8'), cloud * .5 * day);
    WINS.forEach(function(m){ m.color.copy(wc); m.emissive.copy(lerpC('#2c3a8a', '#7fb8e8', day)); m.emissiveIntensity = .3 + .2 * (1 - day); });
    // the sky behind the office
    var top = lerpC('#070a1e', '#6fa8dc', day), bot = lerpC('#1a1236', '#3a2a6a', day);
    top.lerp(new T.Color('#ff9a6a'), gold * .55); top.lerp(new T.Color('#5a6070'), cloud * .55); bot.lerp(new T.Color('#2a2a3a'), cloud * .4);
    stage.style.background = 'linear-gradient(180deg,#' + top.getHexString() + ',#' + bot.getHexString() + ')';
    if(SKY.rain) SKY.rain.visible = wet;
    var chip = root.querySelector('.o3-wx');
    if(!chip){ var tp = root.querySelector('.o3-top'); if(tp){ chip = document.createElement('span'); chip.className = 'o3-live-pill o3-wx'; tp.appendChild(chip); } }
    if(chip){
      var ph = day > .6 ? (gold > .4 ? (h < 12 ? '🌅 Morning' : '🌇 Sunset') : h < 12 ? '☀️ Morning' : '☀️ Afternoon') : day > .05 ? (h < 12 ? '🌅 Sunrise' : '🌇 Sunset') : '🌙 Night';
      var ic = { clear:day > .3 ? '☀️' : '🌙', part:'⛅', cloud:'☁️', fog:'🌫️', drizzle:'🌦️', rain:'🌧️', storm:'⛈️' }[kind] || '';
      chip.textContent = ph + (WX.code >= 0 ? ' · ' + ic + ' ' + (WX.temp != null ? Math.round(WX.temp) + '°C ' : '') + wxInfo(WX.code)[1] : '');
      chip.title = 'Bahrain — real time and weather (Open-Meteo)';
    }
  }
  function loadWeather(){
    fetch('https://api.open-meteo.com/v1/forecast?latitude=26.22&longitude=50.58&current=temperature_2m,weather_code,is_day,cloud_cover&timezone=Asia%2FBahrain')
      .then(function(r){ return r.json(); }).then(function(j){ var c = j && j.current; if(!c) return; WX.code = Number(c.weather_code); WX.temp = c.temperature_2m; WX.isDay = c.is_day; WX.at = Date.now(); applySky(); }).catch(function(){});
  }
  setTimeout(function(){ applySky(); loadWeather(); }, 1500);
  setInterval(applySky, 60000); setInterval(loadWeather, 15 * 60000);
  window.LBOfficeSky = { test:function(code, hour){ if(code != null) WX.code = code; SKY.forceHour = hour; applySky(); } };   // console preview only

  // ---------- public API ----------
  window.LBOffice3D = {
    update:function(d){
      DATA = d; LOADED_AT = Date.now(); NEXT_AT = Date.now() + (d.every || 30000);
      d.KEYS.forEach(function(k){ var e = d.EMP[k]; if(!e) return; var sig = e.st + '|' + e.say;
        if(!firstData && lastSay[k] !== undefined && lastSay[k] !== sig){ lastChange[k] = Date.now(); var a = AG[k]; if(a){ var p = a.tag.querySelector('.pop'); p.classList.remove('on'); void p.offsetWidth; p.classList.add('on'); } }
        lastSay[k] = sig; });
      firstData = false;
      paintTags(); apply(); renderSide();
    },
    say:function(k, text, ms){ var a = AG[k]; if(!a || !text) return; var b = a.tag.querySelector('.bub'); b.textContent = text; a.tag.classList.add('talk'); clearTimeout(a.bt); a.bt = setTimeout(function(){ a.tag.classList.remove('talk'); }, ms || 3000); },
    select:select, whole:wholeOffice, full:function(on){ if(T) goFull(on); }
  };
  function paintTags(){
      var d = DATA; if(!d) return;
      var E = d.EMP, c = { working:0, warn:0, alert:0 }; d.KEYS.forEach(function(k){ if(E[k] && c[E[k].st] != null) c[E[k].st]++; });
      var top = root.querySelector('.o3-count'); if(top) top.innerHTML = d.KEYS.length + L(' workers', ' worker') + ' · <b class="st-working">' + c.working + ' ' + esc(d.LBL.working) + '</b>' + (c.warn ? ' · <b class="st-warn">' + c.warn + ' ' + esc(d.LBL.warn) + '</b>' : '') + (c.alert ? ' · <b class="st-alert">' + c.alert + ' ' + esc(d.LBL.alert) + '</b>' : '');
      ROOMS.forEach(function(R){ var rt = roomTags.filter(function(x){ return x.R === R; })[0]; if(!rt) return; var bad = R.agents.filter(function(k){ return E[k] && (E[k].st === 'warn' || E[k].st === 'alert'); }).length;
        rt.el.innerHTML = '<span class="d"></span>' + esc(TL() ? R.tl : R.en) + (bad ? ' <b>' + bad + '</b>' : ''); rt.el.className = 'o3-room' + (bad ? ' bad' : ''); });
  }

  // ---------- start ----------
  function boot(){ if(window.THREE) return init(); var s = document.createElement('script'); s.src = THREE_URL; s.onload = init; s.onerror = function(){ stage.innerHTML = '<div class="o3-muted" style="padding:30px;text-align:center">Could not load the 3D engine. Check the internet and refresh.</div>'; }; document.head.appendChild(s); }
  boot();
})();
