// LALABELLA — Staff Chat (Supabase Edge Function)  v12 (adds Messenger VISITOR accounts)
// Text, voice, pictures, GIF/stickers, favorites, cartoon avatars.
// Pushes a content-free 'ping' through Supabase Realtime so open chats update instantly.
//
// Auth: our own session token checked against public.users (service key). verify_jwt is OFF.
// Staff use users.token; Messenger VISITORS (role Visitor, approved by an admin) use users.vtoken.
// Visitors can ONLY chat privately with admins: no Team chat, no groups, staff never see visitors.
// Private chats (and their voice/picture files) are only returned to the two people in them.
//
// Media: voice/picture arrive as RAW base64 + mime, are validated and stored in the PRIVATE
// bucket `chat-media`. `list` returns short-lived signed URLs; `media {id}` re-signs one.
// Files are deleted after RETENTION_DAYS and show as expired.
// GIF/sticker: searched here (provider key in secret GIF_API_KEY, never sent to the browser).
// Each result carries `sig` = HMAC of its URL, so a message/favorite can only point at a URL
// the provider really returned.
//
// Actions (POST JSON {action, token, ...}):
//   list {peerId?, sinceId?, delSince?, limit?} | send | delete {id} | unread | people
//   media {id}  | gifSearch {type:'gif'|'sticker', q?, page?}
//   favList | favAdd {kind,value,preview?,sig?} | favRemove {kind,value}
//   avatarSave {cfg}   ('' clears)
//   groups | groupCreate {name, memberIds[]} | groupAdd {groupId, memberIds[]} | groupLeave {groupId}
//   list/send/unread also take groupId (members only). Team chat = no peerId, no groupId.
//   send: {text,peerId?} | {kind:'voice'|'image', data(base64), mime, durationMs?, text?, peerId?}
//         | {kind:'gif'|'sticker', url, preview?, sig, peerId?}

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GIF_KEY = Deno.env.get('GIF_API_KEY') || '';
const GIF_PROVIDER = (Deno.env.get('GIF_PROVIDER') || 'klipy').toLowerCase();
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ONLINE_MINUTES = 5;
const MAX_LEN = 1000;
const TOPIC = 'lalabella-chat';

const MEDIA_BUCKET = 'chat-media';
const MAX_MEDIA_BYTES = 1_500_000;
const MAX_VOICE_MS = 60_000;
const RETENTION_DAYS = 30;
const SIGN_SECONDS = 3600;
const MEDIA_PER_MINUTE = 10;
const MEDIA_PER_DAY = 30;            // photos+voice per user per Bahrain day
const STORAGE_STOP_BYTES = 850_000_000; // stop media uploads near the 1 GB free limit
let usageCache: { at: number; bytes: number } | null = null;
async function storageBytes(): Promise<number> {
  if (usageCache && Date.now() - usageCache.at < 300000) return usageCache.bytes;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/lb_usage`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }, body: '{}' });
    const j = await r.json();
    const b = Number(j?.storage_bytes) || 0;
    usageCache = { at: Date.now(), bytes: b };
    return b;
  } catch (_) { return 0; } // fail-open
}
const MAX_FAVORITES = 80;

const MIME_EXT: Record<string, string> = {
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};
const AV_RANGES: Record<string, number> = { skin: 6, hair: 8, hairColor: 8, eyes: 4, mouth: 4, acc: 4, shirt: 8, bg: 8 };

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
  const rows = await rest('GET', `users?select=id,username,full_name,role,status,token,token_created,vtoken,vtoken_created,last_seen&or=(token.eq.${t},vtoken.eq.${t})&limit=1`);
  const u = rows && rows[0];
  if (!u || String(u.status || 'Active') !== 'Active') return null;
  const viaV = u.vtoken === t && u.token !== t;
  if (viaV && String(u.role) !== 'Visitor' && String(u.role) !== 'Saudi Team') return null;   // Saudi Team = limited account, chats like staff
  const stamp = viaV ? u.vtoken_created : u.token_created;
  const created = stamp ? new Date(stamp).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  const last = u.last_seen ? new Date(u.last_seen).getTime() : 0;
  if (Date.now() - last > 2 * 60 * 1000) rest('PATCH', `users?id=eq.${u.id}`, { last_seen: new Date().toISOString() }).catch(() => {});
  return u;
}

const isAdmin = (u: any) => String(u.role || '').toLowerCase() === 'admin';
const isVisitor = (u: any) => String(u.role || '') === 'Visitor';
const VISITOR_MSG = 'Visitor accounts can only chat with the admin.';
const avatarUrl = (photoLink: string) => {
  const s = String(photoLink || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(s)}&sz=w96` : '';
};
const intOrNull = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

