// LALABELLA — Staff Chat extras (Supabase Edge Function)  v5
// Message reactions + Team group profile + Android-app reply. Kept separate from the main `chat` function so the stable chat is never touched.
// Auth: session token (checked against public.users with the service key), or for keyReply/keyRecent/keyPerson the Android widget key. verify_jwt is OFF.
//
// Actions (POST JSON {action, token, ...}):
//   react     {id, emoji}   toggle: same emoji again removes it, a different emoji replaces your old one
//   teamGet                 -> {photo, name}  (the Lalabella Team group's picture + name)
//   teamSet {photo?, name?} admin only; photo = small image data URL ('' resets)
//   keyReply {key, text, peerId?|groupId?|team?}  (Android app: widget key instead of a session token) -> sends a text message
//   keyPerson {key, peerId?|groupId?|team?}      (Android app) -> {name, photo} of whoever a notification is from
//   keyRecent {key, peerId?|groupId?}            (Android app bubble) -> last messages of that chat (gif/sticker carry `url`)
//   reactions {ids:[..]}    -> {reactions: {"<id>": [[emoji,[userIds]], ...]}} for messages you may see

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TOPIC = 'lalabella-chat';

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

async function ping() {
  try {
    await fetch(`${SB_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: TOPIC, event: 'ping', payload: { t: Date.now() } }] }),
    });
  } catch { /* the fallback poll still catches it */ }
}

async function sessionUser(token: string) {
  const t = String(token || '').trim();
  if (!t || !/^[a-f0-9]{20,}$/i.test(t)) return null;
  const rows = await rest('GET', `users?select=id,username,full_name,role,status,token_created&token=eq.${encodeURIComponent(t)}&limit=1`);
  const u = rows && rows[0];
  if (!u || String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}

const avatarUrl = (photoLink: string) => {
  const s = String(photoLink || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(s)}&sz=w192` : '';
};
const intOrNull = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

async function myGroupIds(userId: number): Promise<Set<number>> {
  const r = await rest('GET', `chat_group_members?select=group_id&user_id=eq.${userId}`);
  return new Set((r || []).map((x: any) => x.group_id));
}
function canSee(m: any, meId: number, groups: Set<number>): boolean {
  if (m.group_id) return groups.has(m.group_id);
  return m.recipient_id === null || m.user_id === meId || m.recipient_id === meId;
}

function group(rows: any[]) {
  const by: Record<string, Map<string, number[]>> = {};
  for (const r of rows) {
    const k = String(r.message_id);
    (by[k] = by[k] || new Map());
    const arr = by[k].get(r.emoji) || [];
    arr.push(r.user_id);
    by[k].set(r.emoji, arr);
  }
  const out: Record<string, [string, number[]][]> = {};
  for (const k of Object.keys(by)) out[k] = [...by[k].entries()];
  return out;
}

// ---------- Android app (widget key instead of a session token) ----------
async function sha256(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function keyUser(keyRaw: unknown) {
  const k = String(keyRaw || '');
  if (!/^[a-f0-9]{40}$/.test(k)) return null;
  const rows = await rest('GET', `widget_keys?select=id,user_id,revoked&key_hash=eq.${await sha256(k)}&limit=1`);
  const wk = rows && rows[0];
  if (!wk || wk.revoked) return null;
  const us = await rest('GET', `users?select=id,username,full_name,role,status&id=eq.${wk.user_id}&limit=1`);
  const u = us && us[0];
  if (!u || String(u.status || 'Active') === 'Inactive') return null;
  return u;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ success: false, error: 'Use POST.' }, 405);
  let p: any = {};
  try { p = await req.json(); } catch { return json({ success: false, error: 'Bad request.' }, 400); }

  try {
    // ---- Android app actions (widget key) ----
    if (p.action === 'keyReply' || p.action === 'keyRecent' || p.action === 'keyPerson') {
      const ku = await keyUser(p.key);
      if (!ku) return json({ success: false, error: 'Key revoked.', revoked: true }, 401);
      const groupId = intOrNull(p.groupId);
      const peerId = groupId ? null : intOrNull(p.peerId);
      if (peerId === ku.id) return json({ success: false, error: 'You cannot message yourself.' });
      if (groupId && !(await myGroupIds(ku.id)).has(groupId)) return json({ success: false, error: 'You are not in that group.' });
      if (p.action === 'keyPerson') {
        if (peerId) {
          const r = await rest('GET', `users?select=full_name,username,photo_link&id=eq.${peerId}&status=eq.Active&limit=1`);
          const u = r && r[0];
          return json({ success: true, name: u ? String(u.full_name || u.username || '') : '', photo: u ? avatarUrl(u.photo_link) : '' });
        }
        if (groupId) {
          const g = await rest('GET', `chat_groups?select=name&id=eq.${groupId}&limit=1`);
          return json({ success: true, name: g && g[0] ? String(g[0].name || '') : '', photo: '' });
        }
        const t = await rest('GET', 'chat_team_profile?select=photo,name&id=eq.1');
        return json({ success: true, name: (t && t[0] && t[0].name) || 'Lalabella Team', photo: (t && t[0] && t[0].photo) || '' });
      }
      const target = groupId ? 'group_id=eq.' + groupId : (peerId ? 'recipient_id=eq.' + peerId + '&group_id=is.null' : 'recipient_id=is.null&group_id=is.null');
      if (p.action === 'keyRecent') {
        const f = groupId ? `group_id=eq.${groupId}` : (peerId
          ? `or=(and(user_id.eq.${ku.id},recipient_id.eq.${peerId}),and(user_id.eq.${peerId},recipient_id.eq.${ku.id}))`
          : 'recipient_id=is.null&group_id=is.null');
        const rows = (await rest('GET', `chat_messages?select=id,user_id,full_name,username,body,kind,media_url,created_at&deleted_at=is.null&${f}&order=id.desc&limit=15`)) || [];
        const LBL: Record<string, string> = { voice: '🎤 Voice message', image: '📷 Photo', gif: 'GIF', sticker: 'Sticker' };
        return json({ success: true, meId: ku.id, messages: rows.reverse().map((r: any) => ({
          id: r.id, mine: r.user_id === ku.id, from: String(r.full_name || r.username || ''),
          text: (r.kind || 'text') === 'text' ? String(r.body || '').slice(0, 500) : (LBL[r.kind] || 'New message'), at: r.created_at,
          url: ((r.kind === 'gif' || r.kind === 'sticker') && /^https:\/\//.test(String(r.media_url || ''))) ? String(r.media_url) : '' })) });
      }
      const text = String(p.text || '').trim();
      if (!text) return json({ success: false, error: 'Message is empty.' });
      if (text.length > 1000) return json({ success: false, error: 'Message is too long (max 1000 characters).' });
      if (peerId) {
        const peer = await rest('GET', `users?select=id&id=eq.${peerId}&status=eq.Active`);
        if (!peer.length) return json({ success: false, error: 'That person is not available.' });
      }
      const since = new Date(Date.now() - 10000).toISOString();
      const recent = await rest('GET', `chat_messages?select=id,body&user_id=eq.${ku.id}&${target}&created_at=gt.${encodeURIComponent(since)}&deleted_at=is.null&kind=eq.text&order=id.desc&limit=5`);
      if ((recent || []).find((r: any) => r.body === text)) return json({ success: true, duplicate: true });
      const minute = await rest('GET', `chat_messages?select=id&user_id=eq.${ku.id}&created_at=gt.${encodeURIComponent(new Date(Date.now() - 60000).toISOString())}&limit=30`);
      if ((minute || []).length >= 30) return json({ success: false, error: 'Too many messages. Please wait a moment.' });
      await rest('POST', 'chat_messages', { user_id: ku.id, username: ku.username, full_name: ku.full_name || ku.username, recipient_id: peerId, group_id: groupId, kind: 'text', body: text });
      await ping();
      return json({ success: true });
    }

    const me = await sessionUser(p.token);
    if (!me) return json({ success: false, error: 'Please log in again.' }, 401);

    switch (p.action) {
      case 'react': {
        const id = intOrNull(p.id);
        const emoji = String(p.emoji || '').trim();
        if (!id) return json({ success: false, error: 'Invalid message.' });
        if (!emoji || [...emoji].length > 8 || !/\p{Extended_Pictographic}/u.test(emoji)) return json({ success: false, error: 'Invalid emoji.' });
        const found = await rest('GET', `chat_messages?select=id,user_id,recipient_id,group_id&id=eq.${id}&deleted_at=is.null`);
        const m = found && found[0];
        if (!m || !canSee(m, me.id, await myGroupIds(me.id))) return json({ success: false, error: 'Message not found.' });
        const mine = await rest('GET', `chat_reactions?select=emoji&message_id=eq.${id}&user_id=eq.${me.id}`);
        if (mine && mine[0] && mine[0].emoji === emoji) {
          await rest('DELETE', `chat_reactions?message_id=eq.${id}&user_id=eq.${me.id}`, undefined, 'return=minimal');
        } else {
          await rest('POST', 'chat_reactions?on_conflict=message_id,user_id', { message_id: id, user_id: me.id, emoji }, 'resolution=merge-duplicates,return=minimal');
        }
        await ping();
        const all = await rest('GET', `chat_reactions?select=message_id,user_id,emoji&message_id=eq.${id}`);
        return json({ success: true, reactions: group(all || []) });
      }

      case 'reactions': {
        const ids = Array.from(new Set((Array.isArray(p.ids) ? p.ids : []).map(intOrNull).filter((x): x is number => !!x))).slice(0, 150);
        if (!ids.length) return json({ success: true, reactions: {} });
        const msgs = await rest('GET', `chat_messages?select=id,user_id,recipient_id,group_id&id=in.(${ids.join(',')})&deleted_at=is.null`);
        const groups = await myGroupIds(me.id);
        const ok = (msgs || []).filter((m: any) => canSee(m, me.id, groups)).map((m: any) => m.id);
        if (!ok.length) return json({ success: true, reactions: {} });
        const rows = await rest('GET', `chat_reactions?select=message_id,user_id,emoji&message_id=in.(${ok.join(',')})&limit=2000`);
        return json({ success: true, reactions: group(rows || []) });
      }

      case 'teamGet': {
        const r = await rest('GET', 'chat_team_profile?select=photo,name,updated_at&id=eq.1');
        const t = (r && r[0]) || {};
        return json({ success: true, photo: t.photo || '', name: t.name || 'Lalabella Team', v: t.updated_at || '' });
      }

      case 'teamSet': {
        if (String(me.role || '').toLowerCase() !== 'admin') return json({ success: false, error: 'Only an admin can change the team picture.' });
        const patch: Record<string, unknown> = { updated_by: me.username, updated_at: new Date().toISOString() };
        if (p.photo !== undefined) {
          const ph = String(p.photo || '');
          if (ph && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(ph) || ph.length > 200000)) return json({ success: false, error: 'That picture is not supported or is too large.' });
          patch.photo = ph;
        }
        if (p.name !== undefined) {
          const nm = String(p.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
          if (!nm) return json({ success: false, error: 'The name cannot be empty.' });
          patch.name = nm;
        }
        await rest('PATCH', 'chat_team_profile?id=eq.1', patch, 'return=minimal');
        await ping();
        return json({ success: true });
      }

      default:
        return json({ success: false, error: 'Unknown action.' }, 400);
    }
  } catch (err) {
    console.error(err);
    return json({ success: false, error: 'Server error. Please try again.' }, 500);
  }
});
