// LALABELLA — Web Push (Supabase Edge Function)  v10
// v11: Shopify alert tag is 'orders-shopify' so the Android app (PushWatcher) treats it as an order, not a chat.
// v10: order alerts show the order's product picture (Shopify CDN only) and open the home page with the order list (?bell=1), not the last page (chat).
// v9: Shopify order alerts show the order number + total only (no branch); the Tampermonkey decides the branch.
// v8: approvalNotify is SILENT (no phone push). Approvals only show in the in-app bell.
// v7: approvalNotify = rate change waiting => Admin devices (mute_approvals) [now disabled].
// v6: per-device choices mute_chat / mute_orders (getPrefs / setPrefs).
// Staff actions: vapidKey, subscribe, unsubscribe, getPrefs, setPrefs, test.
// Internal (must carry push_config.internal_key as `key`): chatNotify, orderNotify, approvalNotify (no-op).

import webpush from 'npm:web-push@3.6.7';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_DEVICES_PER_USER = 8;
const LABEL: Record<string, string> = { voice: '🎤 Voice message', image: '📷 Photo', gif: '🖼 GIF', sticker: '✨ Sticker' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function rest(method: string, path: string, body?: unknown, prefer = 'return=representation') {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

async function sessionUser(token: string) {
  const t = String(token || '').trim();
  if (!t || !/^[a-f0-9]{20,}$/i.test(t)) return null;
  const rows = await rest('GET', `users?select=id,username,full_name,status,token_created&token=eq.${encodeURIComponent(t)}&limit=1`);
  const u = rows && rows[0];
  if (!u || String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}

let cfg: { vapid_public: string; vapid_private: string; subject: string; internal_key: string } | null = null;
async function config() {
  if (cfg) return cfg;
  const r = await rest('GET', 'push_config?select=vapid_public,vapid_private,subject,internal_key&id=eq.1&limit=1');
  if (!r || !r[0]) throw new Error('push_config missing');
  cfg = r[0];
  webpush.setVapidDetails(cfg!.subject, cfg!.vapid_public, cfg!.vapid_private);
  return cfg!;
}

const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const safeUrl = (u: unknown, dflt: string) => /^[A-Za-z0-9_\-./?=&#]{1,120}$/.test(String(u || '')) ? String(u) : dflt;

async function sendTo(subs: any[], payload: Record<string, unknown>) {
  await config();
  const data = JSON.stringify(payload);
  let sent = 0; const dead: number[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data, { TTL: 3600, urgency: 'high' });
      sent++;
    } catch (e: any) {
      const code = e && e.statusCode;
      if (code === 404 || code === 410) dead.push(s.id);
      else console.error('push failed', code, String(e && e.body || e).slice(0, 150));
    }
  }));
  if (dead.length) await rest('DELETE', `push_subscriptions?id=in.(${dead.join(',')})`, undefined, 'return=minimal').catch(() => {});
  return { sent, removed: dead.length };
}

