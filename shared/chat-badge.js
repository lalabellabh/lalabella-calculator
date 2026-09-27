/**
 * LALABELLA CHAT BADGE — the 💬 unread counter on Home, Flower Tools and
 * Item Inventory.
 *
 * Counts group messages AND private messages sent to you.
 * Updates instantly when someone sends a message (Supabase Realtime ping via
 * shared/chat-live.js), with a slow 5-minute check as a fallback. Counts
 * messages from OTHER staff newer than the last one this device saw in the
 * chat (chatbox.html saves that id). Plays a soft sound on new messages.
 *
 * Uses the page's own elements: #msgBadge (the number) and, if present,
 * #msgBtn (gets class "has-new"). Needs shared/config.js.
 */
(function () {
  const FALLBACK_MS = 5 * 60 * 1000;
  let lastCount = -1, busy = false, ctx = null;

  function token() { return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; }
  // What this device has already seen, per chat (saved by chatbox.html).
  function seen() {
    try {
      const s = JSON.parse(localStorage.getItem('lbChatSeen') || '{}') || {};
      if (!s.group) s.group = Number(localStorage.getItem('lalabellaChatLastSeenId')) || 0;
      return s;
    } catch (e) { return {}; }
  }

  function show(count) {
    const badge = document.getElementById('msgBadge');
    const btn = document.getElementById('msgBtn');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 9 ? '9+' : String(count);
      badge.style.display = 'flex'; badge.classList.add('show');
      if (btn) btn.classList.add('has-new');
    } else {
      badge.style.display = 'none'; badge.classList.remove('show');
      if (btn) btn.classList.remove('has-new');
    }
  }
  function ding() {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 660;
      const now = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(now + 0.35);
    } catch (e) {}
  }

  async function check() {
    if (busy || document.hidden || !token() || !window.lbChatApi) return;
    busy = true;
    try {
      const sn = seen();
      const d = await lbChatApi('unread', { seenGroup: sn.group || 0, seenDm: sn.dm || {} });
      if (d && d.success) {
        if (lastCount >= 0 && d.count > lastCount) ding();
        lastCount = d.count;
        show(d.count);
      }
    } catch (e) {}
    busy = false;
  }

  function start() {
    check();
    setInterval(check, FALLBACK_MS);
    if (window.lbChatLive) lbChatLive.onPing(check);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('lb:user-changed', check);

  // Load the shared live listener if this page hasn't already.
  function boot() {
    if (window.lbChatLive) return setTimeout(start, 800);
    const s = document.createElement('script');
    s.src = 'shared/chat-live.js';
    s.onload = () => setTimeout(start, 800);
    document.head.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
