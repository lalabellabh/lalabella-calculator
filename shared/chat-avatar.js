/* ==========================================================
   LALABELLA CHAT AVATAR — a small cartoon-face maker.
   An avatar is just 8 small integers (skin, hair, hairColor, eyes,
   mouth, acc, shirt, bg) — stored per person by the chat backend,
   which validates every number, so nothing but known shapes can ever
   be drawn. Used by shared/chat-bubble.js and chatbox.html.

   lbChatAvatar.uri(cfg)          -> data: URI of the avatar (for <img src>)
   lbChatAvatar.open({cfg,hasPhoto,onSave})  -> opens the builder; onSave(cfg|null)
                                    returns a Promise (null = "use my photo")
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

  function darker(hex, f){
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return '#' + [r, g, b].map(function(x){ return x.toString(16).padStart(2, '0'); }).join('');
  }

  function hairBack(style, c){
    if (style === 1) return '<path d="M23 48 C20 14 80 14 77 48 L81 86 Q68 92 63 80 L37 80 Q32 92 19 86 Z" fill="' + c + '"/>';
    if (style === 5) return '<path d="M23 50 C20 14 80 14 77 50 L77 68 Q65 73 62 58 L38 58 Q35 73 23 68 Z" fill="' + c + '"/>';
    return '';
  }
  function hairFront(style, c){
    const top = '<path d="M27 47 C23 15 77 15 73 47 C69 35 60 30 50 30 C40 30 31 35 27 47 Z" fill="' + c + '"/>';
    switch (style) {
      case 0: return '<path d="M27 47 C23 14 77 14 73 47 C71 38 64 28 46 27 C37 29 30 36 27 47 Z" fill="' + c + '"/>';
      case 1: case 5: return top;
      case 2: return top + '<circle cx="50" cy="14" r="9" fill="' + c + '"/>';
      case 3: return [[29,37,9],[38,27,10],[50,22,10],[62,27,10],[71,37,9],[26,49,6],[74,49,6]].map(function(a){
                return '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="' + a[2] + '" fill="' + c + '"/>'; }).join('');
      case 4: return '<path d="M28 44 C26 20 74 20 72 44 C71 36 62 33 50 33 C38 33 29 36 28 44 Z" fill="' + c + '"/>';
      case 6: return top + '<path d="M72 40 Q93 42 88 68 Q84 78 80 67 Q85 52 71 48 Z" fill="' + c + '"/>';
      default: return '';
    }
  }
  function eyes(style){
    switch (style) {
      case 1: return '<path d="M36 50 Q41 43 46 50 M54 50 Q59 43 64 50" fill="none" stroke="' + INK + '" stroke-width="2.6" stroke-linecap="round"/>';
      case 2: return '<circle cx="41" cy="49" r="5" fill="#fff"/><circle cx="59" cy="49" r="5" fill="#fff"/><circle cx="42" cy="50" r="2.8" fill="' + INK + '"/><circle cx="58" cy="50" r="2.8" fill="' + INK + '"/>';
      case 3: return '<path d="M36 49 L46 49 M54 49 L64 49" stroke="' + INK + '" stroke-width="2.8" stroke-linecap="round"/>';
      default: return '<circle cx="41" cy="49" r="2.8" fill="' + INK + '"/><circle cx="59" cy="49" r="2.8" fill="' + INK + '"/>';
    }
  }
  function mouth(style){
    switch (style) {
      case 1: return '<path d="M40 57 Q50 71 60 57 Z" fill="#7a2436"/><path d="M45 64 Q50 68 55 64 Q50 62 45 64Z" fill="#e8798f"/>';
      case 2: return '<path d="M45 60 Q50 63 55 60" fill="none" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round"/>';
      case 3: return '<ellipse cx="50" cy="61" rx="3.2" ry="3.8" fill="#7a2436"/>';
      default: return '<path d="M41 58 Q50 67 59 58" fill="none" stroke="' + INK + '" stroke-width="2.6" stroke-linecap="round"/>';
    }
  }
  function acc(style){
    switch (style) {
      case 1: return '<g fill="none" stroke="' + INK + '" stroke-width="2"><circle cx="41" cy="49" r="8"/><circle cx="59" cy="49" r="8"/><path d="M49 49 L51 49"/></g>';
      case 2: return '<g fill="' + INK + '"><rect x="31" y="43" width="17" height="11" rx="5"/><rect x="52" y="43" width="17" height="11" rx="5"/><rect x="47" y="46" width="6" height="2.5"/></g>';
      case 3: return '<g transform="translate(66 27)"><circle cx="0" cy="-5" r="4" fill="#ff8fab"/><circle cx="5" cy="0" r="4" fill="#ff8fab"/><circle cx="0" cy="5" r="4" fill="#ff8fab"/><circle cx="-5" cy="0" r="4" fill="#ff8fab"/><circle cx="0" cy="0" r="3" fill="#ffd166"/></g>';
      default: return '';
    }
  }

  function svg(cfg){
    const c = clean(cfg), skin = SKIN[c.skin], hc = HAIRC[c.hairColor];
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<rect width="100" height="100" fill="' + BG[c.bg] + '"/>' +
      hairBack(c.hair, hc) +
      '<path d="M16 100 Q16 75 50 73 Q84 75 84 100 Z" fill="' + SHIRT[c.shirt] + '"/>' +
      '<rect x="43" y="62" width="14" height="15" rx="5" fill="' + darker(skin, 0.92) + '"/>' +
      '<circle cx="28" cy="49" r="4.5" fill="' + skin + '"/><circle cx="72" cy="49" r="4.5" fill="' + skin + '"/>' +
      '<ellipse cx="50" cy="46" rx="22" ry="25" fill="' + skin + '"/>' +
      '<circle cx="35" cy="57" r="4" fill="#ff6f91" opacity=".22"/><circle cx="65" cy="57" r="4" fill="#ff6f91" opacity=".22"/>' +
      eyes(c.eyes) + mouth(c.mouth) + hairFront(c.hair, hc) + acc(c.acc) +
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
      '.lbca-prev{display:block;width:112px;height:112px;border-radius:50%;margin:0 auto 12px;border:3px solid #f0d9d9;object-fit:cover}',
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
    box.innerHTML = '<h3>🎨 My Avatar</h3><img class="lbca-prev" alt=""><div class="lbca-rows"></div>' +
      '<div class="lbca-msg"></div><div class="lbca-btns">' +
      '<button type="button" data-a="rand">🎲 Random</button>' +
      '<button type="button" data-a="photo"' + (opts.hasPhoto === false && !opts.cfg ? ' hidden' : '') + '>Use my photo</button>' +
      '<button type="button" data-a="cancel">Cancel</button>' +
      '<button type="button" class="pri" data-a="save">Save</button></div>';
    const prev = box.querySelector('.lbca-prev'), rowsEl = box.querySelector('.lbca-rows'), msg = box.querySelector('.lbca-msg');

    function draw(){
      prev.src = uri(cur);
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
      if (a === 'rand') { Object.keys(RANGES).forEach(function(k){ cur[k] = Math.floor(Math.random() * RANGES[k]); }); return draw(); }
      if (a === 'save' || a === 'photo') {
        const btns = box.querySelectorAll('.lbca-btns button'); btns.forEach(function(x){ x.disabled = true; });
        msg.textContent = '';
        try { await opts.onSave(a === 'photo' ? null : clean(cur)); close(); }
        catch (err) { msg.textContent = (err && err.message) || 'Could not save. Try again.'; btns.forEach(function(x){ x.disabled = false; }); }
      }
    });
    document.body.appendChild(back);
  }

  window.lbChatAvatar = { uri: uri, svg: svg, clean: clean, open: open, RANGES: RANGES };
})();
