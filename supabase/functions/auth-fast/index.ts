// LALABELLA AUTH — FAST PATH (Supabase Edge Function)
// checkSession, login, logout, register, getPositions, verifyToken, the
// My Profile page (getProfile/updateProfile/changePassword + Team Status
// + Gallery), and User Management (adminListUsers, adminUpdateUser,
// adminUnlockUser, adminResetPassword, invite-code and position
// management, the password-recheck "unlock" gate, plus
// adminSetCanManageUsers and adminDeleteUser).
//
// v9 (Oct 31 2026, pre-deploy hardening): (1) per-IP rate limit on FAILED logins
// (40 / 15 min) and on wrong invite codes at register (10 / 15 min), stored in
// auth_rate_limit via rpc auth_rate_get / auth_rate_hit — fail-open, so if the
// limiter itself errors, login still works. Successful logins are never counted
// (a whole shop shares one IP). (2) MIN_PASSWORD_LENGTH 6 -> 8 for NEW passwords
// (register, change, admin reset); existing passwords keep working.
//
// v8: fixed a regression from v6 — adminPing and adminUnlock are the
// SHARED password-recheck gate used by shared/admin-gate.js on EVERY
// admin-gated page (Chocolate Admin, Flower Admin, Item Admin, AND
// User Management), so they must only require the general Admin role,
// same as before v6. v6 accidentally put them behind the router's
// blanket can_manage_users check meant for the true User-Management-
// only actions (adminListUsers, adminUpdateUser, etc.), which silently
// locked every Admin who ISN'T a can_manage_users holder out of
// Chocolate/Flower/Item Admin too — found Oct 2026. Fixed by gating
// adminPing/adminUnlock on role===Admin only, and moving the
// can_manage_users check to apply only to the remaining ADMIN_ACTIONS.
//
// v7: publicUser() now includes `photo` (resolved via resolvePhotoUrl,
// same helper getProfile already used) so checkSession/login responses
// carry it — that's what gets cached into sessionStorage.lalabellaUser,
// which shared/nav.js reads to show a profile header (photo, name,
// branch) at the top of the hamburger menu without an extra fetch.
//
// v6: User Management access is now its own gate — can_manage_users on
// `users`, not the general Admin role. Bench has it by default; from
// inside User Management he can grant it to IT or anyone else, and it
// can be revoked the same way (except from yourself, and except the
// last remaining holder — there must always be at least one person who
// can get back in). adminUpdateUser's username param is the STABLE
// lookup key (the account's current username, unchanged by this
// request) — a rename goes through the separate newUsername param, same
// pattern as updateChocolateItem's newChocolateName. New adminDeleteUser
// permanently removes an account (for someone who's resigned) — blocked
// for yourself and for the last can_manage_users holder.
//
// UNLOCK STATE: a small table (admin_unlock), keyed by a hash of the
// session token, stands in for Apps Script's old in-memory CacheService
// for the 15-minute admin unlock and its 5-try lockout.
//
// INVITE CODE: lives in the auth_settings table (an Edge Function's env
// vars can't be changed at runtime the way a Script Property could).

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PEPPER = Deno.env.get('LALABELLA_PEPPER') ?? '';
const AUTH_TOKEN = Deno.env.get('LALABELLA_AUTH_TOKEN') ?? '';
const ENV_INVITE_CODE = Deno.env.get('LALABELLA_INVITE_CODE') ?? '';
const PHOTO_BUCKET = 'profile-photos';

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 30;
const LOGIN_IP_MAX_FAILS = 40;
const REGISTER_IP_MAX_FAILS = 10;
const RATE_WINDOW_MIN = 15;
const PX_MAX_ACTIVE_STATUSES = 10;
const PX_MAX_TEXT = 300;
const PX_MAX_IMAGE_CHARS = 220000;
const PX_MAX_THUMB_CHARS = 24000;
const PX_ACTIVE_MINUTES = 15;
const PX_IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;
const ADMIN_UNLOCK_MINUTES = 15;
const ADMIN_UNLOCK_MAX_TRIES = 5;

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

// ---- per-IP rate limit (fail-open: a limiter error never blocks a login) ----
async function rateGet(key: string): Promise<number> {
  try { return Number(await rest('POST', 'rpc/auth_rate_get', { p_key: key, p_window_min: RATE_WINDOW_MIN })) || 0; }
  catch (e) { console.error('rateGet', e); return 0; }
}
async function rateHit(key: string) {
  try { await rest('POST', 'rpc/auth_rate_hit', { p_key: key, p_window_min: RATE_WINDOW_MIN }); }
  catch (e) { console.error('rateHit', e); }
}

