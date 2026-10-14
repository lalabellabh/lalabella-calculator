/* Lalabella Team group: its picture + name (everyone sees it, only an admin can change it).
   lbChatTeam.info            -> { photo, name }
   lbChatTeam.load(cb)        -> fetches from chatx, then runs cb (also on later changes)
   lbChatTeam.iconStyle()     -> inline style string for an avatar circle (photo or '')
   lbChatTeam.edit(onDone)    -> admin editor (picture adjust + name)                       */
(function(){
  var info = { photo: '', name: 'Lalabella Team' }, subs = [], loaded = false;
  function token(){ return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; }
  function api(action, params){
    var url = String(LB_CONFIG.CHAT_API || '').replace(/\/chat$/, '/chatx');
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: LB_CONFIG.SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify(Object.assign({}, params || {}, { action: action, token: token() })) }).then(function(r){ return r.json(); });
  }
  try { var c = JSON.parse(localStorage.getItem('lbTeamProfile') || 'null'); if (c && typeof c === 'object') { info = { photo: c.photo || '', name: c.name || info.name }; } } catch (e) {}
  function notify(){ subs.forEach(function(f){ try { f(info); } catch (e) {} }); }
  function load(cb){
    if (cb) { subs.push(cb); if (loaded) { try { cb(info); } catch (e) {} } }
    return api('teamGet').then(function(d){
      if (!d || !d.success) return;
      var changed = d.photo !== info.photo || d.name !== info.name;
      info = { photo: d.photo || '', name: d.name || 'Lalabella Team' }; loaded = true;
      try { localStorage.setItem('lbTeamProfile', JSON.stringify(info)); } catch (e) {}
      if (changed || cb) notify();
    }).catch(function(){});
  }
  function iconStyle(){
    return info.photo ? 'background:url(' + info.photo + ') center/cover no-repeat;color:transparent;font-size:0;' : '';
  }

  // ---------- editor ----------
  var CSS = '.lbt-back{position:fixed;inset:0;z-index:100001;background:rgba(20,28,30,.55);display:flex;align-items:center;justify-content:center;padding:16px;}' +
    '.lbt-box{background:#fff;border-radius:16px;width:min(340px,100%);padding:18px;box-shadow:0 24px 60px rgba(0,0,0,.3);font-family:inherit;color:#3a2a2e;}' +
    '.lbt-box h4{margin:0 0 12px;font-size:16px;display:flex;justify-content:space-between;align-items:center;}' +
    '.lbt-box h4 button{border:0;background:none;font-size:16px;cursor:pointer;}' +
    '.lbt-stage{position:relative;width:240px;height:240px;margin:0 auto 10px;border-radius:12px;overflow:hidden;background:#eee;touch-action:none;cursor:grab;}' +
    '.lbt-stage img{position:absolute;left:0;top:0;max-width:none;user-select:none;-webkit-user-drag:none;pointer-events:none;}' +
    '.lbt-mask{position:absolute;inset:0;pointer-events:none;border-radius:50%;box-shadow:0 0 0 400px rgba(20,28,30,.55);border:2px solid rgba(255,255,255,.9);}' +
    '.lbt-empty{display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:13px;text-align:center;padding:0 20px;}' +
    '.lbt-pad{display:grid;grid-template-columns:repeat(3,40px);grid-template-rows:repeat(2,34px);gap:6px;justify-content:center;margin:0 0 8px;}' +
    '.lbt-pad button,.lbt-row button{border:0;border-radius:10px;background:#fbe9ec;color:#9e2f4a;font-weight:700;cursor:pointer;font-family:inherit;}' +
    '.lbt-pad .u{grid-column:2;grid-row:1}.lbt-pad .l{grid-column:1;grid-row:2}.lbt-pad .d{grid-column:2;grid-row:2}.lbt-pad .r{grid-column:3;grid-row:2}' +
    '.lbt-row{display:flex;gap:8px;align-items:center;margin-bottom:8px;}.lbt-row input[type=range]{flex:1;accent-color:#c9506b;}' +
    '.lbt-row button{padding:9px 12px;font-size:13px;}' +
    '.lbt-name{width:100%;box-sizing:border-box;border:1px solid #ecd5d5;border-radius:10px;padding:9px 11px;font:inherit;font-size:14px;margin-bottom:10px;}' +
    '.lbt-act{display:flex;gap:8px;}.lbt-act button{flex:1;border:0;border-radius:10px;padding:11px;font:inherit;font-weight:700;font-size:13px;cursor:pointer;background:#fbe9ec;color:#9e2f4a;}' +
    '.lbt-act .ok{background:#c9506b;color:#fff;}.lbt-act button:disabled{opacity:.55;}.lbt-msg{font-size:12px;color:#b23a3a;min-height:16px;margin-top:6px;text-align:center;}';
  function injectCss(){ if (document.getElementById('lbt-css')) return; var s = document.createElement('style'); s.id = 'lbt-css'; s.textContent = CSS; document.head.appendChild(s); }

  function edit(onDone){
    injectCss();
    var back = document.createElement('div'); back.className = 'lbt-back';
    back.innerHTML = '<div class="lbt-box" role="dialog" aria-modal="true"><h4>Team group <button type="button" data-x aria-label="Close">✕</button></h4>' +
      '<div class="lbt-stage" id="lbtStage"><div class="lbt-empty" id="lbtEmpty">Tap “Choose picture”</div></div>' +
      '<div class="lbt-pad" id="lbtPad"><button type="button" class="u" data-d="u">▲</button><button type="button" class="l" data-d="l">◀</button><button type="button" class="d" data-d="d">▼</button><button type="button" class="r" data-d="r">▶</button></div>' +
      '<div class="lbt-row"><span>🔍</span><input type="range" id="lbtZoom" min="100" max="300" value="100"><button type="button" id="lbtPick">📷 Choose picture</button></div>' +
      '<input class="lbt-name" id="lbtName" maxlength="40" placeholder="Group name">' +
      '<div class="lbt-act"><button type="button" data-x>Cancel</button><button type="button" id="lbtReset">Remove picture</button><button type="button" class="ok" id="lbtOk">Save</button></div>' +
      '<div class="lbt-msg" id="lbtMsg"></div></div>';
    document.body.appendChild(back);
    var $ = function(id){ return back.querySelector('#' + id); };
    var stage = $('lbtStage'), nameEl = $('lbtName'), msg = $('lbtMsg'), zoom = $('lbtZoom');
    nameEl.value = info.name;
    var S = 240, img = null, im = null, nw = 0, nh = 0, base = 1, sc = 1, ox = 0, oy = 0, changed = false, reset = false;
    function clamp(){ var s = base * sc; ox = Math.min(0, Math.max(S - nw * s, ox)); oy = Math.min(0, Math.max(S - nh * s, oy)); }
    function apply(){ if (!im) return; clamp(); var s = base * sc; im.style.width = nw * s + 'px'; im.style.height = nh * s + 'px'; im.style.transform = 'translate(' + ox + 'px,' + oy + 'px)'; }
    function show(src, image){
      img = image; nw = image.naturalWidth || image.width; nh = image.naturalHeight || image.height;
      base = Math.max(S / nw, S / nh); sc = 1; zoom.value = 100; ox = (S - nw * base) / 2; oy = (S - nh * base) / 2;
      stage.innerHTML = ''; im = document.createElement('img'); im.src = src; stage.appendChild(im);
      var m = document.createElement('div'); m.className = 'lbt-mask'; stage.appendChild(m); apply();
    }
    if (info.photo) { var cur = new Image(); cur.onload = function(){ show(info.photo, cur); }; cur.src = info.photo; }
    function close(){ back.remove(); }
    back.addEventListener('click', function(e){ if (e.target === back || e.target.closest('[data-x]')) close(); });
    $('lbtPick').addEventListener('click', function(){
      var f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*';
      f.onchange = function(){
        var file = f.files && f.files[0]; if (!file) return;
        var rd = new FileReader();
        rd.onload = function(){ var i2 = new Image(); i2.onload = function(){ show(rd.result, i2); changed = true; reset = false; msg.textContent = ''; };
          i2.onerror = function(){ msg.textContent = 'Could not read that picture.'; }; i2.src = rd.result; };
        rd.readAsDataURL(file);
      };
      f.click();
    });
    zoom.addEventListener('input', function(){
      if (!im) return; var cx = (S / 2 - ox) / (base * sc), cy = (S / 2 - oy) / (base * sc);
      sc = Number(zoom.value) / 100; ox = S / 2 - cx * base * sc; oy = S / 2 - cy * base * sc; changed = true; apply();
    });
    var drag = null;
    stage.addEventListener('pointerdown', function(e){ if (!im) return; drag = { x: e.clientX, y: e.clientY, ox: ox, oy: oy }; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', function(e){ if (!drag) return; ox = drag.ox + e.clientX - drag.x; oy = drag.oy + e.clientY - drag.y; changed = true; apply(); });
    stage.addEventListener('pointerup', function(){ drag = null; }); stage.addEventListener('pointercancel', function(){ drag = null; });
    $('lbtPad').addEventListener('click', function(e){
      var b = e.target.closest('button'); if (!b || !im) return; var k = b.dataset.d, st = 12;
      if (k === 'l') ox += st; if (k === 'r') ox -= st; if (k === 'u') oy += st; if (k === 'd') oy -= st; changed = true; apply();
    });
    $('lbtReset').addEventListener('click', function(){ stage.innerHTML = '<div class="lbt-empty">No picture — the rose icon will show</div>'; im = null; img = null; reset = true; changed = false; });
    $('lbtOk').addEventListener('click', async function(){
      var btn = $('lbtOk'); var nm = nameEl.value.replace(/\s+/g, ' ').trim();
      if (!nm) { msg.textContent = 'Please give the group a name.'; return; }
      var payload = { name: nm };
      if (reset) payload.photo = '';
      else if (im && changed) {
        var c = document.createElement('canvas'); c.width = c.height = 256; var ctx = c.getContext('2d'), s = base * sc, k = 256 / S;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 256, 256); ctx.drawImage(img, ox * k, oy * k, nw * s * k, nh * s * k);
        payload.photo = c.toDataURL('image/jpeg', 0.82);
      }
      btn.disabled = true; btn.textContent = 'Saving…'; msg.textContent = '';
      try {
        var d = await api('teamSet', payload);
        if (!d || !d.success) throw new Error((d && d.error) || 'Could not save.');
        info = { photo: payload.photo !== undefined ? payload.photo : info.photo, name: nm };
        try { localStorage.setItem('lbTeamProfile', JSON.stringify(info)); } catch (e) {}
        notify(); close(); if (onDone) onDone(info);
      } catch (err) { msg.textContent = err.message || 'Connection error.'; btn.disabled = false; btn.textContent = 'Save'; }
    });
  }

  window.lbChatTeam = { get info(){ return info; }, load: load, iconStyle: iconStyle, edit: edit };
})();
