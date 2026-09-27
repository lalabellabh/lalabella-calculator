/**
 * LALABELLA CHAT BADGE — the 💬 unread counter on Home, Flower Tools and
 * Item Inventory. Replaces the old Firebase listener.
 *
 * Every 30 seconds (only while the page is visible) it asks the Auth
 * backend how many messages from OTHER staff are newer than the last one
 * this device saw in the chat (chatbox.html saves that id). Plays a soft
 * sound when a new message arrives.
 *
 * Uses the page's own elements: #msgBadge (the number) and, if present,
 * #msgBtn (gets class "has-new"). Needs shared/config.js.
 */
(function () {
  const POLL_MS = 30000;
  let lastCount = -1, busy = false, ctx = null;

  function token() { return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; }
  function seenId() { try { return Number(localStorage.getItem('lalabellaChatLastSeenId')) || 0; } catch (e) { return 0; } }

  function show(count) {
    const badge = document.getElementById('msgBadge');
    const btn = document.getElementById('msgBtn');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 9 ? '9+' : String(count);
      badge.style.display = 'flex';
      badge.classList.add('show');
      if (btn) btn.classList.add('has-new');
    } else {
      badge.style.display = 'none';
      badge.classList.remove('show');
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
    if (busy || document.hidden || !token() || !window.LB_CONFIG) return;
    busy = true;
    try {
      const p = new URLSearchParams({ action: 'chatUnread', sinceId: seenId(), token: token(), _ts: Date.now() });
      const d = await fetch(LB_CONFIG.AUTH_API + '?' + p.toString()).then(r => r.json());
      if (d && d.success) {
        if (lastCount >= 0 && d.count > lastCount) ding();
        lastCount = d.count;
        show(d.count);
      }
    } catch (e) {}
    busy = false;
  }

  function start() { check(); setInterval(check, POLL_MS); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('lb:user-changed', check);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 1500));
  else setTimeout(start, 1500);
})();