// ---------- signatures for GIF/sticker URLs ----------
let hmacKey: CryptoKey | null = null;
async function sign(url: string): Promise<string> {
  if (!hmacKey) hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode('lb-gif|' + SB_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(url));
  return [...new Uint8Array(sig)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}
const httpsUrl = (u: unknown): string | null => {
  try { const x = new URL(String(u || '')); return x.protocol === 'https:' && String(x).length <= 600 ? String(x) : null; } catch { return null; }
};
async function checkedGif(url: unknown, sig: unknown, preview: unknown): Promise<{ url: string; preview: string } | null> {
  const u = httpsUrl(url);
  if (!u || String(sig || '') !== await sign(u)) return null;
  return { url: u, preview: httpsUrl(preview) || u };
}

// ---------- storage helpers ----------
const storageHeaders = (extra: Record<string, string> = {}) => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, ...extra });

function decodeB64(b64: string): Uint8Array | null {
  const s = String(b64 || '');
  if (!s || s.length > MAX_MEDIA_BYTES * 1.4 || !/^[A-Za-z0-9+/=]+$/.test(s)) return null;
  try {
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch { return null; }
}

async function uploadMedia(userId: number, mime: string, bytes: Uint8Array): Promise<string> {
  const path = `${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${MIME_EXT[mime]}`;
  const res = await fetch(`${SB_URL}/storage/v1/object/${MEDIA_BUCKET}/${path}`, {
    method: 'POST', headers: storageHeaders({ 'Content-Type': mime, 'x-upsert': 'false' }), body: bytes,
  });
  if (!res.ok) { console.error('media upload failed', res.status, (await res.text()).slice(0, 200)); throw new Error('upload'); }
  return path;
}
async function removeMedia(paths: string[]) {
  if (!paths.length) return;
  try {
    await fetch(`${SB_URL}/storage/v1/object/${MEDIA_BUCKET}`, {
      method: 'DELETE', headers: storageHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: paths }),
    });
  } catch (e) { console.error('media remove failed', e); }
}
async function signPaths(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!paths.length) return out;
  try {
    const res = await fetch(`${SB_URL}/storage/v1/object/sign/${MEDIA_BUCKET}`, {
      method: 'POST', headers: storageHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn: SIGN_SECONDS, paths }),
    });
    if (!res.ok) return out;
    const arr = await res.json();
    (arr || []).forEach((r: any) => { if (r && r.path && r.signedURL) out[r.path] = `${SB_URL}/storage/v1${r.signedURL}`; });
  } catch (e) { console.error('sign failed', e); }
  return out;
}
async function purgeOldMedia() {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
    const old = await rest('GET', `chat_messages?select=id,media_path&media_path=not.is.null&media_expired=eq.false&created_at=lt.${encodeURIComponent(cutoff)}&limit=50`);
    if (!old || !old.length) return;
    await removeMedia(old.map((r: any) => r.media_path));
    await rest('PATCH', `chat_messages?id=in.(${old.map((r: any) => r.id).join(',')})`, { media_expired: true, media_path: null }, 'return=minimal');
  } catch (e) { console.error('purge failed', e); }
}

