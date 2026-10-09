/* Lalabella hero 3D: a 3D analog clock + 3D weather icons (sun with shades, clouds, rain, storm, snow, fog, moon)
   for the schedule page. Tap the weather icon (the sun wears shades!) or the clock for a little animation.
   LBHero3D.initClock(panelEl)  /  LBHero3D.weather(el, wmoCode, tempC)  */
(function(){
  if (window.LBHero3D) return;
  let uid = 0;
  const CSS = `
  .h3-wrap{display:inline-block;transform-style:preserve-3d;transition:transform .15s ease-out;will-change:transform;cursor:pointer;-webkit-tap-highlight-color:transparent}
  .h3-wrap svg{display:block;overflow:visible;filter:drop-shadow(0 14px 10px rgba(40,20,10,.35))}
  .h3-float{animation:h3-float 3.4s ease-in-out infinite}
  @keyframes h3-float{50%{transform:translateY(-6px)}}
  .h3-rays{transform-box:view-box;transform-origin:50% 50%;animation:h3-spin 26s linear infinite}
  @keyframes h3-spin{to{transform:rotate(360deg)}}
  .h3-glow{animation:h3-glow 2.6s ease-in-out infinite alternate}@keyframes h3-glow{to{opacity:.55}}
  .h3-shades{transform-box:fill-box;transform-origin:50% 50%}
  .h3-wrap.go .h3-rays{animation:h3-spin .9s cubic-bezier(.2,.7,.3,1) 2}
  .h3-wrap.go .h3-body{animation:h3-pop .9s ease 1;transform-box:fill-box;transform-origin:50% 50%}
  .h3-wrap.go .h3-shades{animation:h3-drop 1.1s cubic-bezier(.3,1.7,.5,1) 1}
  .h3-wrap.go .h3-spark{animation:h3-spark 1.4s ease-out 1}
  @keyframes h3-pop{40%{transform:scale(1.16)}}
  @keyframes h3-drop{0%{transform:translateY(-40px) rotate(-14deg);opacity:0}35%{opacity:1}100%{transform:none;opacity:1}}
  .h3-spark{opacity:0;transform-box:fill-box;transform-origin:50% 50%}
  @keyframes h3-spark{0%{opacity:0;transform:scale(.2) rotate(0)}30%{opacity:1}100%{opacity:0;transform:scale(1.6) rotate(120deg)}}
  .h3-drop{animation:h3-fall 1.1s linear infinite;opacity:0}.h3-drop:nth-of-type(2n){animation-delay:.35s}.h3-drop:nth-of-type(3n){animation-delay:.7s}
  .h3-wrap.go .h3-drop{animation-duration:.45s}
  @keyframes h3-fall{0%{transform:translateY(-6px);opacity:0}20%{opacity:.9}100%{transform:translateY(26px);opacity:0}}
  .h3-cloud{animation:h3-drift 5s ease-in-out infinite alternate}@keyframes h3-drift{to{transform:translateX(5px)}}
  .h3-wrap.go .h3-cloud{animation:h3-shake .8s ease 1}@keyframes h3-shake{20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(4px)}}
  .h3-bolt{opacity:.95;transform-box:fill-box;transform-origin:50% 0}
  .h3-wrap.go .h3-bolt{animation:h3-flash .9s steps(1) 1}@keyframes h3-flash{0%{opacity:0}10%{opacity:1;filter:brightness(2)}25%{opacity:.1}40%{opacity:1;filter:brightness(2.4)}60%{opacity:.2}80%{opacity:1}}
  .h3-fog{animation:h3-fogm 3s ease-in-out infinite alternate}.h3-fog:nth-of-type(2n){animation-delay:.8s;animation-direction:alternate-reverse}@keyframes h3-fogm{to{transform:translateX(9px)}}
  .h3-flake{animation:h3-fall 2s linear infinite;opacity:0}.h3-flake:nth-of-type(2n){animation-delay:.6s}.h3-flake:nth-of-type(3n){animation-delay:1.2s}
  .h3-tw{animation:h3-tw 1.8s ease-in-out infinite alternate}.h3-tw:nth-of-type(2n){animation-delay:.7s}@keyframes h3-tw{from{opacity:.25}to{opacity:1}}
  .h3-zzz{opacity:0;font:700 14px 'Fraunces',serif;fill:#fff}.h3-wrap.go .h3-zzz{animation:h3-z 1.6s ease-out 1}@keyframes h3-z{0%{opacity:0;transform:translate(0,6px)}30%{opacity:1}100%{opacity:0;transform:translate(10px,-18px)}}
  /* clock */
  .hero{perspective:1400px}
  .clock-panel{display:flex;align-items:center;justify-content:space-between;gap:18px;transform-style:preserve-3d}
  .clock-panel .cp-text{position:relative;min-width:0}
  .clock-panel .cp-clock{position:relative;flex:0 0 auto;transform-style:preserve-3d}
  .clock-time{text-shadow:0 1px 0 #e9c06a,0 2px 0 #d9a441,0 3px 0 #b98730,0 4px 0 #9c6f22,0 5px 0 #7d5819,0 6px 0 #5f4213,0 12px 14px rgba(0,0,0,.55),0 0 22px rgba(217,164,65,.25);transform:translateZ(30px);display:inline-block}
  .clock-time span{text-shadow:0 2px 0 rgba(0,0,0,.35)}
  .h3-clock{width:150px;height:150px}
  .h3-clock svg{width:100%;height:100%}
  .h3-clock.go{animation:h3-bounce .9s ease 1}@keyframes h3-bounce{30%{transform:scale(1.12)}60%{transform:scale(.96)}}
  .weather-panel{transform-style:preserve-3d;background:linear-gradient(160deg,#eaf6ff 0%,#fff 55%);position:relative}
  .weather-panel .weather-emoji{width:96px;height:96px;font-size:0;flex:0 0 auto}
  .weather-panel .weather-emoji .h3-wrap,.weather-panel .weather-emoji svg{width:96px;height:96px}
  .weather-temp{text-shadow:0 1px 0 #fff,0 3px 0 rgba(158,47,74,.25),0 8px 10px rgba(158,47,74,.25)}
  @media(max-width:680px){.clock-panel{flex-direction:column-reverse;align-items:flex-start}.h3-clock{width:118px;height:118px;align-self:flex-end;margin-bottom:-6px}}
  @media(prefers-reduced-motion:reduce){.h3-wrap *,.h3-clock *{animation:none!important}}
  `;
  function addStyle(){ if (document.getElementById('h3css')) return; const s = document.createElement('style'); s.id = 'h3css'; s.textContent = CSS; document.head.appendChild(s); }

  // ---------------------------------------------------------------- weather art
  function defs(u){
    return '<defs>' +
      '<radialGradient id="sg' + u + '" cx="38%" cy="30%" r="78%"><stop offset="0" stop-color="#fffbb8"/><stop offset=".45" stop-color="#ffd21f"/><stop offset="1" stop-color="#ff8f00"/></radialGradient>' +
      '<linearGradient id="rg' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#ff9d00"/></linearGradient>' +
      '<radialGradient id="cg' + u + '" cx="40%" cy="25%" r="85%"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#e3ecf7"/><stop offset="1" stop-color="#aebfd6"/></radialGradient>' +
      '<radialGradient id="dg' + u + '" cx="40%" cy="25%" r="85%"><stop offset="0" stop-color="#c3cedd"/><stop offset=".6" stop-color="#8797ad"/><stop offset="1" stop-color="#55657c"/></radialGradient>' +
      '<linearGradient id="lg' + u + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3a48"/><stop offset="1" stop-color="#050508"/></linearGradient>' +
      '<linearGradient id="bg' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff7a8"/><stop offset="1" stop-color="#ffb800"/></linearGradient>' +
      '<radialGradient id="mg' + u + '" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fffbe0"/><stop offset=".6" stop-color="#ffe9a0"/><stop offset="1" stop-color="#e0b95a"/></radialGradient>' +
      '</defs>';
  }
  function sun(u, cx, cy, sc, shades){
    let rays = ''; for (let i = 0; i < 12; i++) rays += '<rect x="56" y="1" width="8" height="18" rx="4" fill="url(#rg' + u + ')" transform="rotate(' + (i * 30) + ' 60 60)"/>';
    const sh = shades ? '<g class="h3-shades"><rect x="30" y="49" width="26" height="18" rx="7" fill="url(#lg' + u + ')"/><rect x="64" y="49" width="26" height="18" rx="7" fill="url(#lg' + u + ')"/><path d="M56 54Q60 50 64 54" stroke="#111" stroke-width="3" fill="none"/><path d="M30 54L24 50M90 54L96 50" stroke="#111" stroke-width="3" stroke-linecap="round"/><path d="M35 53L43 53L37 62Z M69 53L77 53L71 62Z" fill="#fff" opacity=".35"/></g>'
                      : '<circle cx="45" cy="56" r="4.5" fill="#3a2a10"/><circle cx="75" cy="56" r="4.5" fill="#3a2a10"/>';
    return '<g transform="translate(' + (cx - 60 * sc) + ' ' + (cy - 60 * sc) + ') scale(' + sc + ')">' +
      '<circle class="h3-glow" cx="60" cy="60" r="56" fill="#ffd21f" opacity=".22"/>' +
      '<g class="h3-rays">' + rays + '</g>' +
      '<g class="h3-body"><circle cx="60" cy="60" r="35" fill="url(#sg' + u + ')"/><ellipse cx="48" cy="42" rx="12" ry="7" fill="#fff" opacity=".5" transform="rotate(-30 48 42)"/>' +
      '<circle cx="40" cy="74" r="5" fill="#ff7a3d" opacity=".35"/><circle cx="80" cy="74" r="5" fill="#ff7a3d" opacity=".35"/>' + sh +
      '<path d="M46 76Q60 90 74 76" stroke="#7a3a00" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>' +
      '<path class="h3-spark" d="M100 16l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#fff"/><path class="h3-spark" d="M14 28l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff"/><path class="h3-spark" d="M104 92l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="#fff"/></g>';
  }
  function cloud(u, dark, ox, oy, sc){
    const f = 'url(#' + (dark ? 'dg' : 'cg') + u + ')';
    return '<g class="h3-cloud" transform="translate(' + (ox || 0) + ' ' + (oy || 0) + ') scale(' + (sc || 1) + ')"><g fill="' + f + '"><circle cx="40" cy="72" r="19"/><circle cx="62" cy="58" r="25"/><circle cx="86" cy="72" r="19"/><rect x="34" y="70" width="58" height="21" rx="10.5"/></g>' +
      '<ellipse cx="55" cy="46" rx="12" ry="6" fill="#fff" opacity="' + (dark ? .25 : .6) + '" transform="rotate(-25 55 46)"/></g>';
  }
  function drops(n, y, col){ let d = ''; for (let i = 0; i < n; i++) d += '<rect class="h3-drop" x="' + (42 + i * (44 / Math.max(1, n - 1))) + '" y="' + y + '" width="4" height="12" rx="2" fill="' + col + '"/>'; return d; }
  function flakes(){ let d = ''; [44, 58, 72, 86].forEach(function(x){ d += '<circle class="h3-flake" cx="' + x + '" cy="98" r="3.4" fill="#fff"/>'; }); return d; }
  function moon(u){
    return '<g class="h3-body"><circle cx="58" cy="60" r="34" fill="url(#mg' + u + ')"/><circle cx="76" cy="50" r="30" fill="#1b2a52"/></g>' +
      '<path class="h3-tw" d="M92 28l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff"/><path class="h3-tw" d="M24 34l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff"/><circle class="h3-tw" cx="98" cy="84" r="2.5" fill="#fff"/>' +
      '<text class="h3-zzz" x="84" y="40">z</text><text class="h3-zzz" x="94" y="28">Z</text><path class="h3-spark" d="M100 16l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#fff"/>';
  }
  function iconSvg(code, night){
    const u = ++uid; let body = '', wm = 'sun';
    const c = Number(code);
    if (c === 0 || c === 1) body = night ? moon(u) : sun(u, 60, 60, 1, true);
    else if (c === 2) body = (night ? moon(u).replace(/^/, '') : sun(u, 44, 46, .62, true)) + cloud(u, false, 8, 12, .92);
    else if (c === 3) body = cloud(u, false, 0, 0, 1.1);
    else if (c === 45 || c === 48) body = cloud(u, false, 0, -8, 1) + '<rect class="h3-fog" x="26" y="88" width="62" height="7" rx="3.5" fill="#cbd6e4"/><rect class="h3-fog" x="36" y="100" width="62" height="7" rx="3.5" fill="#b9c7d8"/>';
    else if (c >= 71 && c <= 77 || c === 85 || c === 86) body = cloud(u, false, 0, -8, 1) + flakes();
    else if (c >= 95) body = cloud(u, true, 0, -8, 1) + '<polygon class="h3-bolt" points="64,76 50,100 62,100 55,120 80,92 67,92 76,76" fill="url(#bg' + u + ')" stroke="#fff2a0" stroke-width="1"/>';
    else if (c >= 51) body = cloud(u, c >= 63 && c !== 80, 0, -8, 1) + drops(c >= 65 ? 4 : 3, 86, '#4aa3ff');
    else body = cloud(u, false, 0, 0, 1.1);
    return '<svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true">' + defs(u) + '<ellipse cx="60" cy="116" rx="30" ry="5" fill="#000" opacity=".16"/><g class="h3-float">' + body + '</g></svg>';
  }
  function tiltOn(host, el, max){
    host.addEventListener('pointermove', function(e){
      const r = host.getBoundingClientRect(), dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      el.style.transform = 'rotateY(' + (Math.max(-1, Math.min(1, dx)) * max).toFixed(1) + 'deg) rotateX(' + (-Math.max(-1, Math.min(1, dy)) * max).toFixed(1) + 'deg)';
    });
    host.addEventListener('pointerleave', function(){ el.style.transform = ''; });
  }
  function weather(el, code, temp, tz){
    addStyle(); if (!el) return;
    const hr = Number(new Date().toLocaleString('en-US', { timeZone: tz || 'Asia/Bahrain', hour: 'numeric', hour12: false })) % 24, night = hr >= 18 || hr < 5;
    el.innerHTML = '<div class="h3-wrap" title="Tap me">' + iconSvg(code, night) + '</div>';
    const w = el.firstChild; let t = null;
    w.addEventListener('click', function(){ w.classList.remove('go'); void w.offsetWidth; w.classList.add('go'); clearTimeout(t); t = setTimeout(function(){ w.classList.remove('go'); }, 2300); });
    const panel = el.closest('.weather-panel') || el;
    if (!panel._h3) { panel._h3 = true; tiltOn(panel, w, 14); }
  }

  // ---------------------------------------------------------------- 3D analog clock
  function initClock(panel){
    addStyle(); if (!panel || panel._h3) return; panel._h3 = true;
    const kids = Array.from(panel.children), txt = document.createElement('div'); txt.className = 'cp-text';
    kids.forEach(function(k){ txt.appendChild(k); }); panel.appendChild(txt);
    const holder = document.createElement('div'); holder.className = 'cp-clock'; panel.appendChild(holder);
    const u = ++uid; let ticks = '';
    for (let i = 0; i < 60; i++) { const big = i % 5 === 0; ticks += '<rect x="' + (big ? 74 : 74.6) + '" y="' + (big ? 12 : 12) + '" width="' + (big ? 3 : 1.4) + '" height="' + (big ? 11 : 5) + '" rx="1" fill="' + (big ? '#3a1420' : '#a98a8f') + '" transform="rotate(' + (i * 6) + ' 75.5 75)"/>'; }
    holder.innerHTML = '<div class="h3-wrap h3-clock" title="Tap me"><svg viewBox="0 0 150 150">' +
      '<defs><linearGradient id="bz' + u + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".35" stop-color="#e2b04d"/><stop offset=".7" stop-color="#a8741e"/><stop offset="1" stop-color="#f2cf7a"/></linearGradient>' +
      '<radialGradient id="fc' + u + '" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#fffdfb"/><stop offset="1" stop-color="#efdfe0"/></radialGradient>' +
      '<linearGradient id="gl' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".65"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
      '<ellipse cx="75" cy="144" rx="46" ry="5" fill="#000" opacity=".3"/>' +
      '<circle cx="75" cy="75" r="68" fill="url(#bz' + u + ')"/><circle cx="75" cy="75" r="60" fill="#7d5819"/><circle cx="75" cy="75" r="57" fill="url(#fc' + u + ')"/>' + ticks +
      '<text x="75" y="48" text-anchor="middle" font-family="Fraunces,serif" font-weight="700" font-size="9" fill="#9e2f4a" letter-spacing="1.5">LALABELLA</text>' +
      '<g id="hh' + u + '"><path d="M75 78V42" stroke="#3a1420" stroke-width="5.5" stroke-linecap="round"/></g>' +
      '<g id="mm' + u + '"><path d="M75 80V28" stroke="#5c1a28" stroke-width="3.8" stroke-linecap="round"/></g>' +
      '<g id="ss' + u + '"><path d="M75 88V24" stroke="#d94a3a" stroke-width="1.6" stroke-linecap="round"/><circle cx="75" cy="75" r="3" fill="#d94a3a"/></g>' +
      '<circle cx="75" cy="75" r="4.5" fill="#d9a441" stroke="#7d5819" stroke-width="1.2"/>' +
      '<path d="M22 60A58 58 0 0 1 128 52L128 40A66 66 0 0 0 20 56Z" fill="url(#gl' + u + ')" opacity=".55"/></svg></div>';
    const w = holder.firstChild, hh = holder.querySelector('#hh' + u), mm = holder.querySelector('#mm' + u), ss = holder.querySelector('#ss' + u);
    let spin = 0, spinStart = 0;
    function frame(ts){
      const d = new Date(Date.now() + 0), p = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Bahrain' }));
      const ms = d.getMilliseconds(), s = p.getSeconds() + ms / 1000, m = p.getMinutes() + s / 60, h = (p.getHours() % 12) + m / 60;
      let extra = 0; if (spin) { const k = Math.min(1, (ts - spinStart) / 1700), e = 1 - Math.pow(1 - k, 3); extra = e * 1080; if (k >= 1) spin = 0; }
      hh.setAttribute('transform', 'rotate(' + (h * 30 + extra / 12) + ' 75 75)');
      mm.setAttribute('transform', 'rotate(' + (m * 6 + extra) + ' 75 75)');
      ss.setAttribute('transform', 'rotate(' + (s * 6 + extra * 3) + ' 75 75)');
      if (!document.hidden) requestAnimationFrame(frame); else setTimeout(function(){ requestAnimationFrame(frame); }, 1000);
    }
    requestAnimationFrame(frame);
    w.addEventListener('click', function(ev){ ev.stopPropagation(); spin = 1; spinStart = performance.now(); w.classList.remove('go'); void w.offsetWidth; w.classList.add('go'); setTimeout(function(){ w.classList.remove('go'); }, 1000); });
    tiltOn(panel, holder, 22);
    panel.addEventListener('pointermove', function(e){ const r = panel.getBoundingClientRect(), dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2); txt.style.transform = 'rotateY(' + (dx * 6).toFixed(1) + 'deg) rotateX(' + (-dy * 4).toFixed(1) + 'deg)'; });
    panel.addEventListener('pointerleave', function(){ txt.style.transform = ''; });
  }
  window.LBHero3D = { initClock: initClock, weather: weather };
})();
