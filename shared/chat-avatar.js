/* ==========================================================
   LALABELLA CHAT AVATAR — a small cartoon-face maker.
   An avatar is just 8 small integers (skin, hair, hairColor, eyes,
   mouth, acc, shirt, bg) — stored per person by the chat backend,
   which validates every number, so nothing but known shapes can ever
   be drawn. Used by shared/chat-bubble.js and chatbox.html.

   lbChatAvatar.uri(cfg)          -> data: URI of the avatar (for <img src>)
   lbChatAvatar.open({cfg,hasPhoto,onSave,onPhoto})  -> opens the builder; onSave(cfg|null)
                                    returns a Promise (null = "use my profile photo");
                                    onPhoto(dataUri) (optional) saves a picture picked from the device
   ========================================================== */
(function(){
  if (window.lbChatAvatar) return;

  const SKIN  = ['#fde0c8','#f5c9a0','#e0a878','#c68642','#8d5524','#5c3a21'];
  const HAIRC = ['#2b1d14','#5a3825','#9a6a3a','#d9a441','#c9506b','#8a8a8a','#2f6fb5','#1f8a8a'];
  const SHIRT = ['#c9506b','#1f8a8a','#d9a441','#3d5a99','#6a4c93','#3d9a5f','#e07a5f','#333333'];
  const BG    = ['#fbe4e8','#e3f2f1','#fff1d0','#e0e8f7','#ece3f5','#e1f3e6','#fde4da','#e9e9e9'];
  const RANGES = { skin:6, hair:8, hairColor:8, eyes:4, mouth:4, acc:4, shirt:8, bg:8 };
  const DEFAULT = { skin:1, hair:0, hairColor:1, eyes:0, mouth:0, acc:0, shirt:0, bg:0 };
  const INK = '#2a2023';

  function clean(cfg){
    const o = {};
    Object.keys(RANGES).forEach(function(k){
      let v = Number(cfg && cfg[k]);
      if (!Number.isInteger(v) || v < 0 || v >= RANGES[k]) v = DEFAULT[k];
      o[k] = v;
    });
    return o;
  }

  function hexToRgb(hex){ const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(r, g, b){ return '#' + [r, g, b].map(function(x){ return Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0'); }).join(''); }
  function darker(hex, f){ const c = hexToRgb(hex); return toHex(c[0] * f, c[1] * f, c[2] * f); }
  function lighten(hex, f){ const c = hexToRgb(hex); return toHex(c[0] + (255 - c[0]) * f, c[1] + (255 - c[1]) * f, c[2] + (255 - c[2]) * f); }
  const ST = function(o, a){ return '<stop offset="' + o + '" stop-color="' + a[0] + '"' + (a[1] != null ? ' stop-opacity="' + a[1] + '"' : '') + '/>'; };

  // hair (back layer = behind head/shoulders, front layer = fringe/top). All filled with the shaded hair gradient.
  function hairBack(style){
    if (style === 1) return '<path d="M23 48 C20 14 80 14 77 48 L81 86 Q68 92 63 80 L37 80 Q32 92 19 86 Z" fill="url(#hr)"/>';
    if (style === 5) return '<path d="M23 50 C20 14 80 14 77 50 L77 68 Q65 73 62 58 L38 58 Q35 73 23 68 Z" fill="url(#hr)"/>';
    return '';
  }
  function shine(d){ return '<path d="' + d + '" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="2.6" stroke-linecap="round"/>'; }
  function hairFront(style){
    const top = '<path d="M27 47 C23 15 77 15 73 47 C69 35 60 30 50 30 C40 30 31 35 27 47 Z" fill="url(#hr)"/>';
    switch (style) {
      case 0: return '<path d="M27 47 C23 14 77 14 73 47 C71 38 64 28 46 27 C37 29 30 36 27 47 Z" fill="url(#hr)"/>' + shine('M33 30 Q42 21 56 22');
      case 1: case 5: return top + shine('M33 28 Q46 19 62 26');
      case 2: return top + '<circle cx="50" cy="14" r="9" fill="url(#hr)"/>' + '<circle cx="47" cy="11" r="2.6" fill="#fff" fill-opacity=".3"/>' + shine('M33 28 Q46 19 62 26');
      case 3: return [[29,37,9],[38,27,10],[50,22,10],[62,27,10],[71,37,9],[26,49,6],[74,49,6]].map(function(a){
                return '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="' + a[2] + '" fill="url(#hr)"/>'; }).join('') +
                '<circle cx="45" cy="21" r="3.2" fill="#fff" fill-opacity=".25"/><circle cx="35" cy="26" r="2.4" fill="#fff" fill-opacity=".2"/>';
      case 4: return '<path d="M28 44 C26 20 74 20 72 44 C71 36 62 33 50 33 C38 33 29 36 28 44 Z" fill="url(#hr)"/>' + shine('M35 28 Q50 22 64 28');
      case 6: return top + '<path d="M72 40 Q93 42 88 68 Q84 78 80 67 Q85 52 71 48 Z" fill="url(#hr)"/>' + shine('M33 28 Q46 19 62 26');
      default: return '';
    }
  }
  function eye(cx, rx, ry, ir, look){
    const lx = look || 0;
    return '<ellipse cx="' + cx + '" cy="49.5" rx="' + rx + '" ry="' + ry + '" fill="#fff"/>' +
      '<ellipse cx="' + cx + '" cy="49.5" rx="' + rx + '" ry="' + ry + '" fill="url(#eyeshade)"/>' +
      '<circle cx="' + (cx + lx) + '" cy="50" r="' + ir + '" fill="url(#iris)"/>' +
      '<circle cx="' + (cx + lx) + '" cy="50" r="' + (ir * 0.48).toFixed(2) + '" fill="#120a06"/>' +
      '<circle cx="' + (cx + lx - ir * 0.38).toFixed(2) + '" cy="48.2" r="' + (ir * 0.34).toFixed(2) + '" fill="#fff"/>' +
      '<circle cx="' + (cx + lx + ir * 0.42).toFixed(2) + '" cy="51.6" r="' + (ir * 0.16).toFixed(2) + '" fill="#fff" fill-opacity=".8"/>' +
      '<path d="M' + (cx - rx) + ' 49 Q' + cx + ' ' + (49.5 - ry * 1.5) + ' ' + (cx + rx) + ' 49" fill="none" stroke="' + INK + '" stroke-width="1.5" stroke-linecap="round"/>';
  }
  function eyes(style, hc){
    const brow = darker(hc, 0.75);
    const brows = '<path d="M35 42.5 Q41 39 46.5 41.5 M53.5 41.5 Q59 39 65 42.5" fill="none" stroke="' + brow + '" stroke-width="2.2" stroke-linecap="round"/>';
    switch (style) {
      case 1: return brows + '<path d="M36 50.5 Q41 43.5 46 50.5 M54 50.5 Q59 43.5 64 50.5" fill="none" stroke="' + INK + '" stroke-width="2.6" stroke-linecap="round"/>' +
                '<path d="M35.5 49 l-2 -1.2 M64.5 49 l2 -1.2" stroke="' + INK + '" stroke-width="1.4" stroke-linecap="round"/>';
      case 2: return brows + eye(41, 5.4, 5.4, 3.6) + eye(59, 5.4, 5.4, 3.6);
      case 3: return brows + eye(41, 4.8, 3.2, 2.7) + eye(59, 4.8, 3.2, 2.7) +
                '<path d="M36 49.4 L46 49.4 M54 49.4 L64 49.4" stroke="' + INK + '" stroke-width="1.8" stroke-linecap="round"/>' +
                '<path d="M36.2 49.4 Q41 44.6 45.8 49.4 Z M54.2 49.4 Q59 44.6 63.8 49.4 Z" fill="url(#sk)" opacity=".92"/>';
      default: return brows + eye(41, 4.6, 4.4, 3) + eye(59, 4.6, 4.4, 3);
    }
  }
  function mouth(style){
    const lip = '#c4566b';
    switch (style) {
      case 1: return '<path d="M39.5 57 Q50 72 60.5 57 Q50 59.5 39.5 57 Z" fill="#6e1e2e"/>' +
                '<path d="M41 57.6 Q50 60.4 59 57.6 Q50 63 41 57.6 Z" fill="#fff"/>' +
                '<path d="M44.5 65.5 Q50 62 55.5 65.5 Q50 69.5 44.5 65.5 Z" fill="#e8798f"/>' +
                '<path d="M39.5 57 Q50 59.6 60.5 57" fill="none" stroke="' + lip + '" stroke-width="1.6" stroke-linecap="round"/>';
      case 2: return '<path d="M44.5 60 Q50 63.4 55.5 60" fill="none" stroke="' + lip + '" stroke-width="2.4" stroke-linecap="round"/>' +
                '<path d="M47 62.6 Q50 64 53 62.6" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1" stroke-linecap="round"/>';
      case 3: return '<ellipse cx="50" cy="61" rx="3.6" ry="4.2" fill="' + lip + '"/><ellipse cx="50" cy="61.2" rx="2.3" ry="2.9" fill="#4d1220"/>' +
                '<ellipse cx="49" cy="59.4" rx="1.2" ry=".7" fill="#fff" fill-opacity=".5"/>';
      default: return '<path d="M41 58 Q50 68.5 59 58" fill="none" stroke="' + lip + '" stroke-width="2.8" stroke-linecap="round"/>' +
                '<path d="M45 64.6 Q50 67 55 64.6" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.1" stroke-linecap="round"/>';
    }
  }
  function acc(style){
    switch (style) {
      case 1: return '<g fill="url(#glass)" stroke="#3b2f33" stroke-width="1.8"><circle cx="41" cy="49.5" r="8.2"/><circle cx="59" cy="49.5" r="8.2"/></g><path d="M49.2 49 Q50 47.6 50.8 49" fill="none" stroke="#3b2f33" stroke-width="1.8"/>' +
                '<path d="M32.8 48.5 L28.5 47.5 M67.2 48.5 L71.5 47.5" stroke="#3b2f33" stroke-width="1.6" stroke-linecap="round"/>';
      case 2: return '<g><rect x="31" y="43" width="17" height="11.5" rx="5.5" fill="url(#shade)"/><rect x="52" y="43" width="17" height="11.5" rx="5.5" fill="url(#shade)"/><rect x="47" y="46" width="6" height="2.6" fill="#1b1517"/>' +
                '<path d="M34 45.6 Q38 44 42 45" stroke="#fff" stroke-opacity=".5" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M55 45.6 Q59 44 63 45" stroke="#fff" stroke-opacity=".5" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>';
      case 3: return '<g transform="translate(66 27)"><g fill="url(#petal)"><circle cx="0" cy="-5" r="4.2"/><circle cx="5" cy="0" r="4.2"/><circle cx="0" cy="5" r="4.2"/><circle cx="-5" cy="0" r="4.2"/></g><circle cx="0" cy="0" r="3.1" fill="url(#pistil)"/><circle cx="-1" cy="-1" r="1" fill="#fff" fill-opacity=".6"/></g>';
      default: return '';
    }
  }

  function svg(cfg){
    const c = clean(cfg), skin = SKIN[c.skin], hc = HAIRC[c.hairColor], sh = SHIRT[c.shirt], bg = BG[c.bg];
    const defs = '<defs>' +
      '<radialGradient id="bg" cx="50%" cy="36%" r="80%">' + ST(0, [lighten(bg, 0.6)]) + ST(1, [darker(bg, 0.88)]) + '</radialGradient>' +
      '<radialGradient id="sk" cx="38%" cy="28%" r="85%">' + ST(0, [lighten(skin, 0.3)]) + ST(0.5, [skin]) + ST(1, [darker(skin, 0.74)]) + '</radialGradient>' +
      '<linearGradient id="hr" x1="0.1" y1="0" x2="0.9" y2="1">' + ST(0, [lighten(hc, 0.4)]) + ST(0.45, [hc]) + ST(1, [darker(hc, 0.55)]) + '</linearGradient>' +
      '<linearGradient id="sh" x1="0" y1="0" x2="0.3" y2="1">' + ST(0, [lighten(sh, 0.3)]) + ST(1, [darker(sh, 0.66)]) + '</linearGradient>' +
      '<linearGradient id="neck" x1="0" y1="0" x2="0" y2="1">' + ST(0, [darker(skin, 0.55)]) + ST(1, [darker(skin, 0.88)]) + '</linearGradient>' +
      '<radialGradient id="iris" cx="38%" cy="32%" r="75%">' + ST(0, ['#9a6a45']) + ST(1, ['#2e1a10']) + '</radialGradient>' +
      '<linearGradient id="eyeshade" x1="0" y1="0" x2="0" y2="1">' + ST(0, ['#000', 0.16]) + ST(0.5, ['#000', 0]) + '</linearGradient>' +
      '<radialGradient id="cheek">' + ST(0, ['#ff5d86', 0.5]) + ST(1, ['#ff5d86', 0]) + '</radialGradient>' +
      '<radialGradient id="glass" cx="28%" cy="22%" r="80%">' + ST(0, ['#fff', 0.7]) + ST(1, ['#cfe8ff', 0.08]) + '</radialGradient>' +
      '<linearGradient id="shade" x1="0" y1="0" x2="1" y2="1">' + ST(0, ['#4a3d42']) + ST(1, ['#0f0b0d']) + '</linearGradient>' +
      '<radialGradient id="petal" cx="35%" cy="30%">' + ST(0, ['#ffc2d4']) + ST(1, ['#ff6f96']) + '</radialGradient>' +
      '<radialGradient id="pistil" cx="35%" cy="30%">' + ST(0, ['#ffe9a3']) + ST(1, ['#f0a92b']) + '</radialGradient>' +
      '<filter id="bl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>' +
      '<clipPath id="hd"><ellipse cx="50" cy="46" rx="22" ry="25"/></clipPath>' +
      '</defs>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + defs +
      '<rect width="100" height="100" fill="url(#bg)"/>' +
      '<ellipse cx="50" cy="96" rx="34" ry="6" fill="#000" opacity=".12" filter="url(#bl)"/>' +
      hairBack(c.hair) +
      // shoulders + shading + neckline
      '<path d="M14 100 Q14 75 50 73 Q86 75 86 100 Z" fill="url(#sh)"/>' +
      '<path d="M14 100 Q14 75 50 73 Q40 80 36 100 Z" fill="#fff" opacity=".07"/>' +
      '<path d="M40 74 Q50 90 60 74 Z" fill="' + darker(skin, 0.9) + '"/>' +
      '<path d="M40 74 Q50 90 60 74 Q50 82 40 74 Z" fill="' + darker(sh, 0.55) + '" opacity=".55"/>' +
      // neck (shadowed by the chin)
      '<rect x="43" y="60" width="14" height="17" rx="5" fill="url(#neck)"/>' +
      // ears
      '<ellipse cx="28.2" cy="49.5" rx="4.4" ry="5.2" fill="' + darker(skin, 0.9) + '"/><ellipse cx="28.8" cy="49.8" rx="2" ry="2.8" fill="' + darker(skin, 0.7) + '" opacity=".6"/>' +
      '<ellipse cx="71.8" cy="49.5" rx="4.4" ry="5.2" fill="' + darker(skin, 0.9) + '"/><ellipse cx="71.2" cy="49.8" rx="2" ry="2.8" fill="' + darker(skin, 0.7) + '" opacity=".6"/>' +
      // head with volume
      '<ellipse cx="50" cy="46" rx="22" ry="25" fill="url(#sk)"/>' +
      '<g clip-path="url(#hd)"><ellipse cx="50" cy="72" rx="22" ry="9" fill="' + darker(skin, 0.55) + '" opacity=".22" filter="url(#bl)"/>' +
      '<ellipse cx="73" cy="48" rx="6" ry="22" fill="' + darker(skin, 0.6) + '" opacity=".16" filter="url(#bl)"/>' +
      '<ellipse cx="36" cy="30" rx="9" ry="6" fill="#fff" opacity=".22" filter="url(#bl)"/></g>' +
      '<ellipse cx="34" cy="58" rx="6" ry="4.4" fill="url(#cheek)"/><ellipse cx="66" cy="58" rx="6" ry="4.4" fill="url(#cheek)"/>' +
      // nose
      '<ellipse cx="51" cy="55.2" rx="3" ry="2.2" fill="' + darker(skin, 0.7) + '" opacity=".35" filter="url(#bl)"/>' +
      '<ellipse cx="49.3" cy="53.6" rx="1.3" ry=".9" fill="#fff" opacity=".5"/>' +
      eyes(c.eyes, hc) + mouth(c.mouth) + hairFront(c.hair) + acc(c.acc) +
      '</svg>';
  }
  function uri(cfg){ return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(cfg)); }

  // ---------------------------------------------------------- builder modal
  const ROWS = [
    ['skin', 'Skin', 'color', SKIN], ['hair', 'Hair style', 'shape'], ['hairColor', 'Hair color', 'color', HAIRC],
    ['eyes', 'Eyes', 'shape'], ['mouth', 'Mouth', 'shape'], ['acc', 'Extras', 'shape'],
    ['shirt', 'Shirt', 'color', SHIRT], ['bg', 'Background', 'color', BG]
  ];
  let styled = false;
  function addStyle(){
    if (styled) return; styled = true;
    const s = document.createElement('style');
    s.textContent = [
      '.lbca-back{position:fixed;inset:0;z-index:100000;background:rgba(40,20,28,.45);display:flex;align-items:center;justify-content:center;padding:12px;font-family:"Space Grotesk",system-ui,sans-serif}',
      '.lbca{width:min(380px,100%);max-height:94vh;overflow-y:auto;background:#fff;border-radius:18px;padding:16px 16px 0;box-shadow:0 20px 60px rgba(0,0,0,.35);color:#3a2530}',
      '.lbca h3{margin:0 0 10px;font-size:16px}',
      '.lbca-stage{perspective:520px;width:132px;height:132px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center}',
      '.lbca-prev{position:relative;display:block;width:120px;height:120px;border-radius:50%;object-fit:cover;border:3px solid #fff;box-shadow:0 16px 28px rgba(60,20,35,.32),0 3px 6px rgba(60,20,35,.2),inset 0 -6px 12px rgba(0,0,0,.12);transform-style:preserve-3d;will-change:transform;animation:lbca-sway 5s ease-in-out infinite}',
      '.lbca-stage.live .lbca-prev{animation:none}',
      '@keyframes lbca-sway{0%,100%{transform:rotateY(-14deg) rotateX(3deg)}50%{transform:rotateY(14deg) rotateX(-3deg)}}',
      '@media (prefers-reduced-motion:reduce){.lbca-prev{animation:none}}',
      '.lbca-photo-note{font-size:11.5px;color:#8a7078;text-align:center;margin:-4px 0 8px}',
      '.lbca-row{margin:10px 0}',
      '.lbca-lbl{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#8a7078;margin-bottom:5px}',
      '.lbca-opts{display:flex;gap:7px;overflow-x:auto;padding:3px 2px}',
      '.lbca-opt{flex:0 0 auto;border:2px solid transparent;background:none;padding:0;border-radius:50%;cursor:pointer}',
      '.lbca-opt.on{border-color:#c9506b}',
      '.lbca-opt img{display:block;width:46px;height:46px;border-radius:50%}',
      '.lbca-opt span{display:block;width:30px;height:30px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12);margin:2px}',
      '.lbca-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;position:sticky;bottom:0;background:#fff;padding:10px 0 16px}',
      '.lbca-btns button{font:inherit;font-weight:700;font-size:13px;border:0;border-radius:10px;padding:10px 14px;cursor:pointer;background:#f6ecec;color:#3a2530}',
      '.lbca-btns .pri{background:#c9506b;color:#fff;flex:1}',
      '.lbca-btns button:disabled{opacity:.55}',
      '.lbca-btns .alt{background:#e8eefb;color:#2f4a8a}',
      '.lbca-msg{font-size:12px;color:#b23a3a;min-height:16px;margin-top:8px}',
      '@media print{.lbca-back{display:none!important}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function open(opts){
    opts = opts || {};
    addStyle();
    let cur = clean(opts.cfg || DEFAULT);
    const back = document.createElement('div'); back.className = 'lbca-back';
    back.setAttribute('data-lb-theme-skip', '');
    const box = document.createElement('div'); box.className = 'lbca'; back.appendChild(box);
    const canUpload = typeof opts.onPhoto === 'function';
    box.innerHTML = '<h3>🎨 My Avatar</h3><div class="lbca-stage"><img class="lbca-prev" alt=""></div><div class="lbca-photo-note" hidden>Your new photo — tap Save to use it.</div><div class="lbca-rows"></div>' +
      '<div class="lbca-msg"></div><div class="lbca-btns">' +
      '<button type="button" data-a="rand">🎲 Random</button>' +
      (canUpload ? '<button type="button" class="alt" data-a="upload">📷 Upload photo</button>' : '') +
      (opts.hasPhoto && opts.cfg ? '<button type="button" class="alt" data-a="photo">Use profile photo</button>' : '') +
      '<button type="button" data-a="cancel">Cancel</button>' +
      '<button type="button" class="pri" data-a="save">Save</button></div>' +
      (canUpload ? '<input type="file" accept="image/*" hidden class="lbca-file">' : '');
    const prev = box.querySelector('.lbca-prev'), stage = box.querySelector('.lbca-stage'), rowsEl = box.querySelector('.lbca-rows'),
          msg = box.querySelector('.lbca-msg'), note = box.querySelector('.lbca-photo-note'), fileIn = box.querySelector('.lbca-file');
    let photoData = null;     // set when the person picked a picture from their device

    // 3D tilt: the preview leans toward the pointer / finger
    function tilt(e){
      const r = stage.getBoundingClientRect(), t = e.touches ? e.touches[0] : e;
      const dx = Math.max(-1, Math.min(1, (t.clientX - (r.left + r.width / 2)) / 160));
      const dy = Math.max(-1, Math.min(1, (t.clientY - (r.top + r.height / 2)) / 160));
      stage.classList.add('live');
      prev.style.transform = 'rotateY(' + (dx * 24).toFixed(1) + 'deg) rotateX(' + (-dy * 18).toFixed(1) + 'deg)';
    }
    back.addEventListener('pointermove', tilt);
    back.addEventListener('touchmove', tilt, { passive: true });

    function draw(){
      prev.src = photoData || uri(cur);
      note.hidden = !photoData;
      rowsEl.hidden = !!photoData;
      rowsEl.innerHTML = '';
      ROWS.forEach(function(r){
        const key = r[0], row = document.createElement('div'); row.className = 'lbca-row';
        row.innerHTML = '<div class="lbca-lbl">' + r[1] + '</div>';
        const opts2 = document.createElement('div'); opts2.className = 'lbca-opts';
        for (let i = 0; i < RANGES[key]; i++) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'lbca-opt' + (cur[key] === i ? ' on' : '');
          if (r[2] === 'color') { const sp = document.createElement('span'); sp.style.background = r[3][i]; b.appendChild(sp); }
          else { const t = Object.assign({}, cur); t[key] = i; const im = document.createElement('img'); im.alt = ''; im.src = uri(t); b.appendChild(im); }
          b.addEventListener('click', function(){ cur[key] = i; draw(); });
          opts2.appendChild(b);
        }
        row.appendChild(opts2); rowsEl.appendChild(row);
      });
    }
    draw();

    function close(){ back.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e){ if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', function(e){ if (e.target === back) close(); });

    box.querySelector('.lbca-btns').addEventListener('click', async function(e){
      const b = e.target.closest('button'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'cancel') return close();
      if (a === 'rand') { photoData = null; Object.keys(RANGES).forEach(function(k){ cur[k] = Math.floor(Math.random() * RANGES[k]); }); return draw(); }
      if (a === 'upload') { msg.textContent = ''; return fileIn.click(); }
      if (a === 'save' || a === 'photo') {
        const btns = box.querySelectorAll('.lbca-btns button'); btns.forEach(function(x){ x.disabled = true; });
        msg.textContent = '';
        try {
          if (a === 'save' && photoData) await opts.onPhoto(photoData);
          else await opts.onSave(a === 'photo' ? null : clean(cur));
          close();
        }
        catch (err) { msg.textContent = (err && err.message) || 'Could not save. Try again.'; btns.forEach(function(x){ x.disabled = false; }); }
      }
    });
    if (fileIn) fileIn.addEventListener('change', function(){
      const f = fileIn.files && fileIn.files[0]; fileIn.value = '';
      if (!f) return;
      if (!/^image\//.test(f.type)) { msg.textContent = 'Please pick a picture (JPG or PNG).'; return; }
      const rd = new FileReader();
      rd.onerror = function(){ msg.textContent = 'Could not read that file.'; };
      rd.onload = function(){
        const im = new Image();
        im.onerror = function(){ msg.textContent = 'Could not open that picture. Try a JPG or PNG.'; };
        im.onload = function(){
          // centre-crop to a square, 200px, JPEG — same size the profile page uses
          const side = Math.min(im.width, im.height), cv = document.createElement('canvas'); cv.width = cv.height = 200;
          cv.getContext('2d').drawImage(im, (im.width - side) / 2, (im.height - side) / 2, side, side, 0, 0, 200, 200);
          photoData = cv.toDataURL('image/jpeg', 0.72); msg.textContent = ''; draw();
        };
        im.src = rd.result;
      };
      rd.readAsDataURL(f);
    });
    document.body.appendChild(back);
  }

  // Saves a picked picture as the person's profile photo (same call the My Profile page makes),
  // then refreshes the cached user so the menu shows it straight away.
  async function uploadProfilePhoto(dataUri){
    const cfgx = window.LB_CONFIG || {};
    const base = cfgx.AUTH_FAST_API || cfgx.AUTH_API;
    if (!base) throw new Error('Photo upload is not available on this page.');
    const token = window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || '';
    async function call(action, extra){
      const p = new URLSearchParams(Object.assign({ action: action, token: token }, extra || {}));
      const res = await fetch(base + '?' + p.toString());
      return res.json();
    }
    let d;
    try { d = await call('updateProfile', { photoBase64: dataUri }); }
    catch (e) { throw new Error('Connection problem — please try again.'); }
    if (!d || !d.success) throw new Error((d && d.error) || 'Could not save your photo.');
    try {
      const g = await call('getProfile');
      const url = g && g.profile && (g.profile.photo || g.profile.photoDataUri);
      if (url) {
        [sessionStorage, localStorage].forEach(function(store){
          try { const u = JSON.parse(store.getItem('lalabellaUser') || 'null'); if (u) { u.photo = url; store.setItem('lalabellaUser', JSON.stringify(u)); } } catch (e) {}
        });
        window.dispatchEvent(new Event('lb:user-changed'));
      }
    } catch (e) {}
  }

  window.lbChatAvatar = { uri: uri, svg: svg, clean: clean, open: open, uploadProfilePhoto: uploadProfilePhoto, RANGES: RANGES };
})();
