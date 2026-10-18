// LALABELLA PROFILE — FAST PATH (Supabase Edge Function)
// Team Status + Gallery (profile page extras), split out of auth-fast so a change here can never
// affect login. Same token auth as auth-fast (users.token, 24h session).
//
// What's new vs. the same actions in auth-fast: pictures are saved as FILES in the public
// `profile-photos` bucket (folders gallery/ and status/) and the database only stores the file's URL,
// instead of a huge base64 text in the row. Old rows that still hold base64 keep working (the page
// shows either one). If an upload ever fails, the picture falls back to the old base64 way, so
// saving a picture never fails because of storage.
//
// Status videos (max 40 MB) are uploaded in two steps: statusVideoUp (raw file) then statusAdd with the returned URL.
// Status SOUND (v4, Messenger app): a short audio clip (max ~2 MB) is uploaded the same way with statusSoundUp
// (raw file, saved in profile-photos/sound/) and then attached to a status with statusAdd {audio: url}.
// It disappears with the status after 24 hours.
// Actions: statusList, statusImage, statusAdd, statusDelete, statusVideoUp, statusVideoDiscard, statusSoundUp, statusSoundDiscard,
//          profileView, staffPhotos, privacySet, bannerList, bannerSave, bannerAdjust, bannerDelete

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'profile-photos';
const PUBLIC_PREFIX = `${SB_URL}/storage/v1/object/public/${BUCKET}/`;
// Status videos live in their own bucket (bigger file limit, video types only).
const VID_BUCKET = 'status-media';
const VID_PREFIX = `${SB_URL}/storage/v1/object/public/${VID_BUCKET}/`;
const PX_MAX_VIDEO_BYTES = 40 * 1024 * 1024;
const VIDEO_TYPES: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const PX_MAX_SOUND_BYTES = 1900 * 1024;
const SOUND_TYPES: Record<string, string> = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/webm': 'webm' };

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PX_MAX_ACTIVE_STATUSES = 10;
const PX_MAX_TEXT = 300;
const PX_MAX_IMAGE_CHARS = 220000;
const PX_MAX_THUMB_CHARS = 24000;
const PX_ACTIVE_MINUTES = 15;
const PX_IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function rest(method: string, path: string, body?: unknown) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 300)}`);
  return data;
}
async function restUpsert(path: string, body: unknown, onConflict: string, prefer: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: prefer },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------
// SESSION (same rules as auth-fast)
// ---------------------------------------------------------------
async function findUserByToken(token: string) {
  const t = String(token || '').trim();
  if (!t || !/^[a-f0-9]{20,}$/i.test(t)) return null;
  // Staff use users.token; Messenger visitors use users.vtoken (v5).
  const rows = await rest('GET', `users?select=*&limit=1&or=(token.eq.${t},vtoken.eq.${t})`);
  return (rows && rows[0]) || null;
}
function touchLastSeen(user: any) {
  try {
    const last = user.last_seen ? new Date(user.last_seen).getTime() : 0;
    if (Date.now() - last < 2 * 60 * 1000) return;
    rest('PATCH', `users?id=eq.${user.id}`, { last_seen: new Date().toISOString() }).catch(() => {});
  } catch { /* never block a request over this */ }
}
async function sessionUser(token: string) {
  const user = await findUserByToken(token);
  if (!user) return null;
  if (String(user.status || 'Active') !== 'Active') return null;
  const t = String(token || '').trim();
  const isV = user.vtoken === t && user.token !== t;
  if (isV && String(user.role) !== 'Visitor') return null;
  const created = (isV ? user.vtoken_created : user.token_created) ? new Date(isV ? user.vtoken_created : user.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  touchLastSeen(user);
  return user;
}
function isAdminRole(u: any) { return String(u.role || '').toLowerCase() === 'admin'; }
function isVisitor(u: any) { return String(u.role || '') === 'Visitor'; }
// v5 Visitors (Messenger-only accounts): they see ONLY admins (and themselves); staff never see visitors; admins see everyone.
function canSee(me: any, role: string, id: number) {
  if (id === me.id) return true;
  if (isAdminRole(me)) return true;
  if (isVisitor(me)) return String(role || '').toLowerCase() === 'admin';
  return String(role || '') !== 'Visitor';
}
function resolvePhotoUrl(link: string) {
  if (!link) return '';
  const s = String(link).trim();
  if (/^https?:\/\//i.test(s)) return s;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(s)}&sz=w400`;
}

