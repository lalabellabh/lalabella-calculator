/* ==========================================================
   JOYBOY FLOATING CHAT BUBBLE
   Include on any page with: <script src="joyboy-bubble.js"></script>
   Self-contained — injects its own HTML/CSS, no page markup needed.
   Reuses the same NOVA_API_URL / action=chat contract that the full
   NOVA Command Center page already uses.
   ========================================================== */
(function(){
  const NOVA_API_URL = LB_CONFIG.NOVA_API;

  // ---------- Inject styles ----------
  const style = document.createElement('style');
  style.textContent = `
    #joyboy-bubble-btn{
      position:fixed; bottom:20px; right:20px; z-index:9500;
      width:56px; height:56px; border-radius:50%; border:none; cursor:pointer;
      background:linear-gradient(135deg,#f1d38c,#c79a4d); color:#24150c; font-size:26px;
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 8px 24px rgba(0,0,0,.35);
    }
    #joyboy-bubble-btn:active{ transform:scale(.94); }
    #joyboy-panel{
      position:fixed; bottom:88px; right:20px; z-index:9500;
      width:min(340px, calc(100vw - 32px)); height:min(460px, calc(100vh - 140px));
      background:#fff; border-radius:18px; box-shadow:0 16px 44px rgba(0,0,0,.35);
      display:none; flex-direction:column; overflow:hidden;
      font-family:Arial,sans-serif;
    }
    #joyboy-panel.show{ display:flex; }
    #joyboy-panel-header{
      background:linear-gradient(150deg,#3a1420,#5c1a28 55%,#7a2436); color:#fff;
      padding:14px 16px; display:flex; align-items:center; justify-content:space-between;
    }
    #joyboy-panel-header b{ font-size:14px; }
    #joyboy-panel-close{ background:none; border:none; color:#fff; font-size:18px; cursor:pointer; opacity:.8; }
    #joyboy-panel-close:hover{ opacity:1; }
    #joyboy-voice-toggle{ background:none; border:none; color:#fff; font-size:16px; cursor:pointer; opacity:.85; }
    #joyboy-voice-toggle:hover{ opacity:1; }
    #joyboy-voice-toggle.on{ color:#f1d38c; }
    #joyboy-msgs{ flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:10px; background:#fdf1f0; }
    .jb-msg{ max-width:82%; padding:9px 12px; border-radius:12px; font-size:13px; line-height:1.5; }
    .jb-msg.user{ align-self:flex-end; background:#c9506b; color:#fff; border-bottom-right-radius:3px; }
    .jb-msg.bot{ align-self:flex-start; background:#fff; color:#2f2024; border:1px solid #f0dede; border-bottom-left-radius:3px; }
    .jb-msg.thinking{ align-self:flex-start; background:#fff; color:#8a7078; border:1px solid #f0dede; font-style:italic; }
    #joyboy-input-row{ display:flex; gap:8px; padding:12px; border-top:1px solid #f0dede; background:#fff; }
    #joyboy-input{ flex:1; padding:10px 12px; border:1px solid #f0dede; border-radius:20px; font-size:13px; outline:none; }
    #joyboy-input:focus{ border-color:#c9506b; }
    #joyboy-send{ width:38px; height:38px; border-radius:50%; border:none; background:#c9506b; color:#fff; font-size:15px; cursor:pointer; flex:0 0 auto; }
    #joyboy-send:disabled{ opacity:.5; }
    @media(max-width:420px){ #joyboy-panel{ right:12px; } #joyboy-bubble-btn{ right:12px; } }
  `;
  document.head.appendChild(style);

  // ---------- Inject markup ----------
  const btn = document.createElement('button');
  btn.id = 'joyboy-bubble-btn';
  btn.setAttribute('aria-label', 'Ask Joyboy');
  btn.textContent = '🎙️';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'joyboy-panel';
  panel.innerHTML = `
    <div id="joyboy-panel-header">
      <b>🎙️ Joyboy</b>
      <div style="display:flex;gap:10px;align-items:center;">
        <button id="joyboy-voice-toggle" aria-label="Toggle voice" title="Voice replies">🔇</button>
        <button id="joyboy-panel-close" aria-label="Close">✕</button>
      </div>
    </div>
    <div id="joyboy-msgs"></div>
    <div id="joyboy-input-row">
      <input type="text" id="joyboy-input" placeholder="Ask about the system, or type a command…">
      <button id="joyboy-send" aria-label="Send">➤</button>
    </div>
  `;
  document.body.appendChild(panel);

  const msgsEl = document.getElementById('joyboy-msgs');
  const inputEl = document.getElementById('joyboy-input');
  const sendBtn = document.getElementById('joyboy-send');

  let session = {};
  let opened = false;
  let voiceOn = false;
  try{ voiceOn = localStorage.getItem('joyboyBubbleVoice') === '1'; }catch(e){}
  const voiceToggleBtn = document.getElementById('joyboy-voice-toggle');
  function updateVoiceBtn(){
    voiceToggleBtn.textContent = voiceOn ? '🔊' : '🔇';
    voiceToggleBtn.classList.toggle('on', voiceOn);
  }
  updateVoiceBtn();
  voiceToggleBtn.addEventListener('click', ()=>{
    voiceOn = !voiceOn;
    updateVoiceBtn();
    try{ localStorage.setItem('joyboyBubbleVoice', voiceOn ? '1' : '0'); }catch(e){}
    if(!voiceOn && window.speechSynthesis) window.speechSynthesis.cancel();
  });
  function speak(text){
    if(!voiceOn || !text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // never overlap two replies
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.02;
    window.speechSynthesis.speak(utter);
  }

  function safeNavTarget_(u){try{const s=String(u||'').trim();if(!/^[a-z0-9_-]+\.html(\?[a-z0-9_=&-]*)?$/i.test(s))return null;return s}catch(e){return null}}
  function addMsg(text, cls){
    const el = document.createElement('div');
    el.className = 'jb-msg ' + cls;
    el.textContent = text;
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return el;
  }

  btn.addEventListener('click', ()=>{
    panel.classList.toggle('show');
    if(panel.classList.contains('show') && !opened){
      opened = true;
      addMsg('Hi Boss! Ask me anything about how the system works, or tell me what you need done.', 'bot');
      speak('Hi Boss! Ask me anything about how the system works, or tell me what you need done.');
      inputEl.focus();
    }
  });
  document.getElementById('joyboy-panel-close').addEventListener('click', ()=> panel.classList.remove('show'));

  async function sendMessage(){
    const message = inputEl.value.trim();
    if(!message) return;
    inputEl.value = '';
    sendBtn.disabled = true;
    addMsg(message, 'user');
    const thinkingEl = addMsg('Thinking…', 'thinking');
    // If a real-data lookup is involved, the round trip (asking the
    // AI what to do, fetching live data, then asking it to phrase
    // the answer) genuinely takes longer than a plain chat reply —
    // update the message after a few seconds so it's clear Joyboy is
    // still actively working, not stuck.
    const slowTimer = setTimeout(()=>{
      if(thinkingEl.isConnected) thinkingEl.textContent = 'Still checking, Boss — looking up live data…';
    }, 4000);

    try{
      const lalabellaToken = window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || '';
      const sessionStr = JSON.stringify(session || {});
      const contextStr = JSON.stringify({ page: document.title || location.pathname, app: 'Joyboy Bubble' });
      const url = NOVA_API_URL
        + '?action=chat'
        + '&message=' + encodeURIComponent(message)
        + '&token=' + encodeURIComponent(lalabellaToken)
        + '&session=' + encodeURIComponent(sessionStr)
        + '&context=' + encodeURIComponent(contextStr);

      const r = await fetch(url);
      clearTimeout(slowTimer);
      thinkingEl.remove();
      if(!r.ok){
        addMsg('Connection error (HTTP ' + r.status + '). Try again, Boss.', 'bot');
        return;
      }
      const data = await r.json();
      if(!data.ok){
        addMsg(data.error || 'Something went wrong.', 'bot');
        return;
      }
      session = data.session || session;
      addMsg(data.text || '...', 'bot');
      speak(data.text);
      const navTarget = safeNavTarget_(data.navigateTo);
      if(navTarget){
        addMsg('Opening ' + navTarget + '…', 'bot');
        setTimeout(()=>{ window.location.href = navTarget; }, 1400);
      }
    }catch(e){
      clearTimeout(slowTimer);
      thinkingEl.remove();
      addMsg('The AI connection is unavailable right now, Boss.', 'bot');
    }finally{
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') sendMessage(); });
})();
