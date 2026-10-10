/* Lalabella — mini 3D weather scene for the collapsed weather bar in the drawer.
 * LBWxScene.apply(sceneEl, {code,t,w,h,night}) paints a layered, parallax "3D" scene that follows the live weather:
 *   sunny · clear night · partly/cloudy · rain · storm · snow / winter (cold) · + windy streaks · + humid mist.
 * Pure CSS (transform/opacity only). Pointer (or finger) movement over the bar shifts the layers by depth. */
(function () {
  if (window.LBWxScene) return;

  var css =
    '.wxs{position:absolute;inset:0;overflow:hidden;border-radius:inherit;pointer-events:none;--px:0;--py:0;transition:background .6s}' +
    '.wxs-rig{position:absolute;inset:-6px;transform:perspective(380px) rotateX(calc(var(--py)*-5deg)) rotateY(calc(var(--px)*6deg));transition:transform .18s ease-out}' +
    '.wxs-l{position:absolute;inset:0;transform:translate(calc(var(--px)*var(--d,1)*7px),calc(var(--py)*var(--d,1)*5px));transition:transform .18s ease-out}' +
    /* skies */
    '.wxs.sunny{background:linear-gradient(160deg,#3aa0ff 0%,#8ad0ff 55%,#ffd98a 100%)}' +
    '.wxs.hot{background:linear-gradient(160deg,#ff9a3c 0%,#ffc15a 55%,#ffe29a 100%)}' +
    '.wxs.night{background:linear-gradient(160deg,#0a1230 0%,#1b2a5c 60%,#3a3f7a 100%)}' +
    '.wxs.cloudy{background:linear-gradient(160deg,#6f8197 0%,#9fb0c2 60%,#c4d0dc 100%)}' +
    '.wxs.rain{background:linear-gradient(160deg,#3b4a5e 0%,#58708a 60%,#7f93a8 100%)}' +
    '.wxs.storm{background:linear-gradient(160deg,#1f2736 0%,#38445a 60%,#566379 100%)}' +
    '.wxs.snow{background:linear-gradient(160deg,#3f6fae 0%,#6d9ad0 55%,#a9c8ea 100%)}' +
    '.wxs.fog{background:linear-gradient(160deg,#8a97a3 0%,#b3bcc5 60%,#d4dade 100%)}' +
    /* sun */
    '.wxs-sun{position:absolute;right:46px;top:8px;width:38px;height:38px;border-radius:50%;background:radial-gradient(circle at 34% 30%,#fff7c2 0,#ffd54a 38%,#ff9f1c 78%,#e67e00 100%);box-shadow:inset -5px -6px 10px rgba(180,80,0,.45),0 0 18px 6px rgba(255,200,60,.65);animation:wxsPulse 3.4s ease-in-out infinite}' +
    '.wxs-rays{position:absolute;right:20px;top:-18px;width:90px;height:90px;border-radius:50%;background:repeating-conic-gradient(from 0deg,rgba(255,235,150,.55) 0 6deg,transparent 6deg 24deg);-webkit-mask:radial-gradient(circle,transparent 0 30%,#000 32%,transparent 70%);mask:radial-gradient(circle,transparent 0 30%,#000 32%,transparent 70%);animation:wxsSpin 22s linear infinite}' +
    '.wxs.hot .wxs-sun{box-shadow:inset -5px -6px 10px rgba(180,50,0,.5),0 0 26px 10px rgba(255,150,40,.8)}' +
    '@keyframes wxsPulse{50%{transform:scale(1.08)}}@keyframes wxsSpin{to{transform:rotate(360deg)}}' +
    '.wxs-shim{position:absolute;left:0;right:0;bottom:0;height:28px;background:repeating-linear-gradient(0deg,rgba(255,255,255,.14) 0 2px,transparent 2px 7px);animation:wxsShim 1.6s ease-in-out infinite;filter:blur(.6px)}' +
    '@keyframes wxsShim{0%,100%{transform:translateX(-2px) scaleX(1.01)}50%{transform:translateX(2px) scaleX(.99)}}' +
    /* moon + stars */
    '.wxs-moon{position:absolute;right:48px;top:10px;width:32px;height:32px;border-radius:50%;background:radial-gradient(circle at 34% 30%,#fffef0 0,#f2efd2 55%,#cfcaa4 100%);box-shadow:inset -7px -3px 0 0 rgba(10,18,48,.55),0 0 16px 4px rgba(220,225,255,.45)}' +
    '.wxs-star{position:absolute;width:2px;height:2px;border-radius:50%;background:#fff;animation:wxsTw 2.4s ease-in-out infinite}' +
    '@keyframes wxsTw{50%{opacity:.2;transform:scale(.6)}}' +
    /* clouds */
    '.wxs-cloud{position:absolute;height:16px;border-radius:12px;background:rgba(255,255,255,.92);box-shadow:inset 0 -3px 5px rgba(120,140,170,.35);animation:wxsDrift linear infinite}' +
    '.wxs-cloud:before,.wxs-cloud:after{content:"";position:absolute;background:inherit;border-radius:50%;box-shadow:inherit}' +
    '.wxs-cloud:before{width:18px;height:18px;left:8px;top:-9px}.wxs-cloud:after{width:24px;height:24px;left:22px;top:-13px}' +
    '.wxs.rain .wxs-cloud,.wxs.storm .wxs-cloud{background:rgba(90,105,125,.95)}.wxs.fog .wxs-cloud{background:rgba(235,238,242,.8)}' +
    '@keyframes wxsDrift{from{transform:translateX(-70px)}to{transform:translateX(380px)}}' +
    /* rain */
    '.wxs-drop{position:absolute;top:-12px;width:1.5px;height:11px;border-radius:2px;background:linear-gradient(transparent,rgba(190,225,255,.95));transform:rotate(12deg);animation:wxsRain linear infinite}' +
    '@keyframes wxsRain{to{transform:translate(-14px,90px) rotate(12deg)}}' +
    '.wxs-bolt{position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(255,255,255,.7);opacity:0;animation:wxsBolt 5s infinite}' +
    '@keyframes wxsBolt{0%,92%,100%{opacity:0}93%{opacity:.8}95%{opacity:.1}96%{opacity:.7}}' +
    /* snow */
    '.wxs-flake{position:absolute;top:-10px;border-radius:50%;background:#fff;box-shadow:0 0 4px rgba(255,255,255,.9);animation:wxsSnow linear infinite}' +
    '@keyframes wxsSnow{0%{transform:translate(0,-8px)}50%{transform:translate(8px,34px)}100%{transform:translate(-4px,84px)}}' +
    '.wxs-ice{position:absolute;left:-10px;right:-10px;bottom:-14px;height:26px;background:radial-gradient(ellipse at 20% 100%,#fff 0 40%,transparent 41%),radial-gradient(ellipse at 55% 110%,#f4faff 0 42%,transparent 43%),radial-gradient(ellipse at 90% 100%,#fff 0 40%,transparent 41%)}' +
    /* wind */
    '.wxs-wind{position:absolute;left:-70px;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,rgba(255,255,255,1),transparent);box-shadow:0 0 4px rgba(255,255,255,.6);animation:wxsWind linear infinite}' +
    '.wxs-wind:after{content:"";position:absolute;right:6px;top:-3px;width:8px;height:8px;border:2px solid rgba(255,255,255,.8);border-left-color:transparent;border-bottom-color:transparent;border-radius:50%}' +
    '@keyframes wxsWind{from{transform:translateX(0)}to{transform:translateX(470px)}}' +
    /* humid */
    '.wxs-mist{position:absolute;width:150px;height:60px;border-radius:50%;background:radial-gradient(ellipse,rgba(255,255,255,.55),transparent 70%);filter:blur(5px);animation:wxsMist ease-in-out infinite alternate}' +
    '@keyframes wxsMist{from{transform:translateX(-30px)}to{transform:translateX(70px)}}' +
    '.wxs-bead{position:absolute;width:5px;height:7px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:radial-gradient(circle at 35% 30%,#fff,rgba(200,235,255,.7) 60%,rgba(120,180,230,.5));animation:wxsBead ease-in infinite}' +
    '@keyframes wxsBead{0%{transform:translateY(0) scale(.6);opacity:0}15%{opacity:1;transform:translateY(0) scale(1)}100%{transform:translateY(46px);opacity:.1}}' +
    '@media (prefers-reduced-motion:reduce){.wxs *{animation:none!important}}';

  function injectCss() {
    if (document.getElementById('wxs-css')) return;
    var st = document.createElement('style'); st.id = 'wxs-css'; st.textContent = css; document.head.appendChild(st);
  }
  function r(i, a, b) { var x = Math.sin(i * 12.9898 + 4.1414) * 43758.5453; x = x - Math.floor(x); return a + x * (b - a); } // deterministic pseudo-random

  function layer(d, inner) { return '<div class="wxs-l" style="--d:' + d + '">' + inner + '</div>'; }
  function clouds(n, dark) {
    var h = '';
    for (var i = 0; i < n; i++) h += '<div class="wxs-cloud" style="top:' + r(i, 4, 30) + 'px;width:' + r(i + 9, 40, 62) + 'px;animation-duration:' + r(i + 3, 26, 46) + 's;animation-delay:-' + r(i + 5, 0, 30) + 's;opacity:' + (dark ? 1 : r(i, .75, 1)) + '"></div>';
    return h;
  }

  function classify(o) {
    var c = Number(o.code), t = Number(o.t), w = Number(o.w) || 0, hu = Number(o.h) || 0;
    var snow = (c >= 71 && c <= 77) || c === 85 || c === 86;
    var storm = c >= 95;
    var rain = (c >= 51 && c <= 67) || (c >= 80 && c <= 82);
    var fog = c === 45 || c === 48;
    var cold = t <= 12;
    var base;
    if (storm) base = 'storm'; else if (snow || (cold && !rain)) base = 'snow'; else if (rain) base = 'rain'; else if (fog) base = 'fog';
    else if (c === 3 || c === 2) base = 'cloudy'; else if (o.night) base = 'night'; else base = (t >= 38 ? 'hot' : 'sunny');
    return { base: base, windy: w >= 25, humid: hu >= 70 && base !== 'rain' && base !== 'storm', code: c, snowy: snow || (cold && !rain), partly: c === 1 || c === 2, hot: t >= 38 };
  }

  function build(k, o) {
    var h = '';
    var b = k.base;
    if (b === 'sunny' || b === 'hot') {
      h += layer(.4, '<div class="wxs-rays"></div>') + layer(1, '<div class="wxs-sun"></div>');
      if (k.partly) h += layer(1.6, clouds(2));
      if (b === 'hot') h += '<div class="wxs-shim"></div>';
    } else if (b === 'night') {
      var s = ''; for (var i = 0; i < 16; i++) s += '<i class="wxs-star" style="left:' + r(i, 2, 96) + '%;top:' + r(i + 2, 4, 70) + '%;animation-delay:-' + r(i, 0, 2.4) + 's"></i>';
      h += layer(.3, s) + layer(1, '<div class="wxs-moon"></div>');
      if (k.partly) h += layer(1.6, clouds(2));
    } else if (b === 'cloudy' || b === 'fog') {
      h += layer(.6, clouds(2)) + layer(1.5, clouds(3));
    } else if (b === 'rain' || b === 'storm') {
      var dr = ''; for (var j = 0; j < 22; j++) dr += '<i class="wxs-drop" style="left:' + r(j, 0, 100) + '%;animation-duration:' + r(j + 1, .55, .95) + 's;animation-delay:-' + r(j, 0, 1) + 's"></i>';
      h += layer(.6, clouds(3, true)) + layer(1.2, dr);
      if (b === 'storm') h += '<div class="wxs-bolt"></div>';
    } else if (b === 'snow') {
      var f1 = '', f2 = ''; for (var q = 0; q < 26; q++) { var z = r(q + 4, 1.5, 4.5); var fl = '<i class="wxs-flake" style="left:' + r(q, 0, 100) + '%;width:' + z + 'px;height:' + z + 'px;opacity:' + (0.5 + z / 9) + ';animation-duration:' + r(q + 2, 3, 6.5) + 's;animation-delay:-' + r(q, 0, 6) + 's"></i>'; if (z > 3) f2 += fl; else f1 += fl; }
      h += layer(.5, f1) + layer(1.6, f2) + '<div class="wxs-ice"></div>';
    }
    if (k.windy) {
      var wi = '', n = k.windy && Number(o.w) >= 40 ? 7 : 4, sp = Number(o.w) >= 40 ? 1.1 : 2.2;
      for (var m = 0; m < n; m++) wi += '<i class="wxs-wind" style="top:' + r(m + 7, 8, 88) + '%;width:' + r(m, 40, 90) + 'px;animation-duration:' + (sp + r(m, 0, 1.2)) + 's;animation-delay:-' + r(m + 3, 0, 2) + 's"></i>';
      h += layer(1.8, wi);
    }
    if (k.humid) {
      var mi = '', bd = '';
      for (var a = 0; a < 3; a++) mi += '<i class="wxs-mist" style="left:' + (a * 38 - 10) + '%;top:' + r(a, 20, 60) + '%;animation-duration:' + r(a + 2, 6, 11) + 's"></i>';
      for (var c2 = 0; c2 < 6; c2++) bd += '<i class="wxs-bead" style="left:' + r(c2 + 5, 4, 94) + '%;top:' + r(c2, 4, 40) + '%;animation-duration:' + r(c2 + 1, 2.4, 4.2) + 's;animation-delay:-' + r(c2, 0, 3) + 's"></i>';
      h += layer(1.1, mi) + layer(1.9, bd);
    }
    return h;
  }

  function apply(el, o) {
    if (!el || !o) return null;
    injectCss();
    var k = classify(o);
    var key = [k.base, k.windy ? 'w' : '', k.humid ? 'h' : '', k.partly ? 'p' : '', o.night ? 'n' : 'd'].join('|');
    if (el.getAttribute('data-wxk') !== key) {
      el.setAttribute('data-wxk', key);
      el.className = 'wxs ' + k.base;
      el.innerHTML = '<div class="wxs-rig">' + build(k, o) + '</div>';
    }
    return k;
  }
  // pointer / touch parallax on a host element
  function tilt(host, el) {
    if (!host || host.__wxsTilt) return; host.__wxsTilt = 1;
    function mv(e) { var b = host.getBoundingClientRect(), p = e.touches ? e.touches[0] : e; el.style.setProperty('--px', ((p.clientX - b.left) / b.width - .5).toFixed(3)); el.style.setProperty('--py', ((p.clientY - b.top) / b.height - .5).toFixed(3)); }
    function lv() { el.style.setProperty('--px', 0); el.style.setProperty('--py', 0); }
    host.addEventListener('pointermove', mv); host.addEventListener('pointerleave', lv); host.addEventListener('touchmove', mv, { passive: true }); host.addEventListener('touchend', lv);
  }
  var LABEL = { sunny: 'Sunny', hot: 'Hot & sunny', night: 'Clear night', cloudy: 'Cloudy', rain: 'Rain', storm: 'Thunderstorm', snow: 'Cold / snow', fog: 'Foggy' };
  window.LBWxScene = { apply: apply, tilt: tilt, classify: classify, label: function (k) { return LABEL[k.base] || ''; } };
})();