// ---------------------------------------------------------------
// STORAGE (pictures as files)
// ---------------------------------------------------------------
// Saves a data-URI picture as a file and returns its public URL. Any problem -> returns the
// original data-URI so the old (database) way still works.
async function uploadImage(dataUri: string, folder: 'gallery' | 'status', userId: number): Promise<string> {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/=]+)$/.exec(String(dataUri || ''));
  if (!m) return dataUri;
  try {
    const contentType = m[1];
    const ext = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
    const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
    const path = `${folder}/${userId}-${crypto.randomUUID()}.${ext}`;
    const res = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': contentType },
      body: bytes,
    });
    if (!res.ok) { console.error('picture upload failed', res.status, (await res.text()).slice(0, 200)); return dataUri; }
    return PUBLIC_PREFIX + path;
  } catch (e) {
    console.error('picture upload error', e);
    return dataUri;
  }
}
// Only ever returns a location for OUR gallery/status pictures, status sounds and status videos
// (never touches profile photos or anything else).
function storageRef(v: unknown): { bucket: string; path: string } | null {
  const s = String(v || '');
  if (s.startsWith(PUBLIC_PREFIX)) {
    const p = s.slice(PUBLIC_PREFIX.length);
    return /^(gallery|status|sound)\/[A-Za-z0-9._-]+$/.test(p) ? { bucket: BUCKET, path: p } : null;
  }
  if (s.startsWith(VID_PREFIX)) {
    const p = s.slice(VID_PREFIX.length);
    return /^[0-9]+-[0-9a-f-]{36}\.(mp4|webm|mov)$/.test(p) ? { bucket: VID_BUCKET, path: p } : null;
  }
  return null;
}
async function removeObjects(values: unknown[]) {
  const byBucket: Record<string, string[]> = {};
  for (const v of values) {
    const r = storageRef(v);
    if (r) (byBucket[r.bucket] = byBucket[r.bucket] || []).push(r.path);
  }
  for (const bucket of Object.keys(byBucket)) {
    try {
      await fetch(`${SB_URL}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: byBucket[bucket] }),
      });
    } catch (e) { console.error('file delete error', e); }
  }
}

// ---------------------------------------------------------------
// TEAM STATUS + GALLERY
// ---------------------------------------------------------------
function pxCheckImage(v: string, max: number, what: string) {
  if (!v) return null;
  v = String(v);
  if (v.length > max) throw new Error(`${what} is too large. Please choose a smaller picture.`);
  if (!PX_IMAGE_RE.test(v)) throw new Error(`${what} is not a valid picture.`);
  return v;
}
async function pxOnline(me: any) {
  const since = new Date(Date.now() - PX_ACTIVE_MINUTES * 60000).toISOString();
  const rows = await rest('GET', `users?select=id,full_name,username,position,branch,status,role,last_seen&last_seen=gt.${encodeURIComponent(since)}&order=last_seen.desc`);
  return (rows || []).filter((r: any) => String(r.status || 'Active').toLowerCase() === 'active' && canSee(me, r.role, r.id)).map((r: any) => ({
    userId: r.id, name: r.full_name || r.username, position: r.position || '', branch: r.branch || '',
    lastSeen: r.id === me.id ? new Date().toISOString() : r.last_seen,
  }));
}
// Removes expired statuses (and their picture / sound files). Runs in the background.
function pxCleanupExpired(nowIso: string) {
  const job = (async () => {
    try {
      const q = `profile_status?expires_at=lt.${encodeURIComponent(nowIso)}`;
      const gone = await rest('GET', `profile_status?select=id,image,audio&expires_at=lt.${encodeURIComponent(nowIso)}`);
      if (gone && gone.length) {
        await rest('DELETE', q);
        await removeObjects(gone.flatMap((r: any) => [r.image, r.audio]));
      }
    } catch (e) { console.error('status cleanup', e); }
  })();
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(job); } catch { /* ignore */ }
}
async function pxStatusList(me: any) {
  const nowIso = new Date().toISOString();
  pxCleanupExpired(nowIso);
  const rows = await rest('GET', `profile_status?select=id,user_id,text,thumb,has_image,kind,bg,audio,created_at,expires_at,users(full_name,username,position,branch,status,role)&expires_at=gt.${encodeURIComponent(nowIso)}&order=created_at.asc`);
  const now = Date.now();
  const list = (rows || []).filter((r: any) => new Date(r.expires_at).getTime() > now && (!r.users || (String(r.users.status || 'Active').toLowerCase() === 'active' && canSee(me, r.users.role, r.user_id))))
    .map((r: any) => { const u = r.users || {}; return { id: r.id, userId: r.user_id, name: u.full_name || u.username || 'Staff', position: u.position || '', branch: u.branch || '', text: r.text || '', thumb: r.thumb || '', hasImage: !!r.has_image, kind: r.kind === 'video' ? 'video' : 'image', bg: r.bg || '', audio: r.audio || '', createdAt: r.created_at, expiresAt: r.expires_at, mine: r.user_id === me.id }; });
  const mineRows = await rest('GET', `users?select=profile_private&id=eq.${me.id}&limit=1`);
  return { success: true, me: { id: me.id, name: me.full_name || me.username, private: !!(mineRows && mineRows[0] && mineRows[0].profile_private) }, isAdmin: isAdminRole(me), statuses: list, online: await pxOnline(me) };
}
async function pxStatusImage(p: any) {
  const id = parseInt(p.id, 10);
  if (!id) return { success: false, error: 'Missing status.' };
  const rows = await rest('GET', `profile_status?select=image,kind&id=eq.${id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`);
  if (!rows || !rows[0]) return { success: false, error: 'This status has expired.' };
  return { success: true, image: rows[0].image || '', kind: rows[0].kind === 'video' ? 'video' : 'image' };
}
async function pxActiveCount(me: any) {
  const active = await rest('GET', `profile_status?select=id&user_id=eq.${me.id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`);
  return (active || []).length;
}
// A video URL is valid for this user only if it is one of OUR status-media files named with their own id.
function pxOwnVideo(v: unknown, me: any): string {
  const ref = storageRef(v);
  if (!ref || ref.bucket !== VID_BUCKET || !ref.path.startsWith(`${me.id}-`)) return '';
  return String(v);
}
// A sound URL is valid for this user only if it is one of OUR sound/ files named with their own id.
function pxOwnSound(v: unknown, me: any): string {
  const ref = storageRef(v);
  if (!ref || ref.bucket !== BUCKET || !ref.path.startsWith(`sound/${me.id}-`)) return '';
  return String(v);
}
// Step 1 of a video status: the raw video file is sent as the request body.
async function pxVideoUpload(p: any, me: any) {
  const req: Request = p.__req;
  const ct = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = VIDEO_TYPES[ct];
  if (!ext) return { success: false, error: 'This video format is not supported. Please use MP4, MOV or WebM.' };
  const tooBig = { success: false, error: `This video is too large (max ${PX_MAX_VIDEO_BYTES / 1048576} MB). Please trim it or pick a shorter one.` };
  const len = parseInt(req.headers.get('content-length') || '0', 10);
  if (len > PX_MAX_VIDEO_BYTES) return tooBig;
  if (await pxActiveCount(me) >= PX_MAX_ACTIVE_STATUSES) return { success: false, error: `You already have ${PX_MAX_ACTIVE_STATUSES} active statuses. Delete one first.` };
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length > PX_MAX_VIDEO_BYTES) return tooBig;
  if (buf.length < 1024) return { success: false, error: 'That video file looks empty.' };
  const tag = String.fromCharCode(buf[4], buf[5], buf[6], buf[7]);
  const okFile = ext === 'webm'
    ? (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3)
    : ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].includes(tag);
  if (!okFile) return { success: false, error: 'That file is not a valid video.' };
  const path = `${me.id}-${crypto.randomUUID()}.${ext}`;
  const res = await fetch(`${SB_URL}/storage/v1/object/${VID_BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': ct },
    body: buf,
  });
  if (!res.ok) {
    console.error('video upload failed', res.status, (await res.text()).slice(0, 200));
    return { success: false, error: 'Could not save the video. Please try again.' };
  }
  return { success: true, url: VID_PREFIX + path };
}
// Step 1 of a status sound: the raw audio file is sent as the request body.
async function pxSoundUpload(p: any, me: any) {
  const req: Request = p.__req;
  const ct = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = SOUND_TYPES[ct];
  if (!ext) return { success: false, error: 'This sound format is not supported.' };
  const tooBig = { success: false, error: 'This sound is too big (max about 1.9 MB, around 30 seconds).' };
  const len = parseInt(req.headers.get('content-length') || '0', 10);
  if (len > PX_MAX_SOUND_BYTES) return tooBig;
  if (await pxActiveCount(me) >= PX_MAX_ACTIVE_STATUSES) return { success: false, error: `You already have ${PX_MAX_ACTIVE_STATUSES} active statuses. Delete one first.` };
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length > PX_MAX_SOUND_BYTES) return tooBig;
  if (buf.length < 600) return { success: false, error: 'That sound file looks empty.' };
  const head4 = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  const tag = String.fromCharCode(buf[4], buf[5], buf[6], buf[7]);
  const okFile = ext === 'm4a' ? (tag === 'ftyp' || tag === 'moov' || tag === 'mdat' || tag === 'free' || tag === 'wide')
    : ext === 'mp3' ? (head4.startsWith('ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0))
    : ext === 'ogg' ? head4 === 'OggS'
    : (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3);
  if (!okFile) return { success: false, error: 'That file is not a valid sound.' };
  const path = `sound/${me.id}-${crypto.randomUUID()}.${ext}`;
  const res = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': ct },
    body: buf,
  });
  if (!res.ok) {
    console.error('sound upload failed', res.status, (await res.text()).slice(0, 200));
    return { success: false, error: 'Could not save the sound. Please try again.' };
  }
  return { success: true, url: PUBLIC_PREFIX + path };
}
// Cleans up an uploaded video that never became a status (e.g. posting failed). Only the owner, only if unused.
async function pxVideoDiscard(p: any, me: any) {
  const url = pxOwnVideo(p.video, me);
  if (!url) return { success: true };
  const used = await rest('GET', `profile_status?select=id&image=eq.${encodeURIComponent(url)}&limit=1`);
  if (!used || !used.length) await removeObjects([url]);
  return { success: true };
}
async function pxSoundDiscard(p: any, me: any) {
  const url = pxOwnSound(p.audio, me);
  if (!url) return { success: true };
  const used = await rest('GET', `profile_status?select=id&audio=eq.${encodeURIComponent(url)}&limit=1`);
  if (!used || !used.length) await removeObjects([url]);
  return { success: true };
}
async function pxStatusAdd(p: any, me: any) {
  const text = String(p.text || '').trim().slice(0, PX_MAX_TEXT);
  let image: string | null, thumb: string | null;
  try { image = pxCheckImage(p.image, PX_MAX_IMAGE_CHARS, 'Picture'); thumb = pxCheckImage(p.thumb, PX_MAX_THUMB_CHARS, 'Thumbnail'); }
  catch (e: any) { return { success: false, error: e.message }; }
  const bg = /^#[0-9a-fA-F]{6}$/.test(p.bg || '') ? p.bg : '#2f6570';
  let video = '';
  if (p.video) {
    video = pxOwnVideo(p.video, me);
    if (!video) return { success: false, error: 'This video is not valid. Please upload it again.' };
    if (image) return { success: false, error: 'Choose a picture or a video, not both.' };
    // Same video posted twice (double tap / retry): return the existing status.
    const dup = await rest('GET', `profile_status?select=id&image=eq.${encodeURIComponent(video)}&limit=1`);
    if (dup && dup[0]) return { success: true, id: dup[0].id };
  }
  let audio = '';
  if (p.audio) {
    audio = pxOwnSound(p.audio, me);
    if (!audio) return { success: false, error: 'This sound is not valid. Please upload it again.' };
    const dupA = await rest('GET', `profile_status?select=id&audio=eq.${encodeURIComponent(audio)}&limit=1`);
    if (dupA && dupA[0]) return { success: true, id: dupA[0].id };
  }
  if (!text && !image && !video && !audio) return { success: false, error: 'Write something or add a picture, video or sound.' };
  if (await pxActiveCount(me) >= PX_MAX_ACTIVE_STATUSES) return { success: false, error: `You already have ${PX_MAX_ACTIVE_STATUSES} active statuses. Delete one first.` };
  const stored = video ? video : (image ? await uploadImage(image, 'status', me.id) : null);
  let row: any;
  try { row = await rest('POST', 'profile_status', { user_id: me.id, text: text || null, image: stored, thumb: thumb || null, has_image: !!(image || video), kind: video ? 'video' : 'image', bg, audio: audio || null }); }
  catch (e) { if (stored) await removeObjects([stored]); throw e; }
  return { success: true, id: row && row[0] && row[0].id };
}
async function pxStatusDelete(p: any, me: any) {
  const id = parseInt(p.id, 10);
  if (!id) return { success: false, error: 'Missing status.' };
  const rows = await rest('GET', `profile_status?select=id,user_id,image,audio&id=eq.${id}&limit=1`);
  if (!rows || !rows[0]) return { success: true };
  if (rows[0].user_id !== me.id && !isAdminRole(me)) return { success: false, error: 'You can only delete your own status.' };
  await rest('DELETE', `profile_status?id=eq.${id}`);
  await removeObjects([rows[0].image, rows[0].audio]);
  return { success: true };
}
async function pxProfileView(p: any, me: any) {
  const id = parseInt(p.id, 10);
  if (!id) return { success: false, error: 'Missing person.' };
  const rows = await rest('GET', `users?select=id,full_name,username,position,role,branch,date_registered,photo_link,status,profile_private,last_seen&id=eq.${id}&limit=1`);
  const u = rows && rows[0];
  if (!u || String(u.status || 'Active').toLowerCase() !== 'active' || !canSee(me, u.role, u.id)) return { success: false, error: 'This person is not available.' };
  const name = u.full_name || u.username;
  if (u.profile_private && u.id !== me.id) return { success: true, profile: { id: u.id, name, private: true } };
  const banners = await rest('GET', `profile_banners?select=slot,image,pos_x,pos_y,zoom&user_id=eq.${u.id}&order=slot.asc`);
  return { success: true, profile: { id: u.id, name, username: u.username, position: u.position || '', role: u.role || 'Staff', branch: u.branch || '', memberSince: u.date_registered || '', lastSeen: u.last_seen || '', photo: resolvePhotoUrl(u.photo_link), private: !!u.profile_private, banners: (banners || []).map((r: any) => ({ slot: r.slot, image: r.image, x: r.pos_x == null ? 50 : r.pos_x, y: r.pos_y == null ? 50 : r.pos_y, zoom: r.zoom == null ? 1 : r.zoom })) } };
}
async function pxStaffPhotos(p: any) {
  const ids = String(p.ids || '').split(',').map((x: string) => parseInt(x, 10)).filter((x: number) => x > 0).slice(0, 40);
  if (!ids.length) return { success: true, photos: {} };
  const rows = await rest('GET', `users?select=id,photo_link,profile_private&id=in.(${ids.join(',')})`);
  const out: Record<string, string> = {};
  (rows || []).forEach((r: any) => { if (!r.profile_private && r.photo_link) out[r.id] = resolvePhotoUrl(r.photo_link); });
  return { success: true, photos: out };
}
async function pxPrivacySet(p: any, me: any) {
  const on = String(p['private']) === '1' || String(p['private']) === 'true';
  await rest('PATCH', `users?id=eq.${me.id}`, { profile_private: on });
  return { success: true, private: on };
}
async function pxBannerList(me: any) {
  const rows = await rest('GET', `profile_banners?select=slot,image,pos_x,pos_y,zoom,updated_at&user_id=eq.${me.id}&order=slot.asc`);
  return { success: true, banners: (rows || []).map((r: any) => ({ slot: r.slot, image: r.image, x: r.pos_x == null ? 50 : r.pos_x, y: r.pos_y == null ? 50 : r.pos_y, zoom: r.zoom == null ? 1 : r.zoom, updatedAt: r.updated_at })) };
}
async function pxBannerSave(p: any, me: any) {
  const slot = parseInt(p.slot, 10);
  if (!(slot >= 1 && slot <= 6)) return { success: false, error: 'Invalid picture slot.' };
  let image: string | null;
  try { image = pxCheckImage(p.image, PX_MAX_IMAGE_CHARS, 'Picture'); } catch (e: any) { return { success: false, error: e.message }; }
  if (!image) return { success: false, error: 'Please choose a picture.' };
  const old = await rest('GET', `profile_banners?select=image&user_id=eq.${me.id}&slot=eq.${slot}&limit=1`);
  const stored = await uploadImage(image, 'gallery', me.id);
  try {
    await restUpsert('profile_banners', { user_id: me.id, slot, image: stored, pos_x: 50, pos_y: 50, zoom: 1, updated_at: new Date().toISOString() }, 'user_id,slot', 'resolution=merge-duplicates,return=minimal');
  } catch (e) { await removeObjects([stored]); throw e; }
  if (old && old[0] && old[0].image && old[0].image !== stored) await removeObjects([old[0].image]);
  return { success: true };
}
async function pxBannerAdjust(p: any, me: any) {
  const slot = parseInt(p.slot, 10);
  if (!(slot >= 1 && slot <= 6)) return { success: false, error: 'Invalid picture slot.' };
  const clamp = (v: any, lo: number, hi: number, d: number) => { const n = parseFloat(v); return isNaN(n) ? d : Math.min(hi, Math.max(lo, n)); };
  await rest('PATCH', `profile_banners?user_id=eq.${me.id}&slot=eq.${slot}`, { pos_x: clamp(p.x, 0, 100, 50), pos_y: clamp(p.y, 0, 100, 50), zoom: clamp(p.zoom, 1, 4, 1), updated_at: new Date().toISOString() });
  return { success: true };
}
async function pxBannerDelete(p: any, me: any) {
  const slot = parseInt(p.slot, 10);
  if (!(slot >= 1 && slot <= 6)) return { success: false, error: 'Invalid picture slot.' };
  const old = await rest('GET', `profile_banners?select=image&user_id=eq.${me.id}&slot=eq.${slot}&limit=1`);
  await rest('DELETE', `profile_banners?user_id=eq.${me.id}&slot=eq.${slot}`);
  if (old && old[0]) await removeObjects([old[0].image]);
  return { success: true };
}

// ---------------------------------------------------------------
// ROUTER
// ---------------------------------------------------------------
async function route(action: string, p: any) {
  const me = await sessionUser(p.token);
  if (!me) return json({ success: false, error: 'Session expired. Please log in again.' });
  try {
    let out: any;
    if (isVisitor(me) && ['statusAdd', 'statusVideoUp', 'statusSoundUp', 'bannerSave'].includes(action)) return json({ success: false, error: 'Visitor accounts can look around but cannot post.' });
    if (action === 'statusList') out = await pxStatusList(me);
    else if (action === 'statusImage') out = await pxStatusImage(p);
    else if (action === 'statusAdd') out = await pxStatusAdd(p, me);
    else if (action === 'statusDelete') out = await pxStatusDelete(p, me);
    else if (action === 'statusVideoUp') out = await pxVideoUpload(p, me);
    else if (action === 'statusVideoDiscard') out = await pxVideoDiscard(p, me);
    else if (action === 'statusSoundUp') out = await pxSoundUpload(p, me);
    else if (action === 'statusSoundDiscard') out = await pxSoundDiscard(p, me);
    else if (action === 'profileView') out = await pxProfileView(p, me);
    else if (action === 'staffPhotos') out = await pxStaffPhotos(p);
    else if (action === 'privacySet') out = await pxPrivacySet(p, me);
    else if (action === 'bannerList') out = await pxBannerList(me);
    else if (action === 'bannerSave') out = await pxBannerSave(p, me);
    else if (action === 'bannerAdjust') out = await pxBannerAdjust(p, me);
    else if (action === 'bannerDelete') out = await pxBannerDelete(p, me);
    else return json({ error: 'Unknown action' }, 400);
    return json(out);
  } catch (err: any) {
    console.error('[profile-fast]', action, err);
    return json({ success: false, error: err.message || 'Something went wrong. Please try again.' });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    let action = '', p: Record<string, any> = {};
    const qAction = new URL(req.url).searchParams.get('action');
    if (req.method === 'GET') {
      const u = new URL(req.url);
      action = u.searchParams.get('action') || '';
      p = Object.fromEntries(u.searchParams.entries());
    } else if (qAction === 'statusVideoUp' || qAction === 'statusSoundUp') {
      // Raw upload: details are in the query string, the body is the file itself.
      const u = new URL(req.url);
      action = qAction;
      p = Object.fromEntries(u.searchParams.entries());
      p.__req = req;
    } else {
      const ct = req.headers.get('content-type') || '';
      if (ct.includes('application/json')) { p = await req.json(); action = p.action || ''; }
      else { const t = await req.text(); p = Object.fromEntries(new URLSearchParams(t)); action = p.action || ''; }
    }
    return await route(action, p);
  } catch (err) {
    console.error(err);
    return json({ success: false, error: 'Server error. Please try again.' }, 500);
  }
});
