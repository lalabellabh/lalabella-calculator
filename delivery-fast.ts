// LALABELLA DELIVERY TRACKING — Supabase Edge Function (delivery-fast)  v6 (v6: branch per driver and per delivery; v5: Google Maps link per delivery; v4: delivery time slot; v3: driver signup, admin approves)
// Admin puts in an order (Order No + address + driver). The driver taps Start, the phone sends its GPS,
// the admin sees the car on a map. Delivered stops it and keeps the last spot + time.
// v2: drivers have their OWN accounts (table delivery_drivers) and their own token. A driver token works ONLY here,
//     so a driver cannot reach anything else in the system.
// Driver (own login):  signup {fullName,username,password} (waits for admin approval), login {username,password}, logout, mine, start {id}, ping {id,lat,lng,accuracy}, done {id,lat?,lng?}
// Admin (users token, role Admin, checked here on the server): drivers, driverAdd {username,fullName,password},
//     driverEdit {id,fullName?,username?,active?,password?,branch?}, list, track {id}, create {orderNo,address,note,slot?,mapUrl?,branch?,driverId}, cancel {id}
// Branch: Moda Mall / Qalali / Hamala (same names as branch_config). A driver may belong to one branch ('' = any).
//     A delivery gets the branch picked in the form, or else the driver's branch. A driver of one branch cannot be given another branch's order.

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ACC_M = 500;          // ignore very weak GPS fixes
const MIN_PING_GAP_MS = 2000;   // ignore pings that come faster than this
const KEEP_POINTS_DAYS = 30;
const DRIVER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;   // a driver stays logged in on the phone for 30 days
const BRANCHES = ['Moda Mall', 'Qalali', 'Hamala'];
const MAX_FAILS = 5, LOCK_MIN = 10;
const PBKDF2_ITER = 100000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (error: string, extra: Record<string, unknown> = {}) => json({ success: false, error, ...extra });

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
const enc = encodeURIComponent;
const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