const LABEL: Record<string, string> = { voice: '🎤 Voice message', image: '📷 Photo', gif: '🖼 GIF', sticker: '✨ Sticker' };
const rowBase = (r: any) => ({
  id: r.id, userId: r.user_id, username: r.username, name: r.full_name || r.username, text: r.body, time: r.created_at, peerId: r.recipient_id, groupId: r.group_id || null,
  kind: r.kind || 'text', mime: r.media_mime || '', durationMs: r.duration_ms || 0, expired: !!r.media_expired,
});
function rowWithMedia(r: any, signed: Record<string, string>) {
  const o: any = rowBase(r);
  o.mediaUrl = r.media_path ? (signed[r.media_path] || '') : (r.media_url || '');
  return o;
}
async function rows(list: any[]) {
  const signed = await signPaths(list.filter(r => r.media_path && !r.media_expired).map(r => r.media_path));
  return list.map(r => rowWithMedia(r, signed));
}
function convFilter(meId: number, peerId: number | null, groupId: number | null = null) {
  if (groupId) return `group_id=eq.${groupId}`;
  if (!peerId) return 'recipient_id=is.null&group_id=is.null';
  return `or=(and(user_id.eq.${meId},recipient_id.eq.${peerId}),and(user_id.eq.${peerId},recipient_id.eq.${meId}))`;
}

// ---------- groups ----------
const MAX_GROUP_MEMBERS = 30;
const MAX_GROUPS_PER_USER = 10;
async function isMember(groupId: number, userId: number): Promise<boolean> {
  const r = await rest('GET', `chat_group_members?select=user_id&group_id=eq.${groupId}&user_id=eq.${userId}&limit=1`);
  return !!(r && r.length);
}
// Active people only, and never Visitors (visitors cannot be in groups).
async function activeIds(ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const r = await rest('GET', `users?select=id&status=eq.Active&role=neq.Visitor&id=in.(${ids.join(',')})`);
  return (r || []).map((x: any) => x.id);
}
const cleanIds = (v: unknown): number[] => Array.from(new Set((Array.isArray(v) ? v : []).map(intOrNull).filter((x): x is number => !!x))).slice(0, 60);

// ---------- GIF / sticker provider ----------
const gifRate = new Map<number, number[]>();
function gifAllowed(uid: number) {
  const now = Date.now(); const arr = (gifRate.get(uid) || []).filter(t => now - t < 60000);
  if (arr.length >= 30) { gifRate.set(uid, arr); return false; }
  arr.push(now); gifRate.set(uid, arr); return true;
}
const gifCache = new Map<string, { t: number; v: any }>();

