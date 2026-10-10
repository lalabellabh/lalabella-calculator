/* ==========================================================
   LALABELLA CHAT MEDIA — voice messages, photos, GIFs, stickers,
   favorites. Shared by shared/chat-bubble.js and chatbox.html so
   there is ONE copy of this logic.

   Needs: lbChatApi (shared/chat-live.js).

   lbChatMedia.mediaEl(msg)                 -> element for a non-text message
   lbChatMedia.recordUI({host,onSend})      -> voice-record bar over `host`
   lbChatMedia.photoUI({onSend})            -> pick + compress + preview a photo
   lbChatMedia.createPicker({host,toggleBtn,onEmoji,onGif})
                                            -> emoji / GIF / sticker / favorites panel
   ========================================================== */
(function(){
  if (window.lbChatMedia) return;

  const api = (action, params) => window.lbChatApi(action, params || {});
  const MAX_VOICE_MS = 60000;

  // ------------------------------------------------------------ styles
  let styled = false;
  function addStyle(){
    if (styled) return; styled = true;
    const s = document.createElement('style');
    s.textContent = [
      '.lbcm-voice{display:flex;align-items:center;gap:9px;min-width:170px}',
      '.lbcm-vbtn{width:32px;height:32px;border-radius:50%;border:0;cursor:pointer;flex:0 0 32px;font-size:12px;background:rgba(0,0,0,.12);color:inherit;display:flex;align-items:center;justify-content:center;padding:0}',
      '.lbcm-vtrack{flex:1;height:5px;border-radius:3px;background:rgba(0,0,0,.15);overflow:hidden;min-width:60px}',
      '.lbcm-vfill{height:100%;width:0;background:currentColor;opacity:.75}',
      '.lbcm-vtime{font-size:11px;opacity:.75;min-width:32px;text-align:right;font-variant-numeric:tabular-nums}',
      '.lbcm-img{display:block;max-width:220px;max-height:260px;border-radius:12px;cursor:zoom-in;background:rgba(0,0,0,.06)}',
      '.lbcm-gif{display:block;max-width:200px;max-height:200px;border-radius:12px}',
      '.lbcm-sticker{display:block;max-width:150px;max-height:150px}',
      '.lbcm-note{font-size:12px;opacity:.7;font-style:italic}',
      '.lbcm-lightbox{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:14px}',
      '.lbcm-lightbox img{max-width:100%;max-height:100%;border-radius:8px}',
      // recording bar
      '.lbcm-rec{position:absolute;inset:0;z-index:5;background:#fff;display:flex;align-items:center;gap:10px;padding:8px 12px;font-family:inherit}',
      '.lbcm-dot{width:11px;height:11px;border-radius:50%;background:#e03a3a;animation:lbcmPulse 1s infinite}',
      '@keyframes lbcmPulse{50%{opacity:.25}}',
      '.lbcm-rtime{font-variant-numeric:tabular-nums;font-weight:700;font-size:14px;color:#3a2530}',
      '.lbcm-rtxt{flex:1;font-size:12px;color:#8a7078;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.lbcm-rbtn{border:0;border-radius:50%;width:38px;height:38px;font-size:16px;cursor:pointer;flex:0 0 38px}',
      '.lbcm-rcancel{background:#f6ecec;color:#b23a3a}',
      '.lbcm-rsend{background:#c9506b;color:#fff}',
      '.lbcm-rbtn:disabled{opacity:.5}',
      // photo preview
      '.lbcm-pv{position:fixed;inset:0;z-index:100000;background:rgba(40,20,28,.55);display:flex;align-items:center;justify-content:center;padding:14px;font-family:"Space Grotesk",system-ui,sans-serif}',
      '.lbcm-pvbox{background:#fff;border-radius:16px;padding:14px;max-width:min(380px,100%);box-shadow:0 20px 60px rgba(0,0,0,.35)}',
      '.lbcm-pvbox img{display:block;max-width:100%;max-height:60vh;border-radius:10px;margin:0 auto}',
      '.lbcm-pvbtns{display:flex;gap:8px;margin-top:12px}',
      '.lbcm-pvbtns button{flex:1;font:inherit;font-weight:700;font-size:13px;border:0;border-radius:10px;padding:10px;cursor:pointer;background:#f6ecec;color:#3a2530}',
      '.lbcm-pvbtns .pri{background:#c9506b;color:#fff}',
      '.lbcm-pvbtns button:disabled{opacity:.55}',
      '.lbcm-pverr{font-size:12px;color:#b23a3a;margin-top:8px;min-height:14px;text-align:center}',
      // picker
      '.lbcm-picker{display:none;position:absolute;left:0;right:0;bottom:100%;z-index:40;margin:0 8px 6px;max-width:360px;background:#fff;border:1px solid #f0d9d9;border-radius:16px;box-shadow:0 14px 34px rgba(90,30,50,.22);overflow:hidden;font-family:inherit;color:#3a2530}',
      '.lbcm-picker.show{display:flex;flex-direction:column;height:min(340px,60vh)}',
      '.lbcm-tabs{display:flex;border-bottom:1px solid #f0d9d9;flex:0 0 auto}',
      '.lbcm-tabs button{flex:1;border:0;background:none;padding:9px 0;font-size:13px;font-weight:700;cursor:pointer;color:#8a7078;font-family:inherit}',
      '.lbcm-tabs button.on{background:#fdf1f0;color:#9e2f4a}',
      '.lbcm-head{flex:0 0 auto;padding:8px 8px 0}',
      '.lbcm-body{flex:1;overflow-y:auto;min-height:0;padding:8px}',
      '.lbcm-sub{display:flex;gap:4px;margin-bottom:6px}',
      '.lbcm-sub button{border:0;background:none;font-size:18px;padding:3px 7px;border-radius:8px;cursor:pointer}',
      '.lbcm-sub button.on{background:#fdf1f0}',
      '.lbcm-egrid{display:grid;grid-template-columns:repeat(8,1fr);gap:2px}',
      '.lbcm-egrid button,.lbcm-sub button{font-family:' + EMOJI_FONT + ',sans-serif}',
      '.lbcb-msg,#lbcb-input{font-family:"Space Grotesk",Arial,"Noto Color Emoji",sans-serif}',
      '.lbcm-egrid button{border:0;background:none;font-size:22px;padding:4px 0;cursor:pointer;border-radius:8px;position:relative;touch-action:manipulation;user-select:none;-webkit-user-select:none}',
      '.lbcm-egrid button:hover{background:#fdf1f0}',
      '.lbcm-egrid button.fav::after{content:"★";position:absolute;right:1px;top:-1px;font-size:9px;color:#d9a441}',
      '.lbcm-hint{font-size:10.5px;color:#8a7078;margin:6px 2px 0}',
      '.lbcm-search{width:100%;padding:8px 11px;border:1px solid #f0d9d9;border-radius:12px;font:inherit;font-size:13px;outline:none;background:#fdf1f0}',
      '.lbcm-ggrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}',
      '.lbcm-tile{position:relative;border-radius:10px;overflow:hidden;background:#f3ecec;cursor:pointer;aspect-ratio:1;border:0;padding:0}',
      '.lbcm-tile img{width:100%;height:100%;object-fit:cover;display:block}',
      '.lbcm-tile.sticker{background:repeating-conic-gradient(#f3ecec 0 25%,#fff 0 50%) 50%/16px 16px}',
      '.lbcm-tile.sticker img{object-fit:contain}',
      '.lbcm-star{position:absolute;right:3px;top:3px;width:24px;height:24px;border-radius:50%;border:0;background:rgba(255,255,255,.88);font-size:13px;line-height:1;cursor:pointer;padding:0;color:#b8a0a6}',
      '.lbcm-star.on{color:#d9a441}',
      '.lbcm-more{display:block;width:100%;margin-top:8px;padding:8px;border:0;border-radius:10px;background:#f6ecec;font:inherit;font-weight:700;font-size:12px;cursor:pointer;color:#3a2530}',
      '.lbcm-msg{font-size:12.5px;color:#8a7078;text-align:center;padding:18px 8px;line-height:1.5}',
      '.lbcm-attr{font-size:10px;color:#8a7078;text-align:center;padding:5px;border-top:1px solid #f0d9d9;flex:0 0 auto}',
      '.lbcm-fh{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#8a7078;margin:8px 2px 5px}',
      '@media print{.lbcm-rec,.lbcm-pv,.lbcm-lightbox,.lbcm-picker{display:none!important}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  // ------------------------------------------------------------ rendering a media message
  let playing = null;
  const fmt = ms => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  async function freshUrl(msg){
    try {
      const d = await api('media', { id: msg.id });
      if (d && d.success && d.url) { msg.mediaUrl = d.url; return d.url; }
      if (d && d.expired) msg.expired = true;
    } catch (e) {}
    return '';
  }

  function expiredEl(){ return el('div', 'lbcm-note', '🕒 This file has expired (kept for 30 days).'); }
  function unavailableEl(msg){ return msg.expired ? expiredEl() : el('div', 'lbcm-note', 'Could not load this file. Try again later.'); }

  function voiceEl(msg){
    const wrap = el('div', 'lbcm-voice');
    const btn = el('button', 'lbcm-vbtn', '▶'); btn.type = 'button'; btn.setAttribute('aria-label', 'Play voice message');
    const track = el('div', 'lbcm-vtrack'), fill = el('div', 'lbcm-vfill'); track.appendChild(fill);
    const time = el('span', 'lbcm-vtime', fmt(msg.durationMs || 0));
    wrap.append(btn, track, time);
    let audio = null, retried = false;

    function reset(){ btn.textContent = '▶'; fill.style.width = '0'; time.textContent = fmt(msg.durationMs || 0); }
    async function ensure(){
      if (audio) return audio;
      const url = msg.mediaUrl || await freshUrl(msg);
      if (!url) return null;
      audio = new Audio(url); audio.preload = 'auto';
      audio.addEventListener('timeupdate', function(){
        const total = (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : (msg.durationMs || 1000) / 1000;
        fill.style.width = Math.min(100, audio.currentTime / total * 100) + '%';
        time.textContent = fmt(audio.currentTime * 1000);
      });
      audio.addEventListener('ended', function(){ playing = null; reset(); });
      audio.addEventListener('pause', function(){ if (!audio.ended) btn.textContent = '▶'; });
      audio.addEventListener('play', function(){ btn.textContent = '⏸'; });
      audio.addEventListener('error', async function(){
        if (retried) { time.textContent = 'unavailable'; btn.textContent = '▶'; return; }
        retried = true;
        const u = await freshUrl(msg);
        if (u) { audio.src = u; audio.play().catch(function(){}); }
        else { time.textContent = msg.expired ? 'expired' : 'unavailable'; }
      });
      return audio;
    }
    btn.addEventListener('click', async function(){
      const a = await ensure();
      if (!a) { time.textContent = msg.expired ? 'expired' : 'unavailable'; return; }
      if (!a.paused) { a.pause(); return; }
      if (playing && playing !== a) playing.pause();
      playing = a;
      a.play().catch(function(){ time.textContent = 'unavailable'; });
    });
    return wrap;
  }

  function openLightbox(src){
    const lb = el('div', 'lbcm-lightbox'); lb.setAttribute('data-lb-theme-skip', '');
    const im = new Image(); im.src = src; im.alt = ''; lb.appendChild(im);
    const close = function(){ lb.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = function(e){ if (e.key === 'Escape') close(); };
    lb.addEventListener('click', close); document.addEventListener('keydown', onKey);
    document.body.appendChild(lb);
  }

  function imgEl(msg, cls){
    const im = el('img', cls); im.alt = msg.kind === 'image' ? 'Photo' : msg.kind; im.loading = 'lazy';
    let retried = false;
    im.addEventListener('error', async function(){
      if (retried || msg.kind === 'gif' || msg.kind === 'sticker') { im.replaceWith(el('div', 'lbcm-note', msg.expired ? '🕒 Expired' : 'Could not load this ' + (msg.kind === 'image' ? 'photo' : msg.kind) + '.')); return; }
      retried = true;
      const u = await freshUrl(msg);
      if (u) im.src = u; else im.replaceWith(unavailableEl(msg));
    });
    if (msg.kind === 'image') im.addEventListener('click', function(){ openLightbox(im.src); });
    if (msg.mediaUrl) im.src = msg.mediaUrl;
    else if (msg.kind === 'image') freshUrl(msg).then(function(u){ if (u) im.src = u; else im.replaceWith(unavailableEl(msg)); });
    return im;
  }

  function mediaEl(msg){
    addStyle();
    if (msg.expired) return expiredEl();
    if (msg.kind === 'voice') return voiceEl(msg);
    if (msg.kind === 'image') return imgEl(msg, 'lbcm-img');
    if (msg.kind === 'sticker') return imgEl(msg, 'lbcm-sticker');
    if (msg.kind === 'gif') return imgEl(msg, 'lbcm-gif');
    return el('div', 'lbcm-note', msg.text || '');
  }

  // ------------------------------------------------------------ voice recording
  function toB64(blob){
    return new Promise(function(resolve, reject){
      const r = new FileReader();
      r.onload = function(){ resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = function(){ reject(new Error('read')); };
      r.readAsDataURL(blob);
    });
  }
  function recordingSupported(){ return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder); }

  // opts: {host (position:relative element to cover), onSend({data,mime,durationMs}) -> Promise}
  async function recordUI(opts){
    addStyle();
    const host = opts.host;
    if (!recordingSupported()) { alert('Voice messages are not supported on this browser.'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { alert('Please allow microphone access to record a voice message.'); return; }

    const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const mime = mimes.find(function(m){ return window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m); }) || '';
    let rec;
    try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
    catch (e) { stream.getTracks().forEach(function(t){ t.stop(); }); alert('Could not start recording.'); return; }

    const chunks = []; let started = performance.now(), done = false, tick = null;
    rec.addEventListener('dataavailable', function(e){ if (e.data && e.data.size) chunks.push(e.data); });

    const bar = el('div', 'lbcm-rec'); bar.setAttribute('data-lb-theme-skip', '');
    const dot = el('span', 'lbcm-dot'), tm = el('span', 'lbcm-rtime', '0:00'), txt = el('span', 'lbcm-rtxt', 'Recording… tap ➤ to send');
    const cancel = el('button', 'lbcm-rbtn lbcm-rcancel', '🗑'); cancel.type = 'button'; cancel.setAttribute('aria-label', 'Cancel');
    const send = el('button', 'lbcm-rbtn lbcm-rsend', '➤'); send.type = 'button'; send.setAttribute('aria-label', 'Send voice message');
    bar.append(dot, tm, txt, cancel, send);
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(bar);

    function cleanup(){
      done = true; clearInterval(tick);
      try { if (rec.state !== 'inactive') rec.stop(); } catch (e) {}
      stream.getTracks().forEach(function(t){ t.stop(); });
      bar.remove();
    }
    function stopAndGet(){
      return new Promise(function(resolve){
        const finish = function(){ resolve(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' })); };
        if (rec.state === 'inactive') return finish();
        rec.addEventListener('stop', finish, { once: true });
        try { rec.stop(); } catch (e) { finish(); }
      });
    }
    async function doSend(){
      if (done) return;
      const durationMs = Math.round(performance.now() - started);
      send.disabled = true; cancel.disabled = true; clearInterval(tick);
      txt.textContent = 'Sending…';
      const blob = await stopAndGet();
      stream.getTracks().forEach(function(t){ t.stop(); });
      if (durationMs < 600 || !blob.size) { txt.textContent = 'Too short — hold on a bit longer.'; setTimeout(cleanup, 1100); return; }
      try {
        const data = await toB64(blob);
        await opts.onSend({ data: data, mime: blob.type, durationMs: Math.min(durationMs, MAX_VOICE_MS) });
        cleanup();
      } catch (err) {
        txt.textContent = (err && err.message) || 'Could not send. Try again.';
        cancel.disabled = false; send.disabled = true;           // chunks are final now; user can re-record
        dot.style.animation = 'none'; dot.style.opacity = '.3';
      }
    }
    cancel.addEventListener('click', cleanup);
    send.addEventListener('click', doSend);
    rec.start();
    tick = setInterval(function(){
      const ms = performance.now() - started;
      tm.textContent = fmt(ms);
      if (ms >= MAX_VOICE_MS) doSend();                         // 60s limit: send what we have
    }, 250);
    return { cancel: cleanup };
  }

  // ------------------------------------------------------------ photos
  function loadImage(file){
    return new Promise(function(resolve, reject){
      const url = URL.createObjectURL(file); const im = new Image();
      im.onload = function(){ URL.revokeObjectURL(url); resolve(im); };
      im.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('That file is not a picture.')); };
      im.src = url;
    });
  }
  async function compressImage(file){
    const im = await loadImage(file);
    const max = 1280, sc = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * sc)); c.height = Math.max(1, Math.round(im.naturalHeight * sc));
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(im, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.7, 0.58, 0.46]) {
      const blob = await new Promise(function(r){ c.toBlob(r, 'image/jpeg', q); });
      if (blob && blob.size <= 700000) return blob;
    }
    throw new Error('That picture is too large. Try a smaller one.');
  }

  // opts: {onSend({data,mime}) -> Promise}
  function photoUI(opts){
    addStyle();
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.hidden = true;
    document.body.appendChild(inp);
    inp.addEventListener('change', async function(){
      const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
      let blob;
      try { blob = await compressImage(f); } catch (e) { alert(e.message || 'Could not use that picture.'); return; }
      const prevUrl = URL.createObjectURL(blob);
      const ov = el('div', 'lbcm-pv'); ov.setAttribute('data-lb-theme-skip', '');
      const box = el('div', 'lbcm-pvbox'); const im = new Image(); im.src = prevUrl; im.alt = '';
      const err = el('div', 'lbcm-pverr');
      const row = el('div', 'lbcm-pvbtns'); const no = el('button', '', 'Cancel'), yes = el('button', 'pri', 'Send photo'); no.type = yes.type = 'button';
      row.append(no, yes); box.append(im, err, row); ov.appendChild(box); document.body.appendChild(ov);
      const close = function(){ URL.revokeObjectURL(prevUrl); ov.remove(); };
      no.addEventListener('click', close);
      yes.addEventListener('click', async function(){
        yes.disabled = no.disabled = true; yes.textContent = 'Sending…'; err.textContent = '';
        try { await opts.onSend({ data: await toB64(blob), mime: 'image/jpeg' }); close(); }
        catch (e) { err.textContent = (e && e.message) || 'Could not send. Try again.'; yes.disabled = no.disabled = false; yes.textContent = 'Send photo'; }
      });
    });
    inp.click();
  }

  // ------------------------------------------------------------ favorites + picker
  const fav = { emoji: [], gif: [], sticker: [], loaded: false, loading: null };
  function loadFavs(){
    if (fav.loaded) return Promise.resolve();
    if (fav.loading) return fav.loading;
    fav.loading = api('favList').then(function(d){
      if (d && d.success) { fav.emoji = d.emoji || []; fav.gif = d.gif || []; fav.sticker = d.sticker || []; fav.loaded = true; }
    }).catch(function(){}).then(function(){ fav.loading = null; });
    return fav.loading;
  }
  const hasFav = (kind, value) => kind === 'emoji' ? fav.emoji.indexOf(value) !== -1 : fav[kind].some(function(x){ return x.url === value; });
  async function toggleFav(kind, item){
    const value = kind === 'emoji' ? item : item.url;
    if (hasFav(kind, value)) {
      const d = await api('favRemove', { kind: kind, value: value });
      if (d && d.success) fav[kind] = fav[kind].filter(function(x){ return (kind === 'emoji' ? x : x.url) !== value; });
      return d;
    }
    const d = await api('favAdd', kind === 'emoji' ? { kind: kind, value: value } : { kind: kind, value: item.url, preview: item.preview, sig: item.sig });
    if (d && d.success) { if (kind === 'emoji') fav.emoji.unshift(value); else fav[kind].unshift({ url: item.url, preview: item.preview, sig: item.sig }); }
    return d;
  }

  const EMOJI_SETS = {
    '😊': '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😗 😋 😜 🤪 😎 🤩 🥳 😏 😌 😴 🤔 🤗 🤭 😮 😯 😲 😳 🥺 😢 😭 😤 😡 🤯 😱 😬 🙄 😷 🤒 🤧 🥱',
    '👍': '👍 👎 👌 ✌️ 🤞 🤟 🤙 👏 🙌 👐 🙏 💪 👋 🤝 ✋ 👊 ✊ 🫶 👀 💃 🕺 🏃 🙋 🙆 🙅 🤷 🤦',
    '🌸': '🌹 🥀 🌷 🌸 🌺 🌻 🌼 💐 🌿 🍀 🌱 🍃 🎀 🎁 🍫 🍬 🍭 🧁 🎂 🍰 🍩 🍪 ☕ 🧋 🍓 🍒 🍉',
    '❤️': '❤️ 🧡 💛 💚 💙 💜 🤍 🖤 💕 💞 💓 💗 💖 💘 💝 ✨ ⭐ 🌟 🔥 💯 ✅ ❌ ⚠️ ❗ ❓ 📦 🚚 🛵 📍 ⏰ 📅 📝 📸 💰 🎉 🎊',
    // Newest emoji (Emoji 17.0 first, then back to 14.0). A phone or PC that is too old may show an empty box for the very newest ones.
    '🆕': '🫪 🫯 🫍 🫈 🪊 🛘 🪎 🫩 🫆 🪾 🫜 🪉 🪏 🫟 🙂‍↔️ 🙂‍↕️ 🐦‍🔥 🍋‍🟩 🍄‍🟫 ⛓️‍💥 🫨 🩷 🩵 🩶 🫷 🫸 🫎 🫏 🪽 🐦‍⬛ 🪿 🪼 🪻 🫚 🫛 🪭 🪮 🪇 🪈 🪯 🛜 🫠 🫢 🫣 🫡 🫥 🥹 🫰 🫱 🫲 🫳 🫴 🫵 🫶 🪷 🫧 🪩 🧌 🪸 🪹 🪺 🫘 🫙 🛝 🛞 🛟 🪬 🪫 🩼 🩻'
  };
  const EMOJI_FONT = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji'";

  // Hide emoji this device cannot draw (they would show as an empty box). Draws each one on a hidden canvas and
  // compares it with how a missing character looks; sequences that split into several pictures count as missing too.
  const canShow = (function(){
    let ctx = null, refs = null, cache = {};
    const SZ = 32;
    function px(t){ ctx.clearRect(0, 0, SZ * 3, SZ * 2); ctx.fillText(t, 2, 4); return ctx.getImageData(0, 0, SZ * 3, SZ * 2).data.join(','); }
    return function(e){
      if (cache[e] !== undefined) return cache[e];
      try {
        if (!ctx) {
          const c = document.createElement('canvas'); c.width = SZ * 3; c.height = SZ * 2;
          ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.font = SZ + 'px ' + EMOJI_FONT + ',sans-serif'; ctx.textBaseline = 'top';
          refs = ['\u{10FFFF}', '\u{F0000}', '\u{E0FFF}'].map(px);
        }
        const w = ctx.measureText(e).width;
        let ok = true;
        if (/\u200D/.test(e) && w > SZ * 1.7) ok = false;           // joined emoji that fell apart into pieces
        else if (refs.indexOf(px(e)) !== -1) ok = false;               // looks exactly like a missing character
        return (cache[e] = ok);
      } catch (err) { return (cache[e] = true); }                      // cannot test: show it
    };
  })();

  // opts: {host (position:relative), toggleBtn (or toggleBtns[]), tabs (optional, e.g. ['emoji','sticker','fav']), onEmoji(e), onGif(item, 'gif'|'sticker')}
  // picker.open('emoji'|'gif'|'sticker'|'fav') / picker.toggle(tab) can jump straight to a tab.
  function createPicker(opts){
    addStyle();
    if (!document.getElementById('lbcm-emoji-font')) {      // fallback font so the newest emoji show on older devices
      const lk = document.createElement('link'); lk.id = 'lbcm-emoji-font'; lk.rel = 'stylesheet';
      lk.href = 'https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap'; document.head.appendChild(lk);
    }
    const root = el('div', 'lbcm-picker'); root.setAttribute('data-lb-theme-skip', '');
    const tabs = el('div', 'lbcm-tabs'), head = el('div', 'lbcm-head'), body = el('div', 'lbcm-body'), attr = el('div', 'lbcm-attr');
    root.append(tabs, head, body, attr);
    const searchEls = {}; let headKind = null;
    opts.host.appendChild(root);

    let tab = 'emoji', emojiTab = Object.keys(EMOJI_SETS)[0];
    const gifState = { gif: null, sticker: null };       // {q, page, items, hasMore, provider, error, notConfigured, loading}
    let searchTimer = null;

    const ALL_TABS = [['emoji', '😊'], ['gif', 'GIF'], ['sticker', 'Stickers'], ['fav', '⭐']];
    const TABS = opts.tabs ? ALL_TABS.filter(function(t){ return opts.tabs.indexOf(t[0]) !== -1; }) : ALL_TABS;   // opts.tabs = e.g. ['emoji','sticker','fav']
    if (opts.tabs && TABS.length && !TABS.some(function(t){ return t[0] === tab; })) tab = TABS[0][0];
    function drawTabs(){
      tabs.innerHTML = '';
      TABS.forEach(function(t){
        const b = el('button', tab === t[0] ? 'on' : '', t[1]); b.type = 'button';
        b.addEventListener('click', function(){ tab = t[0]; draw(); });
        tabs.appendChild(b);
      });
    }

    function emojiGrid(list, container){
      const grid = el('div', 'lbcm-egrid');
      list.filter(canShow).forEach(function(e){
        const b = el('button', hasFav('emoji', e) ? 'fav' : '', e); b.type = 'button';
        let timer = null, longDone = false;
        const startPress = function(){ longDone = false; timer = setTimeout(async function(){
          longDone = true; const d = await toggleFav('emoji', e);
          if (d && d.success === false) { alert(d.error || 'Could not save.'); return; }
          b.classList.toggle('fav', hasFav('emoji', e)); if (tab === 'fav') draw();
        }, 450); };
        const endPress = function(){ clearTimeout(timer); };
        b.addEventListener('pointerdown', startPress); b.addEventListener('pointerup', endPress);
        b.addEventListener('pointerleave', endPress); b.addEventListener('pointercancel', endPress);
        b.addEventListener('contextmenu', function(ev){ ev.preventDefault(); });
        b.addEventListener('click', function(){ if (longDone) { longDone = false; return; } opts.onEmoji(e); });
        grid.appendChild(b);
      });
      container.appendChild(grid);
    }

    function gifTile(item, kind){
      const t = el('div', 'lbcm-tile' + (kind === 'sticker' ? ' sticker' : '')); t.setAttribute('role', 'button');
      const im = new Image(); im.src = item.preview; im.alt = ''; im.loading = 'lazy'; t.appendChild(im);
      t.addEventListener('click', function(ev){ if (ev.target.closest('.lbcm-star')) return; opts.onGif(item, kind); });
      const star = el('button', 'lbcm-star' + (hasFav(kind, item.url) ? ' on' : ''), '★'); star.type = 'button'; star.setAttribute('aria-label', 'Favorite');
      star.addEventListener('click', async function(ev){
        ev.stopPropagation();
        const d = await toggleFav(kind, item);
        if (d && d.success === false) { alert(d.error || 'Could not save.'); return; }
        star.classList.toggle('on', hasFav(kind, item.url)); if (tab === 'fav') draw();
      });
      t.appendChild(star);
      return t;
    }

    async function runSearch(kind, q, page){
      const st = gifState[kind] || (gifState[kind] = { q: '', page: 1, items: [], hasMore: false });
      if (page === 1) { st.items = []; }
      st.q = q; st.page = page; st.loading = true; st.error = ''; draw();
      try {
        const d = await api('gifSearch', { type: kind, q: q, page: page });
        if (d && d.success) { st.items = st.items.concat(d.items || []); st.hasMore = !!d.hasMore; st.provider = d.provider; st.notConfigured = false; }
        else { st.error = (d && d.error) || 'GIF search is unavailable right now.'; st.notConfigured = !!(d && d.notConfigured); }
      } catch (e) { st.error = 'Could not connect.'; }
      st.loading = false; if (tab === kind) draw();
    }

    function searchEl(kind){
      if (searchEls[kind]) return searchEls[kind];
      const search = el('input', 'lbcm-search'); search.type = 'search';
      search.addEventListener('input', function(){
        clearTimeout(searchTimer); const v = search.value.trim();
        searchTimer = setTimeout(function(){ runSearch(kind, v, 1); }, 450);
      });
      return (searchEls[kind] = search);
    }
    function drawGif(kind){
      const st = gifState[kind];
      if (!st) { runSearch(kind, '', 1); return; }       // runSearch redraws right away
      const provider = st.provider === 'giphy' ? 'GIPHY' : 'KLIPY';
      searchEl(kind).placeholder = st.provider ? 'Search ' + provider : (kind === 'sticker' ? 'Search stickers' : 'Search GIFs');
      if (st.error) {
        body.appendChild(el('div', 'lbcm-msg', st.notConfigured ? 'GIF & sticker search is not set up yet. Ask your admin to add the GIF key.' : st.error));
        return;
      }
      if (!st.items.length && !st.loading) body.appendChild(el('div', 'lbcm-msg', 'No results. Try another word.'));
      const grid = el('div', 'lbcm-ggrid'); st.items.forEach(function(it){ grid.appendChild(gifTile(it, kind)); }); body.appendChild(grid);
      if (st.loading) body.appendChild(el('div', 'lbcm-msg', 'Loading…'));
      else if (st.hasMore) { const m = el('button', 'lbcm-more', 'Load more'); m.type = 'button'; m.addEventListener('click', function(){ runSearch(kind, st.q, st.page + 1); }); body.appendChild(m); }
      attr.textContent = st.provider ? 'Powered by ' + provider : '';
    }

    function drawFav(){
      if (!fav.loaded) { body.innerHTML = '<div class="lbcm-msg">Loading…</div>'; loadFavs().then(function(){ if (tab === 'fav') draw(); }); return; }
      if (!fav.emoji.length && !fav.gif.length && !fav.sticker.length) {
        body.appendChild(el('div', 'lbcm-msg', 'No favorites yet.\nPress and hold an emoji, or tap the ★ on a GIF or sticker, to save it here.')); body.firstChild.style.whiteSpace = 'pre-line'; return;
      }
      if (fav.emoji.length) { body.appendChild(el('div', 'lbcm-fh', 'Emoji')); emojiGrid(fav.emoji, body); }
      ['gif', 'sticker'].forEach(function(k){
        if (!fav[k].length) return;
        body.appendChild(el('div', 'lbcm-fh', k === 'gif' ? 'GIFs' : 'Stickers'));
        const g = el('div', 'lbcm-ggrid'); fav[k].forEach(function(it){ g.appendChild(gifTile(it, k)); }); body.appendChild(g);
      });
    }

    function draw(){
      drawTabs(); body.innerHTML = ''; attr.textContent = ''; attr.style.display = (tab === 'gif' || tab === 'sticker') ? '' : 'none';
      if (tab === 'gif' || tab === 'sticker') {
        if (headKind !== tab) { head.innerHTML = ''; head.appendChild(searchEl(tab)); headKind = tab; }
        head.style.display = '';
      } else { head.style.display = 'none'; head.innerHTML = ''; headKind = null; }
      if (tab === 'emoji') {
        const sub = el('div', 'lbcm-sub');
        Object.keys(EMOJI_SETS).forEach(function(k){ const b = el('button', k === emojiTab ? 'on' : '', k); b.type = 'button'; b.addEventListener('click', function(){ emojiTab = k; draw(); }); sub.appendChild(b); });
        body.appendChild(sub); emojiGrid(EMOJI_SETS[emojiTab].split(' '), body);
        body.appendChild(el('div', 'lbcm-hint', 'Tip: press and hold an emoji to save it to ⭐'));
      }
      else if (tab === 'gif' || tab === 'sticker') drawGif(tab);
      else drawFav();
    }

    const api2 = {
      el: root,
      isOpen: function(){ return root.classList.contains('show'); },
      open: function(t){ if (t && TABS.some(function(x){ return x[0] === t; })) tab = t; root.classList.add('show'); loadFavs().then(function(){ if (api2.isOpen() && (tab === 'emoji' || tab === 'fav')) draw(); }); draw(); },
      close: function(){ root.classList.remove('show'); },
      toggle: function(t){ if (typeof t !== 'string') t = undefined; if (api2.isOpen() && (!t || t === tab)) api2.close(); else api2.open(t); }
    };
    document.addEventListener('click', function(e){
      if (!api2.isOpen()) return;
      // The picker redraws itself on tab clicks, which detaches the very button that was
      // clicked — so judge by the event's original path, not by "is the target still inside".
      const path = e.composedPath ? e.composedPath() : [];
      if (path.indexOf(root) !== -1 || !e.target.isConnected) return;
      const tbs = [].concat(opts.toggleBtn || [], opts.toggleBtns || []);   // more than one button can open the picker
      if (tbs.some(function(b){ return b === e.target || b.contains(e.target); })) return;
      api2.close();
    });
    return api2;
  }

  window.lbChatMedia = { mediaEl: mediaEl, recordUI: recordUI, photoUI: photoUI, createPicker: createPicker, recordingSupported: recordingSupported, MAX_VOICE_MS: MAX_VOICE_MS };
})();
