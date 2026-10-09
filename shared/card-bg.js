/* Card backgrounds for card-print.html — pick a design, a colour, or your own picture.
   LBCardBg.get() -> string to save   |   LBCardBg.set(str) -> restore   |   LBCardBg.open() -> picker */
(function(){
  if (window.LBCardBg) return;
  const KEY = 'lbCardBg';
  const e = s => 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" preserveAspectRatio="none">' + s + '</svg>');
  // seeded pseudo-random so a design looks the same every time
  function rnd(seed){ let x = seed; return function(){ x = (x * 9301 + 49297) % 233280; return x / 233280; }; }
  const stroke = (c, w, o) => ' fill="none" stroke="' + c + '" stroke-width="' + (w || 1.2) + '" stroke-linecap="round" stroke-linejoin="round" opacity="' + (o == null ? 1 : o) + '"';
  function leaf(x, y, r, s, c, fill){ return '<g transform="translate(' + x + ' ' + y + ') rotate(' + r + ') scale(' + s + ')"><path d="M0 0C14-14 14-40 0-62C-14-40-14-14 0 0Z" fill="' + (fill || 'none') + '" stroke="' + c + '" stroke-width="1.3"/><path d="M0 0V-58" stroke="' + c + '" stroke-width=".9"/></g>'; }
  function tulip(x, y, s, c){ return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"' + stroke(c, 1.3) + '><path d="M0 0C-2 -60-3 -120 0 -170"/><path d="M-26 -190C-30 -160-14 -146 0 -146C14 -146 30 -160 26 -190C16 -178 8 -186 0 -202C-8 -186-16 -178-26 -190Z"/><path d="M0 -146C-4 -165 -4 -185 0 -202M-12 -150C-16 -168-18 -180-26 -190M12 -150C16 -168 18 -180 26 -190"/><path d="M0 -60C-30 -80-48 -110-40 -140C-20 -120-6 -90 0 -60Z"/></g>'; }
  function iris(x, y, s, c){ return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"' + stroke(c, 1.2) + '><path d="M0 0C3 -50 0 -100 -2 -150"/><path d="M-2 -150C-40 -150-52 -184-30 -204C-22 -182-8 -170-2 -160C6 -170 20 -182 30 -204C52 -184 40 -150-2 -150Z"/><path d="M-2 -160C-14 -190 -14 -210 -2 -226C10 -210 10 -190 -2 -160Z"/><path d="M-30 -135C-60 -120-62 -100-44 -92C-30 -104-16 -118-2 -140M26 -135C56 -120 58 -100 40 -92C26 -104 12 -118-2 -140"/></g>'; }
  function flower(x, y, r, c, fill){ let p = ''; for (let i = 0; i < 5; i++) p += '<ellipse cx="0" cy="' + (-r * .62) + '" rx="' + (r * .38) + '" ry="' + (r * .62) + '" transform="rotate(' + (i * 72) + ')" fill="' + (fill || 'none') + '" stroke="' + c + '" stroke-width="1.2"/>'; return '<g transform="translate(' + x + ' ' + y + ')">' + p + '<circle r="' + (r * .2) + '" fill="' + (fill ? '#fff2b0' : 'none') + '" stroke="' + c + '" stroke-width="1"/></g>'; }
  function heart(x, y, s, f, o){ return '<path transform="translate(' + x + ' ' + y + ') scale(' + s + ')" d="M0 6C-10-4-10-14-3-14C0-14 0-10 0-10C0-10 0-14 3-14C10-14 10-4 0 6Z" fill="' + f + '" opacity="' + (o == null ? 1 : o) + '"/>'; }
  function star(x, y, s, f){ return '<path transform="translate(' + x + ' ' + y + ') scale(' + s + ')" d="M0-8L2.4-2.4L8 0L2.4 2.4L0 8L-2.4 2.4L-8 0L-2.4-2.4Z" fill="' + f + '"/>'; }

  const D = [];
  const add = (id, name, css, extra) => D.push(Object.assign({ id: id, name: name, css: css }, extra || {}));

  add('none', 'White', '#ffffff');

  // like the "We'll be back soon" card: cream paper, faint botanical line art, sage strip
  (function(){
    const c = '#c9cfae';
    add('botanical', 'Botanical sketch', e(
      '<rect width="400" height="400" fill="#fcfbf5"/>' +
      tulip(70, 372, .92, c) + iris(338, 372, .9, c) + leaf(150, 372, -18, 1.4, c) + leaf(255, 372, 14, 1.3, c) + leaf(30, 330, -40, .8, c) + leaf(380, 300, 35, .8, c) +
      flower(200, 330, 20, c) + flower(236, 350, 13, c) + flower(165, 352, 12, c) + '<path d="M200 372C198 352 200 342 200 332" ' + stroke(c, 1.1) + '/>' +
      '<rect y="378" width="400" height="22" fill="#e7efbd"/>'));
  })();
  add('botanical2', 'Botanical green', e(
    '<rect width="400" height="400" fill="#f8faef"/>' + tulip(40, 380, .8, '#b9c58a') + iris(360, 380, .8, '#b9c58a') + leaf(120, 380, -22, 1.2, '#b9c58a') + leaf(290, 380, 20, 1.2, '#b9c58a') + flower(200, 345, 22, '#b9c58a') +
    '<rect y="382" width="400" height="18" fill="#d4e29a"/><rect width="400" height="12" fill="#d4e29a"/>'));
  add('blush', 'Soft blush', e('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffafa"/><stop offset="1" stop-color="#fbe1e7"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/>'));
  (function(){
    const r = rnd(7); let h = ''; for (let i = 0; i < 26; i++) h += heart(r() * 400, r() * 400, .8 + r() * 1.2, '#f4b6c4', .5);
    add('hearts', 'Tiny hearts', e('<rect width="400" height="400" fill="#fff6f7"/>' + h));
  })();
  add('petals', 'Pink watercolor corners', e('<defs><radialGradient id="a"><stop offset="0" stop-color="#f6a9bd" stop-opacity=".7"/><stop offset="1" stop-color="#f6a9bd" stop-opacity="0"/></radialGradient><radialGradient id="b"><stop offset="0" stop-color="#ffd1b5" stop-opacity=".7"/><stop offset="1" stop-color="#ffd1b5" stop-opacity="0"/></radialGradient></defs><rect width="400" height="400" fill="#fffdfb"/><circle cx="0" cy="0" r="190" fill="url(#a)"/><circle cx="400" cy="400" r="200" fill="url(#a)"/><circle cx="400" cy="0" r="130" fill="url(#b)"/><circle cx="0" cy="400" r="130" fill="url(#b)"/>'));
  add('gold', 'Gold frame', e('<rect width="400" height="400" fill="#fffdf7"/><rect x="14" y="14" width="372" height="372" rx="4"' + stroke('#c9a24d', 2.2) + '/><rect x="23" y="23" width="354" height="354" rx="2"' + stroke('#c9a24d', .8) + '/>' +
    [[23, 23, 0], [377, 23, 90], [377, 377, 180], [23, 377, 270]].map(c => '<g transform="translate(' + c[0] + ' ' + c[1] + ') rotate(' + c[2] + ')"' + stroke('#c9a24d', 1.2) + '><path d="M0 0C20 2 30 12 28 28C22 18 12 14 0 16"/><circle cx="14" cy="14" r="2.5" fill="#c9a24d"/></g>').join('')));
  add('sage', 'Sage leaves', e('<rect width="400" height="400" fill="#fbfcf7"/>' +
    '<g>' + [0, 1, 2, 3, 4].map(i => leaf(28 + i * 5, 96 + i * 38, -50 + i * 6, .7, '#9db38a', '#dfe9cf')).join('') + '</g>' +
    '<path d="M24 372C30 300 40 220 24 130" ' + stroke('#9db38a', 1.4) + '/>' +
    '<g>' + [0, 1, 2, 3, 4].map(i => leaf(372 - i * 5, 300 - i * 38, 130 + i * 6, .7, '#9db38a', '#dfe9cf')).join('') + '</g>' + '<path d="M376 30C370 100 360 180 376 270" ' + stroke('#9db38a', 1.4) + '/>'));
  (function(){
    const r = rnd(11); let d = ''; for (let i = 0; i < 40; i++) d += '<circle cx="' + (r() * 400) + '" cy="' + (r() * 400) + '" r="' + (1 + r() * 3) + '" fill="#fff" opacity=".6"/>';
    add('lavender', 'Lavender mist', e('<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8f4ff"/><stop offset="1" stop-color="#e2d6f5"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/>' + d));
  })();
  add('geo', 'Gold geometric', e('<defs><pattern id="p" width="50" height="50" patternUnits="userSpaceOnUse"><g' + stroke('#d8bf86', .8, .55) + '><rect x="9" y="9" width="32" height="32"/><rect x="9" y="9" width="32" height="32" transform="rotate(45 25 25)"/><circle cx="25" cy="25" r="5"/></g></pattern></defs><rect width="400" height="400" fill="#fffdf6"/><rect width="400" height="400" fill="url(#p)"/><rect x="12" y="12" width="376" height="376"' + stroke('#c9a24d', 1.6) + '/>'));
  add('crescent', 'Crescent & stars', e('<rect width="400" height="400" fill="#fffcf3"/><path d="M330 46C300 50 282 76 288 104C294 132 322 148 350 142C320 142 304 118 308 94C312 70 326 54 330 46Z" fill="#e0bf6c"/>' + star(280, 60, 1.1, '#e0bf6c') + star(360, 100, .9, '#e0bf6c') + star(70, 330, .8, '#ecd49a') + star(40, 60, .7, '#ecd49a') + star(350, 340, .8, '#ecd49a') + star(120, 370, .6, '#ecd49a')));
  add('kraft', 'Kraft paper', e('<defs><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .32  0 0 0 0 .18  0 0 0 .45 0"/></filter></defs><rect width="400" height="400" fill="#e6cfa6"/><rect width="400" height="400" filter="url(#n)"/>'));
  add('peach', 'Peach watercolor', e('<defs><radialGradient id="a"><stop offset="0" stop-color="#ffc9a6" stop-opacity=".75"/><stop offset="1" stop-color="#ffc9a6" stop-opacity="0"/></radialGradient><radialGradient id="b"><stop offset="0" stop-color="#ffe0a8" stop-opacity=".75"/><stop offset="1" stop-color="#ffe0a8" stop-opacity="0"/></radialGradient></defs><rect width="400" height="400" fill="#fffaf5"/><circle cx="110" cy="120" r="170" fill="url(#a)"/><circle cx="310" cy="290" r="190" fill="url(#b)"/>'));
  add('mint', 'Fresh mint', e('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4fff9"/><stop offset="1" stop-color="#d3f0e1"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/>' + leaf(30, 130, 35, 2, '#88c7a5', '#dff5e8') + leaf(380, 330, 215, 2.2, '#88c7a5', '#dff5e8') + leaf(340, 70, -25, 1.3, '#a7d8bd') + leaf(60, 380, 150, 1.3, '#a7d8bd')));
  add('sky', 'Soft sky', e('<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7ecff"/><stop offset="1" stop-color="#fdfbff"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><g fill="#fff" opacity=".85"><ellipse cx="90" cy="80" rx="50" ry="18"/><ellipse cx="120" cy="66" rx="34" ry="18"/><ellipse cx="300" cy="150" rx="56" ry="19"/><ellipse cx="330" cy="134" rx="34" ry="17"/><ellipse cx="160" cy="300" rx="60" ry="18"/></g>'));
  (function(){
    const r = rnd(5), cols = ['#ffb3c6', '#ffd37a', '#9fd5ff', '#b5ecc4', '#cdb4ff']; let d = '';
    for (let i = 0; i < 46; i++) { const x = r() * 400, y = r() * 400, c = cols[i % 5]; d += r() > .5 ? '<circle cx="' + x + '" cy="' + y + '" r="' + (3 + r() * 5) + '" fill="' + c + '"/>' : '<rect x="' + x + '" y="' + y + '" width="' + (5 + r() * 6) + '" height="' + (3 + r() * 4) + '" rx="1.5" fill="' + c + '" transform="rotate(' + (r() * 180) + ' ' + x + ' ' + y + ')"/>'; }
    add('confetti', 'Party confetti', e('<rect width="400" height="400" fill="#fffdfa"/>' + d));
  })();
  add('marble', 'Marble', e('<defs><filter id="m"><feTurbulence type="fractalNoise" baseFrequency=".008 .02" numOctaves="4" seed="9"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .55  0 0 0 0 .6  -2.2 0 0 0 1.25"/></filter></defs><rect width="400" height="400" fill="#fbfbfc"/><rect width="400" height="400" filter="url(#m)" opacity=".55"/>'));
  (function(){
    let g = '';
    [[40, 380], [110, 392], [190, 384], [270, 392], [350, 380]].forEach((p, i) => { g += leaf(p[0] + 20, p[1] + 6, -20 + i * 10, 1, '#9bc08a', '#e3f0da') + flower(p[0], p[1] - 40 - (i % 2) * 18, 26 + (i % 2) * 6, '#e98aa6', i % 2 ? '#fcd3de' : '#f9bfd0'); });
    add('flowerrow', 'Pink flowers (bottom)', e('<rect width="400" height="400" fill="#fffefc"/>' + g + '<rect y="394" width="400" height="6" fill="#cfe6c2"/>'));
  })();
  add('stripes', 'Pastel stripes', e('<defs><pattern id="s" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="20" height="40" fill="#fff6f8"/><rect x="20" width="20" height="40" fill="#fde5ea"/></pattern></defs><rect width="400" height="400" fill="url(#s)"/>'));

  // ------------------------------------------------------------ apply / save
  let cur = 'none';
  function cssFor(v){
    if (v && v.indexOf('color:') === 0) return { bg: v.slice(6), size: '' };
    if (v && v.indexOf('img:') === 0) return { bg: 'url("' + v.slice(4) + '") center/cover no-repeat', size: '' };
    const d = D.find(x => x.id === v) || D[0];
    return d.css.indexOf('data:') === 0 ? { bg: 'url("' + d.css + '") center/100% 100% no-repeat', size: '' } : { bg: d.css, size: '' };
  }
  function apply(v){
    cur = v || 'none';
    const card = document.getElementById('card'); if (!card) return;
    card.style.background = cssFor(cur).bg;
    card.style.webkitPrintColorAdjust = 'exact'; card.style.printColorAdjust = 'exact';
    document.querySelectorAll('.lbbg-th').forEach(t => t.classList.toggle('on', t.getAttribute('data-id') === cur));
  }

  // ------------------------------------------------------------ picker
  function style(){
    if (document.getElementById('lbbgcss')) return;
    const s = document.createElement('style'); s.id = 'lbbgcss';
    s.textContent = '.lbbg-back{position:fixed;inset:0;z-index:99999;background:rgba(40,20,28,.45);display:flex;align-items:center;justify-content:center;padding:12px}' +
      '.lbbg{width:min(520px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.35);color:#3a2530;font-family:Arial,sans-serif}' +
      '.lbbg h3{margin:0 0 4px;font-size:18px}.lbbg .sub{font-size:12px;color:#8a7078;margin-bottom:12px}' +
      '.lbbg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:10px}' +
      '.lbbg-th{border:2px solid #eadde0;border-radius:12px;background:#fff;padding:4px;cursor:pointer;font-size:11px;color:#3a2530;text-align:center}.lbbg-th.on{border-color:#9e2f4a;box-shadow:0 0 0 2px #f6d5de}' +
      '.lbbg-th i{display:block;width:100%;aspect-ratio:1;border-radius:8px;border:1px solid #eadde0;margin-bottom:4px}' +
      '.lbbg-row{display:flex;gap:8px;align-items:center;margin-top:14px;flex-wrap:wrap}.lbbg-row button,.lbbg-row label{border:1px solid #eadde0;background:#fff;border-radius:10px;padding:9px 12px;font-size:13px;cursor:pointer}.lbbg-row input[type=color]{width:44px;height:36px;padding:2px;border:1px solid #eadde0;border-radius:8px}' +
      '.lbbg-done{width:100%;margin-top:14px;border:0;background:#8f3f61;color:#fff;border-radius:11px;padding:12px;font-weight:700;font-size:14px;cursor:pointer}';
    document.head.appendChild(s);
  }
  function open(){
    style();
    const back = document.createElement('div'); back.className = 'lbbg-back';
    back.innerHTML = '<div class="lbbg"><h3>🎨 Card background</h3><div class="sub">Tap one to try it on the card. Print uses the same background.</div><div class="lbbg-grid"></div>' +
      '<div class="lbbg-row"><span style="font-size:13px">Colour:</span><input type="color" id="lbbgColor" value="#fff3f5"><label>🖼️ My picture<input type="file" accept="image/*" id="lbbgFile" hidden></label><button type="button" id="lbbgReset">Reset to white</button></div>' +
      '<button type="button" class="lbbg-done">Done</button></div>';
    const grid = back.querySelector('.lbbg-grid');
    D.forEach(d => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'lbbg-th'; b.setAttribute('data-id', d.id);
      const i = document.createElement('i'); i.style.background = cssFor(d.id).bg; b.appendChild(i); b.appendChild(document.createTextNode(d.name));
      b.addEventListener('click', () => apply(d.id)); grid.appendChild(b);
    });
    document.body.appendChild(back);
    apply(cur);
    const close = () => back.remove();
    back.querySelector('.lbbg-done').addEventListener('click', close);
    back.addEventListener('click', ev => { if (ev.target === back) close(); });
    back.querySelector('#lbbgColor').addEventListener('input', ev => apply('color:' + ev.target.value));
    back.querySelector('#lbbgReset').addEventListener('click', () => apply('none'));
    back.querySelector('#lbbgFile').addEventListener('change', ev => {
      const f = ev.target.files && ev.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { const im = new Image(); im.onload = () => {
        const m = 1000, k = Math.min(1, m / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); apply('img:' + c.toDataURL('image/jpeg', .85)); }; im.src = r.result; };
      r.readAsDataURL(f);
    });
  }

  function mount(){
    const sz = document.getElementById('size'); if (!sz || document.getElementById('bgBtn')) return;
    const g = document.createElement('div'); g.className = 'group';
    g.innerHTML = '<span class="label">BACKGROUND</span><button type="button" id="bgBtn" title="Change the card background">🎨 Choose…</button>';
    const host = sz.closest('.group'); host.parentNode.insertBefore(g, host.nextSibling);
    g.querySelector('#bgBtn').addEventListener('click', open);
    apply('none');   // always starts white so a forgotten background never ends up on a print
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.LBCardBg = { get: () => cur, set: apply, open: open, list: D };
})();
