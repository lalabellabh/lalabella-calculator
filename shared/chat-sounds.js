/**
 * LALABELLA CHAT SOUNDS — notification sounds for the staff chat and the
 * 💬 badges. All sounds are made in the browser (no files to download),
 * plus an optional "My sound" the person uploads. Choice and volume are
 * saved on THIS device only.
 *
 *   lbChatSound.play('receive' | 'send')
 *   lbChatSound.preview(name)
 *   lbChatSound.list()            -> [{id, label}]
 *   lbChatSound.get() / set(id)   current sound
 *   lbChatSound.volume() / setVolume(0..1)
 *   lbChatSound.setCustom(dataUrl) / hasCustom()
 */
(function () {
  if (window.lbChatSound) return;
  const KEY = 'lbChatSound', VOL = 'lbChatSoundVol', CUSTOM = 'lbChatSoundCustom';
  let ctx = null;
  function ac() {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {}
    return ctx;
  }
  document.addEventListener('pointerdown', ac, { once: true, passive: true });

  const get = () => { try { return localStorage.getItem(KEY) || 'chime'; } catch (e) { return 'chime'; } };
  const vol = () => { try { const v = parseFloat(localStorage.getItem(VOL)); return isNaN(v) ? 0.7 : v; } catch (e) { return 0.7; } };

  // one note: frequency, start offset, length, wave type, peak volume, optional pitch glide
  function tone(f, at, len, type, peak, glideTo) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + len * 0.8);
    const p = Math.max(0.0002, (peak || 0.2) * vol());
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + len + 0.05);
  }
  // a short burst of filtered noise — for croaks/chirps/clicks that a pure tone can't make
  function noiseBurst(at, len, freq, q, peak) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + at;
    const n = Math.max(1, Math.round(c.sampleRate * len));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const filt = c.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = freq; filt.Q.value = q || 6;
    const g = c.createGain();
    const p = Math.max(0.0002, (peak || 0.3) * vol());
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p, t + Math.min(0.01, len * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(filt); filt.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + len + 0.02);
  }

  const SOUNDS = {
    chime:    { label: '🎐 Chime',      play: () => { tone(1046, 0, .45, 'triangle', .22); tone(1568, .11, .6, 'triangle', .18); } },
    pop:      { label: '🫧 Soft pop',   play: () => tone(900, 0, .12, 'sine', .3, 380) },
    bell:     { label: '🔔 Bell',       play: () => { tone(880, 0, 1.1, 'sine', .22); tone(2429, 0, .6, 'sine', .06); tone(1320, 0, .8, 'sine', .05); } },
    marimba:  { label: '🎶 Marimba',    play: () => { tone(784, 0, .28, 'sine', .3); tone(1568, 0, .12, 'sine', .08); tone(988, .13, .3, 'sine', .26); } },
    dingdong: { label: '🚪 Ding-dong',  play: () => { tone(659, 0, .55, 'sine', .25); tone(523, .3, .8, 'sine', .25); } },
    bubble:   { label: '💧 Bubble',     play: () => { tone(320, 0, .14, 'sine', .28, 980); tone(520, .1, .12, 'sine', .15, 1300); } },
    sparkle:  { label: '✨ Sparkle',    play: () => [1319, 1568, 2093, 2637].forEach((f, i) => tone(f, i * .06, .35, 'triangle', .12)) },
    classic:  { label: '📟 Classic beep', play: () => tone(560, 0, .32, 'sine', .25) },
    custom:   { label: '🎵 My sound',   play: () => playCustom() },
    off:      { label: '🔕 Silent',     play: () => {} },

    // ---- classic phones ----
    nokia:    { label: '📱 Nokia',
      play: () => { const n=[[659,0],[587,.15],[369,.3],[415,.45],[622,.6],[554,.75],[369,.9],[415,1.05],[494,1.2],[440,1.35],[277,1.5],[332,1.65],[494,1.8]];
        n.forEach(([f,at]) => tone(f, at, .16, 'square', .1)); } },
    motorola: { label: '📟 Motorola',
      play: () => { tone(1400, 0, .05, 'square', .16); tone(1600, .07, .05, 'square', .16); tone(1800, .14, .05, 'square', .16); tone(2000, .21, .09, 'square', .16); } },
    apple:    { label: '🍎 Apple',
      play: () => { tone(1318, 0, .14, 'sine', .16); tone(1568, .1, .14, 'sine', .16); tone(2093, .2, .22, 'sine', .16); } },

    // ---- nature (Philippine/BH-night sounds) ----
    palaka:   { label: '🐸 Palaka',
      play: () => { [0, .22, .42].forEach((at, i) => { tone(180, at, .09, 'sawtooth', .22, 110); tone(90, at, .1, 'sine', .18); }); } },
    tuko:     { label: '🦎 Tuko',
      play: () => { [0,.16].forEach(at => tone(480, at, .07, 'square', .14, 420));
        ['to','ko','to','ko','to','ko'].forEach((_, i) => tone(320 - i*4, .38 + i*.17, .1, 'square', .2, 260)); } },
    kuliglig: { label: '🦗 Kuliglig',
      play: () => { for(let i=0;i<10;i++) noiseBurst(i*.055, .028, 4200, 12, .16); } }
  };

  function playCustom() {
    let src = ''; try { src = localStorage.getItem(CUSTOM) || ''; } catch (e) {}
    if (!src) return SOUNDS.chime.play();
    try { const a = new Audio(src); a.volume = Math.min(1, vol()); a.play().catch(() => {}); } catch (e) {}
  }

  window.lbChatSound = {
    list: () => Object.keys(SOUNDS).map(id => ({ id, label: SOUNDS[id].label })),
    get,
    set: id => { if (SOUNDS[id]) try { localStorage.setItem(KEY, id); } catch (e) {} },
    volume: vol,
    setVolume: v => { try { localStorage.setItem(VOL, String(Math.max(0, Math.min(1, v)))); } catch (e) {} },
    hasCustom: () => { try { return !!localStorage.getItem(CUSTOM); } catch (e) { return false; } },
    setCustom: dataUrl => { try { localStorage.setItem(CUSTOM, dataUrl); return true; } catch (e) { return false; } },
    preview: id => (SOUNDS[id] || SOUNDS.chime).play(),
    play: kind => {
      const id = get();
      if (id === 'off') return;
      if (kind === 'send') { tone(1200, 0, .09, 'sine', .08, 1500); return; }   // tiny, subtle "sent"
      (SOUNDS[id] || SOUNDS.chime).play();
    }
  };
})();
