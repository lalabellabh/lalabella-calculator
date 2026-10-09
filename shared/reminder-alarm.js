/* Site-wide reminder alarm: while ANY Lalabella page is open, your reminders for
   today (and overdue ones) pop up as a floating animated alarm that keeps ringing
   until you press Done or Later (Later = ring again in 10 minutes).
   Uses LBDayoffFx (character + sound). Skips pages with no login. */
(function(){
  if (window.LBReminderAlarm) return;
  const API = (window.LB_CONFIG && LB_CONFIG.SCHEDULE_FAST_API) || 'https://zoratiahjeldgsognfsj.supabase.co/functions/v1/schedule-fast';
  const SNOOZE = 'lbRemSnooze', LOCK = 'lbRemRinging', TAB = Math.random().toString(36).slice(2);
  let list = [], today = '', ringing = null, hb = null, started = false;
  const token = () => window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || '';
  const jget = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  function bahMin(){ const d = new Date(Date.now() + 3 * 3600000); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
  function fmt(t){ if (!t) return ''; const p = t.split(':').map(Number), h = p[0], m = p[1]; return (h % 12 || 12) + (m ? ':' + String(m).padStart(2, '0') : '') + (h >= 12 ? 'PM' : 'AM'); }
  function snoozed(date){ const s = jget(SNOOZE) || {}; return (s[date] || 0) > Date.now(); }
  function otherTabRinging(date){ const l = jget(LOCK); return !!(l && l.date === date && l.tab !== TAB && Date.now() - l.ts < 15000); }
  async function call(params, post){
    const p = Object.assign({ token: token() }, params);
    const res = post ? await fetch(API, { method: 'POST', body: new URLSearchParams(p) }) : await fetch(API + '?' + new URLSearchParams(p).toString());
    return res.json();
  }
  function release(){ if (hb) { clearInterval(hb); hb = null; } const l = jget(LOCK); if (l && l.tab === TAB) { try { localStorage.removeItem(LOCK); } catch (e) {} } ringing = null; }
  function ring(r){
    ringing = r.date;
    jset(LOCK, { date: r.date, tab: TAB, ts: Date.now() });
    hb = setInterval(function(){ jset(LOCK, { date: r.date, tab: TAB, ts: Date.now() }); }, 5000);
    const late = r.date < today;
    const when = late ? 'From ' + r.date : 'Today' + (r.remindTime ? ' · ' + fmt(r.remindTime) : '');
    const text = r.reminder + (r.note ? '  —  📝 ' + r.note : '');
    LBDayoffFx.alarm(text, {
      title: '🔔 ' + when,
      onDone: async function(){ release(); try { await call({ action: 'setReminderDone', date: r.date, done: '1' }, true); } catch (e) {} list = list.filter(x => x.date !== r.date); },
      onLater: function(){ const s = jget(SNOOZE) || {}; s[r.date] = Date.now() + 10 * 60000; jset(SNOOZE, s); release(); }
    });
  }
  function tick(){
    if (ringing || !window.LBDayoffFx) return;
    const now = bahMin();
    for (const r of list) {
      if (snoozed(r.date) || otherTabRinging(r.date)) continue;
      if (r.date > today) continue;
      if (r.date === today && r.remindTime) { const p = r.remindTime.split(':').map(Number); if (now < p[0] * 60 + p[1]) continue; }
      ring(r); return;
    }
  }
  async function refresh(){
    if (!token()) return;
    try {
      const d = await call({ action: 'getMyReminders' });
      if (!d || !d.success) return;
      today = d.today; list = d.reminders || [];
      if (ringing && !list.some(x => x.date === ringing)) { try { LBDayoffFx.stop(); } catch (e) {} release(); }
      tick();
    } catch (e) {}
  }
  function start(){
    if (started) return; started = true;
    function go(){ setTimeout(refresh, 2500); setInterval(refresh, 60000); setInterval(tick, 15000);
      document.addEventListener('visibilitychange', function(){ if (!document.hidden) refresh(); }); }
    if (window.LBDayoffFx) go();
    else { const s = document.createElement('script'); s.src = 'shared/dayoff-fx.js'; s.onload = go; document.body.appendChild(s); }
  }
  window.LBReminderAlarm = { refresh: refresh };
  start();
})();
