  // ==================== NOVA — voice-guided counting ====================
  // Kept as its own self-contained module: NOVA only ever reads ITEMS
  // (the same array View/Barcode already uses) and calls the existing
  // /saveNovaCount backend action to write counts — it never touches
  // inventory business logic directly, so nothing above this section
  // needed to change for NOVA to work.

  // ---------- NovaSpeech: thin wrapper over the Web Speech APIs ----------
  class NovaSpeech {
    constructor(){
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.supported = !!SR && !!window.speechSynthesis;
      if(!SR) return;
      this.recognition = new SR();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
      this.onResult = null;
      this.onError = null;
      this.onEnd = null;
      this.listening = false;

      this.recognition.addEventListener('result', (e)=>{
        const text = e.results[0][0].transcript;
        if(this.onResult) this.onResult(text);
      });
      this.recognition.addEventListener('error', (e)=>{
        this.listening = false;
        if(this.onError) this.onError(e.error);
      });
      this.recognition.addEventListener('end', ()=>{
        this.listening = false;
        if(this.onEnd) this.onEnd();
      });
    }
    start(){
      if(!this.supported || this.listening) return;
      try{ this.recognition.start(); this.listening = true; }catch(e){}
    }
    stop(){
      if(!this.supported) return;
      try{ this.recognition.stop(); }catch(e){}
      this.listening = false;
    }
    speak(text, onDone){
      if(!window.speechSynthesis){ if(onDone) onDone(); return; }
      window.speechSynthesis.cancel(); // never let two responses overlap
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.02; utter.pitch = 1.0;
      if(onDone) utter.addEventListener('end', onDone);
      window.speechSynthesis.speak(utter);
    }
  }

  // ---------- Word-to-number, tolerant of speech-recognition quirks ----------
  const NOVA_NUMBER_WORDS = {
    zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
    eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17,
    eighteen:18, nineteen:19, twenty:20, thirty:30, forty:40, fifty:50, sixty:60,
    seventy:70, eighty:80, ninety:90, hundred:100
  };
  function parseSpokenNumber(text){
    const digitMatch = text.match(/\d+(\.\d+)?/);
    if(digitMatch) return parseFloat(digitMatch[0]);

    const words = text.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean);
    let total = 0, current = 0, found = false;
    words.forEach(w=>{
      if(NOVA_NUMBER_WORDS.hasOwnProperty(w)){
        found = true;
        const val = NOVA_NUMBER_WORDS[w];
        if(val === 100){ current = (current || 1) * 100; }
        else { current += val; }
      } else if(current > 0){
        total += current; current = 0;
      }
    });
    total += current;
    return found ? total : null;
  }

  // ---------- Fuzzy item-name matching (Levenshtein-based similarity) ----------
  function levenshtein(a, b){
    const m = a.length, n = b.length;
    const dp = Array.from({length:m+1}, ()=>new Array(n+1).fill(0));
    for(let i=0;i<=m;i++) dp[i][0]=i;
    for(let j=0;j<=n;j++) dp[0][j]=j;
    for(let i=1;i<=m;i++){
      for(let j=1;j<=n;j++){
        dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
      }
    }
    return dp[m][n];
  }
  function similarity(a, b){
    a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
    if(!a.length && !b.length) return 1;
    const dist = levenshtein(a, b);
    return 1 - dist / Math.max(a.length, b.length);
  }
  // Tries an exact/substring match first (cheap, usually right), and
  // only falls back to fuzzy scoring for genuine speech-recognition
  // noise ("red rose" vs "red roses", minor mishears).
  function matchItemName(spokenText, candidateNames){
    const spoken = spokenText.toLowerCase().trim().replace(/s$/, ''); // tolerate a trailing plural
    let best = null, bestScore = 0;
    candidateNames.forEach(name=>{
      const normalized = name.toLowerCase().replace(/s$/, '');
      if(normalized === spoken) { best = name; bestScore = 1; return; }
      if(bestScore < 1 && (normalized.includes(spoken) || spoken.includes(normalized))){
        best = name; bestScore = Math.max(bestScore, 0.9); return;
      }
      const score = similarity(spoken, normalized);
      if(score > bestScore){ bestScore = score; best = name; }
    });
    return { name: best, score: bestScore };
  }

  // ---------- NovaInventorySession: tracks one counting run ----------
  class NovaInventorySession {
    constructor(items, branch){
      this.items = items; // [{name, code, unit, branch}]
      this.branch = branch;
      this.index = 0;
      this.counted = [];   // {name, qty}
      this.skipped = [];   // names
      this.corrections = 0;
      this.lastRecordedName = null;
    }
    getCurrentItem(){ return this.items[this.index] || null; }
    isComplete(){ return this.index >= this.items.length; }
    recordCount(itemName, qty){
      this.counted.push({ name: itemName, qty });
      this.lastRecordedName = itemName;
      this.index++;
    }
    correctLast(qty){
      if(!this.counted.length) return false;
      this.counted[this.counted.length - 1].qty = qty;
      this.corrections++;
      return true;
    }
    skipCurrent(){
      const item = this.getCurrentItem();
      if(item) this.skipped.push(item.name);
      this.index++;
    }
    goBack(){
      if(this.index > 0){
        this.index--;
        // If the item we're returning to was already counted, pull it
        // back out of the counted list so re-recording it doesn't
        // create a duplicate entry.
        const item = this.items[this.index];
        const lastCounted = this.counted[this.counted.length - 1];
        if(lastCounted && lastCounted.name === item.name){
          this.counted.pop();
        }
      }
    }
    progress(){ return { done: this.index, total: this.items.length }; }
  }

  // ---------- NovaAssistant: parses commands and drives the session ----------
  class NovaAssistant {
    constructor(){
      this.speech = new NovaSpeech();
      this.session = null;
      this.pendingConfirmation = null; // {type:'item', value, onYes, onNo} etc.
      this.awaitingSaveConfirm = false;
      this.active = false;

      this.micBtn = document.getElementById('novaMicBtn');
      this.statusPill = document.getElementById('novaStatusPill');
      this.currentItemEl = document.getElementById('novaCurrentItem');
      this.currentQtyEl = document.getElementById('novaCurrentQty');
      this.progressText = document.getElementById('novaProgressText');
      this.skippedText = document.getElementById('novaSkippedText');
      this.progressFill = document.getElementById('novaProgressFill');
      this.lastCommandEl = document.getElementById('novaLastCommand');
      this.lastResponseEl = document.getElementById('novaLastResponse');

      this.speech.onResult = (text)=> this.handleTranscript(text);
      this.speech.onError = (err)=>{
        this.setStatus('error');
        if(err === 'not-allowed' || err === 'permission-denied'){
          this.respond("Microphone access isn't available. You can still enter the quantity manually.");
        } else if(err !== 'no-speech' && err !== 'aborted'){
          this.respond("I didn't catch that. Please repeat.");
        } else {
          this.setStatus('waiting');
        }
      };
      this.speech.onEnd = ()=>{
        if(this.micBtn.classList.contains('nova-mic-listening')) this.setStatus('waiting');
      };

      this.micBtn.addEventListener('click', ()=> this.toggleListening());
      document.querySelectorAll('.nova-quick-actions button').forEach(btn=>{
        btn.addEventListener('click', ()=> this.handleQuickAction(btn.dataset.cmd));
      });
    }

    setStatus(state){
      const map = {
        waiting: ['nova-status-waiting', '● Waiting', 'nova-mic-idle'],
        listening: ['nova-status-listening', '● Listening', 'nova-mic-listening'],
        processing: ['nova-status-processing', '● Processing', 'nova-mic-processing'],
        error: ['nova-status-error', '● Error', 'nova-mic-error']
      };
      const [cls, label, micCls] = map[state] || map.waiting;
      this.statusPill.className = 'nova-status-pill ' + cls;
      this.statusPill.textContent = label;
      this.micBtn.className = 'nova-mic-btn ' + micCls;
    }

    respond(text){
      this.lastResponseEl.textContent = text;
      this.setStatus('processing');
      this.speech.speak(text, ()=> this.setStatus('waiting'));
    }

    toggleListening(){
      if(this.speech.recognition && this.speech.listening){ this.speech.stop(); return; }
      if(!this.speech.supported){
        alert('Hindi supported ang voice recognition sa browser na ito. Gamitin na lang ang mga buttons/manual entry.');
        return;
      }
      this.setStatus('listening');
      this.speech.start();
    }

    updateDisplay(){
      const item = this.session.getCurrentItem();
      this.currentItemEl.textContent = item ? item.name : '—';
      const { done, total } = this.session.progress();
      this.progressText.textContent = done + ' / ' + total;
      this.progressFill.style.width = total ? (done / total * 100) + '%' : '0%';
      this.skippedText.textContent = this.session.skipped.length ? this.session.skipped.length + ' skipped' : '';
    }

    startSession(items, branch){
      this.session = new NovaInventorySession(items, branch);
      this.active = true;
      document.getElementById('novaSetupCard').style.display = 'none';
      document.getElementById('novaSessionCard').style.display = 'block';
      this.updateDisplay();
      this.currentQtyEl.textContent = '—';
      const first = this.session.getCurrentItem();
      if(first){
        this.respond(`Okay Boss, let's start counting. First item: ${first.name}.`);
      } else {
        this.respond('Walang items na mabibilang sa category na ito.');
      }
    }

    async finishSession(){
      const { counted, skipped } = this.session;
      if(counted.length === 0){
        this.respond('Walang na-record na counts. Session ended nang walang na-save.');
        this.endSessionUI();
        return;
      }
      this.awaitingSaveConfirm = true;
      this.respond(`Counting complete. I recorded ${counted.length} item${counted.length===1?'':'s'}.` +
        (skipped.length ? ` ${skipped.length} skipped.` : '') + ' Save this inventory?');
    }

    async confirmSave(){
      this.awaitingSaveConfirm = false;
      this.respond('Sino ang nag-count? Sabihin ang pangalan mo, o i-type sa ibaba.');
      const name = prompt('Counted By (para sa record):') || '';
      const btn = this.micBtn;
      try{
        const params = new URLSearchParams({
          action: 'saveNovaCount',
          branch: this.session.branch,
          countedBy: name,
          counts: JSON.stringify(this.session.counted)
        });
        const res = await (await fetch(API_URL + '?' + params.toString())).json();
        if(res.error){
          this.respond('May error sa pag-save: ' + res.error);
        } else {
          this.respond('Inventory saved successfully.');
          ITEMS = [];
        }
      }catch(e){
        this.respond('Hindi na-save — check ang connection mo.');
      }
      this.endSessionUI();
    }

    cancelSave(){
      this.awaitingSaveConfirm = false;
      this.respond('Okay, hindi na-save. Session ended.');
      this.endSessionUI();
    }

    endSessionUI(){
      this.active = false;
      document.getElementById('novaSessionCard').style.display = 'none';
      document.getElementById('novaSetupCard').style.display = 'block';
    }

    handleQuickAction(cmd){
      this.handleTranscript(cmd); // buttons reuse the exact same command parser as speech
    }

    // ---------- Main command parser/dispatcher ----------
    handleTranscript(rawText){
      const text = rawText.trim();
      this.lastCommandEl.textContent = text;
      const lower = text.toLowerCase();

      if(!this.active){
        return; // session hasn't started yet — setup card handles Start button itself
      }

      // Pending yes/no confirmations take priority over everything else.
      if(this.awaitingSaveConfirm){
        if(/^(yes|yeah|yep|save|oo|sige)/i.test(lower)){ this.confirmSave(); return; }
        if(/^(no|cancel|don'?t save|huwag)/i.test(lower)){ this.cancelSave(); return; }
        this.respond("Please say 'Yes, save' or 'No' to cancel.");
        return;
      }

      if(this.session.isComplete()){
        // Session already finished but user is still talking — treat
        // save-related words the same as the confirmation prompt.
        this.finishSession();
        return;
      }

      // ---- Stop / pause ----
      if(/^stop( counting)?$/i.test(lower)){
        this.speech.stop();
        this.respond('Paused. Sabihin "resume" kapag handa ka na.');
        return;
      }
      if(/^resume( counting)?$/i.test(lower)){
        const item = this.session.getCurrentItem();
        this.respond(item ? `Resuming. Next item: ${item.name}.` : 'Walang natitirang item.');
        return;
      }
      if(/^(cancel)$/i.test(lower)){
        this.endSessionUI();
        this.respond('Session cancelled.');
        return;
      }

      // ---- Repeat current item ----
      if(/^repeat$/i.test(lower)){
        const item = this.session.getCurrentItem();
        this.respond(item ? `Current item: ${item.name}.` : 'Wala nang item.');
        return;
      }

      // ---- Skip current item ----
      if(/^skip$/i.test(lower)){
        const item = this.session.getCurrentItem();
        this.session.skipCurrent();
        this.updateDisplay();
        if(this.session.isComplete()){ this.finishSession(); return; }
        const next = this.session.getCurrentItem();
        this.respond(`Skipped ${item ? item.name : ''}. Next item: ${next.name}.`);
        return;
      }

      // ---- Go back one item ----
      if(/^(go back|back)$/i.test(lower)){
        this.session.goBack();
        this.updateDisplay();
        const item = this.session.getCurrentItem();
        this.respond(item ? `Back to ${item.name}. What's the quantity?` : 'Nasa simula na tayo.');
        return;
      }

      // ---- Correction to the most recently recorded item ----
      const correctionMatch = lower.match(/^(correction|change (that|it) to|no,? it'?s)\s*,?\s*(.+)/i);
      if(correctionMatch){
        const qty = parseSpokenNumber(correctionMatch[3]);
        if(qty === null){ this.respond("I didn't catch the quantity. Please say it again."); return; }
        const ok = this.session.correctLast(qty);
        this.currentQtyEl.textContent = qty;
        if(ok){
          this.respond(`Updated. ${this.session.lastRecordedName} is now ${qty}. Next?`);
        } else {
          this.respond('Wala pang na-record na item na pwedeng i-correct.');
        }
        return;
      }

      // ---- "What's left?" ----
      if(/what'?s left/i.test(lower)){
        const remaining = this.session.items.length - this.session.index;
        this.respond(`${remaining} item${remaining===1?'':'s'} left to count.`);
        return;
      }

      // ---- Explicit "Next" (without a number) just repeats the prompt ----
      if(/^next$/i.test(lower)){
        const item = this.session.getCurrentItem();
        this.respond(item ? `Next item: ${item.name}.` : 'Wala nang item.');
        return;
      }

      // ---- Otherwise: try to parse "Item Name, Quantity" or a bare quantity ----
      this.parseItemAndQuantity(text);
    }

    parseItemAndQuantity(text){
      const qty = parseSpokenNumber(text);
      const currentItem = this.session.getCurrentItem();

      // Strip the number/number-words out to see if anything resembling
      // an item name is left — if so, this was "Item Name, Quantity"
      // rather than a bare quantity for the item NOVA already prompted.
      const withoutNumbers = text.replace(/\d+/g, '').replace(
        new RegExp('\\b(' + Object.keys(NOVA_NUMBER_WORDS).join('|') + ')\\b', 'gi'), ''
      ).replace(/[,]/g, ' ').replace(/\bpieces?\b|\bstems?\b/gi, '').trim();

      if(withoutNumbers.length > 2){
        // Looks like an item name was spoken — match it against ALL
        // items in this session (not just the current one), since the
        // user may be naming a different item than the one prompted.
        const { name, score } = matchItemName(withoutNumbers, this.session.items.map(i=>i.name));
        if(score < 0.55 || !name){
          this.respond("I found two possible matches. Please say the item name again.");
          return;
        }
        if(qty === null){
          this.respond(`I heard ${name}, but I didn't hear the quantity.`);
          return;
        }
        if(score < 0.85){
          // Uncertain enough to double-check before writing anything.
          this.pendingConfirmation = { name, qty };
          this.respond(`I heard ${name}. Is that correct?`);
          this._awaitItemConfirm = true;
          return;
        }
        this.recordForItem(name, qty);
        return;
      }

      // Handle a pending "Is that correct?" yes/no from the block above.
      if(this._awaitItemConfirm){
        if(/^(yes|yeah|yep|oo|tama)/i.test(text.toLowerCase())){
          this._awaitItemConfirm = false;
          const { name, qty } = this.pendingConfirmation;
          this.recordForItem(name, qty);
          return;
        }
        if(/^(no|hindi|mali)/i.test(text.toLowerCase())){
          this._awaitItemConfirm = false;
          this.respond('Okay, please say the item name again.');
          return;
        }
      }

      // Bare quantity — applies to whatever item NOVA is currently prompting.
      if(qty === null){
        this.respond("I didn't catch the quantity. Please say it again.");
        return;
      }
      if(!currentItem){
        this.respond('Wala nang item na kailangang bilangin.');
        return;
      }
      this.recordForItem(currentItem.name, qty);
    }

    recordForItem(itemName, qty){
      this.session.recordCount(itemName, qty);
      this.currentQtyEl.textContent = qty;
      this.updateDisplay();
      if(this.session.isComplete()){
        this.finishSession();
        return;
      }
      const next = this.session.getCurrentItem();
      this.respond(`${itemName}, ${qty}. Next item: ${next.name}.`);
    }
  }

  // ---------- Wiring the setup card to ITEMS (populated by loadItems) ----------
  let novaAssistant = null;

  function populateNovaCategories(){
    const sel = document.getElementById('novaCategorySelect');
    const cats = [...new Set(ITEMS.map(it => it['Category']).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">— All Items —</option>' +
      cats.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  document.getElementById('novaStartBtn').addEventListener('click', async ()=>{
    if(ITEMS.length === 0) await loadItems();
    populateNovaCategories();

    const category = document.getElementById('novaCategorySelect').value;
    const branch = document.getElementById('novaBranchSelect').value;

    const sessionItems = ITEMS
      .filter(it => String(it['Branch']||'').trim().toLowerCase() === branch.trim().toLowerCase())
      .filter(it => !category || it['Category'] === category)
      .map(it => ({ name: it['Item Name'], code: it['Item Code'], unit: it['Unit'], branch: it['Branch'] }));

    if(!sessionItems.length){
      alert('Walang items na mahahanap para sa branch/category na ito.');
      return;
    }

    if(!novaAssistant){
      if(!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)){
        document.getElementById('novaUnsupportedMsg').style.display = 'block';
        document.getElementById('novaUnsupportedMsg').textContent =
          'Hindi supported ng browser na ito ang voice recognition. Pwede ka pa ring mag-type ng mga command/quantity gamit ang mga button sa ibaba (Repeat/Skip/Back/Stop), pero walang mic input.';
      }
      novaAssistant = new NovaAssistant();
    }
    novaAssistant.startSession(sessionItems, branch);
  });

  document.getElementById('novaEndSessionBtn').addEventListener('click', ()=>{
    if(novaAssistant){
      novaAssistant.speech.stop();
      novaAssistant.endSessionUI();
    }
  });
