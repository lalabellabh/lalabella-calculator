// ==UserScript==
// @name         Lalabella Order Assistant
// @namespace    lalabella-order-assistant
// @version      2.1
// @description  v2.1 also sends the New Orders list (orders given to a branch) to the Lalabella system for the Live Orders page. SAFE MODE — watches an opened order for its delivery address, calculates the nearest branch from your Branch Config list, and shows a recommendation. Does NOT auto-click Assign. Diagnostic panel is hidden by default (Ctrl+Shift+L to reveal).
// @match        https://lalabella.web.app/*
// @grant        none
// ==/UserScript==

(function(){
  'use strict';

  // v1.6: now talks to the Supabase function (the old Apps Script address is dead, so the bell never got updates).
  const BRANCH_API = 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/orderassign-fast';
  const AUTOMATION_KEY = 'PASTE-YOUR-KEY-HERE';   // <- copy this line from your old script (never commit the real key)

  // ---------- Styles ----------
  const style = document.createElement('style');
  style.textContent = `
    #loa-panel{
      position:fixed; top:12px; left:12px; z-index:2147483647;
      width:320px; max-height:85vh; overflow-y:auto;
      background:#1f1310; color:#f0e4da; font-family:monospace; font-size:12px;
      border:2px solid #d9a441; border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.5);
      padding:12px;
      display:none;
    }
    #loa-panel.loa-revealed{ display:block; }
    #loa-panel h3{ margin:0 0 8px; color:#d9a441; font-size:14px; cursor:move; user-select:none; }
    #loa-panel .loa-row{ margin-bottom:6px; }
    #loa-panel .loa-label{ color:#9a8a7a; }
    #loa-panel .loa-close{
      position:absolute; top:8px; right:10px; background:none; color:#9a8a7a; font-size:16px; padding:0; cursor:pointer;
    }
    #loa-panel .loa-pill{
      display:inline-block; padding:3px 8px; border-radius:6px; font-weight:bold; font-size:11px;
    }
    #loa-panel .loa-pill.on{ background:#3d7a4f; }
    #loa-panel .loa-pill.off{ background:#6a5a4a; }

    #loa-card{
      position:fixed; bottom:16px; right:16px; z-index:2147483647;
      width:300px; background:#fff; color:#3a2a20; font-family:'Space Grotesk',sans-serif; font-size:13px;
      border:2px solid #6b4226; border-radius:14px; box-shadow:0 14px 34px rgba(0,0,0,.35);
      padding:16px; display:none;
    }
    #loa-card.show{ display:block; }
    #loa-card h4{ margin:0 0 10px; color:#4a2c18; font-size:15px; }
    #loa-card .loa-line{ margin-bottom:6px; line-height:1.5; }
    #loa-card .loa-line b{ color:#6b4226; }
    #loa-card .loa-needs-review{ color:#a63333; font-weight:bold; }
    #loa-card .loa-actions{ margin-top:12px; display:flex; gap:8px; }
    #loa-card button{
      flex:1; padding:9px 0; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:12.5px;
    }
    #loa-card .loa-assign-btn{ background:linear-gradient(135deg,#d9a441,#b8860b); color:#2a1a0a; }
    #loa-card .loa-skip-btn{ background:#eee; color:#555; }
  `;
  document.head.appendChild(style);

  // ---------- Inspector-style status panel — hidden by default. ----------
  const panel = document.createElement('div');
  panel.id = 'loa-panel';
  panel.innerHTML = `
    <button class="loa-close" id="loa-close" title="Close">✕</button>
    <h3>🧭 Lalabella Order Assistant</h3>
    <div class="loa-row"><span class="loa-label">Accessibility:</span> <span class="loa-pill off" id="loa-a11y-status">enabling…</span></div>
    <div class="loa-row"><span class="loa-label">Branches loaded:</span> <b id="loa-branch-count">—</b></div>
    <div class="loa-row" style="color:#9a8a7a;font-size:11px;">Open an unassigned order — a recommendation card will appear automatically if a delivery address is found. SAFE MODE: nothing is auto-clicked.</div>
    <button id="loa-debug" style="margin-top:8px;background:#6a5a4a;color:#fff;border:none;border-radius:6px;padding:7px 12px;font-weight:bold;cursor:pointer;font-size:12px;">Show Raw Text (Debug)</button>
    <button id="loa-debug-branches" style="margin-top:8px;background:#6a5a4a;color:#fff;border:none;border-radius:6px;padding:7px 12px;font-weight:bold;cursor:pointer;font-size:12px;">Show Loaded Branches</button>
    <button id="loa-debug-report" style="margin-top:8px;background:#3d7a4f;color:#fff;border:none;border-radius:6px;padding:7px 12px;font-weight:bold;cursor:pointer;font-size:12px;">Show Report Preview</button>
    <button id="loa-debug-clickables" style="margin-top:8px;background:#3a5c8a;color:#fff;border:none;border-radius:6px;padding:7px 12px;font-weight:bold;cursor:pointer;font-size:12px;">Show Clickable Texts</button>
    <button id="loa-debug-new" style="margin-top:8px;background:#c9506b;color:#fff;border:none;border-radius:6px;padding:7px 12px;font-weight:bold;cursor:pointer;font-size:12px;">Show New Orders (Live Orders)</button>
    <pre id="loa-debug-out" style="display:none;background:#120b09;border:1px solid #3a2a20;border-radius:6px;padding:8px;white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto;margin-top:8px;font-size:11px;"></pre>
    <button id="loa-copy-btn" style="display:none;margin-top:6px;background:#d9a441;color:#1f1310;border:none;border-radius:6px;padding:7px 12px;font-weight:bold;cursor:pointer;font-size:12px;width:100%;">📋 Copy Debug Text</button>
  `;
  document.body.appendChild(panel);
  document.getElementById('loa-close').addEventListener('click', ()=> panel.classList.remove('loa-revealed'));

  document.addEventListener('keydown', (e)=>{
    if(e.ctrlKey && e.altKey && e.key.toLowerCase() === 'l'){
      panel.classList.toggle('loa-revealed');
    }
  });

  (function makeDraggable(handleEl, panelEl){
    let dragging = false, offsetX = 0, offsetY = 0;
    handleEl.addEventListener('pointerdown', e=>{
      if(e.target.closest('button')) return;
      dragging = true;
      const rect = panelEl.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      handleEl.setPointerCapture(e.pointerId);
    });
    handleEl.addEventListener('pointermove', e=>{
      if(!dragging) return;
      panelEl.style.left = (e.clientX - offsetX) + 'px';
      panelEl.style.top = (e.clientY - offsetY) + 'px';
    });
    handleEl.addEventListener('pointerup', ()=> dragging = false);
    handleEl.addEventListener('pointercancel', ()=> dragging = false);
  })(panel.querySelector('h3'), panel);

  // ---------- Recommendation card ----------
  const card = document.createElement('div');
  card.id = 'loa-card';
  document.body.appendChild(card);

  // ---------- Step 1: auto-enable Flutter's accessibility semantics ----------
  function enableAccessibility(){
    const placeholder = document.querySelector('flt-semantics-placeholder')
      || document.querySelector('[aria-label*="ccessib" i]');
    if(!placeholder){
      setTimeout(enableAccessibility, 800);
      return;
    }
    ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(type=>{
      placeholder.dispatchEvent(new MouseEvent(type, { bubbles:true, cancelable:true, view:window }));
    });
    const statusEl = document.getElementById('loa-a11y-status');
    if(statusEl){ statusEl.textContent = 'enabled'; statusEl.className = 'loa-pill on'; }
  }
  setTimeout(enableAccessibility, 2000);

  // ---------- Step 2: load branch config ----------
  let branches = [];
  function loadBranches(){
    fetch(BRANCH_API + '?action=getBranchConfig&automationKey=' + encodeURIComponent(AUTOMATION_KEY))
      .then(r => r.json())
      .then(data => {
        branches = (Array.isArray(data) ? data : [])
          .map(b => ({
            name: b.Name || '',
            lat: parseFloat(b.Latitude),
            lng: parseFloat(b.Longitude),
            keywords: String(b.Keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
          }))
          .filter(b => b.name);
        const countEl = document.getElementById('loa-branch-count');
        if(countEl) countEl.textContent = branches.length + (branches.length === 1 ? ' branch' : ' branches');
      })
      .catch(()=>{
        const countEl = document.getElementById('loa-branch-count');
        if(countEl) countEl.textContent = 'failed to load';
      });
  }
  loadBranches();

  document.getElementById('loa-debug-branches').addEventListener('click', ()=>{
    const out = document.getElementById('loa-debug-out');
    out.style.display = 'block';
    document.getElementById('loa-copy-btn').style.display = 'block';
    if(!branches.length){
      out.textContent = '(no branches currently loaded — fetch may have failed, or the list is empty)';
      return;
    }
    out.textContent = branches.map((b, i) =>
      `${i+1}. "${b.name}"\n   lat=${b.lat} lng=${b.lng}\n   keywords=[${b.keywords.map(k=>'"'+k+'"').join(', ')}]`
    ).join('\n\n');
  });

  document.getElementById('loa-debug-report').addEventListener('click', async ()=>{
    const out = document.getElementById('loa-debug-out');
    out.style.display = 'block';
    document.getElementById('loa-copy-btn').style.display = 'block';
    const { orders, headingIdx } = collectUnassignedOrders();

    let text = 'headingIdx: ' + headingIdx + '\n';
    text += 'Orders collected: ' + orders.length + '\n\n';
    text += orders.length
      ? orders.map((o, i) => (i+1) + '. ' + o.orderNo + ' — ' + (o.address || '(no address)')).join('\n')
      : '(collectUnassignedOrders found ZERO orders — this is why the bell is empty)';
    out.textContent = text + '\n\n--- Sending to server now... ---';

    try{
      const detail = await withBranches(orders);
      text += '\n\n' + detail.map(o => o.orderNo + ' → ' + (o.branch || 'FOR MANUAL ASSIGN') + (o.note ? ' (' + o.note + ')' : '')).join('\n');
      const body = new URLSearchParams({
        action: 'reportUnassignedStatus',
        automationKey: AUTOMATION_KEY,
        count: String(detail.length),
        orderNumbers: detail.map(o => o.orderNo).join(','),
        ordersDetail: JSON.stringify(detail)
      });
      const res = await fetch(BRANCH_API, { method: 'POST', body });
      const json = await res.json();
      out.textContent = text + '\n\n--- Server response ---\n' + JSON.stringify(json);
    }catch(err){
      out.textContent = text + '\n\n--- Server FETCH FAILED ---\n' + String(err);
    }
  });

  // New debug button — shows EXACTLY what getElementLabel_() reads for
  // every candidate element, so a future "not found" mismatch can be
  // diagnosed in seconds instead of guessing again.
  document.getElementById('loa-debug-clickables').addEventListener('click', ()=>{
    const out = document.getElementById('loa-debug-out');
    out.style.display = 'block';
    document.getElementById('loa-copy-btn').style.display = 'block';
    const candidates = document.querySelectorAll('flt-semantics, button, [role="menuitem"], [role="button"], [role="option"], li, a');
    const rows = [...candidates].map((el, i) => {
      const label = getElementLabel_(el);
      return label ? `${i}: "${label}"` : null;
    }).filter(Boolean);
    out.textContent = rows.length ? rows.join('\n') : '(no labeled elements found)';
  });

  document.getElementById('loa-debug').addEventListener('click', ()=>{
    const { orderNo, addressText, allLines } = scanForOrderDetails();
    const out = document.getElementById('loa-debug-out');
    out.style.display = 'block';
    document.getElementById('loa-copy-btn').style.display = 'block';
    out.textContent = 'Order: ' + (orderNo || '(none)') + '\nExtracted address: ' + (addressText || '(none)') + '\n\n--- All visible lines ---\n' +
      allLines.map((l, i) => i + ': ' + l).join('\n');
  });

  // ---------- Semi-automated branch assignment ----------

  // v1.5 FIX: even with correct coordinates, dispatching on the
  // flt-semantics accessibility element itself still did nothing —
  // the dropdown never opened. This strongly suggests these
  // accessibility nodes exist ONLY for screen readers and aren't
  // Flutter's real interactive surface; the actual click-handling
  // lives on Flutter's canvas/glass-pane layer, positioned
  // underneath (or overlapping) the accessibility tree. The fix:
  // use document.elementFromPoint(x, y) to find whatever element is
  // TRULY rendered at that screen position — exactly what a real
  // finger/mouse would hit — and dispatch there instead. Falls back
  // to the accessibility element itself if elementFromPoint somehow
  // returns nothing usable.
  function simulateRealClick(el){
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const realTarget = document.elementFromPoint(x, y) || el;
    console.log('[Lalabella Assistant] Accessibility element:', el, '— actual element at that point:', realTarget);

    const opts = {
      bubbles: true, cancelable: true, view: window,
      clientX: x, clientY: y, button: 0, buttons: 1
    };
    ['mousedown','mouseup','click'].forEach(type=>{
      realTarget.dispatchEvent(new MouseEvent(type, opts));
    });
  }

  function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

  // Flutter's accessibility semantics tree (flt-semantics elements)
  // very often carries its label in the aria-label attribute rather
  // than as a real visible text node — the app paints everything to a
  // canvas and only exposes labels for screen readers via ARIA, so
  // textContent alone can come back empty even though the option is
  // plainly visible on screen. Checking aria-label first, with
  // textContent/innerText as fallbacks, covers both rendering styles.
  function getElementLabel_(el){
    const ariaLabel = el.getAttribute && el.getAttribute('aria-label');
    if(ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
    const innerText = (el.innerText || '').trim();
    if(innerText) return innerText;
    return (el.textContent || '').trim();
  }

  // Finds a clickable-looking element whose label matches — tries an
  // EXACT match first, then falls back to "starts with" so a trailing
  // dropdown-arrow icon or extra whitespace baked into the label
  // doesn't silently defeat the search.
  function findClickableByExactText(text){
    const candidates = document.querySelectorAll('flt-semantics, button, [role="menuitem"], [role="button"], [role="option"], li, a');
    const target = text.trim().toLowerCase();
    let startsWithMatch = null;
    for(const el of candidates){
      const elText = getElementLabel_(el).toLowerCase();
      if(!elText) continue;
      if(elText === target) return el;
      if(!startsWithMatch && elText.startsWith(target)) startsWithMatch = el;
    }
    return startsWithMatch;
  }

  // Position-based fallback — maps each branch to its FIXED slot in
  // the dropdown (1st, 2nd, 3rd as it currently appears: Qalali,
  // Moda mall, Hamala), and drives selection with real ArrowDown/
  // Enter keyboard events instead of clicking a specific DOM element.
  // This sidesteps the text-matching problem entirely: it doesn't
  // matter what label the Flutter semantics tree exposes (or fails
  // to), only how many times to press Down. Update this map if the
  // dropdown's own ordering ever changes.
  const BRANCH_DROPDOWN_POSITION = {
    'galali': 1, 'qalali': 1,
    'modamall': 2, 'moda mall': 2,
    'hamala': 3
  };
  function getBranchPosition_(branchName){
    const key = branchName.trim().toLowerCase().replace(/\s+/g, ' ');
    if(BRANCH_DROPDOWN_POSITION[key] !== undefined) return BRANCH_DROPDOWN_POSITION[key];
    const noSpaceKey = key.replace(/\s+/g, '');
    return BRANCH_DROPDOWN_POSITION[noSpaceKey];
  }

  function dispatchKey(el, key, code){
    ['keydown','keyup'].forEach(type=>{
      el.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles:true, cancelable:true }));
    });
  }

  async function selectBranchByKeyboard_(position){
    // Whatever element the dropdown just opened onto (or the button
    // itself, if focus didn't move) is where the arrow-key events
    // need to be sent — Flutter's own key handling reads from
    // document.activeElement, same as any native <select>.
    const active = document.activeElement || document.body;
    for(let i = 0; i < position; i++){
      dispatchKey(active, 'ArrowDown', 'ArrowDown');
      await sleep(180);
    }
    dispatchKey(active, 'Enter', 'Enter');
    await sleep(300);
  }

  async function autoAssignBranch(branchName){
    console.log('[Lalabella Assistant] autoAssignBranch starting for branch:', branchName);

    const selectBtn = findClickableByExactText('Select a branch');
    if(!selectBtn){
      const allTexts = [...document.querySelectorAll('flt-semantics, button, [role="menuitem"], [role="button"], [role="option"], li, a')]
        .map(el => getElementLabel_(el)).filter(Boolean);
      console.warn('[Lalabella Assistant] "Select a branch" button NOT found. Visible clickable texts on page:', allTexts);
      showAssignError('Hindi mahanap ang "Select a branch" button sa page. I-check ang browser console (F12) para makita ang mga candidate texts.');
      return false;
    }
    console.log('[Lalabella Assistant] Found "Select a branch" element:', getElementLabel_(selectBtn), 'at', selectBtn.getBoundingClientRect());
    simulateRealClick(selectBtn);
    await sleep(500);

    // First try matching by label (works whenever aria-label/text IS
    // readable). Only fall back to blind keyboard positioning if that
    // genuinely can't find anything — keeps the more precise,
    // self-verifying method as the default.
    const branchOption = findClickableByExactText(branchName);
    if(branchOption){
      console.log('[Lalabella Assistant] Found branch option:', getElementLabel_(branchOption), 'at', branchOption.getBoundingClientRect(), '— clicking now.');
      simulateRealClick(branchOption);
      return true;
    }

    const position = getBranchPosition_(branchName);
    if(position === undefined){
      console.warn('[Lalabella Assistant] Branch "' + branchName + '" NOT found in dropdown, and no known keyboard position for it either.');
      showAssignError('Hindi mahanap ang "' + branchName + '" sa dropdown, at wala ring alam na posisyon para dito. I-update ang BRANCH_DROPDOWN_POSITION sa script.');
      return false;
    }
    console.log('[Lalabella Assistant] Label match failed — falling back to keyboard navigation, position', position);
    await selectBranchByKeyboard_(position);
    return true;
  }

  function showAssignError(message){
    card.innerHTML = `<h4>⚠ Auto-assign Failed</h4><div class="loa-line" style="color:#a63333;">${message}</div><div class="loa-actions"><button class="loa-skip-btn" id="loa-skip-btn" style="flex:1">Dismiss</button></div>`;
    const skipBtn = document.getElementById('loa-skip-btn');
    if(skipBtn) skipBtn.addEventListener('click', ()=> card.classList.remove('show'));
  }

  // ---------- Distance math (Haversine — real-world distance in km) ----------
  function haversineKm(lat1, lng1, lat2, lng2){
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  async function geocodeAddress(addressText){
    try{
      const query = encodeURIComponent(addressText + ', Bahrain');
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
        headers: { 'Accept-Language': 'en' }
      });
      const data = await res.json();
      if(data && data.length > 0){
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
    }catch(e){}
    return null;
  }

  async function findNearestBranch(addressText){
    const lower = addressText.toLowerCase();
    const matches = branches.filter(b => b.keywords.some(k => k && lower.includes(k)));
    if(matches.length === 1){
      return { branch: matches[0], confident: true, method: 'keyword' };
    }

    const coords = await geocodeAddress(addressText);
    if(coords && branches.length > 0){
      let nearest = null, nearestDist = Infinity;
      branches.forEach(b=>{
        if(isNaN(b.lat) || isNaN(b.lng)) return;
        const dist = haversineKm(coords.lat, coords.lng, b.lat, b.lng);
        if(dist < nearestDist){ nearestDist = dist; nearest = b; }
      });
      if(nearest){
        return {
          branch: nearest, confident: true, method: 'coordinates',
          distanceKm: nearestDist.toFixed(1)
        };
      }
    }

    if(matches.length > 1){
      return { branch: null, confident: false, reason: 'Multiple branches match this address (' + matches.map(m=>m.name).join(', ') + ')' };
    }
    return { branch: null, confident: false, reason: 'No branch keyword matched, and the address could not be located on the map' };
  }

  function getPageTextExcludingOurPanels(){
    const ownPanelIds = ['loa-panel', 'loa-card', 'lbi-panel'];
    const hidden = [];
    ownPanelIds.forEach(id => {
      const el = document.getElementById(id);
      if(el && el.style.display !== 'none'){
        hidden.push({ el, prevDisplay: el.style.display });
        el.style.display = 'none';
      }
    });
    const text = document.body.innerText || '';
    hidden.forEach(({ el, prevDisplay }) => { el.style.display = prevDisplay; });
    return text;
  }

  function scanForOrderDetails(){
    const bodyText = getPageTextExcludingOurPanels();
    const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);

    const dateTimePattern = /\b\d{1,2}:\d{2}\s*(AM|PM)\b/i;
    const stopWords = /^(print|mark as ready|assign|skip|select a branch|processed orders|completed orders|new orders|unassigned orders)\s*:?\d*$/i;

    const unassignedHeadingIdx = lines.findIndex(l => /^unassigned orders\s*:?\s*\d*$/i.test(l));
    let orderNo = null;
    let orderIndex = -1;
    if(unassignedHeadingIdx !== -1){
      const nextHeadingIdx = lines.findIndex((l, idx) =>
        idx > unassignedHeadingIdx && /^(new orders|processed orders|completed orders)\s*:?\s*\d*$/i.test(l)
      );
      const sectionEnd = nextHeadingIdx !== -1 ? nextHeadingIdx : lines.length;
      for(let i = unassignedHeadingIdx + 1; i < sectionEnd; i++){
        const m = lines[i].match(/#\d{3,7}/);
        if(m){ orderNo = m[0]; orderIndex = i; break; }
      }
    }

    let addressText = null;
    if(orderIndex !== -1){
      const immediateNext = lines[orderIndex + 1];
      if(immediateNext && !stopWords.test(immediateNext) && !dateTimePattern.test(immediateNext) && !/^#\d{3,7}$/.test(immediateNext)){
        addressText = immediateNext;
      }

      if(!addressText){
        for(let i = orderIndex + 1; i < Math.min(orderIndex + 6, lines.length); i++){
          if(dateTimePattern.test(lines[i])){
            const next = lines[i + 1];
            if(next && !stopWords.test(next) && !/^#\d{3,7}$/.test(next)){
              addressText = next;
            }
            break;
          }
        }
      }
    }

    return { orderNo, addressText, allLines: lines };
  }

  let activeCountdownTimer = null;
  let assigning = false; // true while an auto-assign click sequence is running (page must not reload then)

  function showCard({ orderNo, addressText, result }){
    if(activeCountdownTimer){ clearInterval(activeCountdownTimer); activeCountdownTimer = null; }

    let html = `<h4>📦 Order ${orderNo || '(number not found)'}</h4>`;
    html += `<div class="loa-line"><b>Address:</b> ${addressText || '(not found)'}</div>`;

    if(result.confident){
      html += `<div class="loa-line"><b>Nearest branch:</b> ${result.branch.name}</div>`;
      if(result.method === 'coordinates'){
        html += `<div class="loa-line" style="color:#8a766a;font-size:11px;">📍 Na-determine gamit ang map coordinates (~${result.distanceKm} km) — walang tumugmang keyword sa address na ito.</div>`;
      }
      html += `<div class="loa-line" id="loa-countdown-line" style="color:#8a766a;font-size:11.5px;">Auto-a-assign sa <b id="loa-countdown-num">60</b>s kung walang kilos…</div>`;
      html += `<div class="loa-actions">
        <button class="loa-assign-btn" id="loa-assign-btn">Use this branch</button>
        <button class="loa-skip-btn" id="loa-skip-btn">Skip</button>
      </div>`;
    } else {
      html += `<div class="loa-line loa-needs-review">⚠ Needs Review — ${result.reason}</div>`;
      html += `<div class="loa-actions">
        <button class="loa-skip-btn" id="loa-skip-btn" style="flex:1">Dismiss</button>
      </div>`;
    }
    card.innerHTML = html;
    card.classList.add('show');

    async function doAssign(){
      if(activeCountdownTimer){ clearInterval(activeCountdownTimer); activeCountdownTimer = null; }
      const assignBtn = document.getElementById('loa-assign-btn');
      if(assignBtn){ assignBtn.disabled = true; assignBtn.textContent = 'Nag-a-assign…'; }
      assigning = true;
      let success = false;
      try{ success = await autoAssignBranch(result.branch.name); } finally { assigning = false; }
      if(success){
        card.innerHTML = `<h4>✅ Na-assign na</h4><div class="loa-line">Order ${orderNo || ''} → ${result.branch.name}</div><div class="loa-line" style="color:#8a766a;font-size:11.5px;">I-verify mo sa listahan na tama ito.</div>`;
        setTimeout(()=> card.classList.remove('show'), 4000);
      } else if(assignBtn){
        assignBtn.disabled = false;
        assignBtn.textContent = 'Use this branch';
      }
    }

    const skipBtn = document.getElementById('loa-skip-btn');
    if(skipBtn) skipBtn.addEventListener('click', ()=>{
      if(activeCountdownTimer){ clearInterval(activeCountdownTimer); activeCountdownTimer = null; }
      card.classList.remove('show');
    });

    const assignBtn = document.getElementById('loa-assign-btn');
    if(assignBtn){
      assignBtn.addEventListener('click', ()=>{
        const confirmed = confirm(
          'I-a-assign ang Order ' + (orderNo || '') + ' sa "' + result.branch.name + '"?\n\n' +
          'Address: ' + addressText + '\n\n' +
          'Susubukan itong i-click nang otomatiko sa dropdown. Tama ba ito?'
        );
        if(!confirmed) return;
        doAssign();
      });

      let secondsLeft = 60;
      activeCountdownTimer = setInterval(()=>{
        secondsLeft--;
        const numEl = document.getElementById('loa-countdown-num');
        if(numEl) numEl.textContent = String(secondsLeft);
        if(secondsLeft <= 0){
          clearInterval(activeCountdownTimer);
          activeCountdownTimer = null;
          doAssign();
        }
      }, 1000);
    }
  }

  const processedSignatures = new Set();
  async function checkForNewOrder(){
    const { orderNo, addressText } = scanForOrderDetails();

    if(!addressText){
      if(orderNo){
        const noAddrSignature = 'NOADDR|' + orderNo;
        if(!processedSignatures.has(noAddrSignature)){
          processedSignatures.add(noAddrSignature);
          showNoAddressCard(orderNo);
        }
      }
      return;
    }

    const signature = (orderNo || '') + '|' + addressText;
    if(processedSignatures.has(signature)) return;
    processedSignatures.add(signature);

    const result = await findNearestBranch(addressText);
    showCard({ orderNo, addressText, result });
  }

  function showNoAddressCard(orderNo){
    card.innerHTML = `
      <h4>📦 Order ${orderNo}</h4>
      <div class="loa-line loa-needs-review">⚠ Kulang ang address — kailangang tawagan ang receiver para makuha ang lokasyon.</div>
      <div class="loa-actions">
        <button class="loa-skip-btn" id="loa-skip-btn" style="flex:1">Dismiss</button>
      </div>
    `;
    card.classList.add('show');
    document.getElementById('loa-skip-btn').addEventListener('click', ()=> card.classList.remove('show'));
  }

  const observer = new MutationObserver(checkForNewOrder);
  observer.observe(document.body, { childList:true, subtree:true, characterData:true });

  setTimeout(checkForNewOrder, 3500);

  // Same address rule the recommendation card uses: the line right after the order number,
  // otherwise the line after the delivery time.
  function addressAfter(lines, i){
    const dateTimePattern = /\b\d{1,2}:\d{2}\s*(AM|PM)\b/i;
    const stop = /^(print|mark as ready|assign|skip|select a branch|processed orders|completed orders|new orders|unassigned orders)\s*:?\d*$/i;
    const immediateNext = lines[i + 1];
    if(immediateNext && !stop.test(immediateNext) && !dateTimePattern.test(immediateNext) && !/^#\d{3,7}$/.test(immediateNext)) return immediateNext;
    for(let j = i + 1; j < Math.min(i + 6, lines.length); j++){
      if(dateTimePattern.test(lines[j])){
        const next = lines[j + 1];
        if(next && !stop.test(next) && !/^#\d{3,7}$/.test(next)) return next;
        break;
      }
    }
    return '';
  }

  function collectUnassignedOrders(){
    const bodyText = getPageTextExcludingOurPanels();
    const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);
    const headingIdx = lines.findIndex(l => /^unassigned orders\s*:?\s*\d*$/i.test(l));
    if(headingIdx === -1) return { orders: [], headingIdx: -1, allLines: lines };

    const nextHeadingIdx = lines.findIndex((l, idx) =>
      idx > headingIdx && /^(new orders|processed orders|completed orders)\s*:?\s*\d*$/i.test(l)
    );
    const sectionEnd = nextHeadingIdx !== -1 ? nextHeadingIdx : lines.length;

    const orders = [];
    for(let i = headingIdx + 1; i < sectionEnd; i++){
      const m = lines[i].match(/#\d{3,7}/);
      if(!m) continue;
      orders.push({ orderNo: m[0], address: addressAfter(lines, i) });
    }
    return { orders, headingIdx, sectionEnd, allLines: lines };
  }

  // For every unassigned order work out WHERE it should go, so the bell can show it.
  // branch = '' means "for manual assign" (no keyword matched and the address could not be located).
  // Results are remembered per order+address, so the map lookup runs only once.
  const recoCache = new Map();
  async function withBranches(orders){
    const out = [];
    for(const o of orders){
      if(!o.address){ out.push({ ...o, branch: '', method: '', note: 'Walang address — tawagan ang receiver' }); continue; }
      const key = o.orderNo + '|' + o.address;
      if(!recoCache.has(key)){
        if(!branches.length){ out.push({ ...o, branch: '', method: '', note: 'Hindi pa na-load ang branch list' }); continue; }
        let r;
        try{ r = await findNearestBranch(o.address); }catch(e){ r = { branch: null, confident: false, reason: 'Hindi ma-check ang address' }; }
        recoCache.set(key, {
          branch: r.confident && r.branch ? r.branch.name : '',
          method: r.confident ? (r.method || '') : '',
          note: r.confident ? (r.method === 'coordinates' ? '~' + r.distanceKm + ' km (map)' : '') : (r.reason || '')
        });
      }
      out.push({ ...o, ...recoCache.get(key) });
    }
    return out;
  }

  // v1.9: right after a page load the dashboard is not drawn yet, so the list looks empty. Reporting that would wipe the
  // list on the server and re-announce every open order as "new" a few seconds later. So for the first 15 s, if the
  // "Unassigned Orders" heading has not appeared yet, do not report anything.
  const LOADED_AT = Date.now();
  const LOAD_GRACE_MS = 15000;
  let reporting = false;
  async function reportUnassignedStatus(){
    if(reporting) return;
    reporting = true;
    try{
      const { orders, headingIdx } = collectUnassignedOrders();
      if(headingIdx === -1 && Date.now() - LOADED_AT < LOAD_GRACE_MS) return;
      const detail = await withBranches(orders);
      const body = new URLSearchParams({
        action: 'reportUnassignedStatus',
        automationKey: AUTOMATION_KEY,
        count: String(detail.length),
        orderNumbers: detail.map(o => o.orderNo).join(','),
        ordersDetail: JSON.stringify(detail)
      });
      await fetch(BRANCH_API, { method: 'POST', body });
    }catch(e){} finally { reporting = false; }
  }
  setInterval(reportUnassignedStatus, 6000);
  setTimeout(reportUnassignedStatus, 2000);

  // ---------- v2.0: LIVE ORDERS ----------
  // Reads the "New Orders" list (orders already given to a branch) and sends the whole list to the system every 6 s.
  // The system page live-orders.html shows it per branch: newest on top, red NEW + gift alarm until someone taps "Nakita ko".
  // Only on the MAIN dashboard (all branches). On a single-branch page (e.g. "MODA MALL") it does not report,
  // otherwise the other branches' orders would look finished.
  const ORDER_START = /^(#\d{3,7}|[A-Za-z]{1,3}[ -]?\d{1,7}|walk[- ]?in)$/i;
  const HEADER_WORDS = /^(number|tag|branch|method|delivery time|sender|receiver|delivery address|price|action|status|driver|create)$/i;
  const ACTION_WORDS = /^(print|mark as ready|assign|accept|reject|select a branch|edit|view|details|cancel|delete)$/i;
  function brKey(s){ s = String(s || '').toLowerCase().replace(/[^a-z]/g, ''); return s === 'galali' ? 'qalali' : s; }
  function isBranchName(l){
    const k = brKey(l); if(!k) return false;
    if(['qalali', 'modamall', 'hamala'].indexOf(k) !== -1) return true;
    return branches.some(b => brKey(b.name) === k);
  }
  function parseNewRow(r, scope){
    const preset = scope && !r.raw.some(isBranchName) ? scope : '';   // branch page without a Branch column
    const o = { orderNo: r.orderNo, tag: '', branch: preset, method: '', date: '', time: '', sender: '', senderPhone: '', receiver: '', receiverPhone: '', address: '', price: '' };
    const dateRx = /\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b/, timeRx = /\d{1,2}:\d{2}\s*(AM|PM)/i, priceRx = /^[\d.,]+\s*(BHD|BD)$/i;
    const methodRx = /^(delivery|pick ?up|pickup|collection|walk[- ]?in|in[- ]?store)$/i, phoneRx = /^\+?[\d\s-]{7,}$/;
    const rest = [], tag = [];
    r.raw.forEach(l => {
      if(!o.branch && isBranchName(l)){ o.branch = l; return; }
      if(!o.branch){ tag.push(l); return; }
      if(!o.method && methodRx.test(l)){ o.method = l; return; }
      if(!o.date && dateRx.test(l)){ o.date = l; const t = l.match(/\d{1,2}:\d{2}\s*(AM|PM).*$/i); if(t){ o.time = t[0]; o.date = l.slice(0, t.index).trim().replace(/[,·-]+$/, ''); } return; }
      if(!o.time && timeRx.test(l)){ o.time = l; return; }
      if(!o.price && priceRx.test(l)){ o.price = l; return; }
      // "Name 3959 5858" on one line -> two parts
      const m = l.match(/^(.*\D)\s+(\+?\d[\d\s-]{6,})$/);
      if(m){ rest.push(m[1].trim(), m[2].trim()); return; }
      rest.push(l);
    });
    o.tag = tag.join(' ');
    const ph = []; rest.forEach((l, i) => { if(phoneRx.test(l)) ph.push(i); });
    if(ph.length >= 2){
      o.sender = rest[ph[0] - 1] || ''; o.senderPhone = rest[ph[0]];
      o.receiver = ph[1] - 1 > ph[0] ? rest[ph[1] - 1] : ''; o.receiverPhone = rest[ph[1]];
      o.address = rest.slice(ph[1] + 1).join(', ');
    } else if(ph.length === 1){
      o.sender = rest[ph[0] - 1] || ''; o.senderPhone = rest[ph[0]];
      o.receiver = rest[ph[0] + 1] || ''; o.address = rest.slice(ph[0] + 2).join(', ');
    } else { o.sender = rest[0] || ''; o.receiver = rest[1] || ''; o.address = rest.slice(2).join(', '); }
    return o;
  }
  function collectNewOrders(){
    const lines = getPageTextExcludingOurPanels().split('\n').map(l => l.trim()).filter(Boolean);
    const unIdx = lines.findIndex(l => /^unassigned orders\s*:?\s*\d*$/i.test(l));
    const h = lines.findIndex(l => /^new orders\s*:?\s*\d*$/i.test(l));
    if(h === -1) return { found: false, why: '"New Orders" heading not on screen', orders: [] };
    // v2.1: the MAIN dashboard shows all branch names at the top (buttons); a BRANCH page shows only its own name
    // (e.g. "MODA MALL"). On a branch page we still report, but only for that branch (scope), so the others stay.
    const top = lines.slice(0, unIdx !== -1 ? unIdx : h);
    const names = [...new Set(top.filter(isBranchName).map(brKey))];
    const scope = names.length === 1 ? top.filter(isBranchName)[0] : '';
    const end0 = lines.findIndex((l, i) => i > h && /^(processed orders|completed orders|unassigned orders)\s*:?\s*\d*$/i.test(l));
    const end = end0 !== -1 ? end0 : lines.length;
    const rows = []; let cur = null;
    for(let i = h + 1; i < end; i++){
      const l = lines[i];
      if(HEADER_WORDS.test(l) || ACTION_WORDS.test(l)) continue;
      if(ORDER_START.test(l) && !isBranchName(l)){ cur = { orderNo: l, raw: [] }; rows.push(cur); continue; }
      if(cur) cur.raw.push(l);
    }
    return { found: true, scope, orders: rows.map(r => parseNewRow(r, scope)) };
  }
  let reportingNew = false;
  async function reportNewOrders(){
    if(reportingNew) return;
    reportingNew = true;
    try{
      if(Date.now() - LOADED_AT < 8000) return;   // let the dashboard draw first
      const r = collectNewOrders();
      if(!r.found) return;
      const body = new URLSearchParams({ action: 'reportNewOrders', automationKey: AUTOMATION_KEY, found: '1', scope: r.scope || '', orders: JSON.stringify(r.orders) });
      await fetch(BRANCH_API, { method: 'POST', body });
    }catch(e){} finally { reportingNew = false; }
  }
  setInterval(reportNewOrders, 6000);
  document.getElementById('loa-debug-new').addEventListener('click', async ()=>{
    const out = document.getElementById('loa-debug-out');
    out.style.display = 'block';
    document.getElementById('loa-copy-btn').style.display = 'block';
    const r = collectNewOrders();
    let text = r.found ? ((r.scope ? 'Branch page: ' + r.scope + ' (reports this branch only)\n' : 'Main dashboard (all branches)\n') + 'New Orders found: ' + r.orders.length + '\n\n' + r.orders.map((o, i) => (i + 1) + '. ' + o.orderNo + ' → ' + (o.branch || '(no branch)') + ' | ' + o.method + ' | ' + o.date + ' ' + o.time + ' | ' + o.sender + ' ' + o.senderPhone + ' → ' + o.receiver + ' ' + o.receiverPhone + ' | ' + o.address + ' | ' + o.price + (o.tag ? ' | tag: ' + o.tag : '')).join('\n')) : ('NOT reporting: ' + r.why);
    out.textContent = text;
  });

  document.getElementById('loa-copy-btn').addEventListener('click', function(){
    const text = document.getElementById('loa-debug-out').textContent;
    const btn = this;
    function showCopied(){
      const original = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(()=>{ btn.textContent = original; }, 1500);
    }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(showCopied).catch(()=>fallbackCopy(text, showCopied));
    } else {
      fallbackCopy(text, showCopied);
    }
  });
  function fallbackCopy(text, onDone){
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try{ document.execCommand('copy'); onDone(); }catch(e){}
    document.body.removeChild(ta);
  }

  // v1.8: Watcher mode — for the dedicated always-open window. Open lalabella.web.app/?watch=1 once in that window
  // (use ?watch=0 to turn it off). While on, the page reloads so the order list never goes stale.
  // v1.9: reloads every 60 s (was 5 min) so new orders reach the system faster. It waits (re-checks every 5 s) while an
  // auto-assign countdown or click sequence is running, so it never cuts an assignment in half.
  try {
    const q = new URLSearchParams(location.search).get('watch');
    if (q === '1') localStorage.setItem('loaWatcher', '1');
    if (q === '0') localStorage.removeItem('loaWatcher');
    if (localStorage.getItem('loaWatcher') === '1') {
      const RELOAD_MS = 60 * 1000;
      const tryReload = function(){
        if(activeCountdownTimer || assigning){ setTimeout(tryReload, 5000); return; }
        location.reload();
      };
      setTimeout(tryReload, RELOAD_MS);
    }
  } catch(e) {}
})();
