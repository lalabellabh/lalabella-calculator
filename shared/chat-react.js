/* ==========================================================
   LALABELLA STAFF CHAT — MESSAGE REACTIONS
   Used by chatbox.html and the floating chat bubble.
   Long-press (phone) / right-click or double-click (desktop) a message
   -> pick an emoji. Tap the little reaction under a message to add or
   remove yours. Talks to the `chatx` Edge Function (same login token).

   lbChatReact.mount({ id, bubble, after, mine, ctx })
       id      message id
       bubble  the message bubble element (gets the long-press)
       after   element the reaction chips are placed right after
       mine    true when it is my own message (chips align right)
       ctx     { meId, nameOf(userId) }   (optional, for tooltips)
   lbChatReact.refresh()   re-read reactions of the messages on screen
   ========================================================== */
(function(){
  if (window.lbChatReact) return;

  var QUICK = ['❤️', '😂', '😮', '😢', '🙏', '👍'];
  var MORE = ['😍','🥰','😘','😊','😁','🤣','😅','😉','😎','🤩','🥺','😭','😡','🤯','😱','🤔','😴','🤗','👏','🙌','💪','👌','✌️','🤝','🔥','✨','🎉','💯','🌹','🌸','🍫','☕','👎','💔','💖','🙊','🤭','😌','😏','🫡'];

  var nodes = {};          // id -> { chips, list, ctx }
  var openPop = null;

  function token(){ return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; }
  function apiUrl(){ return String(LB_CONFIG.CHAT_API || '').replace(/\/chat$/, '/chatx'); }
  async function api(action, params){
    var res = await fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: LB_CONFIG.SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify(Object.assign({}, params || {}, { action: action, token: token() }))
    });
    return res.json();
  }

  // ---------- styles ----------
  var st = document.createElement('style');
  st.textContent =
    '.lbr-chips{display:flex;flex-wrap:wrap;gap:4px;margin:-3px 8px 0;position:relative;z-index:1;max-width:100%;}' +
    '.lbr-chips:empty{display:none;}' +
    '.lbr-chip{display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:12px;background:#fff;border:1px solid #ecd5d5;font-size:13px;line-height:1.5;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.12);color:#3a2a2f;font-family:inherit;}' +
    '.lbr-chip b{font-size:10.5px;font-weight:700;color:#8a7078;}' +
    '.lbr-chip.mine{background:#fde6ec;border-color:#c9506b;}' +
    '.lbr-btn{opacity:0;border:0;background:none;cursor:pointer;font-size:15px;padding:2px 4px;border-radius:50%;transition:opacity .12s;flex:0 0 auto;}' +
    '.msg:hover .lbr-btn,.lbr-btn:focus{opacity:.75;}.lbr-btn:hover{opacity:1 !important;background:rgba(0,0,0,.06);}' +
    '@media(hover:none){.lbr-btn{display:none;}}' +
    '.lbr-pop{position:fixed;z-index:100000;background:#fff;border-radius:26px;box-shadow:0 8px 28px rgba(0,0,0,.28);padding:6px 8px;display:flex;flex-wrap:wrap;gap:2px;align-items:center;max-width:min(300px,calc(100vw - 16px));animation:lbrIn .12s ease-out;}' +
    '.lbr-pop.big{border-radius:18px;}' +
    '.lbr-pop button{border:0;background:none;font-size:25px;line-height:1;padding:5px;border-radius:50%;cursor:pointer;transition:transform .1s;}' +
    '.lbr-pop button:hover,.lbr-pop button:active{transform:scale(1.25);background:#fdf1f0;}' +
    '.lbr-pop button.on{background:#fde6ec;}' +
    '.lbr-pop .more{font-size:17px;color:#8a7078;font-weight:700;}' +
    '@keyframes lbrIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}' +
    '.lbr-pressing{filter:brightness(.96);}';
  document.head.appendChild(st);

  // ---------- rendering ----------
  function myEmoji(list, meId){
    for (var i = 0; i < list.length; i++) if (list[i][1].indexOf(meId) !== -1) return list[i][0];
    return '';
  }
  function render(id){
    var n = nodes[id]; if (!n) return;
    var meId = n.ctx && n.ctx.meId;
    n.chips.innerHTML = '';
    (n.list || []).forEach(function(r){
      var emoji = r[0], users = r[1] || [];
      if (!users.length) return;
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'lbr-chip' + (users.indexOf(meId) !== -1 ? ' mine' : '');
      b.appendChild(document.createTextNode(emoji));
      if (users.length > 1) { var c = document.createElement('b'); c.textContent = users.length; b.appendChild(c); }
      var names = users.map(function(u){ return u === meId ? 'You' : ((n.ctx && n.ctx.nameOf && n.ctx.nameOf(u)) || ''); }).filter(Boolean);
      if (names.length) b.title = names.join(', ');
      b.addEventListener('click', function(ev){ ev.stopPropagation(); react(id, emoji); });
      n.chips.appendChild(b);
    });
  }
  function setList(id, list){ var n = nodes[id]; if (!n) return; n.list = list || []; render(id); }

  // ---------- actions ----------
  function localToggle(list, meId, emoji){
    var had = myEmoji(list, meId);
    var out = [];
    list.forEach(function(r){
      var u = r[1].filter(function(x){ return x !== meId; });
      if (u.length) out.push([r[0], u]);
    });
    if (had !== emoji) {
      var hit = out.filter(function(r){ return r[0] === emoji; })[0];
      if (hit) hit[1].push(meId); else out.push([emoji, [meId]]);
    }
    return out;
  }
  async function react(id, emoji){
    var n = nodes[id]; if (!n) return;
    var meId = n.ctx && n.ctx.meId;
    closePop();
    var before = n.list;
    setList(id, localToggle(before || [], meId, emoji));      // instant feedback
    try{
      var d = await api('react', { id: id, emoji: emoji });
      if (!d || !d.success) throw new Error((d && d.error) || 'failed');
      setList(id, (d.reactions && d.reactions[String(id)]) || []);
    }catch(e){
      setList(id, before);
      try{ if (window.LBBrain && LBBrain.notify) LBBrain.notify({ id: 'chat-react-err', text: 'Could not add the reaction. Check your connection.' }); }catch(_){}
    }
  }

  // ---------- picker ----------
  function closePop(){ if (openPop) { openPop.remove(); openPop = null; document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc, true); } }
  function outside(ev){ if (openPop && !openPop.contains(ev.target)) closePop(); }
  function esc(ev){ if (ev.key === 'Escape') closePop(); }
  function place(pop, rect){
    var w = pop.offsetWidth, h = pop.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var x = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), vw - w - 8);
    var y = rect.top - h - 8; if (y < 8) y = Math.min(rect.bottom + 8, vh - h - 8);
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }
  function openPicker(id, anchor){
    closePop();
    var n = nodes[id]; if (!n) return;
    var mineNow = myEmoji(n.list || [], n.ctx && n.ctx.meId);
    var pop = document.createElement('div'); pop.className = 'lbr-pop';
    function fill(list, withMore){
      pop.innerHTML = '';
      list.forEach(function(e){
        var b = document.createElement('button'); b.type = 'button'; b.textContent = e; if (e === mineNow) b.className = 'on';
        b.addEventListener('click', function(ev){ ev.stopPropagation(); react(id, e); });
        pop.appendChild(b);
      });
      if (withMore) {
        var m = document.createElement('button'); m.type = 'button'; m.className = 'more'; m.textContent = '＋'; m.title = 'More';
        m.addEventListener('click', function(ev){ ev.stopPropagation(); pop.classList.add('big'); fill(QUICK.concat(MORE), false); place(pop, anchor.getBoundingClientRect()); });
        pop.appendChild(m);
      }
    }
    fill(QUICK, true);
    document.body.appendChild(pop);
    place(pop, anchor.getBoundingClientRect());
    openPop = pop;
    setTimeout(function(){ document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', esc, true); }, 0);
  }

  // ---------- public ----------
  function mount(o){
    if (!o || !o.id || !o.bubble || nodes[o.id]) return;
    var chips = document.createElement('div'); chips.className = 'lbr-chips';
    chips.style.alignSelf = o.mine ? 'flex-end' : 'flex-start';
    var host = o.after || o.bubble;
    if (host.parentNode) host.parentNode.insertBefore(chips, host.nextSibling);
    nodes[o.id] = { chips: chips, list: [], ctx: o.ctx || {} };

    // long-press (phone) / right-click / double-click (desktop)
    var timer = null, sx = 0, sy = 0;
    function cancel(){ if (timer) { clearTimeout(timer); timer = null; } o.bubble.classList.remove('lbr-pressing'); }
    o.bubble.addEventListener('pointerdown', function(ev){
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      if (ev.target.closest && ev.target.closest('a,button,audio,video,input')) return;
      sx = ev.clientX; sy = ev.clientY;
      o.bubble.classList.add('lbr-pressing');
      timer = setTimeout(function(){ timer = null; o.bubble.classList.remove('lbr-pressing'); if (navigator.vibrate) { try{ navigator.vibrate(12); }catch(_){} } openPicker(o.id, o.bubble); }, 450);
    });
    o.bubble.addEventListener('pointermove', function(ev){ if (timer && (Math.abs(ev.clientX - sx) > 10 || Math.abs(ev.clientY - sy) > 10)) cancel(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function(t){ o.bubble.addEventListener(t, cancel); });
    o.bubble.addEventListener('contextmenu', function(ev){ ev.preventDefault(); openPicker(o.id, o.bubble); });
    o.bubble.addEventListener('dblclick', function(ev){ ev.preventDefault(); openPicker(o.id, o.bubble); });

    // little hover button (desktop)
    if (o.button) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'lbr-btn'; b.title = 'React'; b.textContent = '☺';
      b.addEventListener('click', function(ev){ ev.stopPropagation(); openPicker(o.id, b); });
      o.button.appendChild(b);
    }
  }

  var refreshing = false, again = false;
  async function refresh(){
    if (refreshing) { again = true; return; }
    refreshing = true;
    try{
      var ids = Object.keys(nodes).filter(function(id){ return document.contains(nodes[id].chips); });
      Object.keys(nodes).forEach(function(id){ if (ids.indexOf(id) === -1) delete nodes[id]; });
      ids = ids.slice(-150).map(Number);
      if (ids.length) {
        var d = await api('reactions', { ids: ids });
        if (d && d.success) ids.forEach(function(id){ setList(id, (d.reactions && d.reactions[String(id)]) || []); });
      }
    }catch(e){}
    refreshing = false;
    if (again) { again = false; refresh(); }
  }

  window.lbChatReact = { mount: mount, refresh: refresh };
})();