async function hashPassword(password: string) {
  const bytes = new TextEncoder().encode(password + PEPPER);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function generateToken() {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
}
async function sha256Hex(s: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function findUserByUsername(username: string) {
  const rows = await rest('POST', 'rpc/auth_get_user_by_username', { p_username: String(username) });
  return (rows && rows[0]) || null;
}
async function findUserByToken(token: string) {
  const t = String(token || '').trim();
  if (!t) return null;
  const rows = await rest('GET', `users?select=*&limit=1&token=eq.${encodeURIComponent(t)}`);
  return (rows && rows[0]) || null;
}
async function listPositions(includeInactive: boolean) {
  const rows = await rest('GET', 'staff_positions?select=id,name,active,sort_order,modules&order=sort_order.asc,name.asc' + (includeInactive ? '' : '&active=eq.true'));
  return rows || [];
}
async function positionModules(position: string | null) {
  const name = String(position || '').trim().toLowerCase();
  if (!name) return null;
  const list = await listPositions(true);
  const p = list.find((x: any) => String(x.name).toLowerCase() === name);
  return p && Array.isArray(p.modules) ? p.modules : null;
}
async function findPosition(name: string) {
  const wanted = String(name || '').trim().toLowerCase();
  if (!wanted) return '';
  const list = await listPositions(false);
  const hit = list.find((p: any) => String(p.name).toLowerCase() === wanted);
  return hit ? hit.name : '';
}
function resolvePhotoUrl(link: string) {
  if (!link) return '';
  const s = String(link).trim();
  if (/^https?:\/\//i.test(s)) return s;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(s)}&sz=w400`;
}
async function publicUser(u: any) {
  return {
    username: u.username, fullName: u.full_name, role: u.role, branch: u.branch,
    position: u.position || '',
    modules: String(u.role || '').toLowerCase() === 'admin' ? null : await positionModules(u.position),
    canManageUsers: !!u.can_manage_users,
    photo: resolvePhotoUrl(u.photo_link),
  };
}
function touchLastSeen(user: any) {
  try {
    const last = user.last_seen ? new Date(user.last_seen).getTime() : 0;
    if (Date.now() - last < 2 * 60 * 1000) return;
    rest('PATCH', `users?id=eq.${user.id}`, { last_seen: new Date().toISOString() }).catch(() => {});
  } catch { /* never block a check over this */ }
}
async function sessionRow(rawToken: string) {
  const user = await findUserByToken(rawToken);
  if (!user) return { valid: false as const };
  if (String(user.status || 'Active') === 'Inactive') return { valid: false as const, error: 'Account disabled.' };
  const created = user.token_created ? new Date(user.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return { valid: false as const, error: 'Session expired.' };
  touchLastSeen(user);
  return { valid: true as const, row: user };
}
async function lookupSession(rawToken: string) {
  const r = await sessionRow(rawToken);
  return r.valid ? { valid: true, user: await publicUser(r.row) } : { valid: false, error: r.error };
}
async function sessionUser(token: string) {
  const r = await sessionRow(token);
  return r.valid ? r.row : null;
}
function isAdminRole(u: any) { return String(u.role || '').toLowerCase() === 'admin'; }

// ---------------------------------------------------------------
// PHOTOS
// ---------------------------------------------------------------
async function saveProfilePhoto(base64Data: string, username: string): Promise<string> {
  if (!base64Data) return '';
  const commaIdx = base64Data.indexOf(',');
  const meta = commaIdx !== -1 ? base64Data.slice(0, commaIdx) : '';
  const cleanBase64 = commaIdx !== -1 ? base64Data.slice(commaIdx + 1) : base64Data;
  const contentTypeMatch = meta.match(/data:([^;]+);/);
  const contentType = contentTypeMatch ? contentTypeMatch[1] : 'image/jpeg';
  const ext = contentType.split('/')[1] || 'jpg';
  const bytes = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0));
  const path = `${(username || 'user').replace(/[^A-Za-z0-9_-]/g, '_')}-${Date.now()}.${ext}`;
  const res = await fetch(`${SB_URL}/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: bytes,
  });
  if (!res.ok) { console.error('photo upload failed', res.status, (await res.text()).slice(0, 300)); return ''; }
  return `${SB_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

// ---------------------------------------------------------------
// INVITE CODE (auth_settings table, falls back to the env secret until
// an admin explicitly sets it here for the first time)
// ---------------------------------------------------------------
async function getInviteCode(): Promise<string> {
  const rows = await rest('GET', `auth_settings?select=value&key=eq.invite_code&limit=1`);
  if (rows && rows[0] && rows[0].value !== null && rows[0].value !== undefined) return String(rows[0].value);
  return ENV_INVITE_CODE;
}
async function setInviteCode(code: string) {
  await restUpsert('auth_settings', { key: 'invite_code', value: code }, 'key', 'resolution=merge-duplicates,return=minimal');
}

// ---------------------------------------------------------------
// LOGIN / SESSION / REGISTER
// ---------------------------------------------------------------
async function handleLogin(p: any) {
  const username = String(p.username || '').trim();
  const password = String(p.password || '');
  if (!username || !password) return json({ success: false, error: 'Username and password are required.' });
  const ip = String(p.__ip || '');
  const ipKey = 'login:' + ip;
  if (ip && await rateGet(ipKey) >= LOGIN_IP_MAX_FAILS) return json({ success: false, error: `Too many failed attempts from this network. Please try again in ${RATE_WINDOW_MIN} minutes.` });
  const user = await findUserByUsername(username);
  if (!user) { if (ip) await rateHit(ipKey); return json({ success: false, error: 'Incorrect username or password.' }); }
  if (user.locked_until) {
    const until = new Date(user.locked_until).getTime();
    if (Date.now() < until) {
      const minutesLeft = Math.ceil((until - Date.now()) / 60000);
      return json({ success: false, error: `Too many failed attempts. Try again in ${minutesLeft} minute(s).` });
    }
  }
  if (user.password_hash !== await hashPassword(password)) {
    if (ip) await rateHit(ipKey);
    const attempts = (Number(user.failed_attempts) || 0) + 1;
    const patch: any = { failed_attempts: attempts };
    const locking = attempts >= MAX_FAILED_ATTEMPTS;
    if (locking) patch.locked_until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
    await rest('PATCH', `users?id=eq.${user.id}`, patch);
    return json({ success: false, error: locking ? `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.` : 'Incorrect username or password.' });
  }
  if (String(user.status || 'Active') === 'Inactive') return json({ success: false, error: 'This account is disabled. Please contact your admin.' });
  const token = generateToken();
  await rest('PATCH', `users?id=eq.${user.id}`, { token, token_created: new Date().toISOString(), failed_attempts: 0, locked_until: null });
  return json({ success: true, token, user: await publicUser(user) });
}
async function handleRegister(p: any) {
  const expectedCode = await getInviteCode();
  if (!expectedCode) return json({ success: false, error: 'Registration is closed. Please contact your admin.' });
  const ip = String(p.__ip || '');
  const ipKey = 'reg:' + ip;
  if (ip && await rateGet(ipKey) >= REGISTER_IP_MAX_FAILS) return json({ success: false, error: `Too many attempts. Please try again in ${RATE_WINDOW_MIN} minutes.` });
  if (String(p.inviteCode || '').trim() !== expectedCode) { if (ip) await rateHit(ipKey); return json({ success: false, error: 'Invalid invite code.' }); }
  const username = String(p.username || '').trim();
  const password = String(p.password || '');
  const fullName = String(p.fullName || '').trim();
  const branch = String(p.branch || '').trim();
  const position = await findPosition(p.position);
  if (!username || !password || !fullName || !branch) return json({ success: false, error: 'All fields are required.' });
  if (!position) return json({ success: false, error: 'Please choose your position.' });
  if (password.length < MIN_PASSWORD_LENGTH) return json({ success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  if (await findUserByUsername(username)) return json({ success: false, error: 'That username is already taken.' });
  try {
    await rest('POST', 'users', { username, password_hash: await hashPassword(password), full_name: fullName, role: 'Staff', branch, position });
  } catch (e: any) {
    if (String(e.message).includes('409')) return json({ success: false, error: 'That username is already taken.' });
    throw e;
  }
  return json({ success: true, message: 'Registered successfully. You can now log in.' });
}

// ---------------------------------------------------------------
// PROFILE
// ---------------------------------------------------------------
async function handleGetProfile(token: string) {
  const user = await sessionUser(token);
  if (!user) return { success: false, error: 'Unauthorized.' };
  const profile: any = await publicUser(user);
  profile.dateRegistered = user.date_registered || '';
  profile.photoDataUri = resolvePhotoUrl(user.photo_link);
  return { success: true, profile };
}
async function handleUpdateProfile(token: string, p: any) {
  const user = await sessionUser(token);
  if (!user) return { success: false, error: 'Unauthorized.' };
  const patch: any = {};
  const newUsername = String(p.username || '').trim();
  if (newUsername && newUsername !== user.username) {
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(newUsername)) return { success: false, error: 'Username must be 3–30 characters: letters, numbers, dot, dash or underscore.' };
    const existing = await findUserByUsername(newUsername);
    if (existing && existing.id !== user.id) return { success: false, error: 'That username is already taken.' };
    patch.username = newUsername;
  }
  if (p.fullName) patch.full_name = String(p.fullName).trim();
  if (p.branch) patch.branch = String(p.branch).trim();
  if (p.photoBase64) patch.photo_link = await saveProfilePhoto(p.photoBase64, user.username);
  if (Object.keys(patch).length) {
    try { await rest('PATCH', `users?id=eq.${user.id}`, patch); }
    catch (e: any) { if (String(e.message).includes('409')) return { success: false, error: 'That username is already taken.' }; throw e; }
  }
  return { success: true, message: 'Profile updated.', username: patch.username || user.username };
}
async function handleChangePassword(token: string, p: any) {
  const user = await sessionUser(token);
  if (!user) return { success: false, error: 'Unauthorized.' };
  const currentPassword = String(p.currentPassword || '');
  const newPassword = String(p.newPassword || '');
  if (!currentPassword || !newPassword) return { success: false, error: 'Current and new password are both required.' };
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { success: false, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (user.password_hash !== await hashPassword(currentPassword)) return { success: false, error: 'Current password is incorrect.' };
  await rest('PATCH', `users?id=eq.${user.id}`, { password_hash: await hashPassword(newPassword) });
  return { success: true, message: 'Password changed successfully.' };
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
  const rows = await rest('GET', `users?select=id,full_name,username,position,branch,status,last_seen&last_seen=gt.${encodeURIComponent(since)}&order=last_seen.desc`);
  return (rows || []).filter((r: any) => String(r.status || 'Active').toLowerCase() === 'active').map((r: any) => ({
    userId: r.id, name: r.full_name || r.username, position: r.position || '', branch: r.branch || '',
    lastSeen: r.id === me.id ? new Date().toISOString() : r.last_seen,
  }));
}
async function pxStatusList(me: any) {
  const nowIso = new Date().toISOString();
  rest('DELETE', `profile_status?expires_at=lt.${encodeURIComponent(nowIso)}`).catch(() => {});
  const rows = await rest('GET', `profile_status?select=id,user_id,text,thumb,has_image,bg,created_at,expires_at,users(full_name,username,position,branch,status)&expires_at=gt.${encodeURIComponent(nowIso)}&order=created_at.asc`);
  const now = Date.now();
  const list = (rows || []).filter((r: any) => new Date(r.expires_at).getTime() > now && (!r.users || String(r.users.status || 'Active').toLowerCase() === 'active'))
    .map((r: any) => { const u = r.users || {}; return { id: r.id, userId: r.user_id, name: u.full_name || u.username || 'Staff', position: u.position || '', branch: u.branch || '', text: r.text || '', thumb: r.thumb || '', hasImage: !!r.has_image, bg: r.bg || '', createdAt: r.created_at, expiresAt: r.expires_at, mine: r.user_id === me.id }; });
  const mineRows = await rest('GET', `users?select=profile_private&id=eq.${me.id}&limit=1`);
  return { success: true, me: { id: me.id, name: me.full_name || me.username, private: !!(mineRows && mineRows[0] && mineRows[0].profile_private) }, isAdmin: isAdminRole(me), statuses: list, online: await pxOnline(me) };
}
async function pxStatusImage(p: any) {
  const id = parseInt(p.id, 10);
  if (!id) return { success: false, error: 'Missing status.' };
  const rows = await rest('GET', `profile_status?select=image&id=eq.${id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`);
  if (!rows || !rows[0]) return { success: false, error: 'This status has expired.' };
  return { success: true, image: rows[0].image || '' };
}
async function pxStatusAdd(p: any, me: any) {
  const text = String(p.text || '').trim().slice(0, PX_MAX_TEXT);
  let image: string | null, thumb: string | null;
  try { image = pxCheckImage(p.image, PX_MAX_IMAGE_CHARS, 'Picture'); thumb = pxCheckImage(p.thumb, PX_MAX_THUMB_CHARS, 'Thumbnail'); }
  catch (e: any) { return { success: false, error: e.message }; }
  const bg = /^#[0-9a-fA-F]{6}$/.test(p.bg || '') ? p.bg : '#2f6570';
  if (!text && !image) return { success: false, error: 'Write something or add a picture.' };
  const active = await rest('GET', `profile_status?select=id&user_id=eq.${me.id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`);
  if ((active || []).length >= PX_MAX_ACTIVE_STATUSES) return { success: false, error: `You already have ${PX_MAX_ACTIVE_STATUSES} active statuses. Delete one first.` };
  const row = await rest('POST', 'profile_status', { user_id: me.id, text: text || null, image, thumb: thumb || null, has_image: !!image, bg });
  return { success: true, id: row && row[0] && row[0].id };
}
async function pxStatusDelete(p: any, me: any) {
  const id = parseInt(p.id, 10);
  if (!id) return { success: false, error: 'Missing status.' };
  const rows = await rest('GET', `profile_status?select=id,user_id&id=eq.${id}&limit=1`);
  if (!rows || !rows[0]) return { success: true };
  if (rows[0].user_id !== me.id && !isAdminRole(me)) return { success: false, error: 'You can only delete your own status.' };
  await rest('DELETE', `profile_status?id=eq.${id}`);
  return { success: true };
}
async function pxProfileView(p: any, me: any) {
  const id = parseInt(p.id, 10);
  if (!id) return { success: false, error: 'Missing person.' };
  const rows = await rest('GET', `users?select=id,full_name,username,position,role,branch,date_registered,photo_link,status,profile_private,last_seen&id=eq.${id}&limit=1`);
  const u = rows && rows[0];
  if (!u || String(u.status || 'Active').toLowerCase() !== 'active') return { success: false, error: 'This person is not available.' };
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
  await restUpsert('profile_banners', { user_id: me.id, slot, image, pos_x: 50, pos_y: 50, zoom: 1, updated_at: new Date().toISOString() }, 'user_id,slot', 'resolution=merge-duplicates,return=minimal');
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
  await rest('DELETE', `profile_banners?user_id=eq.${me.id}&slot=eq.${slot}`);
  return { success: true };
}

// ---------------------------------------------------------------
// USER MANAGEMENT (was UserAdmin.gs). adminPing/adminUnlock are the
// general shared admin gate (role===Admin, used by every admin-gated
// page). Everything else here is a TRUE User Management action, gated
// separately on can_manage_users (see router).
// ---------------------------------------------------------------
async function unlockKeyFor(token: string) { return 'unlock:' + await sha256Hex(String(token || '').trim()); }
async function getUnlockRow(key: string) {
  const rows = await rest('GET', `admin_unlock?select=*&unlock_key=eq.${encodeURIComponent(key)}&limit=1`);
  return (rows && rows[0]) || null;
}
async function handleAdminUnlock(p: any, admin: any) {
  const key = await unlockKeyFor(p.token);
  const row = await getUnlockRow(key);
  const now = Date.now();
  const failResetOk = row && row.fail_reset_at && new Date(row.fail_reset_at).getTime() > now;
  const fails = failResetOk ? (row.fail_count || 0) : 0;
  if (fails >= ADMIN_UNLOCK_MAX_TRIES) return { success: false, error: 'Too many wrong passwords. Try again in 15 minutes.' };
  const pw = String(p.password || '');
  if (!pw || await hashPassword(pw) !== admin.password_hash) {
    const newFails = fails + 1;
    await restUpsert('admin_unlock', { unlock_key: key, fail_count: newFails, fail_reset_at: new Date(now + 15 * 60000).toISOString() }, 'unlock_key', 'resolution=merge-duplicates,return=minimal');
    const left = ADMIN_UNLOCK_MAX_TRIES - newFails;
    return { success: false, error: left > 0 ? `Wrong password. ${left} tr${left === 1 ? 'y' : 'ies'} left.` : 'Too many wrong passwords. Try again in 15 minutes.' };
  }
  await restUpsert('admin_unlock', { unlock_key: key, unlocked_until: new Date(now + ADMIN_UNLOCK_MINUTES * 60000).toISOString(), fail_count: 0, fail_reset_at: null }, 'unlock_key', 'resolution=merge-duplicates,return=minimal');
  return { success: true, minutes: ADMIN_UNLOCK_MINUTES };
}
async function checkAndExtendUnlock(token: string): Promise<boolean> {
  const key = await unlockKeyFor(token);
  const row = await getUnlockRow(key);
  const now = Date.now();
  if (!row || !row.unlocked_until || new Date(row.unlocked_until).getTime() <= now) return false;
  await restUpsert('admin_unlock', { unlock_key: key, unlocked_until: new Date(now + ADMIN_UNLOCK_MINUTES * 60000).toISOString() }, 'unlock_key', 'resolution=merge-duplicates,return=minimal');
  return true;
}

async function adminListUsers(admin: any) {
  const rows = await rest('GET', 'users?select=id,username,full_name,role,branch,position,status,date_registered,token_created,failed_attempts,locked_until,can_manage_users&order=username.asc');
  const now = Date.now();
  const users = (rows || []).map((u: any) => ({
    username: u.username, fullName: u.full_name || '', role: u.role || 'Staff', branch: u.branch || '', position: u.position || '',
    status: u.status || 'Active', dateRegistered: u.date_registered || '', lastLogin: u.token_created || '',
    failedAttempts: Number(u.failed_attempts) || 0, locked: !!(u.locked_until && new Date(u.locked_until).getTime() > now),
    lockedUntil: u.locked_until || '', isMe: u.id === admin.id, canManageUsers: !!u.can_manage_users,
  }));
  return { success: true, users };
}
async function adminUpdateUser(p: any, admin: any) {
  const target = await findUserByUsername(p.username || '');
  if (!target) return { success: false, error: 'User not found.' };
  const patch: any = {};
  const role = p.role, status = p.status;
  if (p.fullName !== undefined && String(p.fullName).trim()) patch.full_name = String(p.fullName).trim();
  if (p.newUsername !== undefined) {
    const newUsername = String(p.newUsername).trim();
    if (newUsername && newUsername !== target.username) {
      if (!/^[A-Za-z0-9._-]{3,30}$/.test(newUsername)) return { success: false, error: 'Username must be 3–30 characters: letters, numbers, dot, dash or underscore.' };
      const existing = await findUserByUsername(newUsername);
      if (existing && existing.id !== target.id) return { success: false, error: 'That username is already taken.' };
      patch.username = newUsername;
    }
  }
  if (p.branch !== undefined && String(p.branch).trim()) patch.branch = String(p.branch).trim();
  if (p.position !== undefined) {
    if (String(p.position).trim() === '') patch.position = null;
    else { const pos = await findPosition(p.position); if (!pos) return { success: false, error: 'Unknown position.' }; patch.position = pos; }
  }
  if (role !== undefined && role !== '') { if (role !== 'Admin' && role !== 'Staff') return { success: false, error: 'Role must be Admin or Staff.' }; patch.role = role; }
  if (status !== undefined && status !== '') { if (status !== 'Active' && status !== 'Inactive') return { success: false, error: 'Status must be Active or Inactive.' }; patch.status = status; }
  if (!Object.keys(patch).length) return { success: false, error: 'Nothing to change.' };
  const losingAdmin = String(target.role) === 'Admin' && String(target.status || 'Active') === 'Active' && ((patch.role && patch.role !== 'Admin') || patch.status === 'Inactive');
  if (losingAdmin) {
    if (target.id === admin.id) return { success: false, error: 'You cannot remove your own admin access or disable yourself.' };
    const admins = await rest('GET', 'users?select=id&role=eq.Admin&status=eq.Active');
    if ((admins || []).length <= 1) return { success: false, error: 'This is the last active Admin — keep at least one.' };
  }
  if (patch.status === 'Inactive' && target.id === admin.id) return { success: false, error: 'You cannot disable yourself.' };
  if (patch.status === 'Inactive') patch.token = null;
  try { await rest('PATCH', `users?id=eq.${target.id}`, patch); }
  catch (e: any) { if (String(e.message).includes('409')) return { success: false, error: 'That username is already taken.' }; throw e; }
  return { success: true, message: 'Saved.', renamedTo: patch.username || undefined };
}
async function adminUnlockUser(p: any) {
  const target = await findUserByUsername(p.username || '');
  if (!target) return { success: false, error: 'User not found.' };
  await rest('PATCH', `users?id=eq.${target.id}`, { failed_attempts: 0, locked_until: null });
  return { success: true, message: 'Account unlocked.' };
}
async function adminResetPassword(p: any) {
  const target = await findUserByUsername(p.username || '');
  if (!target) return { success: false, error: 'User not found.' };
  const pw = String(p.newPassword || '');
  if (pw.length < MIN_PASSWORD_LENGTH) return { success: false, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  await rest('PATCH', `users?id=eq.${target.id}`, { password_hash: await hashPassword(pw), token: null, failed_attempts: 0, locked_until: null });
  return { success: true, message: `Password reset. Give the new password to ${target.username}.` };
}
async function adminSetCanManageUsers(p: any, admin: any) {
  const target = await findUserByUsername(p.username || '');
  if (!target) return { success: false, error: 'User not found.' };
  const grant = String(p.value) === 'true';
  if (!grant) {
    if (target.id === admin.id) return { success: false, error: 'You cannot remove your own User Management access.' };
    const holders = await rest('GET', 'users?select=id&can_manage_users=eq.true');
    if ((holders || []).length <= 1) return { success: false, error: 'This is the last person with User Management access — grant it to someone else first.' };
  }
  await rest('PATCH', `users?id=eq.${target.id}`, { can_manage_users: grant });
  return { success: true, message: grant ? `${target.username} can now open User Management.` : `Removed ${target.username}’s access to User Management.` };
}
async function adminDeleteUser(p: any, admin: any) {
  const target = await findUserByUsername(p.username || '');
  if (!target) return { success: false, error: 'User not found.' };
  if (target.id === admin.id) return { success: false, error: 'You cannot delete your own account.' };
  if (target.can_manage_users) {
    const holders = await rest('GET', 'users?select=id&can_manage_users=eq.true');
    if ((holders || []).length <= 1) return { success: false, error: 'This is the last person with User Management access — grant it to someone else before deleting this account.' };
  }
  await rest('DELETE', `users?id=eq.${target.id}`);
  return { success: true, message: `${target.username} has been deleted.` };
}
async function adminGetInviteCode() { return { success: true, inviteCode: await getInviteCode() }; }
async function adminSetInviteCode(p: any) {
  const code = String(p.inviteCode || '').trim();
  if (!code) { await setInviteCode(''); return { success: true, message: 'Registration closed.', inviteCode: '' }; }
  if (code.length < 6) return { success: false, error: 'Invite code must be at least 6 characters.' };
  await setInviteCode(code);
  return { success: true, message: 'Invite code updated.', inviteCode: code };
}
async function adminListPositions() {
  const list = await listPositions(true);
  return { success: true, positions: list.map((p: any) => ({ id: p.id, name: p.name, active: p.active, modules: p.modules || null })) };
}
async function adminAddPosition(p: any) {
  const name = String(p.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 40) return { success: false, error: 'Position name must be 2–40 characters.' };
  const list = await listPositions(true);
  const existing = list.find((x: any) => String(x.name).toLowerCase() === name.toLowerCase());
  if (existing) {
    if (!existing.active) await rest('PATCH', `staff_positions?id=eq.${existing.id}`, { active: true });
    return { success: true, message: existing.active ? 'Already in the list.' : 'Position restored.' };
  }
  const maxSort = list.reduce((m: number, p: any) => Math.max(m, Number(p.sort_order) || 0), 0);
  await rest('POST', 'staff_positions', { name, sort_order: maxSort + 10 });
  return { success: true, message: 'Position added.' };
}
async function adminSetPositionActive(p: any) {
  const id = Number(p.id);
  if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid position.' };
  const active = String(p.active) === 'true';
  await rest('PATCH', `staff_positions?id=eq.${id}`, { active });
  return { success: true, message: active ? 'Position shown again.' : 'Position hidden.' };
}
async function adminSetPositionModules(p: any) {
  const id = Number(p.id);
  if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid position.' };
  const allowed = ['chocolate', 'flower', 'item'];
  const picked = String(p.modules || '').split(',').map((x: string) => x.trim().toLowerCase()).filter((x: string) => allowed.indexOf(x) !== -1);
  const unique = allowed.filter(x => picked.indexOf(x) !== -1);
  const value = (unique.length === 0 || unique.length === allowed.length) ? null : unique;
  await rest('PATCH', `staff_positions?id=eq.${id}`, { modules: value });
  return { success: true, message: 'Menu access saved. Staff see it after they log in again.' };
}

// These are the TRUE User-Management-only actions — gated on
// can_manage_users in the router below. adminPing/adminUnlock are
// deliberately NOT in this map — they're handled separately with just
// the general Admin-role check (see router).
const ADMIN_ACTIONS: Record<string, (p: any, admin: any) => Promise<any>> = {
  adminListUsers: (p, a) => adminListUsers(a),
  adminUpdateUser: (p, a) => adminUpdateUser(p, a),
  adminUnlockUser: (p) => adminUnlockUser(p),
  adminResetPassword: (p) => adminResetPassword(p),
  adminSetCanManageUsers: (p, a) => adminSetCanManageUsers(p, a),
  adminDeleteUser: (p, a) => adminDeleteUser(p, a),
  adminGetInviteCode: () => adminGetInviteCode(),
  adminSetInviteCode: (p) => adminSetInviteCode(p),
  adminListPositions: () => adminListPositions(),
  adminAddPosition: (p) => adminAddPosition(p),
  adminSetPositionActive: (p) => adminSetPositionActive(p),
  adminSetPositionModules: (p) => adminSetPositionModules(p),
};

// ---------------------------------------------------------------
// ROUTER
// ---------------------------------------------------------------
const PX_ACTIONS = new Set(['statusList', 'statusImage', 'statusAdd', 'statusDelete', 'profileView', 'staffPhotos', 'privacySet', 'bannerList', 'bannerSave', 'bannerAdjust', 'bannerDelete']);

async function route(action: string, p: any) {
  switch (action) {
    case 'checkSession':
      return json(await lookupSession(p.token));
    case 'login':
      return handleLogin(p);
    case 'register':
      return handleRegister(p);
    case 'logout': {
      const token = String(p.token || '').trim();
      if (token) await rest('PATCH', `users?token=eq.${encodeURIComponent(token)}`, { token: null });
      return json({ success: true });
    }
    case 'getPositions':
      return json({ success: true, positions: (await listPositions(false)).map((x: any) => x.name) });
    case 'verifyToken': {
      if (!AUTH_TOKEN || String(p.callerSecret || '') !== AUTH_TOKEN) return json({ valid: false, error: 'Unauthorized caller.' });
      return json(await lookupSession(p.token));
    }
    case 'getProfile':
      return json(await handleGetProfile(p.token));
    case 'updateProfile':
      return json(await handleUpdateProfile(p.token, p));
    case 'changePassword':
      return json(await handleChangePassword(p.token, p));
  }

  if (PX_ACTIONS.has(action)) {
    const me = await sessionUser(p.token);
    if (!me) return json({ success: false, error: 'Session expired. Please log in again.' });
    try {
      let out: any;
      if (action === 'statusList') out = await pxStatusList(me);
      else if (action === 'statusImage') out = await pxStatusImage(p);
      else if (action === 'statusAdd') out = await pxStatusAdd(p, me);
      else if (action === 'statusDelete') out = await pxStatusDelete(p, me);
      else if (action === 'profileView') out = await pxProfileView(p, me);
      else if (action === 'staffPhotos') out = await pxStaffPhotos(p);
      else if (action === 'privacySet') out = await pxPrivacySet(p, me);
      else if (action === 'bannerList') out = await pxBannerList(me);
      else if (action === 'bannerSave') out = await pxBannerSave(p, me);
      else if (action === 'bannerAdjust') out = await pxBannerAdjust(p, me);
      else if (action === 'bannerDelete') out = await pxBannerDelete(p, me);
      return json(out);
    } catch (err: any) {
      console.error('[ProfileExtras]', action, err);
      return json({ success: false, error: err.message || 'Something went wrong. Please try again.' });
    }
  }

  // Shared admin gate (role===Admin) — used by Chocolate/Flower/Item
  // Admin AND User Management for the 15-minute password-recheck
  // unlock. Not tied to can_manage_users: unlocking here just proves
  // "I am an Admin and I re-typed my password" — the true
  // User-Management-only actions below enforce can_manage_users
  // separately, on top of this.
  if (action === 'adminPing' || action === 'adminUnlock') {
    const admin = await sessionUser(p.token);
    if (!admin) return json({ success: false, error: 'Unauthorized.' });
    if (!isAdminRole(admin)) return json({ success: false, error: 'Admins only.' });
    if (action === 'adminUnlock') return json(await handleAdminUnlock(p, admin));
    return json({ success: true });
  }

  if (ADMIN_ACTIONS[action]) {
    const admin = await sessionUser(p.token);
    if (!admin) return json({ success: false, error: 'Unauthorized.' });
    if (!admin.can_manage_users) return json({ success: false, error: 'You do not have access to User Management.' });
    try {
      const unlocked = await checkAndExtendUnlock(p.token);
      if (!unlocked) return json({ success: false, reauth: true, error: 'Please confirm your password.' });
      return json(await ADMIN_ACTIONS[action](p, admin));
    } catch (err: any) {
      console.error('[UserAdmin]', action, err);
      return json({ success: false, error: err.message || 'Something went wrong. Please try again.' });
    }
  }

  return json({ error: 'Unknown action' }, 400);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    let action = '', p: Record<string, any> = {};
    if (req.method === 'GET') {
      const u = new URL(req.url);
      action = u.searchParams.get('action') || '';
      p = Object.fromEntries(u.searchParams.entries());
    } else {
      const ct = req.headers.get('content-type') || '';
      if (ct.includes('application/json')) { p = await req.json(); action = p.action || ''; }
      else { const t = await req.text(); p = Object.fromEntries(new URLSearchParams(t)); action = p.action || ''; }
    }
    // Server-derived client IP (always overwrites anything the caller sent).
    p.__ip = (req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || '').trim();
    return await route(action, p);
  } catch (err) {
    console.error(err);
    return json({ success: false, valid: false, error: 'Server error. Please try again.' }, 500);
  }
});