async function sessionUser(token: string) {
  const t = String(token || '').trim();
  if (!t || !/^[a-f0-9]{20,}$/i.test(t)) return null;
  const rows = await rest('GET', `users?select=id,username,full_name,role,branch,status,token_created&token=eq.${enc(t)}&limit=1`);
  const u = rows && rows[0];
  if (!u || String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}
const isAdmin = (u: any) => String(u.role || '').toLowerCase() === 'admin';
const nameOf = (u: any) => String(u.full_name || u.username || '').trim();

// ---------- driver accounts ----------
const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => Uint8Array.from((h.match(/../g) || []).map((x) => parseInt(x, 16)));
async function sha256hex(t: string) { return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))); }
async function pbkdf2(pw: string, salt: Uint8Array, iter: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
async function hashPw(pw: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${toHex(salt)}$${toHex(await pbkdf2(pw, salt, PBKDF2_ITER))}`;
}
async function checkPw(pw: string, stored: string) {
  const [kind, it, salt, hash] = String(stored || '').split('$');
  if (kind !== 'pbkdf2' || !salt || !hash) return false;
  const got = toHex(await pbkdf2(pw, fromHex(salt), Number(it) || PBKDF2_ITER));
  let diff = got.length ^ hash.length;
  for (let i = 0; i < got.length && i < hash.length; i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}
const cleanUser = (v: unknown) => String(v ?? '').trim().toLowerCase();
const goodUser = (u: string) => /^[a-z0-9._-]{3,30}$/.test(u);
async function driverSession(token: string) {
  const t = String(token || '').trim();
  if (!/^[a-f0-9]{40,}$/i.test(t)) return null;
  const rows = await rest('GET', `delivery_drivers?select=id,username,full_name,active,token_created&token_hash=eq.${await sha256hex(t)}&limit=1`);
  const d = rows && rows[0];
  if (!d || d.active === false) return null;
  const created = d.token_created ? new Date(d.token_created).getTime() : 0;
  if (!created || Date.now() - created > DRIVER_SESSION_MS) return null;
  return d;
}

function goodPos(lat: unknown, lng: unknown) {
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0);
}
async function getDelivery(id: unknown) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) return null;
  const r = await rest('GET', `deliveries?select=*&id=eq.${n}&limit=1`);
  return (r && r[0]) || null;
}
const pub = (d: any) => ({
  id: d.id, orderNo: d.order_no, address: d.address, note: d.note, slot: d.slot || '', mapUrl: d.map_url || '', branch: d.branch || '', driverId: d.dd_id, driverName: d.driver_name,
  status: d.status, createdAt: d.created_at, startedAt: d.started_at, deliveredAt: d.delivered_at,
  lastLat: d.last_lat, lastLng: d.last_lng, lastAcc: d.last_acc, lastAt: d.last_at,
});

// ---------- driver ----------
async function actLogin(p: any) {
  const username = cleanUser(p.username), password = String(p.password ?? '');
  const bad = () => fail('Wrong username or password.');
  if (!goodUser(username) || !password || password.length > 200) { await pbkdf2('x', new Uint8Array(16), PBKDF2_ITER); return bad(); }
  const d = ((await rest('GET', `delivery_drivers?select=*&username=eq.${enc(username)}&limit=1`)) || [])[0];
  if (!d) { await pbkdf2('x', new Uint8Array(16), PBKDF2_ITER); return bad(); }
  if (d.locked_until && new Date(d.locked_until).getTime() > Date.now()) {
    return fail(`Too many wrong tries. Try again in ${Math.max(1, Math.ceil((new Date(d.locked_until).getTime() - Date.now()) / 60000))} min.`);
  }
  if (!(await checkPw(password, d.pass_hash))) {
    const fails = (Number(d.failed_attempts) || 0) + 1;
    const patch: any = { failed_attempts: fails };
    if (fails >= MAX_FAILS) { patch.failed_attempts = 0; patch.locked_until = new Date(Date.now() + LOCK_MIN * 60000).toISOString(); }
    await rest('PATCH', `delivery_drivers?id=eq.${d.id}`, patch, 'return=minimal');
    return bad();
  }
  if (d.pending) return fail('Your account is waiting for the admin to approve it. Try again later.');
  if (d.active === false) return fail('This driver account is switched off. Ask the admin.');
  const raw = toHex(crypto.getRandomValues(new Uint8Array(24)));
  const now = new Date().toISOString();
  await rest('PATCH', `delivery_drivers?id=eq.${d.id}`, { token_hash: await sha256hex(raw), token_created: now, failed_attempts: 0, locked_until: null, last_login: now }, 'return=minimal');
  return json({ success: true, token: raw, name: d.full_name, username: d.username });
}
async function actSignup(p: any) {
  const username = cleanUser(p.username), fullName = clip(p.fullName, 60), password = String(p.password ?? '');
  if (fullName.length < 2) return fail('Write your name.');
  if (!goodUser(username)) return fail('Username: 3 to 30 letters, numbers, dot, dash or underscore. No spaces.');
  if (password.length < 6 || password.length > 100) return fail('Password must be at least 6 characters.');
  const pend = (await rest('GET', 'delivery_drivers?select=id&pending=eq.true&limit=21')) || [];
  if (pend.length >= 20) return fail('Too many sign-ups are waiting. Please tell the admin.');
  const dup = (await rest('GET', `delivery_drivers?select=id&username=eq.${enc(username)}&limit=1`)) || [];
  if (dup.length) return fail('That username is already used. Choose another one.');
  await rest('POST', 'delivery_drivers', { username, full_name: fullName, pass_hash: await hashPw(password), active: false, pending: true }, 'return=minimal');
  return json({ success: true });
}
async function actLogout(me: any) {
  await rest('PATCH', `delivery_drivers?id=eq.${me.id}`, { token_hash: null, token_created: null }, 'return=minimal');
  return json({ success: true });
}
async function actMine(me: any) {
  const since = new Date(Date.now() - 2 * 86400000).toISOString();
  const [act, done] = await Promise.all([
    rest('GET', `deliveries?select=*&dd_id=eq.${me.id}&status=in.(Assigned,"On the way")&order=created_at.desc&limit=30`),
    rest('GET', `deliveries?select=*&dd_id=eq.${me.id}&status=eq.Delivered&delivered_at=gte.${enc(since)}&order=created_at.desc&limit=10`),
  ]);
  return json({ success: true, now: new Date().toISOString(), rows: [...(act || []), ...(done || [])].map(pub) });
}
async function mineOrFail(me: any, id: unknown) {
  const d = await getDelivery(id);
  if (!d || d.dd_id !== me.id) return { err: 'This delivery is not assigned to you.' };
  return { d };
}
async function actStart(me: any, p: any) {
  const { d, err } = await mineOrFail(me, p.id) as any;
  if (err) return fail(err);
  if (d.status === 'Delivered' || d.status === 'Cancelled') return fail(`This delivery is already ${d.status}.`);
  if (d.status === 'Assigned') {
    await rest('PATCH', `deliveries?id=eq.${d.id}`, { status: 'On the way', started_at: new Date().toISOString() }, 'return=minimal');
  }
  return json({ success: true });
}
async function actPing(me: any, p: any) {
  const { d, err } = await mineOrFail(me, p.id) as any;
  if (err) return fail(err);
  if (d.status !== 'On the way') return fail(`Tracking stopped: this delivery is ${d.status}.`, { stop: true });
  if (!goodPos(p.lat, p.lng)) return fail('No GPS position.');
  const acc = Number(p.accuracy);
  if (Number.isFinite(acc) && acc > MAX_ACC_M) return json({ success: true, ignored: 'weak' });
  if (d.last_at && Date.now() - new Date(d.last_at).getTime() < MIN_PING_GAP_MS) return json({ success: true, ignored: 'fast' });
  const at = new Date().toISOString();
  const a = Number.isFinite(acc) ? Math.round(acc) : null;
  await rest('POST', 'delivery_points', { delivery_id: d.id, lat: Number(p.lat), lng: Number(p.lng), acc: a, at }, 'return=minimal');
  await rest('PATCH', `deliveries?id=eq.${d.id}`, { last_lat: Number(p.lat), last_lng: Number(p.lng), last_acc: a, last_at: at }, 'return=minimal');
  return json({ success: true });
}
async function actDone(me: any, p: any) {
  const { d, err } = await mineOrFail(me, p.id) as any;
  if (err) return fail(err);
  if (d.status === 'Delivered') return json({ success: true, already: true });
  if (d.status === 'Cancelled') return fail('This delivery was cancelled.');
  const now = new Date().toISOString();
  const patch: any = { status: 'Delivered', delivered_at: now };
  if (!d.started_at) patch.started_at = now;
  if (goodPos(p.lat, p.lng)) {
    const acc = Number(p.accuracy), a = Number.isFinite(acc) ? Math.round(acc) : null;
    patch.last_lat = Number(p.lat); patch.last_lng = Number(p.lng); patch.last_acc = a; patch.last_at = now;
    await rest('POST', 'delivery_points', { delivery_id: d.id, lat: Number(p.lat), lng: Number(p.lng), acc: a, at: now }, 'return=minimal');
  }
  await rest('PATCH', `deliveries?id=eq.${d.id}`, patch, 'return=minimal');
  return json({ success: true, deliveredAt: now });
}

// ---------- admin ----------
async function actDrivers() {
  const r = (await rest('GET', 'delivery_drivers?select=id,username,full_name,active,pending,last_login,branch&order=full_name.asc')) || [];
  return json({ success: true, drivers: r.map((u: any) => ({ id: u.id, username: u.username, name: u.full_name, active: u.active !== false, pending: !!u.pending, lastLogin: u.last_login, branch: u.branch || '' })) });
}
async function actDriverAdd(p: any) {
  const username = cleanUser(p.username), fullName = clip(p.fullName, 60), password = String(p.password ?? '');
  if (fullName.length < 2) return fail('Write the driver name.');
  if (!goodUser(username)) return fail('Username: 3 to 30 letters, numbers, dot, dash or underscore. No spaces.');
  if (password.length < 6 || password.length > 100) return fail('Password must be at least 6 characters.');
  const dup = (await rest('GET', `delivery_drivers?select=id&username=eq.${enc(username)}&limit=1`)) || [];
  if (dup.length) return fail('That username is already used.');
  const br = clip(p.branch, 30);
  if (br && !BRANCHES.includes(br)) return fail('Pick a branch from the list.');
  const row = await rest('POST', 'delivery_drivers', { username, full_name: fullName, pass_hash: await hashPw(password), branch: br || null });
  return json({ success: true, id: row && row[0] && row[0].id });
}
async function actDriverEdit(p: any) {
  const id = Number(p.id);
  if (!Number.isInteger(id) || id < 1) return fail('Invalid driver.');
  const d = ((await rest('GET', `delivery_drivers?select=id&id=eq.${id}&limit=1`)) || [])[0];
  if (!d) return fail('Driver not found.');
  const patch: any = {};
  if (p.fullName !== undefined) { const n = clip(p.fullName, 60); if (n.length < 2) return fail('Write the driver name.'); patch.full_name = n; }
  if (p.username !== undefined) {
    const un = cleanUser(p.username);
    if (!goodUser(un)) return fail('Username: 3 to 30 letters, numbers, dot, dash or underscore. No spaces.');
    const dup = (await rest('GET', `delivery_drivers?select=id&username=eq.${enc(un)}&id=neq.${id}&limit=1`)) || [];
    if (dup.length) return fail('That username is already used.');
    patch.username = un; patch.token_hash = null; patch.token_created = null;
  }
  if (p.branch !== undefined) { const br = clip(p.branch, 30); if (br && !BRANCHES.includes(br)) return fail('Pick a branch from the list.'); patch.branch = br || null; }
  if (p.active !== undefined) { patch.active = !!p.active; if (p.active) patch.pending = false; if (!p.active) { patch.token_hash = null; patch.token_created = null; } }
  if (p.password !== undefined && String(p.password) !== '') {
    const pw = String(p.password);
    if (pw.length < 6 || pw.length > 100) return fail('Password must be at least 6 characters.');
    patch.pass_hash = await hashPw(pw); patch.token_hash = null; patch.token_created = null; patch.failed_attempts = 0; patch.locked_until = null;
  }
  if (!Object.keys(patch).length) return fail('Nothing to change.');
  await rest('PATCH', `delivery_drivers?id=eq.${id}`, patch, 'return=minimal');
  if (patch.full_name) await rest('PATCH', `deliveries?dd_id=eq.${id}&status=in.(Assigned,"On the way")`, { driver_name: patch.full_name }, 'return=minimal');
  return json({ success: true });
}
async function actList() {
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const [act, recent] = await Promise.all([
    rest('GET', `deliveries?select=*&status=in.(Assigned,"On the way")&order=created_at.desc&limit=100`),
    rest('GET', `deliveries?select=*&created_at=gte.${enc(since)}&order=created_at.desc&limit=100`),
  ]);
  const seen = new Set<number>();
  const rows = [...(act || []), ...(recent || [])].filter((r: any) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  rows.sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
  return json({ success: true, now: new Date().toISOString(), rows: rows.map(pub) });
}
async function actTrack(p: any) {
  const d = await getDelivery(p.id);
  if (!d) return fail('Delivery not found.');
  const pts = (await rest('GET', `delivery_points?select=lat,lng,acc,at&delivery_id=eq.${d.id}&order=at.asc&limit=3000`)) || [];
  return json({ success: true, now: new Date().toISOString(), delivery: pub(d), points: pts });
}
// Pasted from WhatsApp: take the first link in the text and keep it only if it is a Google Maps link.
function mapLink(v: unknown): string | null {
  const m = /https?:\/\/[^\s<>"']+/i.exec(String(v ?? ''));
  if (!m) return null;
  let u: URL;
  try { u = new URL(m[0].replace(/[).,;]+$/, '')); } catch { return null; }
  const h = u.hostname.toLowerCase();
  const ok = h === 'maps.app.goo.gl' || (h === 'goo.gl' && u.pathname.startsWith('/maps'))
    || /^maps\.google\.com(\.[a-z]{2})?$/.test(h) || (/^(www\.)?google\.com(\.[a-z]{2})?$/.test(h) && u.pathname.startsWith('/maps'));
  if (!ok || u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  u.protocol = 'https:';
  const out = u.toString();
  return out.length <= 500 ? out : null;
}
const SLOTS = ['10 AM - 2 PM', '3 PM - 6 PM', '7 PM - 10 PM'];
async function actCreate(me: any, p: any) {
  const orderNo = clip(p.orderNo, 40), address = clip(p.address, 300), note = clip(p.note, 300);
  const slot = clip(p.slot, 20);
  const rawLink = String(p.mapUrl ?? '').trim();
  const mapUrl = rawLink ? mapLink(rawLink) : null;
  if (rawLink && !mapUrl) return fail('That is not a Google Maps link. Share the pin from Google Maps and paste the link.');
  if (slot && !SLOTS.includes(slot)) return fail('Pick a delivery time from the list.');
  if (!orderNo) return fail('Write the Order No.');
  if (!address) return fail('Write the delivery address.');
  const driverId = Number(p.driverId);
  if (!Number.isInteger(driverId) || driverId < 1) return fail('Pick a driver.');
  const dr = ((await rest('GET', `delivery_drivers?select=id,full_name,active,branch&id=eq.${driverId}&limit=1`)) || [])[0];
  if (!dr || dr.active === false) return fail('That driver is not active.');
  const pickBr = clip(p.branch, 30);
  if (pickBr && !BRANCHES.includes(pickBr)) return fail('Pick a branch from the list.');
  if (dr.branch && pickBr && dr.branch !== pickBr) return fail(`${dr.full_name} belongs to ${dr.branch}. Pick a ${pickBr} driver.`);
  const branch = pickBr || dr.branch || null;
  const dup = (await rest('GET', `deliveries?select=id&order_no=eq.${enc(orderNo)}&status=in.(Assigned,"On the way")&limit=1`)) || [];
  if (dup.length) return fail(`Order ${orderNo} already has a delivery that is not finished.`);
  const row = await rest('POST', 'deliveries', { order_no: orderNo, address, note, slot: slot || null, map_url: mapUrl, branch, dd_id: dr.id, driver_name: dr.full_name, created_by: me.id });
  rest('DELETE', `delivery_points?at=lt.${enc(new Date(Date.now() - KEEP_POINTS_DAYS * 86400000).toISOString())}`, undefined, 'return=minimal').catch(() => {});
  return json({ success: true, id: row && row[0] && row[0].id });
}
async function actCancel(p: any) {
  const d = await getDelivery(p.id);
  if (!d) return fail('Delivery not found.');
  if (d.status === 'Delivered') return fail('This delivery is already delivered.');
  await rest('PATCH', `deliveries?id=eq.${d.id}`, { status: 'Cancelled' }, 'return=minimal');
  return json({ success: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('Use POST.');
  let p: any = {};
  try { p = await req.json(); } catch { return fail('Bad request.'); }
  try {
    const act = String(p.action || '');
    if (act === 'login') return await actLogin(p);
    if (act === 'signup') return await actSignup(p);
    if (['logout', 'mine', 'start', 'ping', 'done'].includes(act)) {
      const dr = await driverSession(p.token);
      if (!dr) return json({ success: false, error: 'Please log in again.', reauth: true }, 401);
      if (act === 'logout') return await actLogout(dr);
      if (act === 'mine') return await actMine(dr);
      if (act === 'start') return await actStart(dr, p);
      if (act === 'ping') return await actPing(dr, p);
      return await actDone(dr, p);
    }
    const me = await sessionUser(p.token);
    if (!me) return json({ success: false, error: 'Please log in again.', reauth: true }, 401);
    if (!isAdmin(me)) return fail('Only an Admin can do this.');
    if (act === 'drivers') return await actDrivers();
    if (act === 'driverAdd') return await actDriverAdd(p);
    if (act === 'driverEdit') return await actDriverEdit(p);
    if (act === 'list') return await actList();
    if (act === 'track') return await actTrack(p);
    if (act === 'create') return await actCreate(me, p);
    if (act === 'cancel') return await actCancel(p);
    return fail('Unknown action.');
  } catch (err: any) {
    console.error('[delivery-fast]', err);
    return json({ success: false, error: String(err && err.message || '').startsWith('db ') ? 'Server error. Please try again.' : (err.message || 'Server error. Please try again.') });
  }
});
