/* ==========================================================
   LALABELLA DAY-OFF FX — a little animated character + sound that
   greets you when you open your schedule on your day off.

   • 8 characters (chicken, parrot, dog, cat, frog, robot, girl, boy) that come
     out of their "home" (coop, cage, kennel…) in a pseudo-3D scene.
   • Sounds are synthesised in the browser (WebAudio) — no audio files.
   • Settings (character / volume / mute / on-off) are saved on THIS device.

   LBDayoffFx.openSettings()        the ⚙️ panel (character, volume, preview)
   LBDayoffFx.play(id?, opts?)      play a scene now (id = a character id or 'random')
   LBDayoffFx.maybePlayToday(name)  plays once per day (call when today is a day off)
   LBDayoffFx.beep()                short reminder chime that obeys the same volume/mute
   ========================================================== */
(function(){
  if (window.LBDayoffFx) return;

  const KEY = 'lbDayoffFx', SEEN = 'lbDayoffSeen';
  const CHARS = [
    { id: 'rooster',  label: 'Rooster — real recording', emoji: '🐓', vis: 'chicken', say: 'Cock-a-doodle-doo! It’s your day off.' },
    { id: 'chicken',  label: 'Rooster crow (synth)',     emoji: '🐔', vis: 'chicken', say: 'Cock-a-doodle-doo! It’s your day off.' },
    { id: 'dog',      label: 'Dog bark',                 emoji: '🐶', vis: 'dog',     say: 'Woof woof! It’s your day off.' },
    { id: 'horn',     label: 'Air horn',                 emoji: '📣', vis: 'clock',   say: 'It’s your day off.' },
    { id: 'bell',     label: 'Classic alarm-clock bell', emoji: '⏰', vis: 'clock',   say: 'Wake up! It’s your day off.' },
    { id: 'digital',  label: 'Digital alarm beeps',      emoji: '📟', vis: 'clock',   say: 'It’s your day off.' },
    { id: 'siren',    label: 'Siren',                    emoji: '🚨', vis: 'clock',   say: 'It’s your day off.' },
    { id: 'ringtone', label: 'Old phone ring',           emoji: '☎️', vis: 'clock',   say: 'It’s your day off.' },
    { id: 'ding',     label: 'Doorbell ding-dong',       emoji: '🔔', vis: 'clock',   say: 'It’s your day off.' },
    { id: 'cuckoo',   label: 'Cuckoo clock',             emoji: '🕰️', vis: 'clock',   say: 'Cuckoo! It’s your day off.' },
    { id: 'reveille', label: 'Morning trumpet',          emoji: '🎺', vis: 'clock',   say: 'Rise and shine. It’s your day off.' },
    { id: 'cat',      label: 'Cat meow',                 emoji: '🐱', vis: 'cat',     say: 'Meow. It’s your day off.' },
    { id: 'parrot',   label: 'Parrot whistle',           emoji: '🦜', vis: 'parrot',  say: 'Hello! It’s your day off.' },
    { id: 'frog',     label: 'Frog',                     emoji: '🐸', vis: 'frog',    say: 'Ribbit. It’s your day off.' },
    { id: 'robot',    label: 'Robot voice: “Attention. It is your day off.”', emoji: '🤖', vis: 'robot', say: 'Attention. It is your day off.' },
    { id: 'girl',     label: 'Girl voice: “Hello there!”', emoji: '👧', vis: 'girl',  say: 'Hello there! It’s your day off.' },
    { id: 'boy',      label: 'Boy voice: “Hi! Hello there!”', emoji: '👦', vis: 'boy', say: 'Hi! Hello there! It’s your day off.' },
    { id: 'custom',   label: 'My own sound (upload a file)', emoji: '📁', vis: 'clock', say: 'It’s your day off.' }
  ];
  const byId = {}; CHARS.forEach(function(c){ byId[c.id] = c; });

  // ------------------------------------------------------------ settings
  const DEF = { on: true, char: 'rooster', vol: 0.7, mute: false, horn: false, gifDay: null, gifRem: null };
  function load(){
    let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
    const o = Object.assign({}, DEF, s);
    o.vol = Math.max(0, Math.min(1, Number(o.vol))); if (isNaN(o.vol)) o.vol = DEF.vol;
    if (o.char !== 'random' && !byId[o.char]) o.char = 'rooster';
    o.on = o.on !== false; o.mute = !!o.mute; o.horn = !!o.horn;
    ['gifDay', 'gifRem'].forEach(function(k){ const g = o[k]; o[k] = (g && typeof g.url === 'string' && /^https:\/\//i.test(g.url)) ? { url: g.url, preview: (typeof g.preview === 'string' && /^https:\/\//i.test(g.preview)) ? g.preview : '' } : null; });
    return o;
  }
  function save(o){
    try {
      localStorage.setItem(KEY, JSON.stringify(o));
      // the reminder chime on the schedule page reads these two
      localStorage.setItem('lbSchedVol', String(o.vol)); localStorage.setItem('lbSchedMute', o.mute ? '1' : '0');
    } catch (e) {}
  }

  // ------------------------------------------------------------ sound (WebAudio)
  let ctx = null, master = null, noiseBuf = null;
  function audio(){
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor(); master = ctx.createGain();
      master.connect(comp); comp.connect(ctx.destination);
    }
    const s = load(); master.gain.value = s.mute ? 0 : s.vol * 0.9;
    return ctx;
  }
  function running(){ return !!ctx && ctx.state === 'running'; }
  function noise(){
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  // one pitched voice: freq glide f0→f1 (optionally via fm), shaped by a band-pass "mouth"
  function voice(o){
    const t = o.t, dur = o.dur, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sawtooth';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.fm) osc.frequency.linearRampToValueAtTime(o.fm, t + dur * 0.5);
    osc.frequency.linearRampToValueAtTime(o.f1 != null ? o.f1 : o.f0, t + dur);
    let node = osc;
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
      l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.05);
    }
    if (o.bp) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.bp; f.Q.value = o.q || 1.2; node.connect(f); node = f; }
    const peak = o.gain == null ? 0.5 : o.gain, a = Math.min(0.02, dur / 4);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur - 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function thump(t, dur, f, gain){            // noisy burst (bark / chest)
    const s = ctx.createBufferSource(); s.buffer = noise();
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = f; f1.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f1); f1.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
  }
  function horn(t, n){                          // air horn: two detuned saws, slight droop
    for (let i = 0; i < (n || 1); i++) {
      const st = t + i * 0.95;
      [415, 418, 622, 626, 830].forEach(function(f, k){
        voice({ t: st, dur: 0.78, type: 'sawtooth', f0: f * 1.03, f1: f * 0.985, bp: 1800, q: 0.5, gain: k < 2 ? 0.2 : 0.13 });
      });
      thump(st, 0.12, 2500, 0.25);
    }
  }
  const SOUNDS = {
    chicken: function(t){                      // rooster: cock-a-doodle-doo, layered for body
      [1, 1.012].forEach(function(m){
        voice({ t: t,        dur: 0.2,  type: 'sawtooth', f0: 480 * m, f1: 720 * m, bp: 1400, q: 1.6, gain: 0.3 });
        voice({ t: t + 0.24, dur: 0.14, type: 'sawtooth', f0: 760 * m, f1: 740 * m, bp: 1500, q: 1.6, gain: 0.28 });
        voice({ t: t + 0.42, dur: 0.42, type: 'sawtooth', f0: 700 * m, fm: 1000 * m, f1: 1180 * m, bp: 1700, q: 1.6, vib: [16, 26], gain: 0.34 });
        voice({ t: t + 0.9,  dur: 0.2,  type: 'sawtooth', f0: 1000 * m, f1: 840 * m, bp: 1600, q: 1.6, gain: 0.28 });
        voice({ t: t + 1.14, dur: 1.1,  type: 'sawtooth', f0: 1150 * m, fm: 1000 * m, f1: 520 * m, bp: 1500, q: 1.6, vib: [13, 34], gain: 0.34 });
      });
      thump(t, 0.05, 2200, 0.15); thump(t + 0.42, 0.05, 2200, 0.12);
    },
    parrot: function(t){
      voice({ t: t,        dur: 0.12, type: 'square', f0: 1300, f1: 1900, bp: 2000, q: 2, gain: 0.25 });
      voice({ t: t + 0.16, dur: 0.16, type: 'sawtooth', f0: 1600, f1: 950, bp: 1800, q: 2, gain: 0.3 });
      voice({ t: t + 0.4,  dur: 0.5, type: 'sine', f0: 900, fm: 1500, f1: 1050, vib: [9, 40], gain: 0.4 });
      voice({ t: t + 0.95, dur: 0.14, type: 'square', f0: 1500, f1: 2000, bp: 2200, q: 2, gain: 0.22 });
    },
    dog: function(t){                          // woof woof woof — chesty, with a noisy attack
      [0, 0.36, 0.78].forEach(function(d, i){
        const k = i === 2 ? 0.8 : 1;
        thump(t + d, 0.1, 1200, 0.5 * k); thump(t + d, 0.22, 500, 0.45 * k);
        voice({ t: t + d, dur: 0.24, type: 'sawtooth', f0: 330, fm: 270, f1: 150, bp: 700, q: 1.2, gain: 0.6 * k });
        voice({ t: t + d, dur: 0.2,  type: 'sawtooth', f0: 660, f1: 300, bp: 1500, q: 1.5, gain: 0.25 * k });
      });
    },
    cat: function(t){
      voice({ t: t,        dur: 0.85, type: 'triangle', f0: 420, fm: 980, f1: 480, bp: 1300, q: 1.4, vib: [7, 14], gain: 0.55 });
      voice({ t: t + 1.0,  dur: 0.4, type: 'triangle', f0: 600, f1: 380, bp: 1100, q: 1.4, gain: 0.35 });
    },
    frog: function(t){
      [0, 0.22, 0.6, 0.82].forEach(function(d){
        voice({ t: t + d, dur: 0.16, f0: 150, f1: 210, bp: 420, q: 3, vib: [38, 60], gain: 0.5 });
      });
    },
    horn: function(t){ horn(t, 2); }
  };
  SOUNDS.bell = function(t){                    // two-bell hammer, like an old wind-up alarm clock
    for (let i = 0; i < 22; i++) {
      const st = t + i * 0.085, f = i % 2 ? 2200 : 2350;
      voice({ t: st, dur: 0.12, type: 'triangle', f0: f, f1: f * 0.99, gain: 0.32 });
      voice({ t: st, dur: 0.12, type: 'sine', f0: f * 2.4, f1: f * 2.4, gain: 0.1 });
    }
  };
  SOUNDS.digital = function(t){
    for (let g = 0; g < 3; g++) { for (let i = 0; i < 4; i++) voice({ t: t + g * 0.9 + i * 0.11, dur: 0.07, type: 'square', f0: 2000, f1: 2000, gain: 0.22 }); }
  };
  SOUNDS.siren = function(t){
    for (let i = 0; i < 3; i++) voice({ t: t + i * 0.9, dur: 0.88, type: 'sawtooth', f0: 600, fm: 1150, f1: 600, bp: 1500, q: 0.4, gain: 0.3 });
  };
  SOUNDS.ringtone = function(t){                // brr-brr … brr-brr
    for (let r = 0; r < 2; r++) for (let i = 0; i < 16; i++) voice({ t: t + r * 1.4 + i * 0.045, dur: 0.04, type: 'square', f0: i % 2 ? 1400 : 1000, f1: i % 2 ? 1400 : 1000, gain: 0.2 });
  };
  SOUNDS.ding = function(t){
    [[659, 0], [523, 0.55]].forEach(function(n){
      voice({ t: t + n[1], dur: 1.1, type: 'sine', f0: n[0], f1: n[0], gain: 0.4 });
      voice({ t: t + n[1], dur: 0.7, type: 'sine', f0: n[0] * 2.01, f1: n[0] * 2.01, gain: 0.12 });
    });
  };
  SOUNDS.cuckoo = function(t){
    [0, 0.7, 1.4].forEach(function(d){
      voice({ t: t + d, dur: 0.22, type: 'sine', f0: 780, f1: 780, gain: 0.4 });
      voice({ t: t + d + 0.26, dur: 0.3, type: 'sine', f0: 620, f1: 620, gain: 0.4 });
    });
  };
  SOUNDS.reveille = function(t){                // bugle-style wake-up call
    const N = [[392, 0, .16], [523, .2, .16], [659, .4, .16], [784, .6, .5], [659, 1.15, .16], [784, 1.35, .7]];
    N.forEach(function(n){ voice({ t: t + n[1], dur: n[2], type: 'sawtooth', f0: n[0], f1: n[0], bp: 1400, q: 0.8, vib: [5, 4], gain: 0.28 }); });
  };

  // real recordings: shared/sounds/rooster.(mp3|ogg|wav) in the site, or the user's own uploaded file
  const FILES = { rooster: ['shared/sounds/rooster.mp3', 'shared/sounds/rooster.ogg', 'shared/sounds/rooster.wav'] };
  const bufCache = {};
  function idb(){ return new Promise(function(res, rej){ try { const r = indexedDB.open('lbDayoffSnd', 1); r.onupgradeneeded = function(){ r.result.createObjectStore('s'); }; r.onsuccess = function(){ res(r.result); }; r.onerror = function(){ rej(r.error); }; } catch (e) { rej(e); } }); }
  async function customGet(){ try { const db = await idb(); return await new Promise(function(res){ const q = db.transaction('s').objectStore('s').get('custom'); q.onsuccess = function(){ res(q.result || null); }; q.onerror = function(){ res(null); }; }); } catch (e) { return null; } }
  async function customSet(blob){ const db = await idb(); return new Promise(function(res, rej){ const tx = db.transaction('s', 'readwrite'); if (blob) tx.objectStore('s').put(blob, 'custom'); else tx.objectStore('s').delete('custom'); tx.oncomplete = function(){ delete bufCache.custom; res(); }; tx.onerror = function(){ rej(tx.error); }; }); }
  async function getBuffer(id){
    if (bufCache[id] !== undefined) return bufCache[id];
    let ab = null;
    try {
      if (id === 'custom') { const b = await customGet(); if (b) ab = await b.arrayBuffer(); }
      else for (const u of FILES[id] || []) { try { const r = await fetch(u); if (r.ok) { ab = await r.arrayBuffer(); break; } } catch (e) {} }
      bufCache[id] = ab ? await new Promise(function(res, rej){ ctx.decodeAudioData(ab, res, rej); }) : null;
    } catch (e) { bufCache[id] = null; }
    return bufCache[id];
  }
  async function playFileSound(id, fallback){
    const buf = await getBuffer(id);
    if (!buf) { if (running()) { try { SOUNDS[fallback](ctx.currentTime + 0.05); } catch (e) {} } return false; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(master); src.start(ctx.currentTime + 0.02);
    try { src.stop(ctx.currentTime + 0.02 + Math.min(buf.duration, 10)); } catch (e) {}
    return true;
  }
  async function fileExists(id){ return !!(await getBuffer(id)); }

  // robot / girl / boy talk (browser speech voices) — falls back to a short tone if none exists
  const SPEECH = {
    robot: { text: 'Attention. It is your day off.',        pitch: 0.2,  rate: 0.85, want: 'male' },
    girl:  { text: 'Hello there! It is your day off!',      pitch: 1.25, rate: 1,    want: 'female' },
    boy:   { text: 'Hi! Hello there! It is your day off!',  pitch: 0.85, rate: 1,    want: 'male' }
  };
  function pickVoice(want){
    const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    const en = vs.filter(function(v){ return /^en/i.test(v.lang); });
    const fem = /female|zira|samantha|hazel|susan|aria|jenny|karen|moira|fiona|victoria|google uk english female/i;
    const mal = /male|david|mark|george|james|daniel|guy|alex|fred|google uk english male/i;
    const re = want === 'female' ? fem : mal;
    return en.filter(function(v){ return re.test(v.name) && (want === 'female' || !/female/i.test(v.name)); })[0] || en[0] || null;
  }
  function speak(id, custom){
    const sp = SPEECH[id], set = load();
    if (!sp || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return false;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(custom || sp.text), v = pickVoice(sp.want);
      if (v) u.voice = v; u.lang = (v && v.lang) || 'en-US';
      u.pitch = sp.pitch; u.rate = sp.rate; u.volume = Math.max(0.05, set.vol);
      speechSynthesis.speak(u); return true;
    } catch (e) { return false; }
  }
  function playSound(id, custom){
    const c = audio(); if (!c) return false;
    try { c.resume && c.resume(); } catch (e) {}
    const set = load();
    if (set.horn) { if (!running()) return false; try { horn(c.currentTime + 0.05, 1); } catch (e) {} }
    if (SPEECH[id]) {
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
      const wait = set.horn ? 1100 : 0;
      setTimeout(function(){ if (!speak(id, custom) && running()) { try { voice({ t: ctx.currentTime, dur: 0.3, type: 'square', f0: 440, f1: 660, gain: 0.2 }); } catch (e) {} } }, wait);
      return true;
    }
    if (!running()) return false;
    if (id === 'rooster' || id === 'custom') { audio(); playFileSound(id, id === 'rooster' ? 'chicken' : 'bell'); return true; }
    try { (SOUNDS[id] || SOUNDS.chicken)(c.currentTime + 0.05 + (set.horn ? 1.0 : 0)); } catch (e) { return false; }
    return true;
  }
  function beep(){
    const c = audio(); if (!c || !running()) return;
    const t = c.currentTime + 0.02;
    try { voice({ t: t, dur: 0.28, type: 'sine', f0: 660, f1: 660, gain: 0.3 }); voice({ t: t + 0.16, dur: 0.3, type: 'sine', f0: 880, f1: 880, gain: 0.3 }); } catch (e) {}
  }


  // ------------------------------------------------------------ repeating reminder alarm
  const alarms = {};
  function alarmCycle(){
    const c = audio(); if (!c) return;
    try { c.resume && c.resume(); } catch (e) {}
    if (!running()) return;
    let id = load().char; if (id === 'random' || !byId[id] || SPEECH[id]) id = 'bell';
    playSound(id);
  }
  function alarmStart(key, maxMs){
    if (alarms[key]) return;
    const a = alarms[key] = { n: 0 };
    const resume = function(){ try { audio(); ctx && ctx.resume && ctx.resume(); } catch (e) {} };
    a.unlock = resume; document.addEventListener('pointerdown', resume, { once: true });
    const tick = function(){ a.n++; alarmCycle(); };
    tick(); a.iv = setInterval(tick, 4600);
    a.cap = setTimeout(function(){ alarmStop(key); }, maxMs || 120000);
  }
  function alarmStop(key){
    const a = alarms[key]; if (!a) return;
    clearInterval(a.iv); clearTimeout(a.cap); document.removeEventListener('pointerdown', a.unlock);
    delete alarms[key];
  }

  // ------------------------------------------------------------ characters (inline SVG, shaded to look rounded)
  const G = function(id, a, b, cx, cy, r){ return '<radialGradient id="' + id + '" cx="' + (cx || 38) + '%" cy="' + (cy || 30) + '%" r="' + (r || 80) + '%"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></radialGradient>'; };
  const eyeDot = function(x, y, r, cls){ return '<g class="' + (cls || '') + '"><circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#1d1416"/><circle cx="' + (x - r * 0.3) + '" cy="' + (y - r * 0.35) + '" r="' + (r * 0.32) + '" fill="#fff"/></g>'; };
  const ART = {
    clock: '<defs><radialGradient id="k1" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#ffd0d6"/><stop offset="1" stop-color="#d63a52"/></radialGradient><radialGradient id="k2" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f1e6e8"/></radialGradient></defs>' +
      '<circle cx="34" cy="36" r="17" fill="url(#k1)"/><circle cx="126" cy="36" r="17" fill="url(#k1)"/><path d="M80 30V22" stroke="#a82b40" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M44 138L34 158M116 138L126 158" stroke="#a82b40" stroke-width="9" stroke-linecap="round"/>' +
      '<circle cx="80" cy="88" r="58" fill="url(#k1)"/><circle cx="80" cy="88" r="46" fill="url(#k2)"/>' +
      '<g stroke="#3a2530" stroke-width="3" stroke-linecap="round"><path d="M80 52V58M80 118V124M44 88H50M110 88H116"/></g>' +
      '<g class="hand"><path d="M80 88V62" stroke="#3a2530" stroke-width="5" stroke-linecap="round"/></g><path d="M80 88L98 98" stroke="#3a2530" stroke-width="4" stroke-linecap="round"/><circle cx="80" cy="88" r="5" fill="#d63a52"/>' +
      '<path d="M40 70Q46 52 62 46" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".7"/>',
    chicken: '<defs>' + G('c1', '#ffffff', '#e8dccd') + G('c2', '#ff6b6b', '#c92a3a') + '</defs>' +
      '<g class="tail"><path d="M48 98 Q16 60 30 40 Q44 66 56 82 Z" fill="#d9ccbb"/><path d="M46 104 Q10 84 14 58 Q38 80 54 92 Z" fill="#efe4d5"/><path d="M50 108 Q20 106 14 84 Q40 92 56 100 Z" fill="#c7b9a6"/></g>' +
      '<path d="M66 134 L64 150 M92 134 L94 150" stroke="#f0a41c" stroke-width="5" stroke-linecap="round"/><path d="M56 152 L72 152 M86 152 L102 152" stroke="#f0a41c" stroke-width="5" stroke-linecap="round"/>' +
      '<ellipse cx="80" cy="104" rx="40" ry="35" fill="url(#c1)"/><ellipse cx="80" cy="132" rx="30" ry="8" fill="#000" opacity=".07"/>' +
      '<g class="wing"><path d="M62 96 Q84 84 100 104 Q86 128 62 118 Q54 108 62 96Z" fill="#efe4d5" stroke="#d6c6b2" stroke-width="1.5"/><path d="M70 104 Q82 100 92 108" stroke="#d6c6b2" stroke-width="1.5" fill="none"/></g>' +
      '<g class="head"><circle cx="108" cy="62" r="21" fill="url(#c1)"/>' +
      '<g fill="url(#c2)"><circle cx="100" cy="40" r="7"/><circle cx="109" cy="37" r="7.5"/><circle cx="118" cy="41" r="6.5"/></g>' +
      '<path d="M125 62 L143 67 L125 73 Z" fill="#f4a51f"/><path d="M125 73 L142 69" stroke="#d68c10" stroke-width="1.2"/>' +
      '<path d="M122 74 Q124 88 114 86 Q112 78 118 74Z" fill="url(#c2)"/>' + eyeDot(114, 58, 3.6, 'blink') +
      '<circle cx="104" cy="68" r="4.5" fill="#ff9aa2" opacity=".5"/></g>',
    parrot: '<defs>' + G('p1', '#58e07a', '#1f9a4c') + G('p2', '#5aa7ff', '#2456b8') + '</defs>' +
      '<path d="M30 148 Q80 138 140 150" stroke="#8a5a34" stroke-width="7" stroke-linecap="round" fill="none"/>' +
      '<g class="tail"><path d="M70 120 Q58 150 74 168 Q80 146 84 126Z" fill="#e4382f"/><path d="M80 120 Q76 152 92 166 Q94 142 92 124Z" fill="#2f6fe0"/></g>' +
      '<ellipse cx="82" cy="96" rx="32" ry="44" fill="url(#p1)"/><ellipse cx="82" cy="112" rx="18" ry="24" fill="#a6f0a8" opacity=".55"/>' +
      '<g class="wing"><path d="M58 84 Q38 110 62 138 Q82 118 80 90Z" fill="url(#p2)"/><path d="M60 100 Q54 116 62 130" stroke="#8cc4ff" stroke-width="2" fill="none" opacity=".7"/></g>' +
      '<g class="head"><circle cx="86" cy="50" r="26" fill="url(#p1)"/><path d="M70 36 Q86 22 104 34 Q90 30 76 40Z" fill="#ff5a4f"/>' +
      '<circle cx="76" cy="48" r="9" fill="#fff"/>' + eyeDot(77, 48, 4.4, 'blink') +
      '<path d="M96 46 Q126 44 118 72 Q108 66 100 62Z" fill="#ffd34d"/><path d="M96 46 Q120 46 116 60 Q104 52 98 52Z" fill="#ffe98a"/><path d="M99 62 Q110 66 118 72 Q108 76 100 70Z" fill="#e0a920"/></g>' +
      '<path d="M76 140 L74 150 M92 140 L94 150" stroke="#555" stroke-width="3.5" stroke-linecap="round"/>',
    dog: '<defs>' + G('d1', '#f6d6a5', '#d1a468') + G('d2', '#9a6a3c', '#5e3a1a') + '</defs>' +
      '<g class="tail"><path d="M118 118 Q150 96 144 72 Q136 96 114 108Z" fill="url(#d1)"/></g>' +
      '<ellipse cx="80" cy="128" rx="36" ry="28" fill="url(#d1)"/><ellipse cx="80" cy="136" rx="20" ry="16" fill="#fff3dd" opacity=".7"/>' +
      '<ellipse cx="62" cy="152" rx="11" ry="7" fill="#f6d6a5"/><ellipse cx="98" cy="152" rx="11" ry="7" fill="#f6d6a5"/>' +
      '<g class="head"><path d="M42 54 Q18 56 22 96 Q40 100 48 78Z" fill="url(#d2)"/><path d="M118 54 Q142 56 138 96 Q120 100 112 78Z" fill="url(#d2)"/>' +
      '<circle cx="80" cy="64" r="38" fill="url(#d1)"/><ellipse cx="80" cy="82" rx="22" ry="17" fill="#fff3dd"/>' +
      '<ellipse cx="80" cy="73" rx="7.5" ry="5.5" fill="#2b1a15"/><ellipse cx="78" cy="71.5" rx="2.2" ry="1.4" fill="#fff" opacity=".8"/>' +
      '<path d="M80 78 L80 86 M80 86 Q72 94 66 86 M80 86 Q88 94 94 86" stroke="#2b1a15" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<path d="M73 88 Q80 104 87 88Z" fill="#ff7d8e"/>' + eyeDot(64, 54, 4.2, 'blink') + eyeDot(96, 54, 4.2, 'blink') +
      '<path d="M54 44 Q62 40 70 44 M90 44 Q98 40 106 44" stroke="#8a5a2c" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>',
    cat: '<defs>' + G('t1', '#ffb561', '#e07a1f') + '</defs>' +
      '<g class="tail"><path d="M112 140 Q156 140 150 102 Q146 86 134 92 Q142 108 128 124 Q120 130 108 130Z" fill="url(#t1)"/><path d="M146 100 L150 108 M142 120 L148 124" stroke="#a9540f" stroke-width="3" stroke-linecap="round"/></g>' +
      '<ellipse cx="82" cy="126" rx="34" ry="30" fill="url(#t1)"/><ellipse cx="82" cy="138" rx="18" ry="16" fill="#ffe3bd" opacity=".85"/>' +
      '<ellipse cx="64" cy="154" rx="10" ry="6.5" fill="#ffe3bd"/><ellipse cx="100" cy="154" rx="10" ry="6.5" fill="#ffe3bd"/>' +
      '<g class="head"><path d="M44 40 L48 8 L74 30Z" fill="url(#t1)"/><path d="M116 40 L112 8 L86 30Z" fill="url(#t1)"/><path d="M50 32 L51 17 L64 29Z" fill="#ff9aa8"/><path d="M110 32 L109 17 L96 29Z" fill="#ff9aa8"/>' +
      '<ellipse cx="80" cy="62" rx="40" ry="34" fill="url(#t1)"/><path d="M80 30 L80 42 M68 32 L70 42 M92 32 L90 42" stroke="#a9540f" stroke-width="3" stroke-linecap="round"/>' +
      '<ellipse cx="80" cy="76" rx="16" ry="11" fill="#ffe3bd"/><path d="M75 70 L85 70 L80 76Z" fill="#ff7d8e"/><path d="M80 76 Q80 84 72 83 M80 76 Q80 84 88 83" stroke="#5a2f0c" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      '<g class="blink"><ellipse cx="62" cy="56" rx="7" ry="8" fill="#fff6c9"/><ellipse cx="98" cy="56" rx="7" ry="8" fill="#fff6c9"/><ellipse cx="62" cy="57" rx="2.6" ry="6.4" fill="#1d1416"/><ellipse cx="98" cy="57" rx="2.6" ry="6.4" fill="#1d1416"/><circle cx="60.6" cy="53" r="1.8" fill="#fff"/><circle cx="96.6" cy="53" r="1.8" fill="#fff"/></g>' +
      '<path d="M30 70 L52 74 M30 80 L52 78 M130 70 L108 74 M130 80 L108 78" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".9"/></g>',
    frog: '<defs>' + G('f1', '#8be56a', '#3a9c2e') + '</defs>' +
      '<ellipse cx="46" cy="138" rx="24" ry="14" fill="#3a9c2e"/><ellipse cx="114" cy="138" rx="24" ry="14" fill="#3a9c2e"/>' +
      '<ellipse cx="80" cy="112" rx="46" ry="38" fill="url(#f1)"/><ellipse cx="80" cy="124" rx="28" ry="22" fill="#e8ffc9" opacity=".85" class="throat"/>' +
      '<ellipse cx="50" cy="150" rx="14" ry="7" fill="#58b83f"/><ellipse cx="110" cy="150" rx="14" ry="7" fill="#58b83f"/>' +
      '<g class="head"><circle cx="54" cy="66" r="19" fill="url(#f1)"/><circle cx="106" cy="66" r="19" fill="url(#f1)"/>' +
      '<circle cx="54" cy="64" r="13" fill="#fff"/><circle cx="106" cy="64" r="13" fill="#fff"/>' + eyeDot(56, 65, 7, 'blink') + eyeDot(104, 65, 7, 'blink') +
      '<path d="M44 100 Q80 124 116 100" stroke="#1f6a1b" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="68" cy="92" r="1.8" fill="#1f6a1b"/><circle cx="92" cy="92" r="1.8" fill="#1f6a1b"/></g>' +
      '<circle cx="38" cy="100" r="6" fill="#ff9aa2" opacity=".45"/><circle cx="122" cy="100" r="6" fill="#ff9aa2" opacity=".45"/>',
    robot: '<defs><linearGradient id="r1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f7fb"/><stop offset=".55" stop-color="#b9c4d4"/><stop offset="1" stop-color="#7d8aa0"/></linearGradient>' + G('r2', '#9ff6ff', '#14b6d6') + '</defs>' +
      '<rect x="66" y="132" width="10" height="20" rx="4" fill="#6e7a90"/><rect x="86" y="132" width="10" height="20" rx="4" fill="#6e7a90"/><rect x="58" y="148" width="22" height="9" rx="4" fill="#4d576a"/><rect x="84" y="148" width="22" height="9" rx="4" fill="#4d576a"/>' +
      '<g class="armL"><rect x="26" y="88" width="14" height="38" rx="7" fill="url(#r1)"/><circle cx="33" cy="128" r="7" fill="#6e7a90"/></g>' +
      '<g class="armR"><rect x="122" y="88" width="14" height="38" rx="7" fill="url(#r1)"/><circle cx="129" cy="128" r="7" fill="#6e7a90"/></g>' +
      '<rect x="40" y="82" width="80" height="58" rx="14" fill="url(#r1)"/><rect x="54" y="94" width="52" height="30" rx="8" fill="#28324a"/><circle cx="68" cy="109" r="5" fill="url(#r2)" class="led"/><circle cx="82" cy="109" r="5" fill="#ff7da0" class="led2"/><circle cx="96" cy="109" r="5" fill="#ffd34d" class="led"/>' +
      '<g class="head"><line x1="80" y1="20" x2="80" y2="36" stroke="#6e7a90" stroke-width="3"/><circle cx="80" cy="16" r="6" fill="url(#r2)" class="led"/>' +
      '<rect x="46" y="34" width="68" height="50" rx="16" fill="url(#r1)"/><rect x="54" y="44" width="52" height="26" rx="10" fill="#1c2438"/>' +
      '<g class="blink"><rect x="62" y="50" width="12" height="13" rx="5" fill="url(#r2)"/><rect x="86" y="50" width="12" height="13" rx="5" fill="url(#r2)"/><circle cx="66" cy="54" r="2" fill="#fff"/><circle cx="90" cy="54" r="2" fill="#fff"/></g>' +
      '<path d="M68 76 L92 76" stroke="#6e7a90" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 3"/><rect x="38" y="48" width="8" height="18" rx="4" fill="#7d8aa0"/><rect x="114" y="48" width="8" height="18" rx="4" fill="#7d8aa0"/></g>',
    girl: '<defs>' + G('g1', '#ffe0cc', '#f0b896') + G('g2', '#7a4a2a', '#3f220f') + '</defs>' +
      '<path d="M54 90 Q80 82 106 90 L120 150 Q80 160 40 150Z" fill="#ff6f9c"/><path d="M54 90 Q80 82 106 90 L112 104 Q80 96 48 104Z" fill="#ff9ab9"/>' +
      '<rect x="66" y="148" width="9" height="12" rx="4" fill="#f0b896"/><rect x="86" y="148" width="9" height="12" rx="4" fill="#f0b896"/>' +
      '<g class="armL"><path d="M54 94 Q36 106 40 126" stroke="#f0b896" stroke-width="9" stroke-linecap="round" fill="none"/></g>' +
      '<g class="armR"><path d="M106 94 Q126 78 128 58" stroke="#f0b896" stroke-width="9" stroke-linecap="round" fill="none"/><circle cx="128" cy="54" r="7" fill="url(#g1)"/></g>' +
      '<g class="head"><path d="M40 52 Q24 100 44 112 Q48 80 56 62Z" fill="url(#g2)"/><path d="M120 52 Q136 100 116 112 Q112 80 104 62Z" fill="url(#g2)"/>' +
      '<circle cx="80" cy="56" r="34" fill="url(#g1)"/><path d="M46 52 Q48 18 80 18 Q112 18 114 52 Q100 36 80 36 Q60 36 46 52Z" fill="url(#g2)"/>' +
      eyeDot(66, 58, 4.4, 'blink') + eyeDot(94, 58, 4.4, 'blink') + '<circle cx="56" cy="68" r="6" fill="#ff8aa0" opacity=".45"/><circle cx="104" cy="68" r="6" fill="#ff8aa0" opacity=".45"/>' +
      '<path d="M70 72 Q80 82 90 72" stroke="#b0345a" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<g transform="translate(106 26)"><circle cx="-6" cy="0" r="6" fill="#ff5a8a"/><circle cx="6" cy="0" r="6" fill="#ff5a8a"/><circle cx="0" cy="0" r="3.5" fill="#ffd34d"/></g></g>',
    boy: '<defs>' + G('b1', '#f8d9bf', '#e0a982') + G('b2', '#3b2a22', '#171010') + '</defs>' +
      '<rect x="62" y="140" width="13" height="18" rx="5" fill="#2f4aa8"/><rect x="86" y="140" width="13" height="18" rx="5" fill="#2f4aa8"/><rect x="58" y="154" width="20" height="8" rx="4" fill="#fff"/><rect x="84" y="154" width="20" height="8" rx="4" fill="#fff"/>' +
      '<rect x="52" y="88" width="56" height="56" rx="12" fill="#3fa0ff"/><rect x="52" y="88" width="56" height="14" rx="8" fill="#7cc0ff"/><path d="M70 112 L90 112 M70 120 L84 120" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>' +
      '<g class="armL"><path d="M54 96 Q36 110 40 130" stroke="#e0a982" stroke-width="9" stroke-linecap="round" fill="none"/></g>' +
      '<g class="armR"><path d="M106 96 Q126 80 128 60" stroke="#e0a982" stroke-width="9" stroke-linecap="round" fill="none"/><circle cx="128" cy="56" r="7" fill="url(#b1)"/></g>' +
      '<g class="head"><circle cx="80" cy="56" r="34" fill="url(#b1)"/><path d="M46 56 Q40 14 82 16 Q122 14 114 56 Q106 38 96 34 Q80 42 62 34 Q50 40 46 56Z" fill="url(#b2)"/>' +
      eyeDot(66, 60, 4.4, 'blink') + eyeDot(94, 60, 4.4, 'blink') + '<circle cx="56" cy="70" r="6" fill="#ff8aa0" opacity=".4"/><circle cx="104" cy="70" r="6" fill="#ff8aa0" opacity=".4"/>' +
      '<path d="M68 74 Q80 86 92 74Z" fill="#7a2436"/><path d="M71 75 Q80 78 89 75" stroke="#fff" stroke-width="2.4" fill="none"/></g>'
  };
  function charSvg(id){ return '<svg viewBox="0 0 160 170" xmlns="http://www.w3.org/2000/svg" class="dfx-art dfx-' + id + '">' + (ART[id] || '') + '</svg>'; }

  // ------------------------------------------------------------ "homes" the characters come out of
  const HOME = {
    chicken: '<svg viewBox="0 0 200 150"><defs><linearGradient id="hw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c98a52"/><stop offset="1" stop-color="#9a6234"/></linearGradient></defs><path d="M20 62 L100 14 L180 62Z" fill="#c9352f"/><path d="M20 62 L100 14 L100 22 L34 62Z" fill="#e65a52"/><rect x="32" y="62" width="136" height="80" fill="url(#hw)"/><g stroke="#7d4b24" stroke-width="2" opacity=".55"><path d="M32 82H168M32 102H168M32 122H168"/></g><rect x="78" y="86" width="44" height="56" rx="22" fill="#2a1710"/><path d="M82 142 L118 142 L132 148 L68 148Z" fill="#8a5a30"/></svg>',
    parrot: '<svg viewBox="0 0 200 150"><path d="M100 4 L100 14" stroke="#b8860b" stroke-width="4"/><path d="M46 140 Q44 40 100 24 Q156 40 154 140Z" fill="#fff3b8" fill-opacity=".25" stroke="#d4a017" stroke-width="3"/><g stroke="#d4a017" stroke-width="3"><path d="M64 140 Q62 60 100 28"/><path d="M82 140 Q80 50 100 26"/><path d="M118 140 Q120 50 100 26"/><path d="M136 140 Q138 60 100 28"/></g><rect x="40" y="136" width="120" height="10" rx="4" fill="#b8860b"/></svg>',
    dog: '<svg viewBox="0 0 200 150"><path d="M22 70 L100 16 L178 70Z" fill="#b5483a"/><path d="M22 70 L100 16 L100 26 L40 70Z" fill="#d86a58"/><rect x="34" y="70" width="132" height="72" fill="#d9a066"/><g stroke="#a8743c" stroke-width="2" opacity=".5"><path d="M34 90H166M34 110H166M34 128H166"/></g><path d="M72 142 L72 100 Q100 70 128 100 L128 142Z" fill="#2a1710"/></svg>',
    cat: '<svg viewBox="0 0 200 150"><path d="M30 142 L30 70 Q30 44 60 44 L140 44 Q170 44 170 70 L170 142Z" fill="#e8cfa4"/><path d="M30 70 Q30 44 60 44 L140 44 Q170 44 170 70 Q100 62 30 70Z" fill="#f3e0bd"/><path d="M76 142 L76 98 Q100 74 124 98 L124 142Z" fill="#2a1710"/><path d="M60 30 L70 6 L88 30Z M140 30 L130 6 L112 30Z" fill="#e8cfa4"/></svg>',
    frog: '<svg viewBox="0 0 200 150"><ellipse cx="100" cy="118" rx="92" ry="26" fill="#2a8fd0"/><ellipse cx="100" cy="112" rx="80" ry="20" fill="#4fb5ef"/><ellipse cx="100" cy="110" rx="56" ry="11" fill="#9ad9ff" opacity=".6"/><ellipse cx="46" cy="116" rx="18" ry="6" fill="#3fae4a"/><path d="M42 116 L58 112" stroke="#2a8fd0" stroke-width="3"/><g stroke="#3a7a2e" stroke-width="3" stroke-linecap="round"><path d="M160 112 L158 70 M170 114 L174 76"/></g></svg>',
    robot: '<svg viewBox="0 0 200 150"><rect x="40" y="30" width="120" height="112" rx="20" fill="#9aa6bb"/><rect x="40" y="30" width="120" height="112" rx="20" fill="none" stroke="#6e7a90" stroke-width="4"/><rect x="62" y="52" width="76" height="90" rx="12" fill="#161d2e"/><g fill="#3de0ff"><rect x="66" y="40" width="12" height="5" rx="2"/><rect x="94" y="40" width="12" height="5" rx="2"/><rect x="122" y="40" width="12" height="5" rx="2"/></g></svg>',
    girl: '<svg viewBox="0 0 200 150"><rect x="38" y="26" width="124" height="120" fill="#ffd9a8"/><path d="M26 30 L100 2 L174 30Z" fill="#c9506b"/><rect x="72" y="52" width="56" height="94" rx="6" fill="#2b1a15"/><path d="M72 52 L50 60 L50 144 L72 146Z" fill="#a1623a"/><rect x="48" y="40" width="20" height="20" fill="#bfe4ff"/></svg>',
    boy: '<svg viewBox="0 0 200 150"><rect x="38" y="26" width="124" height="120" fill="#bfe0c8"/><path d="M26 30 L100 2 L174 30Z" fill="#3d5a99"/><rect x="72" y="52" width="56" height="94" rx="6" fill="#2b1a15"/><path d="M72 52 L50 60 L50 144 L72 146Z" fill="#7a5230"/><rect x="132" y="40" width="20" height="20" fill="#bfe4ff"/></svg>'
  };

  // ------------------------------------------------------------ scene
  let styled = false;
  function addStyle(){
    if (styled) return; styled = true;
    const s = document.createElement('style');
    s.textContent = [
      '.dfx-back{position:fixed;inset:0;z-index:100001;background:rgba(30,12,22,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:14px;opacity:0;animation:dfx-fade .35s ease forwards;font-family:"Space Grotesk",system-ui,sans-serif}',
      '@keyframes dfx-fade{to{opacity:1}}',
      '.dfx-stage{position:relative;width:min(360px,100%);height:400px;border-radius:26px;overflow:hidden;background:linear-gradient(#1d2b4a 0%,#7b5a86 34%,#f2a77a 51%,#2f3d33 51%,#1c2620 100%);box-shadow:0 26px 70px rgba(0,0,0,.45);perspective:760px;cursor:pointer}',
      '.dfx-sun{opacity:.35;position:absolute;top:18px;right:22px;width:54px;height:54px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fffbd0,#ffd84a);box-shadow:0 0 40px 12px rgba(255,226,120,.6);animation:dfx-sun 6s ease-in-out infinite}',
      '@keyframes dfx-sun{50%{transform:scale(1.08)}}',
      '.dfx-cloud{display:none;position:absolute;top:34px;left:-80px;width:70px;height:24px;border-radius:20px;background:#fff;opacity:.9;box-shadow:24px -10px 0 6px #fff,44px 0 0 2px #fff;animation:dfx-cloud 14s linear infinite}',
      '@keyframes dfx-cloud{to{transform:translateX(480px)}}',
      '.dfx-hill{position:absolute;left:-20%;right:-20%;bottom:-40px;height:150px;border-radius:50%;background:radial-gradient(ellipse at 50% 20%,#4a6b45,#2a3b2a)}',
      '.dfx-home{position:absolute;left:50%;top:52px;width:200px;margin-left:-100px;filter:drop-shadow(0 8px 6px rgba(0,0,0,.25))}',
      '.dfx-home svg{display:block;width:100%;height:auto}',
      '.dfx-char{position:absolute;left:50%;top:112px;width:168px;margin-left:-84px;transform-style:preserve-3d;will-change:transform;opacity:0;animation:dfx-emerge 1.7s cubic-bezier(.3,.8,.3,1) .5s forwards}',
      '.dfx-char.gif{top:-6px;width:220px;margin-left:-110px}.dfx-gif{display:block;width:100%;max-height:220px;object-fit:contain;border-radius:18px;box-shadow:0 10px 26px rgba(0,0,0,.4);background:#0003}',
      '.dfx-char .tilt{transform-style:preserve-3d;transition:transform .12s ease-out}',
      '.dfx-char svg{display:block;width:100%;height:auto;overflow:visible;filter:drop-shadow(0 10px 8px rgba(0,0,0,.28))}',
      '@keyframes dfx-emerge{0%{opacity:0;transform:translate3d(0,-24px,-160px) scale(.28)}18%{opacity:1}100%{opacity:1;transform:translate3d(0,92px,50px) scale(1)}}',
      '.dfx-shadow{position:absolute;left:50%;top:340px;width:140px;height:22px;margin-left:-70px;border-radius:50%;background:rgba(0,0,0,.22);filter:blur(5px);opacity:0;animation:dfx-fade .6s ease 1.7s forwards}',
      '.dfx-say{position:absolute;left:14px;right:14px;top:14px;padding:10px 14px;border-radius:16px;background:rgba(15,18,28,.72);backdrop-filter:blur(6px);color:#fff;font-weight:600;font-size:14px;letter-spacing:.2px;text-align:center;box-shadow:0 8px 22px rgba(0,0,0,.35);opacity:0;transform:translateY(-8px) scale(.96);animation:dfx-say .45s ease 1.9s forwards}',
      '@keyframes dfx-say{to{opacity:1;transform:none}}',
      '.dfx-say{white-space:pre-line}.dfx-ttl{font-size:11px;letter-spacing:.8px;text-transform:uppercase;opacity:.75;margin-bottom:3px}',
      '.dfx-act{position:absolute;left:14px;right:56px;bottom:14px;display:flex;gap:8px;z-index:5}.dfx-act button{flex:1;padding:11px;border-radius:12px;border:1px solid rgba(255,255,255,.35);background:rgba(15,18,28,.7);color:#fff;font-weight:700;font-size:14px;cursor:pointer}.dfx-act .pri{background:#c9506f;border-color:#c9506f}',
      '.dfx-x{position:absolute;right:10px;bottom:10px;z-index:3;border:0;border-radius:50%;width:34px;height:34px;background:rgba(0,0,0,.35);color:#fff;font-size:16px;cursor:pointer}',
      '.dfx-tap{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:3;border:0;border-radius:20px;padding:8px 14px;background:#c9506b;color:#fff;font:inherit;font-weight:700;font-size:13px;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.3)}',
      '.dfx-conf{position:absolute;top:-12px;width:8px;height:12px;border-radius:2px;opacity:0;animation:dfx-conf 3.4s linear forwards}',
      '@keyframes dfx-conf{0%{opacity:1;transform:translate3d(0,0,0) rotate(0)}100%{opacity:.9;transform:translate3d(var(--dx),400px,0) rotate(540deg)}}',
      // idle motion (after they come out)
      '.dfx-art *{transform-box:fill-box}',
      '.dfx-art.dfx-clock{transform-origin:50% 90%;animation:dfx-ring .09s linear 2.2s infinite alternate}@keyframes dfx-ring{from{transform:rotate(-3.5deg)}to{transform:rotate(3.5deg)}}.dfx-art .hand{transform-origin:50% 100%;animation:dfx-spin 2s linear 2.2s infinite}@keyframes dfx-spin{to{transform:rotate(360deg)}}',
      '.dfx-art .tail{transform-origin:20% 80%;animation:dfx-wag .5s ease-in-out 2.2s infinite alternate}',
      '.dfx-dog .tail{transform-origin:10% 90%;animation-duration:.22s}',
      '.dfx-cat .tail{transform-origin:10% 90%;animation-duration:.9s}',
      '.dfx-art .wing{transform-origin:70% 30%;animation:dfx-flap .24s ease-in-out 2.4s 8 alternate}',
      '.dfx-art .head{transform-origin:50% 90%;animation:dfx-nod 1.1s ease-in-out 2.2s infinite}',
      '.dfx-art .blink{transform-origin:center;animation:dfx-blink 3.2s ease-in-out 2.6s infinite}',
      '.dfx-art .armR{transform-origin:10% 90%;animation:dfx-wave .5s ease-in-out 2.2s infinite alternate}',
      '.dfx-robot .armR{transform-origin:50% 8%;animation:dfx-wave .38s ease-in-out 2.2s infinite alternate}',
      '.dfx-robot .armL{transform-origin:50% 8%;animation:dfx-wave .38s ease-in-out 2.2s infinite alternate-reverse}',
      '.dfx-art .armL{transform-origin:90% 10%}',
      '.dfx-art .led{animation:dfx-led .6s ease-in-out 2.2s infinite alternate}.dfx-art .led2{animation:dfx-led .6s ease-in-out 2.5s infinite alternate}',
      '.dfx-art .throat{transform-origin:center;animation:dfx-throat .5s ease-in-out 2.2s infinite alternate}',
      '.dfx-frog,.dfx-chicken,.dfx-parrot,.dfx-girl,.dfx-boy,.dfx-robot,.dfx-dog,.dfx-cat{animation:dfx-bob 1.2s ease-in-out 2.2s infinite}',
      '@keyframes dfx-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}',
      '@keyframes dfx-wag{to{transform:rotate(14deg)}}',
      '@keyframes dfx-flap{to{transform:rotate(-24deg) scaleY(.85)}}',
      '@keyframes dfx-nod{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(4deg)}}',
      '@keyframes dfx-blink{0%,92%,100%{transform:scaleY(1)}96%{transform:scaleY(.08)}}',
      '@keyframes dfx-wave{from{transform:rotate(-14deg)}to{transform:rotate(16deg)}}',
      '@keyframes dfx-led{from{opacity:.35}to{opacity:1}}',
      '@keyframes dfx-throat{from{transform:scale(1)}to{transform:scale(1.18,1.12)}}',
      '@media (prefers-reduced-motion:reduce){.dfx-char{animation:dfx-fade .3s ease .1s forwards;transform:translate3d(0,92px,50px)}.dfx-art,.dfx-art *{animation:none!important}.dfx-conf{display:none}}',
      // settings panel
      '.dfxs-back{position:fixed;inset:0;z-index:100000;background:rgba(40,20,28,.45);display:flex;align-items:center;justify-content:center;padding:12px;font-family:"Space Grotesk",system-ui,sans-serif}',
      '.dfxs{width:min(420px,100%);max-height:94vh;overflow-y:auto;background:#fff;border-radius:18px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.35);color:#3a2530}',
      '.dfxs h3{margin:0 0 4px;font-size:16px}.dfxs .sub{font-size:12px;color:#8a7078;margin-bottom:12px}',
      '.dfxs .gifrow{display:flex;align-items:center;gap:8px;margin:8px 0}.dfxs .gifrow b{width:98px;font-size:13px}.dfxs .gifrow .gp{flex:1;font-size:12px;opacity:.6}.dfxs .gifrow .gp img{height:44px;border-radius:8px;display:block}.dfxs .gifrow button{font:inherit;font-size:12px;font-weight:700;border:0;border-radius:9px;padding:8px 11px;background:#f6ecee;color:#7a2a40;cursor:pointer}',
      '.dfxg{width:min(380px,100%);height:min(470px,92vh);background:#fff;border-radius:18px;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.35);color:#3a2530}.dfxg-h{display:flex;align-items:center;padding:12px 14px}.dfxg-h b{flex:1}.dfxg-x{border:0;background:#f6ecee;border-radius:50%;width:28px;height:28px;cursor:pointer}.dfxg-host{position:absolute;left:0;right:0;bottom:0;height:0}.dfxg-host .lbcm-picker{margin:0 8px 8px;max-width:none}',
      '.dfxs .snds{max-height:260px;overflow-y:auto;border:1px solid #f0d9d9;border-radius:12px;padding:4px}.dfxs .snd{display:flex;align-items:center;gap:6px;border-radius:9px;padding:2px}.dfxs .snd.on{background:#fde8ed}.dfxs .snd .pk{flex:1;text-align:left;font:inherit;font-size:13px;border:0;background:none;padding:9px 8px;cursor:pointer;color:#3a2530}.dfxs .snd.on .pk{font-weight:700}.dfxs .snd .hint{font-size:10.5px;opacity:.6}.dfxs .snd .pl{border:0;background:#f6ecee;color:#7a2a40;border-radius:8px;width:32px;height:30px;font-weight:700;cursor:pointer}',
      '.dfxs .row{display:flex;align-items:center;gap:10px;margin:12px 0}.dfxs .row b{flex:1;font-size:13.5px}',
      '.dfxs input[type=checkbox]{width:20px;height:20px;accent-color:#c9506b}',
      '.dfxs input[type=range]{flex:2;accent-color:#c9506b}',
      '.dfxs .lbl{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#8a7078;margin:14px 0 6px}',
      '.dfxs .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
      '.dfxs .ch{border:2px solid #f0d9d9;border-radius:14px;background:#fdf6f6;padding:6px 4px 8px;text-align:center;cursor:pointer;font:inherit;font-size:12px;color:#3a2530}',
      '.dfxs .ch.on{border-color:#c9506b;background:#fde8ee}',
      '.dfxs .ch .th{width:64px;height:64px;margin:0 auto 2px;display:block}.dfxs .ch .th svg{width:100%;height:100%;overflow:visible}.dfxs .ch .th .dfx-art *{animation:none!important}',
      '.dfxs .ch .rnd{font-size:34px;line-height:64px}',
      '.dfxs .btns{display:flex;gap:8px;margin-top:16px}.dfxs .btns button{font:inherit;font-weight:700;font-size:13px;border:0;border-radius:10px;padding:11px 14px;cursor:pointer;background:#f6ecec;color:#3a2530}.dfxs .btns .pri{background:#c9506b;color:#fff;flex:1}',
      '.dfxs .note{font-size:11px;color:#8a7078;margin-top:10px;line-height:1.4}',
      '@media print{.dfx-back,.dfxs-back{display:none!important}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  let current = null;
  function stop(){ if (current) { clearTimeout(current.timer); current.el.remove(); document.removeEventListener('keydown', current.key); current = null; } }

  function play(id, opts){
    opts = opts || {}; addStyle(); stop();
    const set = load();
    if (!id || id === 'random') { const pool = CHARS.filter(function(c){ return c.id !== 'custom'; }); id = pool[Math.floor(Math.random() * pool.length)].id; }
    if (!byId[id]) id = 'rooster';
    const ch = byId[id], vis = ch.vis || id;
    const back = document.createElement('div'); back.className = 'dfx-back'; back.setAttribute('data-lb-theme-skip', '');
    const say = (opts.name ? opts.name + ', ' : '') + ch.say.charAt(0).toLowerCase() + ch.say.slice(1);
    back.innerHTML = '<div class="dfx-stage"><div class="dfx-sun"></div><div class="dfx-cloud"></div><div class="dfx-hill"></div>' +
      '<div class="dfx-home">' + (opts.gif ? '' : (HOME[vis] || '')) + '</div><div class="dfx-shadow"></div>' +
      '<div class="dfx-char' + (opts.gif ? ' gif' : '') + '"><div class="tilt">' + (opts.gif ? '<img class="dfx-gif" alt="">' : charSvg(vis)) + '</div></div>' +
      '<div class="dfx-say"></div><button class="dfx-x" type="button" aria-label="Close">✕</button></div>';
    const stage = back.querySelector('.dfx-stage');
    if (opts.gif) {
      const gi = back.querySelector('.dfx-gif'); let tried = 0;
      gi.onerror = function(){ tried++; if (tried === 1 && opts.gif.preview && gi.src !== opts.gif.preview) gi.src = opts.gif.preview; else { const t = back.querySelector('.tilt'); t.innerHTML = charSvg(vis); back.querySelector('.dfx-char').classList.remove('gif'); } };
      gi.src = opts.gif.url;
    }
    back.querySelector('.dfx-say').textContent = opts.text ? opts.text : (opts.name ? opts.name + ' — ' : '') + ch.say + (opts.extra ? '\n' + opts.extra : '');
    if (opts.title) { const h = document.createElement('div'); h.className = 'dfx-ttl'; h.textContent = opts.title; back.querySelector('.dfx-say').insertAdjacentElement('afterbegin', h); }
    if (opts.actions) { const bar = document.createElement('div'); bar.className = 'dfx-act'; opts.actions.forEach(function(a){ const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = a.label; if (a.pri) bt.className = 'pri'; bt.addEventListener('click', function(e){ e.stopPropagation(); stop(); try { a.fn && a.fn(); } catch (er) {} }); bar.appendChild(bt); }); stage.appendChild(bar); }
    // confetti
    const cols = ['#ff6f91', '#ffd34d', '#5aa7ff', '#6ee09a', '#b48cff'];
    for (let i = 0; i < 0; i++) {
      const c = document.createElement('i'); c.className = 'dfx-conf';
      c.style.left = (Math.random() * 100) + '%'; c.style.background = cols[i % cols.length];
      c.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px'); c.style.animationDelay = (2.1 + Math.random() * 1.6) + 's';
      stage.appendChild(c);
    }
    // pointer / touch tilt (pseudo-3D)
    const tilt = back.querySelector('.tilt');
    function onMove(e){
      const r = stage.getBoundingClientRect(), t = e.touches ? e.touches[0] : e;
      const dx = Math.max(-1, Math.min(1, (t.clientX - (r.left + r.width / 2)) / (r.width / 2)));
      const dy = Math.max(-1, Math.min(1, (t.clientY - (r.top + r.height * 0.6)) / (r.height / 2)));
      tilt.style.transform = 'rotateY(' + (dx * 18).toFixed(1) + 'deg) rotateX(' + (-dy * 10).toFixed(1) + 'deg)';
    }
    stage.addEventListener('pointermove', onMove); stage.addEventListener('touchmove', onMove, { passive: true });
    function close(){ stop(); if (opts.onClose) try { opts.onClose(); } catch (er) {} }
    back.querySelector('.dfx-x').addEventListener('click', function(e){ e.stopPropagation(); close(); });
    back.addEventListener('click', function(e){ if (e.target === back && !opts.persist) close(); });
    const key = function(e){ if (e.key === 'Escape' && !opts.persist) close(); };
    document.addEventListener('keydown', key);
    document.body.appendChild(back);

    // sound: at the moment the character is out; if the browser blocks audio, offer a tap
    let played = false;
    function sound(){ if (played) return; if (set.mute || set.vol === 0) { played = true; return; } if (playSound(id, opts.speak)) played = true; }
    const soundTimer = setTimeout(function(){
      sound();
      if (!played) {
        const b = document.createElement('button'); b.className = 'dfx-tap'; b.type = 'button'; b.textContent = '🔊 Tap for sound';
        b.addEventListener('click', function(e){ e.stopPropagation(); b.remove(); sound(); });
        stage.appendChild(b);
      }
    }, 1900);
    audio();                                   // wake the audio engine as early as possible (works when started by a tap)
    const timer = opts.persist ? 0 : setTimeout(close, opts.hold || 9000);
    current = { el: back, timer: timer, key: key, soundTimer: soundTimer };
    if (opts.persist) current.loop = setInterval(function(){ if (!set.mute && set.vol > 0 && played) playSound(id, opts.speak); }, opts.every || 5500);
    return id;
  }
  // make sure the delayed sound never fires after the scene is closed
  const _stop = stop;
  stop = function(){ if (current && current.soundTimer) clearTimeout(current.soundTimer); if (current && current.loop) clearInterval(current.loop); try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {} _stop(); };

  // ------------------------------------------------------------ once a day
  function today(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function maybePlayToday(name, extra){
    const s = load(); if (!s.on) return false;
    let seen = ''; try { seen = localStorage.getItem(SEEN) || ''; } catch (e) {}
    if (seen === today()) return false;
    try { localStorage.setItem(SEEN, today()); } catch (e) {}
    play(s.char, { name: name, extra: extra, gif: s.gifDay });
    return true;
  }

  // ------------------------------------------------------------ GIF chooser (reuses the chat GIF picker / favorites)
  function loadScript(src){ return new Promise(function(res, rej){ const x = document.createElement('script'); x.src = src; x.onload = res; x.onerror = rej; document.body.appendChild(x); }); }
  async function chooseGif(onPick){
    addStyle();
    try {
      if (!window.lbChatApi) {
        window.lbChatApi = async function(action, params){
          const tok = window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || '';
          const r = await fetch(LB_CONFIG.CHAT_API, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: LB_CONFIG.SUPABASE_PUBLISHABLE_KEY }, body: JSON.stringify(Object.assign({}, params || {}, { action: action, token: tok })) });
          return r.json();
        };
      }
      if (!window.lbChatMedia) await loadScript('shared/chat-media.js');
    } catch (e) { alert('Could not load the GIF picker.'); return; }
    const back = document.createElement('div'); back.className = 'dfxs-back'; back.style.zIndex = 100001; back.setAttribute('data-lb-theme-skip', '');
    back.innerHTML = '<div class="dfxg"><div class="dfxg-h"><b>Pick a GIF</b><button type="button" class="dfxg-x">✕</button></div><div class="dfxg-host"></div></div>';
    document.body.appendChild(back);
    const host = back.querySelector('.dfxg-host');
    function close(){ back.remove(); }
    back.querySelector('.dfxg-x').addEventListener('click', close);
    back.addEventListener('click', function(e){ if (e.target === back) close(); });
    const picker = lbChatMedia.createPicker({ host: host, toggleBtn: null, onEmoji: function(){}, onGif: function(item, kind){ close(); onPick(item); } });
    setTimeout(function(){ picker.open(); const tb = picker.el.querySelectorAll('.lbcm-tabs button'); if (tb[1]) tb[1].click(); }, 30);   // after the opening click has finished bubbling
  }

  // ------------------------------------------------------------ settings panel
  function openSettings(){
    addStyle();
    const s = load();
    const back = document.createElement('div'); back.className = 'dfxs-back'; back.setAttribute('data-lb-theme-skip', '');
    const box = document.createElement('div'); box.className = 'dfxs'; back.appendChild(box);
    box.innerHTML = '<h3>🎭 Day-off animation &amp; sound</h3><div class="sub">When you open My Schedule on your day off, a little friend greets you (once a day). Saved on this device.</div>' +
      '<div class="row"><b>Show the animation</b><input type="checkbox" id="dfxOn"></div>' +
      '<div class="lbl">GIF animation (optional — replaces the drawn character)</div>' +
      '<div class="gifrow"><b>Day-off GIF</b><span class="gp" id="dfxGpD"></span><button type="button" id="dfxGcD">Choose</button><button type="button" id="dfxGxD">✕</button></div>' +
      '<div class="gifrow"><b>Reminder GIF</b><span class="gp" id="dfxGpR"></span><button type="button" id="dfxGcR">Choose</button><button type="button" id="dfxGxR">✕</button></div>' +
      '<div class="lbl">Sound</div><div class="snds" id="dfxGrid"></div>' +
      '<div class="row" style="margin-top:10px"><b>🔈 Volume</b><input type="range" id="dfxVol" min="0" max="100" step="1"><span id="dfxVolN" style="width:36px;text-align:right;font-size:12px"></span></div>' +
      '<div class="row"><b>📣 Air horn blast first (louder, alarm-style)</b><input type="checkbox" id="dfxHorn"></div>' +
      '<div class="row"><b>Mute (also mutes reminder chime)</b><input type="checkbox" id="dfxMute"></div>' +
      '<div class="btns"><button type="button" id="dfxTest">▶ Preview</button><button type="button" class="pri" id="dfxDone">Done</button></div>' +
      '<div class="note">Tap ▶ to hear a sound. Animal and alarm sounds are made by your browser; the voices use your device’s voice. For a real chicken, add shared/sounds/rooster.mp3 to the site or upload your own file under “My own sound”. Phones may need a tap before sound can play.</div>';
    const grid = box.querySelector('#dfxGrid'), note2 = {};
    function drawGrid(){
      grid.innerHTML = '';
      const items = CHARS.map(function(c){ return { id: c.id, label: c.emoji + ' ' + c.label }; });
      items.push({ id: 'random', label: '🎲 Surprise me (random each time)' });
      items.forEach(function(it){
        const row = document.createElement('div'); row.className = 'snd' + (s.char === it.id ? ' on' : '');
        const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'pk'; pick.textContent = it.label;
        const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = note2[it.id] || '';
        const play1 = document.createElement('button'); play1.type = 'button'; play1.className = 'pl'; play1.textContent = '▶'; play1.setAttribute('aria-label', 'Play');
        pick.addEventListener('click', function(){ s.char = it.id; save(s); drawGrid(); });
        play1.addEventListener('click', function(){ audio(); let id = it.id; if (id === 'random') { const pool = CHARS.filter(function(c){ return c.id !== 'custom'; }); id = pool[Math.floor(Math.random() * pool.length)].id; } playSound(id); });
        row.appendChild(pick); if (note2[it.id]) row.appendChild(hint); row.appendChild(play1);
        if (it.id === 'custom') {
          const up = document.createElement('button'); up.type = 'button'; up.className = 'pl'; up.textContent = '⬆';  up.setAttribute('aria-label', 'Upload sound');
          up.addEventListener('click', function(){
            const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*';
            inp.addEventListener('change', async function(){
              const f = inp.files && inp.files[0]; if (!f) return;
              if (f.size > 2 * 1024 * 1024) { alert('Please use a short clip under 2 MB (about 10–20 seconds).'); return; }
              try { await customSet(f); audio(); const ok = await fileExists('custom'); if (!ok) { await customSet(null); alert('That file could not be played. Try an mp3, wav or m4a.'); return; }
                note2.custom = f.name.slice(0, 22); s.char = 'custom'; save(s); drawGrid(); } catch (e) { alert('Could not save the sound on this device.'); }
            });
            inp.click();
          });
          row.appendChild(up);
        }
        grid.appendChild(row);
      });
    }
    // flag the real-recording rows that have no file yet
    (async function(){ audio(); if (!(await fileExists('rooster'))) note2.rooster = 'file not added yet'; if (await fileExists('custom')) note2.custom = 'saved on this device'; drawGrid(); })();
    function testPlay(id, useGif){ audio(); play(id || s.char, { hold: 6500, gif: useGif ? s.gifDay : null }); }
    const on = box.querySelector('#dfxOn'), vol = box.querySelector('#dfxVol'), volN = box.querySelector('#dfxVolN'), mute = box.querySelector('#dfxMute');
    on.checked = s.on; vol.value = Math.round(s.vol * 100); volN.textContent = vol.value + '%'; mute.checked = s.mute; const hornEl = box.querySelector('#dfxHorn'); hornEl.checked = s.horn;
    hornEl.addEventListener('change', function(){ s.horn = hornEl.checked; save(s); audio(); if (hornEl.checked) horn(ctx.currentTime + 0.05, 1); });
    on.addEventListener('change', function(){ s.on = on.checked; save(s); });
    vol.addEventListener('input', function(){ s.vol = vol.value / 100; volN.textContent = vol.value + '%'; save(s); if (master) master.gain.value = s.mute ? 0 : s.vol * 0.9; });
    vol.addEventListener('change', function(){ audio(); beep(); });             // small tick so you can hear the level
    mute.addEventListener('change', function(){ s.mute = mute.checked; save(s); if (master) master.gain.value = s.mute ? 0 : s.vol * 0.9; });
    box.querySelector('#dfxTest').addEventListener('click', function(){ testPlay(s.char, true); });
    function close(){ back.remove(); document.removeEventListener('keydown', key); }
    const key = function(e){ if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    box.querySelector('#dfxDone').addEventListener('click', close);
    back.addEventListener('click', function(e){ if (e.target === back) close(); });
    function drawGifs(){
      [['D', 'gifDay'], ['R', 'gifRem']].forEach(function(p){
        const g = s[p[1]], sp = box.querySelector('#dfxGp' + p[0]);
        sp.innerHTML = ''; if (g) { const im = new Image(); im.src = g.preview || g.url; im.alt = ''; sp.appendChild(im); } else sp.textContent = 'none';
        box.querySelector('#dfxGx' + p[0]).style.visibility = g ? 'visible' : 'hidden';
      });
    }
    [['D', 'gifDay'], ['R', 'gifRem']].forEach(function(p){
      box.querySelector('#dfxGc' + p[0]).addEventListener('click', function(){ chooseGif(function(item){ s[p[1]] = { url: item.url, preview: item.preview || '' }; save(s); drawGifs(); }); });
      box.querySelector('#dfxGx' + p[0]).addEventListener('click', function(){ s[p[1]] = null; save(s); drawGifs(); });
    });
    drawGifs();
    drawGrid();
    document.body.appendChild(back);
  }

  // reminder alarm: the character keeps calling (sound repeats) until you press Done / Later
  function alarm(text, o){
    o = o || {}; const set = load();
    const id = (set.char === 'random' || !byId[set.char]) ? 'random' : set.char;
    play(id, { gif: set.gifRem, persist: true, title: o.title || '🔔 Reminder', text: text, speak: 'Reminder. ' + text, every: 6000,
      actions: [{ label: '✔ Done', pri: true, fn: o.onDone }, { label: 'Later', fn: o.onLater }], onClose: o.onLater });
    return id;
  }
  window.LBDayoffFx = { alarm: alarm, openSettings: openSettings, play: play, stop: function(){ stop(); }, maybePlayToday: maybePlayToday, beep: beep, alarmStart: alarmStart, alarmStop: alarmStop, CHARS: CHARS, get: load };
})();