async function subsFor(userIds: number[] | null, excludeUserId = 0, kind = '') {
  let q = 'push_subscriptions?select=id,user_id,endpoint,p256dh,auth,mute_chat,mute_orders,mute_approvals&limit=500';
  if (userIds) {
    if (!userIds.length) return [];
    q += `&user_id=in.(${userIds.join(',')})`;
  }
  let subs = await rest('GET', q);
  if (excludeUserId) subs = subs.filter((s: any) => s.user_id !== excludeUserId);
  if (kind === 'chat') subs = subs.filter((s: any) => !s.mute_chat);
  if (kind === 'orders') subs = subs.filter((s: any) => !s.mute_orders);
  if (kind === 'approvals') subs = subs.filter((s: any) => !s.mute_approvals);
  if (!subs.length) return [];
  const uids = Array.from(new Set(subs.map((s: any) => s.user_id)));
  const act = await rest('GET', `users?select=id,role&status=eq.Active&id=in.(${uids.join(',')})`);
  const ok = new Set((act || []).filter((u: any) => kind !== 'approvals' || String(u.role || '').toLowerCase() === 'admin').map((u: any) => u.id));
  return subs.filter((s: any) => ok.has(s.user_id));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ success: false, error: 'Use POST.' }, 405);
  let p: any = {};
  try { p = await req.json(); } catch { return json({ success: false, error: 'Bad request.' }, 400); }

  try {
    if (p.action === 'chatNotify' || p.action === 'orderNotify' || p.action === 'approvalNotify') {
      const c = await config();
      if (!p.key || String(p.key) !== c.internal_key) return json({ success: false, error: 'Unauthorized.' }, 401);

      if (p.action === 'chatNotify') {
        const id = Number(p.messageId);
        if (!Number.isInteger(id) || id < 1) return json({ success: false, error: 'Invalid.' });
        const rows = await rest('GET', `chat_messages?select=id,user_id,username,full_name,body,kind,recipient_id,group_id,deleted_at&id=eq.${id}&limit=1`);
        const m = rows && rows[0];
        if (!m || m.deleted_at) return json({ success: true, sent: 0 });
        const who = String(m.full_name || m.username || 'Someone');
        let userIds: number[] | null = null; let title = `${who} · Team chat`; let tag = 'chat-team'; let url = 'chatbox.html?team=1';
        let reply: Record<string, unknown> = { team: true };
        if (m.group_id) {
          const mem = await rest('GET', `chat_group_members?select=user_id&group_id=eq.${m.group_id}`);
          const g = await rest('GET', `chat_groups?select=name&id=eq.${m.group_id}&limit=1`);
          userIds = (mem || []).map((r: any) => r.user_id);
          title = `${who} · ${(g && g[0] && g[0].name) || 'Group'}`; tag = 'chat-g' + m.group_id; url = 'chatbox.html?g=' + m.group_id;
          reply = { groupId: m.group_id };
        } else if (m.recipient_id) {
          userIds = [m.recipient_id]; title = who; tag = 'chat-d' + m.user_id; url = 'chatbox.html?dm=' + m.user_id;
          reply = { peerId: m.user_id };
        }
        const body = (m.kind || 'text') === 'text' ? String(m.body || '') : (LABEL[m.kind] || 'New message');
        const subs = await subsFor(userIds, m.user_id, 'chat');
        const r = await sendTo(subs, { title: clip(title, 80), body: clip(body, 160), url: safeUrl(url, 'chatbox.html'), tag, reply });
        return json({ success: true, ...r });
      }

      if (p.action === 'approvalNotify') {
        // SILENT: approvals only show in the in-app bell, never as a phone push.
        return json({ success: true, sent: 0, silent: true });
      }

      const orders = (Array.isArray(p.orders) ? p.orders : []).slice(0, 10);
      if (!orders.length) return json({ success: true, sent: 0 });
      const subs = await subsFor(null, 0, 'orders');
      if (!subs.length) return json({ success: true, sent: 0 });
      // Shopify alerts: order number only (no branch) — the Tampermonkey + Branch Config decide the branch.
      const allShop = orders.every((o: any) => o.source === 'shopify');
      const lines = orders.map((o: any) => {
        const no = '#' + clip(o.orderNo, 20).replace(/^#+/, '');
        if (o.source === 'shopify') return no + (o.total ? ' · BHD ' + clip(o.total, 12) : '');
        return `${no} ${o.branch ? '➜ ' + clip(o.branch, 40) : '⚠ For manual assign'}`;
      });
      const title = allShop
        ? (orders.length === 1 ? 'New Shopify order' : `${orders.length} new Shopify orders`)
        : (orders.length === 1 ? 'New order to assign' : `${orders.length} new orders to assign`);
      const pic = String((orders.find((o: any) => /^https:\/\/cdn\.shopify\.com\/[^\s"'<>]{1,400}$/.test(String(o.thumb || ''))) || {}).thumb || '');
      const r = await sendTo(subs, { title, body: clip(lines.join(' · '), 160), url: 'index.html?bell=1', tag: allShop ? 'orders-shopify' : 'orders', icon: pic, image: pic, kind: 'order' });
      return json({ success: true, ...r });
    }

    const me = await sessionUser(p.token);
    if (!me) return json({ success: false, error: 'Please log in again.' }, 401);

    switch (p.action) {
      case 'vapidKey': {
        const c = await config();
        return json({ success: true, publicKey: c.vapid_public });
      }
      case 'subscribe': {
        const s = p.subscription || {};
        const endpoint = String(s.endpoint || '');
        const p256dh = String(s.keys?.p256dh || ''), auth = String(s.keys?.auth || '');
        if (!/^https:\/\/[^\s]{10,600}$/.test(endpoint) || !/^[A-Za-z0-9_-]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}$/.test(auth))
          return json({ success: false, error: 'Invalid subscription.' });
        const mine = await rest('GET', `push_subscriptions?select=id,endpoint&user_id=eq.${me.id}&order=id.asc&limit=50`);
        const others = (mine || []).filter((r: any) => r.endpoint !== endpoint);
        if (others.length >= MAX_DEVICES_PER_USER) {
          const drop = others.slice(0, others.length - MAX_DEVICES_PER_USER + 1).map((r: any) => r.id);
          await rest('DELETE', `push_subscriptions?id=in.(${drop.join(',')})`, undefined, 'return=minimal');
        }
        await rest('POST', 'push_subscriptions?on_conflict=endpoint',
          { user_id: me.id, endpoint, p256dh, auth, user_agent: clip(req.headers.get('user-agent'), 160) },
          'resolution=merge-duplicates,return=minimal');
        return json({ success: true });
      }
      case 'unsubscribe': {
        const endpoint = String(p.endpoint || '');
        if (!endpoint) return json({ success: false, error: 'Invalid.' });
        await rest('DELETE', `push_subscriptions?user_id=eq.${me.id}&endpoint=eq.${encodeURIComponent(endpoint)}`, undefined, 'return=minimal');
        return json({ success: true });
      }
      case 'getPrefs': {
        const endpoint = String(p.endpoint || '');
        if (!endpoint) return json({ success: true, registered: false, chat: true, orders: true, approvals: true });
        const r = await rest('GET', `push_subscriptions?select=mute_chat,mute_orders,mute_approvals&user_id=eq.${me.id}&endpoint=eq.${encodeURIComponent(endpoint)}&limit=1`);
        if (!r || !r[0]) return json({ success: true, registered: false, chat: true, orders: true, approvals: true });
        return json({ success: true, registered: true, chat: !r[0].mute_chat, orders: !r[0].mute_orders, approvals: !r[0].mute_approvals });
      }
      case 'setPrefs': {
        const endpoint = String(p.endpoint || '');
        if (!endpoint) return json({ success: false, error: 'Invalid.' });
        const fields: Record<string, boolean> = {};
        if (typeof p.chat === 'boolean') fields.mute_chat = !p.chat;
        if (typeof p.orders === 'boolean') fields.mute_orders = !p.orders;
        if (typeof p.approvals === 'boolean') fields.mute_approvals = !p.approvals;
        if (!Object.keys(fields).length) return json({ success: false, error: 'Nothing to save.' });
        const r = await rest('PATCH', `push_subscriptions?user_id=eq.${me.id}&endpoint=eq.${encodeURIComponent(endpoint)}`, fields);
        if (!r || !r.length) return json({ success: false, error: 'This device is not registered yet. Turn notifications on first.' });
        return json({ success: true });
      }
      case 'test': {
        const subs = await rest('GET', `push_subscriptions?select=id,user_id,endpoint,p256dh,auth&user_id=eq.${me.id}&limit=20`);
        if (!subs.length) return json({ success: false, error: 'No device is registered yet.' });
        const r = await sendTo(subs, { title: 'Lalabella', body: 'Notifications are working ✅', url: 'index.html', tag: 'lb-test' });
        return json({ success: true, ...r });
      }
      default:
        return json({ success: false, error: 'Unknown action.' }, 400);
    }
  } catch (err) {
    console.error(err);
    return json({ success: false, error: 'Server error. Please try again.' }, 500);
  }
});