function klipyPick(item: any, kind: string) {
  const f = item && item.file ? item.file : {};
  const get = (sz: string, fmt: string) => f[sz] && f[sz][fmt] && f[sz][fmt].url;
  const url = get('md', 'gif') || get('sm', 'gif') || get('hd', 'gif') || get('md', 'webp') || get('sm', 'webp') || get('hd', 'webp') || get('md', 'png') || get('sm', 'png');
  const preview = get('sm', 'webp') || get('xs', 'webp') || get('sm', 'gif') || get('xs', 'gif') || get('sm', 'png') || url;
  return { url, preview };
}
async function gifFetch(kind: string, q: string, page: number, uid: number) {
  const ck = `${GIF_PROVIDER}|${kind}|${q}|${page}`;
  const hit = gifCache.get(ck);
  if (hit && Date.now() - hit.t < 5 * 60000) return hit.v;
  let items: { url: string; preview: string }[] = []; let hasMore = false;
  if (GIF_PROVIDER === 'giphy') {
    const path = kind === 'sticker' ? 'stickers' : 'gifs';
    const ep = q ? 'search' : 'trending';
    const u = `https://api.giphy.com/v1/${path}/${ep}?api_key=${encodeURIComponent(GIF_KEY)}&limit=24&offset=${(page - 1) * 24}&rating=pg&lang=en${q ? '&q=' + encodeURIComponent(q) : ''}`;
    const r = await fetch(u); if (!r.ok) throw new Error('giphy ' + r.status);
    const j = await r.json();
    items = (j.data || []).map((g: any) => ({ url: g.images?.fixed_height?.url, preview: g.images?.fixed_width_small?.url || g.images?.fixed_height_small?.url || g.images?.fixed_height?.url }));
    const tot = j.pagination?.total_count || 0; hasMore = page * 24 < tot;
  } else {
    const path = kind === 'sticker' ? 'stickers' : 'gifs';
    const ep = q ? 'search' : 'trending';
    const u = `https://api.klipy.com/api/v1/${encodeURIComponent(GIF_KEY)}/${path}/${ep}?page=${page}&per_page=24&customer_id=lb${uid}${q ? '&q=' + encodeURIComponent(q) : ''}`;
    const r = await fetch(u); if (!r.ok) throw new Error('klipy ' + r.status);
    const j = await r.json();
    const d = j.data || {};
    items = (d.data || []).map((g: any) => klipyPick(g, kind));
    hasMore = !!d.has_next;
  }
  const out: any[] = [];
  for (const it of items) {
    const url = httpsUrl(it.url); if (!url) continue;
    out.push({ url, preview: httpsUrl(it.preview) || url, sig: await sign(url) });
  }
  const v = { items: out, hasMore };
  gifCache.set(ck, { t: Date.now(), v });
  if (gifCache.size > 200) gifCache.delete(gifCache.keys().next().value as string);
  return v;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ success: false, error: 'Use POST.' }, 405);
  let p: any = {};
  try { p = await req.json(); } catch { return json({ success: false, error: 'Bad request.' }, 400); }

  try {
    const me = await sessionUser(p.token);
    if (!me) return json({ success: false, error: 'Please log in again.' }, 401);
    const groupId = intOrNull(p.groupId);
    const peerId = groupId ? null : intOrNull(p.peerId);
    if (peerId === me.id) return json({ success: false, error: 'You cannot message yourself.' });
    const act = String(p.action);
    const visitor = isVisitor(me);
    // Visitors: private chats with admins only (no Team chat, no groups).
    if (visitor) {
      if (groupId || (['list', 'send'].includes(act) && !peerId) || ['groupCreate', 'groupAdd'].includes(act)) return json({ success: false, error: VISITOR_MSG });
    }
    if (peerId && ['list', 'send'].includes(act) && !isAdmin(me)) {
      const pr = await rest('GET', `users?select=id,role&id=eq.${peerId}&limit=1`);
      const peerRole = pr && pr[0] ? String(pr[0].role || '') : '';
      if (visitor ? peerRole.toLowerCase() !== 'admin' : peerRole === 'Visitor') return json({ success: false, error: visitor ? VISITOR_MSG : 'That person is not available.' });
    }
    if (groupId && ['list', 'send'].includes(act) && !(await isMember(groupId, me.id)))
      return json({ success: false, error: 'You are not in that group.' });

    switch (p.action) {
      case 'list': {
        const serverTime = new Date().toISOString();
        const sinceId = Number(p.sinceId) || 0;
        const limit = Math.min(Math.max(Number(p.limit) || 100, 1), 200);
        const f = convFilter(me.id, peerId, groupId);
        let msgs;
        if (sinceId > 0) msgs = await rest('GET', `chat_messages?select=*&deleted_at=is.null&${f}&id=gt.${sinceId}&order=id.asc&limit=${limit}`);
        else msgs = (await rest('GET', `chat_messages?select=*&deleted_at=is.null&${f}&order=id.desc&limit=${limit}`)).reverse();
        let deletedIds: number[] = [];
        if (p.delSince) {
          const del = await rest('GET', `chat_messages?select=id&${f}&deleted_at=gt.${encodeURIComponent(String(p.delSince))}&limit=200`);
          deletedIds = del.map((r: any) => r.id);
        }
        return json({ success: true, me: me.username, meId: me.id, isAdmin: isAdmin(me), visitor, serverTime, messages: await rows(msgs), deletedIds });
      }

      case 'media': {
        const id = Number(p.id);
        if (!Number.isInteger(id) || id < 1) return json({ success: false, error: 'Invalid message.' });
        const found = await rest('GET', `chat_messages?select=*&id=eq.${id}&deleted_at=is.null`);
        const m = found[0];
        const allowed = m && (m.group_id ? await isMember(m.group_id, me.id) : (visitor ? (m.user_id === me.id || m.recipient_id === me.id) : (m.recipient_id === null || m.user_id === me.id || m.recipient_id === me.id)));
        if (!allowed) return json({ success: false, error: 'Not found.' });
        if (m.media_expired || (!m.media_path && !m.media_url)) return json({ success: false, expired: true });
        if (m.media_url) return json({ success: true, url: m.media_url });
        const signed = await signPaths([m.media_path]);
        return signed[m.media_path] ? json({ success: true, url: signed[m.media_path] }) : json({ success: false, error: 'Unavailable.' });
      }

      case 'send': {
        const kind = String(p.kind || 'text');
        if (!['text', 'voice', 'image', 'gif', 'sticker'].includes(kind)) return json({ success: false, error: 'Unsupported message type.' });
        if (peerId) {
          const peer = await rest('GET', `users?select=id&id=eq.${peerId}&status=eq.Active`);
          if (!peer.length) return json({ success: false, error: 'That person is not available.' });
        }
        const target = groupId ? 'group_id=eq.' + groupId : (peerId ? 'recipient_id=eq.' + peerId + '&group_id=is.null' : 'recipient_id=is.null&group_id=is.null');
        const base: any = { user_id: me.id, username: me.username, full_name: me.full_name || me.username, recipient_id: peerId, group_id: groupId, kind };

        if (kind === 'text') {
          const text = String(p.text || '').trim();
          if (!text) return json({ success: false, error: 'Message is empty.' });
          if (text.length > MAX_LEN) return json({ success: false, error: `Message is too long (max ${MAX_LEN} characters).` });
          const since = new Date(Date.now() - 10000).toISOString();
          const recent = await rest('GET', `chat_messages?select=*&user_id=eq.${me.id}&${target}&created_at=gt.${encodeURIComponent(since)}&deleted_at=is.null&kind=eq.text&order=id.desc&limit=5`);
          const dup = recent.find((r: any) => r.body === text);
          if (dup) return json({ success: true, message: rowBase(dup), duplicate: true });
          const ins = await rest('POST', 'chat_messages', { ...base, body: text });
          await ping();
          return json({ success: true, message: rowBase(ins[0]) });
        }

        if (kind === 'gif' || kind === 'sticker') {
          const g = await checkedGif(p.url, p.sig, p.preview);
          if (!g) return json({ success: false, error: 'That GIF could not be verified. Please pick it again.' });
          const ins = await rest('POST', 'chat_messages', { ...base, body: LABEL[kind], media_url: g.url });
          await ping();
          return json({ success: true, message: rowWithMedia(ins[0], {}) });
        }

        // voice / image
        const since1m = new Date(Date.now() - 60000).toISOString();
        const recentMedia = await rest('GET', `chat_messages?select=id&user_id=eq.${me.id}&media_path=not.is.null&created_at=gt.${encodeURIComponent(since1m)}&limit=${MEDIA_PER_MINUTE}`);
        if ((recentMedia || []).length >= MEDIA_PER_MINUTE) return json({ success: false, error: 'Too many files sent. Please wait a moment.' });

        const dayStart = new Date(Math.floor((Date.now() + 10800000) / 86400000) * 86400000 - 10800000).toISOString();
        const todayMedia = await rest('GET', `chat_messages?select=id&user_id=eq.${me.id}&media_path=not.is.null&created_at=gte.${encodeURIComponent(dayStart)}&limit=${MEDIA_PER_DAY}`);
        const usedToday = (todayMedia || []).length;
        if (usedToday >= MEDIA_PER_DAY) return json({ success: false, error: `Daily limit reached (${MEDIA_PER_DAY} photos/voice per day). Text still works — try again tomorrow.` });
        if ((await storageBytes()) >= STORAGE_STOP_BYTES) return json({ success: false, error: 'Photo and voice sending is paused for now (storage is almost full). Text still works. Please tell the admin.' });

        const mime = String(p.mime || '').split(';')[0].trim().toLowerCase();
        const okType = kind === 'voice' ? mime.startsWith('audio/') : mime.startsWith('image/');
        if (!okType || !MIME_EXT[mime]) return json({ success: false, error: kind === 'voice' ? 'That audio format is not supported.' : 'Please send a JPG, PNG or WebP picture.' });
        const bytes = decodeB64(p.data);
        if (!bytes || !bytes.length) return json({ success: false, error: 'That file could not be read.' });
        if (bytes.length > MAX_MEDIA_BYTES) return json({ success: false, error: kind === 'voice' ? 'Voice message is too long.' : 'Picture is too large.' });
        let duration: number | null = null;
        if (kind === 'voice') {
          duration = Math.round(Number(p.durationMs) || 0);
          if (duration < 300) return json({ success: false, error: 'Voice message is too short.' });
          if (duration > MAX_VOICE_MS + 1500) return json({ success: false, error: 'Voice message is too long (max 60 seconds).' });
          duration = Math.min(duration, MAX_VOICE_MS);
        }
        const caption = kind === 'image' ? String(p.text || '').trim().slice(0, 300) : '';
        const path = await uploadMedia(me.id, mime, bytes);
        let ins;
        try {
          ins = await rest('POST', 'chat_messages', { ...base, body: caption || LABEL[kind], media_path: path, media_mime: mime, duration_ms: duration });
        } catch (e) { await removeMedia([path]); throw e; }
        if (Math.random() < 0.1) await purgeOldMedia();
        await ping();
        return json({ success: true, message: await rows(ins).then(a => a[0]), quota: { left: MEDIA_PER_DAY - usedToday - 1, limit: MEDIA_PER_DAY } });
      }

      case 'delete': {
        const id = Number(p.id);
        if (!Number.isInteger(id) || id < 1) return json({ success: false, error: 'Invalid message.' });
        const found = await rest('GET', `chat_messages?select=id,user_id,recipient_id,group_id,deleted_at,media_path&id=eq.${id}`);
        const m = found[0];
        if (!m || m.deleted_at) return json({ success: true });
        const mine = m.user_id === me.id;
        let adminOnGroup = isAdmin(me) && m.recipient_id === null && !m.group_id;
        if (!mine && m.group_id) { const g = await rest('GET', `chat_groups?select=created_by&id=eq.${m.group_id}`); adminOnGroup = !!(g[0] && g[0].created_by === me.id); }
        if (!mine && !adminOnGroup) return json({ success: false, error: 'You can only delete your own messages.' });
        await rest('PATCH', `chat_messages?id=eq.${id}`, { deleted_at: new Date().toISOString(), deleted_by: me.username, ...(m.media_path ? { media_path: null, media_expired: true } : {}) });
        if (m.media_path) await removeMedia([m.media_path]);
        await ping();
        return json({ success: true });
      }

      case 'unread': {
        const seenGroup = Number(p.seenGroup) || 0;
        const seenDm: Record<string, number> = (p.seenDm && typeof p.seenDm === 'object') ? p.seenDm : {};
        const g = visitor ? [] : await rest('GET', `chat_messages?select=id&deleted_at=is.null&recipient_id=is.null&group_id=is.null&id=gt.${seenGroup}&user_id=neq.${me.id}&limit=100`);
        const dms = await rest('GET', `chat_messages?select=id,user_id&deleted_at=is.null&recipient_id=eq.${me.id}&group_id=is.null&order=id.desc&limit=300`);
        const seenGrp: Record<string, number> = (p.seenGrp && typeof p.seenGrp === 'object') ? p.seenGrp : {};
        const grp: Record<string, number> = {}; let grpTotal = 0;
        const mine = await rest('GET', `chat_group_members?select=group_id&user_id=eq.${me.id}`);
        if (mine.length) {
          const gm = await rest('GET', `chat_messages?select=id,group_id&deleted_at=is.null&group_id=in.(${mine.map((r: any) => r.group_id).join(',')})&user_id=neq.${me.id}&order=id.desc&limit=400`);
          for (const r of gm) { if (r.id > (Number(seenGrp[String(r.group_id)]) || 0)) { grp[r.group_id] = (grp[r.group_id] || 0) + 1; grpTotal++; } }
        }
        const dm: Record<string, number> = {};
        let dmTotal = 0;
        for (const r of dms) {
          const seen = Number(seenDm[String(r.user_id)]) || 0;
          if (r.id > seen) { dm[r.user_id] = (dm[r.user_id] || 0) + 1; dmTotal++; }
        }
        return json({ success: true, group: g.length, dm, grp, total: g.length + dmTotal + grpTotal, count: g.length + dmTotal + grpTotal });
      }

      case 'people': {
        const all = await rest('GET', 'users?select=id,username,full_name,position,photo_link,last_seen,chat_avatar,role&status=eq.Active&order=full_name.asc');
        // Visitors see admins only; staff never see visitors; admins see everyone.
        const users = all.filter((u: any) => u.id === me.id || (visitor ? String(u.role || '').toLowerCase() === 'admin' : (isAdmin(me) || String(u.role || '') !== 'Visitor')));
        const now = Date.now();
        const people = users.map((u: any) => {
          const seen = u.last_seen ? new Date(u.last_seen).getTime() : 0;
          return {
            id: u.id, username: u.username, name: u.full_name || u.username, position: u.position || '',
            lastSeen: u.last_seen || '',
            online: u.id === me.id || (!!seen && now - seen < ONLINE_MINUTES * 60000),
            avatar: avatarUrl(u.photo_link), avatarCfg: u.chat_avatar || null, me: u.id === me.id,
            visitor: String(u.role || '') === 'Visitor',
          };
        }).sort((a: any, b: any) => (Number(b.online) - Number(a.online)) || String(a.name).localeCompare(String(b.name)));
        return json({ success: true, me: me.username, meId: me.id, visitor, people });
      }

      case 'avatarSave': {
        if (p.cfg === '' || p.cfg === null || p.cfg === undefined) {
          await rest('PATCH', `users?id=eq.${me.id}`, { chat_avatar: null }, 'return=minimal');
        } else {
          if (typeof p.cfg !== 'object') return json({ success: false, error: 'Invalid avatar.' });
          const cfg: Record<string, number> = {};
          for (const k of Object.keys(AV_RANGES)) {
            const v = Number(p.cfg[k]);
            if (!Number.isInteger(v) || v < 0 || v >= AV_RANGES[k]) return json({ success: false, error: 'Invalid avatar.' });
            cfg[k] = v;
          }
          await rest('PATCH', `users?id=eq.${me.id}`, { chat_avatar: cfg }, 'return=minimal');
        }
        await ping();
        return json({ success: true });
      }

      case 'groups': {
        const mem = await rest('GET', `chat_group_members?select=group_id&user_id=eq.${me.id}`);
        if (!mem.length) return json({ success: true, groups: [] });
        const ids = mem.map((r: any) => r.group_id).join(',');
        const gs = await rest('GET', `chat_groups?select=id,name,created_by,created_at&id=in.(${ids})&order=created_at.desc`);
        const ms = await rest('GET', `chat_group_members?select=group_id,user_id&group_id=in.(${ids})`);
        const by: Record<number, number[]> = {};
        ms.forEach((r: any) => { (by[r.group_id] = by[r.group_id] || []).push(r.user_id); });
        return json({ success: true, groups: gs.map((g: any) => ({ id: g.id, name: g.name, createdBy: g.created_by, memberIds: by[g.id] || [] })) });
      }

      case 'groupCreate': {
        const name = String(p.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (!name) return json({ success: false, error: 'Please give the group a name.' });
        const ids = (await activeIds(cleanIds(p.memberIds))).filter(i => i !== me.id);
        if (!ids.length) return json({ success: false, error: 'Pick at least one person to add.' });
        if (ids.length + 1 > MAX_GROUP_MEMBERS) return json({ success: false, error: `A group can have up to ${MAX_GROUP_MEMBERS} people.` });
        const own = await rest('GET', `chat_groups?select=id&created_by=eq.${me.id}&limit=${MAX_GROUPS_PER_USER}`);
        if (own.length >= MAX_GROUPS_PER_USER) return json({ success: false, error: `You can make up to ${MAX_GROUPS_PER_USER} groups.` });
        const g = (await rest('POST', 'chat_groups', { name, created_by: me.id }))[0];
        try { await rest('POST', 'chat_group_members', [me.id, ...ids].map(u => ({ group_id: g.id, user_id: u })), 'return=minimal'); }
        catch (e) { await rest('DELETE', `chat_groups?id=eq.${g.id}`, undefined, 'return=minimal'); throw e; }
        await ping();
        return json({ success: true, group: { id: g.id, name: g.name, createdBy: me.id, memberIds: [me.id, ...ids] } });
      }

      case 'groupAdd': {
        if (!groupId) return json({ success: false, error: 'Invalid group.' });
        const g = (await rest('GET', `chat_groups?select=id,created_by&id=eq.${groupId}`))[0];
        if (!g || (g.created_by !== me.id && !isAdmin(me))) return json({ success: false, error: 'Only the person who made the group can add people.' });
        const have = (await rest('GET', `chat_group_members?select=user_id&group_id=eq.${groupId}`)).map((r: any) => r.user_id);
        const add = (await activeIds(cleanIds(p.memberIds))).filter(i => !have.includes(i));
        if (!add.length) return json({ success: false, error: 'Nobody new to add.' });
        if (have.length + add.length > MAX_GROUP_MEMBERS) return json({ success: false, error: `A group can have up to ${MAX_GROUP_MEMBERS} people.` });
        await rest('POST', 'chat_group_members', add.map(u => ({ group_id: groupId, user_id: u })), 'return=minimal');
        await ping();
        return json({ success: true });
      }

      case 'groupLeave': {
        if (!groupId) return json({ success: false, error: 'Invalid group.' });
        await rest('DELETE', `chat_group_members?group_id=eq.${groupId}&user_id=eq.${me.id}`, undefined, 'return=minimal');
        const left = await rest('GET', `chat_group_members?select=user_id&group_id=eq.${groupId}&limit=1`);
        if (!left.length) {
          const old = await rest('GET', `chat_messages?select=media_path&group_id=eq.${groupId}&media_path=not.is.null&limit=500`);
          await removeMedia(old.map((r: any) => r.media_path));
          await rest('DELETE', `chat_groups?id=eq.${groupId}`, undefined, 'return=minimal'); // messages cascade
        }
        await ping();
        return json({ success: true });
      }

      case 'gifSearch': {
        if (!GIF_KEY) return json({ success: false, notConfigured: true, error: 'GIF search is not set up yet.' });
        const kind = p.type === 'sticker' ? 'sticker' : 'gif';
        if (!gifAllowed(me.id)) return json({ success: false, error: 'Slow down a little, then try again.' });
        const q = String(p.q || '').trim().slice(0, 60);
        const page = Math.min(Math.max(Number(p.page) || 1, 1), 20);
        try {
          const v = await gifFetch(kind, q, page, me.id);
          return json({ success: true, items: v.items, hasMore: v.hasMore, provider: GIF_PROVIDER === 'giphy' ? 'giphy' : 'klipy' });
        } catch (e) { console.error('gif provider', e); return json({ success: false, error: 'GIF search is unavailable right now.' }); }
      }

      case 'favList': {
        const favs = await rest('GET', `chat_favorites?select=id,kind,value,preview&user_id=eq.${me.id}&order=created_at.desc&limit=${MAX_FAVORITES * 3}`);
        const out: any = { success: true, emoji: [], gif: [], sticker: [] };
        for (const f of favs || []) {
          if (f.kind === 'emoji') out.emoji.push(f.value);
          else if (f.kind === 'gif' || f.kind === 'sticker') out[f.kind].push({ url: f.value, preview: f.preview || f.value, sig: await sign(f.value) });
        }
        return json(out);
      }

      case 'favAdd': {
        const kind = String(p.kind || '');
        if (!['emoji', 'gif', 'sticker'].includes(kind)) return json({ success: false, error: 'Invalid favorite.' });
        let value = String(p.value || '').trim();
        let preview = '';
        if (kind === 'emoji') {
          if (!value || [...value].length > 8) return json({ success: false, error: 'Invalid emoji.' });
        } else {
          const g = await checkedGif(value, p.sig, p.preview);
          if (!g) return json({ success: false, error: 'That GIF could not be verified.' });
          value = g.url; preview = g.preview;
        }
        const count = await rest('GET', `chat_favorites?select=id&user_id=eq.${me.id}&kind=eq.${kind}&limit=${MAX_FAVORITES + 1}`);
        if ((count || []).length >= MAX_FAVORITES) return json({ success: false, error: `You can keep up to ${MAX_FAVORITES} favorites of each type. Remove one first.` });
        await rest('POST', 'chat_favorites?on_conflict=user_id,kind,value', { user_id: me.id, kind, value, preview: preview || null }, 'resolution=ignore-duplicates,return=minimal');
        return json({ success: true });
      }

      case 'favRemove': {
        const kind = String(p.kind || '');
        if (!['emoji', 'gif', 'sticker'].includes(kind)) return json({ success: false, error: 'Invalid favorite.' });
        const value = String(p.value || '').trim();
        if (!value) return json({ success: false, error: 'Invalid favorite.' });
        await rest('DELETE', `chat_favorites?user_id=eq.${me.id}&kind=eq.${kind}&value=eq.${encodeURIComponent(value)}`, undefined, 'return=minimal');
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
