/**
 * LALABELLA CHAT LIVE — instant "new message" signal for the staff chat.
 *
 * Listens on Supabase Realtime (public channel "lalabella-chat") for a tiny
 * "ping" that the chat Edge Function sends after every new or deleted
 * message. The ping carries NO message content — pages then fetch the new
 * messages from the chat Edge Function with their own login token.
 *
 * Usage:  lbChatLive.onPing(fn)      fn() runs on every new/deleted message
 *         lbChatLive.onStatus(fn)    fn(true|false) when connected / not
 *         lbChatApi(action, params)  calls the chat Edge Function
 * Needs shared/config.js. Loads supabase-js from the CDN on its own.
 */
(function () {
  const pingFns = [], statusFns = [];
  let connected = false;

  function token() { return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; }

  window.lbChatApi = async function (action, params) {
    const res = await fetch(LB_CONFIG.CHAT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: LB_CONFIG.SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify(Object.assign({}, params || {}, { action: action, token: token() }))
    });
    const data = await res.json();
    // Usage warning: tell the sender when their daily photo/voice allowance is nearly used up
    try {
      if (action === 'send' && data && data.success && data.quota && data.quota.left <= 5 && window.LBBrain) {
        const q = data.quota;
        window.LBBrain.notify({ id: 'chat-quota', text: q.left > 0
          ? 'Heads up: only ' + q.left + ' photo/voice message' + (q.left === 1 ? '' : 's') + ' left today (limit ' + q.limit + '). Photos and voices are deleted after 30 days.'
          : 'That was your last photo/voice for today (limit ' + q.limit + '). Text and GIFs still work.' });
      }
    } catch (e) {}
    return data;
  };

  function setStatus(v) { connected = v; statusFns.forEach(f => { try { f(v); } catch (e) {} }); }

  function start() {
    if (!window.supabase || !window.LB_CONFIG) return;
    const client = window.supabase.createClient(LB_CONFIG.SUPABASE_URL, LB_CONFIG.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    client.channel('lalabella-chat')
      .on('broadcast', { event: 'ping' }, () => pingFns.forEach(f => { try { f(); } catch (e) {} }))
      .subscribe(status => setStatus(status === 'SUBSCRIBED'));
  }

  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  s.async = true;
  s.onload = start;
  s.onerror = () => setStatus(false);
  document.head.appendChild(s);

  window.lbChatLive = {
    onPing: fn => pingFns.push(fn),
    onStatus: fn => { statusFns.push(fn); fn(connected); },
    isConnected: () => connected
  };
})();
