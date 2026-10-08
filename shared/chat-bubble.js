/* ==========================================================
   LALABELLA STAFF CHAT — FLOATING BUBBLE
   Injected automatically by shared/nav.js on every page except
   chatbox.html (which is the full chat experience already).
   Self-contained — injects its own HTML/CSS, loads its own
   dependencies (shared/chat-live.js, shared/chat-sounds.js) if
   they aren't already on the page, no page markup needed.

   Also dispatches a window 'lb:chat-unread' CustomEvent with
   {detail:{total}} whenever the unread count changes, so nav.js
   can show a dot on the hamburger profile header without polling
   the chat backend a second time from a separate place.
   ========================================================== */
(function(){
  if (document.getElementById('lbcb-btn')) return; // already on the page

  // Pages that already have their own chat button at the top — no floating bubble here.
  // To add/remove a page, just edit this list (file name without .html).
  const HIDE_ON = ['index', 'flower-tools', 'item-inventory'];
  const page = (location.pathname.split('/').pop() || 'index').replace(/\.html?$/i, '') || 'index';
  if (HIDE_ON.indexOf(page.toLowerCase()) !== -1) return;

  function loadScriptOnce(src){
    return new Promise(function(resolve){
      const existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        if (window.lbChatApi && src.indexOf('chat-live') !== -1) return resolve();
        if (window.lbChatSound && src.indexOf('chat-sounds') !== -1) return resolve();
        if (window.lbChatAvatar && src.indexOf('chat-avatar') !== -1) return resolve();
        if (window.lbChatMedia && src.indexOf('chat-media') !== -1) return resolve();
        existing.addEventListener('load', resolve);
        existing.addEventListener('error', resolve);
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
  }

  Promise.all([
    loadScriptOnce('shared/chat-live.js'),
    loadScriptOnce('shared/chat-sounds.js'),
    loadScriptOnce('shared/chat-avatar.js'),
    loadScriptOnce('shared/chat-media.js')
  ]).then(init);

  function init(){
    if (!window.lbChatApi) return; // dependency failed to load — fail quietly, don't break the page

    // ---------- styles ----------
    const style = document.createElement('style');
    style.textContent = `
      #lbcb-btn{
        position:fixed; bottom:20px; left:20px; z-index:9499;
        width:48px; height:48px; border-radius:50%; border:none; cursor:pointer;
        background:linear-gradient(135deg,#f3b0bf,#c9506b); color:#fff; font-size:20px;
        display:flex; align-items:center; justify-content:center;
        box-shadow:0 8px 24px rgba(0,0,0,.3);
      }
      #lbcb-btn:active{ transform:scale(.94); }
      #lbcb-badge{
        position:absolute; top:-3px; right:-3px; min-width:19px; height:19px; padding:0 4px;
        border-radius:10px; background:#e03a3a; color:#fff; font-size:10.5px; font-weight:700;
        display:none; align-items:center; justify-content:center; border:2px solid #fff;
      }
      #lbcb-badge.show{ display:flex; }
      #lbcb-panel{
        position:fixed; bottom:80px; left:20px; z-index:9499;
        width:min(340px, calc(100vw - 32px)); height:min(480px, calc(100vh - 140px));
        background:#fff; border-radius:18px; box-shadow:0 16px 44px rgba(0,0,0,.3);
        display:none; flex-direction:column; overflow:hidden;
        font-family:'Space Grotesk',Arial,sans-serif;
      }
      #lbcb-panel.show{ display:flex; }
      #lbcb-head{
        background:linear-gradient(150deg,#3a1420,#5c1a28 55%,#7a2436); color:#fff;
        padding:12px 14px; display:flex; align-items:center; gap:8px;
      }
      #lbcb-back{ display:none; background:none; border:none; color:#fff; font-size:20px; cursor:pointer; padding:0 2px; opacity:.9; }
      #lbcb-back.show{ display:block; }
      #lbcb-head-title{ flex:1; min-width:0; }
      #lbcb-head-title b{ font-size:13.5px; display:block; }
      #lbcb-head-sub{ font-size:10.5px; opacity:.75; }
      #lbcb-openfull{ background:none; border:none; color:#fff; font-size:13px; cursor:pointer; opacity:.85; text-decoration:none; }
      #lbcb-openfull:hover{ opacity:1; }
      #lbcb-avatar{ background:none; border:none; color:#fff; font-size:14px; cursor:pointer; opacity:.85; padding:0 2px; }
      #lbcb-avatar:hover{ opacity:1; }
      .lbcb-ib{ width:30px; height:34px; border:0; background:none; font-size:17px; cursor:pointer; padding:0; flex:0 0 auto; }
      .lbcb-msg.bare{ background:none; border:none; padding:0; }
      .lbcb-msg.bare .t{ color:#8a7078; }
      .lbcb-msg.me .lbcm-vbtn{ background:rgba(255,255,255,.25); }
      .lbcb-msg.me .lbcm-vtrack{ background:rgba(255,255,255,.3); }
      #lbcb-close{ background:none; border:none; color:#fff; font-size:17px; cursor:pointer; opacity:.8; }
      #lbcb-close:hover{ opacity:1; }
      #lbcb-search{ padding:8px 10px; border-bottom:1px solid #f0dede; }
      #lbcb-search input{ width:100%; padding:7px 10px; border:1px solid #f0dede; border-radius:10px; font-size:12px; outline:none; background:#fdf1f0; font-family:inherit; }
      #lbcb-list{ flex:1; overflow-y:auto; padding:5px; }
      .lbcb-sep{ font-size:9px; letter-spacing:.1em; text-transform:uppercase; color:#8a7078; padding:8px 8px 3px; }
      .lbcb-empty{ font-size:10.5px; color:#8a7078; padding:2px 8px 8px; font-style:italic; }
      .lbcb-conv{ display:flex; align-items:center; gap:8px; padding:8px; border-radius:10px; cursor:pointer; }
      .lbcb-conv:hover{ background:#fdf1f0; }
      .lbcb-av{ position:relative; width:32px; height:32px; flex-shrink:0; border-radius:50%; background:linear-gradient(135deg,#f3b0bf,#c9506b); color:#fff; font-weight:700; font-size:11px; display:flex; align-items:center; justify-content:center; }
      .lbcb-av img{ width:100%; height:100%; object-fit:cover; border-radius:50%; display:block; }
      .lbcb-av .dot{ position:absolute; right:-1px; bottom:-1px; width:9px; height:9px; border-radius:50%; background:#c9bfc2; border:2px solid #fff; }
      .lbcb-av .dot.on{ background:#3d9a5f; }
      .lbcb-conv .txt{ min-width:0; flex:1; }
      .lbcb-conv .cname{ font-size:12.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .lbcb-conv .csub{ font-size:10px; color:#8a7078; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .lbcb-ubadge{ min-width:17px; height:17px; padding:0 5px; border-radius:9px; background:#c9506b; color:#fff; font-size:9.5px; font-weight:700; display:none; align-items:center; justify-content:center; }
      .lbcb-ubadge.show{ display:flex; }
      #lbcb-msgs{ flex:1; overflow-y:auto; padding:12px; display:none; flex-direction:column; gap:8px; background:#fdf1f0; }
      #lbcb-msgs.show{ display:flex; }
      .lbcb-msg{ max-width:82%; padding:8px 11px; border-radius:12px; font-size:12.5px; line-height:1.45; align-self:flex-start; background:#fff; color:#2f2024; border:1px solid #f0dede; border-bottom-left-radius:3px; word-break:break-word; white-space:pre-wrap; }
      .lbcb-msg.me{ align-self:flex-end; background:#c9506b; color:#fff; border:none; border-bottom-right-radius:3px; }
      .lbcb-msg .t{ display:block; font-size:9px; opacity:.6; margin-top:3px; text-align:right; }
      #lbcb-input-row{ display:none; gap:6px; padding:10px; border-top:1px solid #f0dede; background:#fff; position:relative; align-items:center; }
      #lbcb-input-row.show{ display:flex; }
      #lbcb-input{ flex:1; min-width:0; padding:9px 11px; border:1px solid #f0dede; border-radius:18px; font-size:12.5px; outline:none; font-family:inherit; }
      #lbcb-input:focus{ border-color:#c9506b; }
      #lbcb-send{ width:34px; height:34px; flex:0 0 34px; border-radius:50%; border:none; background:#c9506b; color:#fff; font-size:13px; cursor:pointer; flex:0 0 auto; }
      #lbcb-send:disabled{ opacity:.5; }
      @media print{ #lbcb-btn, #lbcb-panel{ display:none !important; } }
      @media(max-width:420px){ #lbcb-panel{ left:12px; } #lbcb-btn{ left:12px; width:46px; height:46px; font-size:19px; } }
    `;
    document.head.appendChild(style);

    // ---------- markup ----------
    const btn = document.createElement('button');
    btn.id = 'lbcb-btn';
    btn.setAttribute('aria-label', 'Staff chat');
    btn.innerHTML = '💬<span id="lbcb-badge"></span>';
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'lbcb-panel';
    panel.innerHTML = `
      <div id="lbcb-head">
        <button id="lbcb-back" aria-label="Back">‹</button>
        <div id="lbcb-head-title"><b id="lbcb-head-name">Chats</b><div id="lbcb-head-sub"></div></div>
        <button id="lbcb-avatar" aria-label="My avatar" title="Make my avatar" hidden>🎨</button>
        <a id="lbcb-openfull" href="chatbox.html" title="Open full chat">⤢</a>
        <button id="lbcb-close" aria-label="Close">✕</button>
      </div>
      <div id="lbcb-search"><input type="search" id="lbcb-search-input" placeholder="Search people…"></div>
      <div id="lbcb-list"></div>
      <div id="lbcb-msgs"></div>
      <div id="lbcb-input-row">
        <button class="lbcb-ib" id="lbcb-emoji" aria-label="Emoji, GIF and stickers" title="Emoji · GIF · Stickers">😊</button>
        <button class="lbcb-ib" id="lbcb-photo" aria-label="Send a photo" title="Send a photo">📷</button>
        <input type="text" id="lbcb-input" placeholder="Message…" maxlength="1000">
        <button class="lbcb-ib" id="lbcb-mic" aria-label="Record a voice message" title="Voice message">🎤</button>
        <button id="lbcb-send" aria-label="Send">➤</button>
      </div>
    `;
    document.body.appendChild(panel);

    const listEl = document.getElementById('lbcb-list');
    const msgsEl = document.getElementById('lbcb-msgs');
    const searchInput = document.getElementById('lbcb-search-input');
    const inputRow = document.getElementById('lbcb-input-row');
    const inputEl = document.getElementById('lbcb-input');
    const sendBtn = document.getElementById('lbcb-send');
    const backBtn = document.getElementById('lbcb-back');
    const badgeEl = document.getElementById('lbcb-badge');
    const headName = document.getElementById('lbcb-head-name');
    const headSub = document.getElementById('lbcb-head-sub');

    let meId = null, people = [], peopleById = {};
    let conv = null; // null = list view; {peerId} = a conversation (peerId null = group)
    let lastId = 0, delSince = '', firstLoad = true, opened = false;
    let lastUnreadTotal = -1;

    function initials(n){ return String(n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase(); }
    function avatarEl(p, dot){
      const el = document.createElement('div'); el.className = 'lbcb-av';
      if (p && p.avatarCfg && window.lbChatAvatar) {
        const img = document.createElement('img'); img.src = lbChatAvatar.uri(p.avatarCfg); img.alt = '';
        el.appendChild(img);
      } else if (p && p.avatar) {
        const img = document.createElement('img'); img.src = p.avatar; img.alt = ''; img.referrerPolicy = 'no-referrer';
        img.onerror = function(){ img.remove(); el.insertBefore(document.createTextNode(initials(p.name)), el.firstChild); };
        el.appendChild(img);
      } else el.textContent = initials(p && p.name);
      if (dot) { const d = document.createElement('span'); d.className = 'dot' + (p && p.online ? ' on' : ''); el.appendChild(d); }
      return el;
    }

    // ---------- seen markers (shared key with chatbox.html, same device) ----------
    function loadSeen(){ try{ return JSON.parse(localStorage.getItem('lbChatSeen') || '{}') || {}; }catch(e){ return {}; } }
    function saveSeen(s){ try{ localStorage.setItem('lbChatSeen', JSON.stringify(s)); }catch(e){} }
    function markSeen(id){
      const s = loadSeen(); s.dm = s.dm || {};
      if (conv && conv.peerId) { if (id > (s.dm[conv.peerId] || 0)) s.dm[conv.peerId] = id; }
      else if (conv) { if (id > (s.group || 0)) s.group = id; }
      saveSeen(s);
    }

    let unreadState = { group: 0, dm: {} };
    async function refreshUnread(){
      try{
        const s = loadSeen();
        const d = await lbChatApi('unread', { seenGroup: s.group || 0, seenDm: s.dm || {} });
        if (!d.success) return;
        unreadState = { group: (conv === null) ? d.group : (conv.peerId === null ? 0 : d.group), dm: d.dm || {} };
        if (conv && conv.peerId) unreadState.dm[conv.peerId] = 0;
        const total = (d.total != null ? d.total : (d.group + Object.values(d.dm || {}).reduce((a,b)=>a+b,0)));
        badgeEl.textContent = total > 99 ? '99+' : String(total);
        badgeEl.classList.toggle('show', total > 0);
        if (total !== lastUnreadTotal) {
          lastUnreadTotal = total;
          window.dispatchEvent(new CustomEvent('lb:chat-unread', { detail: { total } }));
        }
        if (!opened) return; // list only needs redrawing while the panel is open
        renderList();
      }catch(e){}
    }

    function lastSeenText(iso){
      if (!iso) return 'Offline';
      const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
      if (m < 60) return 'seen ' + Math.max(m,1) + 'm ago';
      const h = Math.round(m / 60); if (h < 24) return 'seen ' + h + 'h ago';
      return 'seen ' + new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
    }

    function renderList(){
      const q = searchInput.value.trim().toLowerCase();
      listEl.innerHTML = '';
      const g = document.createElement('div'); g.className = 'lbcb-conv';
      g.innerHTML = '<div class="lbcb-av" style="background:linear-gradient(135deg,#f1d38c,#c79a4d);">🌹</div>' +
        '<div class="txt"><div class="cname">Lalabella Team</div><div class="csub">Group chat</div></div>';
      const gb = document.createElement('span'); gb.className = 'lbcb-ubadge' + (unreadState.group ? ' show' : ''); gb.textContent = unreadState.group > 99 ? '99+' : unreadState.group;
      g.appendChild(gb);
      g.addEventListener('click', function(){ openConv(null); });
      listEl.appendChild(g);

      const others = people.filter(function(p){ return !p.me && (!q || (p.name + ' ' + (p.position||'')).toLowerCase().indexOf(q) !== -1); });
      function section(title, arr, emptyText){
        const h = document.createElement('div'); h.className = 'lbcb-sep'; h.textContent = title; listEl.appendChild(h);
        if (!arr.length) { const e = document.createElement('div'); e.className = 'lbcb-empty'; e.textContent = emptyText; listEl.appendChild(e); return; }
        arr.forEach(function(p){
          const c = document.createElement('div'); c.className = 'lbcb-conv';
          c.appendChild(avatarEl(p, true));
          const t = document.createElement('div'); t.className = 'txt';
          const n = document.createElement('div'); n.className = 'cname'; n.textContent = p.name;
          const s = document.createElement('div'); s.className = 'csub'; s.textContent = p.online ? 'Active now' : lastSeenText(p.lastSeen);
          t.appendChild(n); t.appendChild(s); c.appendChild(t);
          const cnt = unreadState.dm[p.id] || 0;
          const b = document.createElement('span'); b.className = 'lbcb-ubadge' + (cnt ? ' show' : ''); b.textContent = cnt > 99 ? '99+' : cnt; c.appendChild(b);
          c.addEventListener('click', function(){ openConv(p.id); });
          listEl.appendChild(c);
        });
      }
      section('Online now', others.filter(function(p){ return p.online; }), 'No one else is online right now.');
      section('Private messages', others.filter(function(p){ return !p.online; }), 'No other staff accounts yet.');
    }
    searchInput.addEventListener('input', renderList);

    function showListView(){
      conv = null;
      if (picker) picker.close();
      listEl.style.display = ''; searchInput.parentElement.style.display = '';
      msgsEl.classList.remove('show'); inputRow.classList.remove('show'); backBtn.classList.remove('show');
      headName.textContent = 'Chats'; headSub.textContent = '';
      renderList();
      refreshUnread();
    }
    backBtn.addEventListener('click', showListView);

    function dayLabel(d){
      const t = new Date(); t.setHours(0,0,0,0); const x = new Date(d); x.setHours(0,0,0,0);
      const diff = Math.round((t - x) / 86400000);
      if (diff === 0) return 'Today'; if (diff === 1) return 'Yesterday';
      return new Date(d).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
    }
    let lastMsg = null;
    function addMsg(v){
      if (!v || !v.text || v.id <= lastId) return;
      lastId = v.id;
      const empty = msgsEl.querySelector('.lbcb-empty-chat'); if (empty) empty.remove();
      const t = new Date(v.time), mine = v.userId === meId;
      if (!lastMsg || new Date(lastMsg.time).toDateString() !== t.toDateString()) {
        const sep = document.createElement('div'); sep.style.cssText = 'text-align:center;align-self:center;font-size:9.5px;color:#8a7078;margin:4px 0;';
        sep.textContent = dayLabel(t); msgsEl.appendChild(sep); lastMsg = null;
      }
      const el = document.createElement('div');
      const isMedia = v.kind && v.kind !== 'text' && window.lbChatMedia;
      el.className = 'lbcb-msg' + (mine ? ' me' : '') + (isMedia && v.kind !== 'voice' ? ' bare' : '');
      if (isMedia) el.appendChild(lbChatMedia.mediaEl(v));
      else el.appendChild(document.createTextNode(v.text));
      const tm = document.createElement('span'); tm.className = 't'; tm.textContent = t.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
      el.appendChild(tm);
      msgsEl.appendChild(el);
      lastMsg = v;
      if (!mine && !firstLoad && window.lbChatSound) lbChatSound.play('receive');
    }

    function openConv(peerId){
      conv = { peerId: peerId || null };
      lastId = 0; delSince = ''; lastMsg = null; firstLoad = true;
      listEl.style.display = 'none'; searchInput.parentElement.style.display = 'none';
      msgsEl.classList.add('show'); inputRow.classList.add('show'); backBtn.classList.add('show');
      msgsEl.innerHTML = '';
      if (peerId) {
        const p = peopleById[peerId] || { name: '…' };
        headName.textContent = p.name;
        headSub.textContent = p.online ? 'Active now' : lastSeenText(p.lastSeen);
        inputEl.placeholder = 'Message ' + p.name.split(' ')[0] + '…';
      } else {
        headName.textContent = 'Lalabella Team';
        headSub.textContent = 'Group chat';
        inputEl.placeholder = 'Message the team…';
      }
      poll();
      if (window.innerWidth > 420) inputEl.focus();
    }

    let busy = false;
    async function poll(){
      if (busy || !conv) return; busy = true;
      const myConv = conv.peerId;
      try{
        const params = { peerId: conv.peerId || undefined };
        if (lastId) params.sinceId = lastId; else params.limit = 60;
        if (delSince) params.delSince = delSince;
        const d = await lbChatApi('list', params);
        if (!conv || myConv !== conv.peerId) { busy = false; return; }
        if (!d.success) throw new Error(d.error || 'failed');
        meId = d.meId; if (d.serverTime) delSince = d.serverTime;
        const nearBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 80;
        (d.messages || []).forEach(addMsg);
        if (firstLoad && !msgsEl.children.length) {
          const e = document.createElement('div'); e.className = 'lbcb-empty-chat';
          e.style.cssText = 'text-align:center;color:#8a7078;font-size:11.5px;padding:20px 8px;align-self:center;';
          e.textContent = conv.peerId ? '🔒 Private chat. Say hi 👋' : 'No messages yet — say hi 🌹';
          msgsEl.appendChild(e);
        }
        if (firstLoad || nearBottom) msgsEl.scrollTop = msgsEl.scrollHeight;
        if (lastId) markSeen(lastId);
        firstLoad = false;
      }catch(e){}
      busy = false;
      refreshUnread();
    }

    async function loadPeople(){
      try{
        const d = await lbChatApi('people');
        if (!d.success) return;
        meId = d.meId; people = d.people || []; peopleById = {};
        people.forEach(function(p){ peopleById[p.id] = p; });
        if (!opened || conv === null) renderList();
      }catch(e){}
    }

    async function sendMessage(){
      const text = inputEl.value.trim();
      if (!text || !conv) return;
      inputEl.value = ''; sendBtn.disabled = true;
      try{
        const d = await lbChatApi('send', { text, peerId: conv.peerId || undefined });
        if (!d.success) throw new Error(d.error || 'failed');
        if (window.lbChatSound) lbChatSound.play('send');
        await poll();
        msgsEl.scrollTop = msgsEl.scrollHeight;
      }catch(err){ /* quietly retry-able — the input already cleared is acceptable here, panel is compact */ }
      sendBtn.disabled = false; inputEl.focus();
    }
    // ---- media: voice, photo, GIF/sticker, emoji picker, avatar ----
    async function sendPayload(payload){
      if (!conv) throw new Error('Open a chat first.');
      const d = await lbChatApi('send', Object.assign({ peerId: conv.peerId || undefined }, payload));
      if (!d.success) throw new Error(d.error || 'Could not send. Try again.');
      if (window.lbChatSound) lbChatSound.play('send');
      await poll();
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }
    const emojiBtn = document.getElementById('lbcb-emoji'), photoBtn = document.getElementById('lbcb-photo'),
          micBtn = document.getElementById('lbcb-mic'), avatarBtn = document.getElementById('lbcb-avatar');
    let picker = null;
    if (!window.lbChatMedia) { emojiBtn.hidden = photoBtn.hidden = micBtn.hidden = true; }
    else {
      emojiBtn.addEventListener('click', function(){
        if (!picker) picker = lbChatMedia.createPicker({
          host: inputRow, toggleBtn: emojiBtn,
          onEmoji: function(e){ inputEl.value += e; inputEl.focus(); },
          onGif: async function(item, kind){
            picker.close();
            try { await sendPayload({ kind: kind, url: item.url, preview: item.preview, sig: item.sig }); }
            catch (err) { alert(err.message); }
          }
        });
        picker.toggle();
      });
      photoBtn.addEventListener('click', function(){
        lbChatMedia.photoUI({ onSend: function(p){ return sendPayload({ kind: 'image', data: p.data, mime: p.mime }); } });
      });
      micBtn.addEventListener('click', function(){
        lbChatMedia.recordUI({ host: inputRow, onSend: function(p){ return sendPayload({ kind: 'voice', data: p.data, mime: p.mime, durationMs: p.durationMs }); } });
      });
    }
    if (window.lbChatAvatar) {
      avatarBtn.hidden = false;
      avatarBtn.addEventListener('click', function(){
        const mine = people.find(function(p){ return p.me; }) || {};
        lbChatAvatar.open({
          cfg: mine.avatarCfg || null, hasPhoto: !!mine.avatar,
          onSave: async function(cfg){
            const d = await lbChatApi('avatarSave', { cfg: cfg === null ? '' : cfg });
            if (!d.success) throw new Error(d.error || 'Could not save.');
            await loadPeople();
          }
        });
      });
    }

    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', function(e){ if (e.key === 'Enter') sendMessage(); });

    btn.addEventListener('click', function(){
      panel.classList.toggle('show');
      if (panel.classList.contains('show') && !opened) {
        opened = true;
        loadPeople().then(showListView);
      } else if (panel.classList.contains('show')) {
        if (conv === null) refreshUnread();
      }
    });
    document.getElementById('lbcb-close').addEventListener('click', function(){ panel.classList.remove('show'); });

    if (window.lbChatLive) {
      lbChatLive.onPing(function(){ if (conv) poll(); else refreshUnread(); });
    }
    setInterval(function(){ if (!document.hidden) { if (conv) poll(); else refreshUnread(); } }, 25000);
    setInterval(function(){ if (!document.hidden) loadPeople(); }, 90000);

    loadPeople();
    refreshUnread();
  }
})();
