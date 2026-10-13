/* ==========================================================
   LALABELLA STAFF CHAT — TEAM STATUS (like Messenger stories)
   Shows who posted a status (from My Profile) as a ring around their
   picture in the chat, plus a "Team Status" strip you can tap to watch.
   Reads the same statuses as profile.html (profile-fast `statusList`).

   lbChatStatus.mount(stripEl, onChange)  fill stripEl with the Team Status row
   lbChatStatus.decorate(avatarEl, userId) add the ring (if that person has a status) and make it tappable
   lbChatStatus.refresh()
   ========================================================== */
(function(){
  if (window.lbChatStatus) return;
  var SEEN_KEY = 'lbStatusSeen';
  var data = { me: null, statuses: [] }, groups = [], strips = [], listeners = [], cache = {}, loading = false, timer = null;

  function token(){ return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; }
  function bases(){ var a = LB_CONFIG.PROFILE_FAST_API || LB_CONFIG.AUTH_FAST_API, b = LB_CONFIG.AUTH_FAST_API; return a === b ? [a] : [a, b]; }
  async function get(action, extra){
    var q = new URLSearchParams(Object.assign({ action: action, token: token(), _ts: Date.now() }, extra || {}));
    var list = bases(), last;
    for (var i = 0; i < list.length; i++) {
      try {
        var r = await fetch(list[i] + '?' + q.toString(), { headers: { apikey: LB_CONFIG.SUPABASE_PUBLISHABLE_KEY } });
        if ((r.status >= 500 || r.status === 404) && i < list.length - 1) { last = new Error('HTTP ' + r.status); continue; }
        return await r.json();
      } catch (e) { last = e; }
    }
    throw last;
  }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function initials(n){ return String(n || '?').trim().split(/\s+/).slice(0, 2).map(function(w){ return w[0]; }).join('').toUpperCase(); }
  function ago(iso){ var m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + 'm' : Math.floor(m / 60) + 'h'; }
  var COLORS = ['#2f6570', '#c9506b', '#b07d2b', '#5f8f63', '#7a5a9e', '#3d6fa3'];
  function color(id){ return COLORS[Math.abs(Number(id) || 0) % COLORS.length]; }

  function seenList(){ try { var s = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); return Array.isArray(s) ? s : []; } catch (e) { return []; } }
  function markSeen(id){ var s = seenList(); if (s.indexOf(id) === -1) { s.push(id); try { localStorage.setItem(SEEN_KEY, JSON.stringify(s.slice(-400))); } catch (e) {} } }

  function build(){
    var by = {};
    (data.statuses || []).forEach(function(st){
      (by[st.userId] = by[st.userId] || { userId: st.userId, name: st.name, mine: st.mine, items: [] }).items.push(st);
    });
    var seen = seenList();
    var list = Object.keys(by).map(function(k){ return by[k]; });
    list.forEach(function(g){ g.allSeen = g.items.every(function(i){ return seen.indexOf(i.id) !== -1; }); g.latest = g.items[g.items.length - 1]; });
    var mine = list.filter(function(g){ return g.mine; });
    var others = list.filter(function(g){ return !g.mine; }).sort(function(a, b){ return (a.allSeen - b.allSeen) || (new Date(b.latest.createdAt) - new Date(a.latest.createdAt)); });
    groups = mine.concat(others);
  }
  function groupOf(uid){ for (var i = 0; i < groups.length; i++) if (String(groups[i].userId) === String(uid)) return groups[i]; return null; }

  // ---------- styles ----------
  var st = document.createElement('style');
  st.textContent =
    '.lbs-strip{display:flex;gap:10px;overflow-x:auto;padding:8px 10px 6px;scrollbar-width:none;}.lbs-strip::-webkit-scrollbar{display:none;}' +
    '.lbs-strip.empty{display:none;}' +
    '.lbs-item{flex:0 0 auto;width:56px;text-align:center;border:0;background:none;cursor:pointer;padding:0;font-family:inherit;}' +
    '.lbs-ring{width:50px;height:50px;border-radius:50%;padding:2.5px;margin:0 auto;background:linear-gradient(135deg,#f6a5b7,#c9506b,#e8b44d);display:flex;}' +
    '.lbs-ring.seen{background:#d9cfd2;}.lbs-ring.none{background:none;border:2px dashed #d9b9c2;padding:2px;}' +
    '.lbs-face{flex:1;border-radius:50%;border:2px solid #fff;background-size:cover;background-position:center;color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;overflow:hidden;}' +
    '.lbs-nm{font-size:10.5px;color:#6b5a5f;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.lbs-head{font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#8a7078;padding:8px 12px 0;}' +
    '.av.lbs-has,.lbcb-av.lbs-has{box-shadow:0 0 0 2px #fff,0 0 0 4.5px #c9506b;cursor:pointer;}' +
    '.av.lbs-has.lbs-seen,.lbcb-av.lbs-has.lbs-seen{box-shadow:0 0 0 2px #fff,0 0 0 4.5px #d0c4c8;}' +
    '.lbsv{position:fixed;inset:0;z-index:100001;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:inherit;}' +
    '.lbsv-bars{position:absolute;top:10px;left:10px;right:10px;display:flex;gap:4px;z-index:2;}' +
    '.lbsv-bars i{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.35);overflow:hidden;display:block;}' +
    '.lbsv-bars i b{display:block;height:100%;width:0;background:#fff;}' +
    '.lbsv-top{position:absolute;top:22px;left:12px;right:12px;display:flex;align-items:center;gap:10px;z-index:2;font-size:14px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.6);}' +
    '.lbsv-top small{font-weight:400;opacity:.85;}' +
    '.lbsv-x{margin-left:auto;border:0;background:none;color:#fff;font-size:28px;line-height:1;cursor:pointer;}' +
    '.lbsv-body{position:relative;width:min(100vw,460px);height:100%;max-height:100vh;display:flex;align-items:center;justify-content:center;}' +
    '.lbsv-body img,.lbsv-body video{max-width:100%;max-height:100%;object-fit:contain;}' +
    '.lbsv-text{padding:40px 28px;font-size:26px;font-weight:700;text-align:center;line-height:1.3;word-break:break-word;}' +
    '.lbsv-cap{position:absolute;left:0;right:0;bottom:24px;text-align:center;padding:0 24px;font-size:15px;text-shadow:0 1px 4px rgba(0,0,0,.8);}' +
    '.lbsv-tap{position:absolute;top:60px;bottom:0;width:35%;z-index:1;}.lbsv-tap.l{left:0;}.lbsv-tap.r{right:0;}';
  document.head.appendChild(st);

  // ---------- strip ----------
  function faceStyle(g){
    var t = g.latest && g.latest.thumb;
    return t ? 'background-image:url(\'' + esc(t) + '\')' : 'background:' + esc((g.latest && g.latest.bg) || color(g.userId));
  }
  function renderStrip(el){
    var mineG = groups.filter(function(g){ return g.mine; })[0];
    var others = groups.filter(function(g){ return !g.mine; });
    if (!others.length && !mineG) { el.className = 'lbs-strip empty'; el.innerHTML = ''; return; }
    el.className = 'lbs-strip';
    var meName = (data.me && data.me.name) || 'Me';
    var h = '<button type="button" class="lbs-item" data-my="1" title="' + (mineG ? 'View my status' : 'Add a status in My Profile') + '">' +
      '<div class="lbs-ring ' + (mineG ? '' : 'none') + '"><div class="lbs-face" style="' + (mineG ? faceStyle(mineG) : 'background:#f3e3e7;color:#c9506b;font-size:22px') + '">' + (mineG ? esc(mineG.latest.thumb ? '' : initials(meName)) : '+') + '</div></div>' +
      '<div class="lbs-nm">My status</div></button>';
    others.forEach(function(g){
      h += '<button type="button" class="lbs-item" data-user="' + esc(g.userId) + '">' +
        '<div class="lbs-ring ' + (g.allSeen ? 'seen' : '') + '"><div class="lbs-face" style="' + faceStyle(g) + '">' + (g.latest.thumb ? '' : esc(initials(g.name))) + '</div></div>' +
        '<div class="lbs-nm">' + esc(String(g.name).split(' ')[0]) + '</div></button>';
    });
    el.innerHTML = h;
  }
  function paint(){
    build();
    strips.forEach(renderStrip);
    listeners.forEach(function(f){ try { f(); } catch (e) {} });
  }
  async function refresh(){
    if (loading || !token()) return;
    loading = true;
    try {
      var d = await get('statusList');
      if (d && d.success) { data = d; paint(); }
    } catch (e) {}
    loading = false;
  }

  function mount(el, onChange){
    if (!el) return;
    if (strips.indexOf(el) === -1) strips.push(el);
    if (onChange && listeners.indexOf(onChange) === -1) listeners.push(onChange);
    el.className = 'lbs-strip empty';
    el.addEventListener('click', function(ev){
      var b = ev.target.closest('.lbs-item'); if (!b) return;
      if (b.dataset.my) {
        var mg = groups.filter(function(g){ return g.mine; })[0];
        if (mg) openViewer(groups.indexOf(mg)); else location.href = 'profile.html';
        return;
      }
      var g = groupOf(b.dataset.user); if (g) openViewer(groups.indexOf(g));
    });
    if (!timer) {
      timer = setInterval(function(){ if (!document.hidden) refresh(); }, 90000);
      document.addEventListener('visibilitychange', function(){ if (!document.hidden) refresh(); });
    }
    refresh();
  }

  // ring on avatars
  function decorate(el, userId){
    var g = groupOf(userId);
    if (!g || !el) return el;
    el.classList.add('lbs-has'); if (g.allSeen) el.classList.add('lbs-seen');
    el.title = 'View status';
    el.addEventListener('click', function(ev){ ev.stopPropagation(); var gg = groupOf(userId); if (gg) openViewer(groups.indexOf(gg)); });
    return el;
  }

  // ---------- viewer ----------
  function openViewer(startGroup){
    var gi = startGroup, si = 0, closed = false, tick = null, vid = null;
    var root = document.createElement('div'); root.className = 'lbsv';
    root.innerHTML = '<div class="lbsv-bars"></div><div class="lbsv-top"><span class="who"></span><button class="lbsv-x" aria-label="Close">×</button></div>' +
      '<div class="lbsv-body"><div class="lbsv-tap l"></div><div class="lbsv-tap r"></div><div class="lbsv-media" style="display:contents"></div></div>';
    document.body.appendChild(root);
    var bars = root.querySelector('.lbsv-bars'), who = root.querySelector('.who'), media = root.querySelector('.lbsv-media'), body = root.querySelector('.lbsv-body');

    function close(){ if (closed) return; closed = true; clearInterval(tick); if (vid) { try { vid.pause(); } catch (e) {} } root.remove(); document.removeEventListener('keydown', onKey); paint(); }
    function onKey(e){ if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev(); }
    document.addEventListener('keydown', onKey);
    root.querySelector('.lbsv-x').addEventListener('click', close);
    root.querySelector('.lbsv-tap.r').addEventListener('click', next);
    root.querySelector('.lbsv-tap.l').addEventListener('click', prev);

    function next(){ var g = groups[gi]; if (si < g.items.length - 1) { si++; show(); } else if (gi < groups.length - 1 && !g.mine) { gi++; si = 0; show(); } else close(); }
    function prev(){ if (si > 0) { si--; show(); } else if (gi > 0 && !groups[gi - 1].mine) { gi--; si = groups[gi].items.length - 1; show(); } else show(); }

    function show(){
      clearInterval(tick); vid = null;
      var g = groups[gi], it = g.items[si]; if (!it) return close();
      markSeen(it.id); g.allSeen = g.items.every(function(i){ return seenList().indexOf(i.id) !== -1; });
      who.innerHTML = esc(g.mine ? 'My status' : g.name) + ' <small>' + esc(ago(it.createdAt)) + '</small>';
      bars.innerHTML = g.items.map(function(_, k){ return '<i><b style="width:' + (k < si ? '100' : '0') + '%"></b></i>'; }).join('');
      var fill = bars.children[si].firstChild, dur = 6000, t0 = null;
      function run(ms){ dur = ms; t0 = Date.now(); clearInterval(tick); tick = setInterval(function(){ var p = Math.min(1, (Date.now() - t0) / dur); fill.style.width = (p * 100) + '%'; if (p >= 1) { clearInterval(tick); next(); } }, 50); }
      body.style.background = '';
      media.innerHTML = '';
      if (it.hasImage) {
        var wait = document.createElement('div'); wait.className = 'lbsv-text'; wait.style.opacity = '.6'; wait.textContent = '…'; media.appendChild(wait);
        var mine = it.id;
        (cache[it.id] ? Promise.resolve({ success: true, image: cache[it.id] }) : get('statusImage', { id: it.id })).then(function(d){
          if (closed || groups[gi].items[si] !== it) return;
          if (!d || !d.success || !d.image) { media.innerHTML = '<div class="lbsv-text">Picture unavailable.</div>'; run(3000); return; }
          cache[it.id] = d.image; media.innerHTML = '';
          if (it.kind === 'video') {
            var v = document.createElement('video'); v.playsInline = true; v.autoplay = true; v.muted = false; v.src = d.image; media.appendChild(v); vid = v;
            v.onended = next; v.onerror = function(){ media.innerHTML = '<div class="lbsv-text">Could not play this video.</div>'; run(3000); };
            var pr = v.play(); if (pr && pr.catch) pr.catch(function(){ v.muted = true; v.play().catch(function(){}); });
            v.onloadedmetadata = function(){ clearInterval(tick); dur = (v.duration || 10) * 1000; };
            v.ontimeupdate = function(){ if (v.duration) fill.style.width = (v.currentTime / v.duration * 100) + '%'; };
          } else {
            var im = document.createElement('img'); im.alt = ''; im.onload = function(){ run(6000); }; im.onerror = function(){ run(3000); }; im.src = d.image; media.appendChild(im);
          }
          if (it.text) { var c = document.createElement('div'); c.className = 'lbsv-cap'; c.textContent = it.text; media.appendChild(c); }
        }).catch(function(){ media.innerHTML = '<div class="lbsv-text">Could not load.</div>'; run(3000); });
      } else {
        body.style.background = it.bg || '#2f6570';
        var tx = document.createElement('div'); tx.className = 'lbsv-text'; tx.textContent = it.text || ''; media.appendChild(tx);
        run(6000);
      }
    }
    show();
  }

  window.lbChatStatus = { mount: mount, decorate: decorate, refresh: refresh };
})();
