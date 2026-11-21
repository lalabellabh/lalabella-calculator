// LALABELLA — Café monthly inventory (Nov 21 2026, Bench).
// cafe_items: the list (name, category, unit, picture) · cafe_counts: what is in stock at the end of each month, with expiry.
// Actions: list (month) · saveCounts (anyone logged in) · addItem / editItem / deleteItem / setPhoto (Admin).
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
async function sbGet(path: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`db ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}
async function sbGetAll(path: string) {
  const out: any[] = []; let from = 0;
  for (;;) {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { ...H, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`db ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const rows = await r.json(); out.push(...rows);
    if (rows.length < 1000) return out; from += 1000;
  }
}
async function sbPost(table: string, rows: unknown[]) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(rows) });
  const t = await r.text(); if (!r.ok) throw new Error(`db ${r.status}: ${t.slice(0, 300)}`); return t ? JSON.parse(t) : [];
}
async function sbPatch(table: string, filter: string, fields: unknown) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(fields) });
  if (!r.ok) throw new Error(`db ${r.status}: ${(await r.text()).slice(0, 300)}`);
}
async function sbDelete(table: string, filter: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, { method: 'DELETE', headers: H });
  if (!r.ok) throw new Error(`db ${r.status}: ${(await r.text()).slice(0, 300)}`);
}
async function sbRpc(fn: string, args: unknown) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`rpc ${r.status}: ${(await r.text()).slice(0, 300)}`); return r.json();
}
const SAUDI_ROLE = 'Saudi Team';
async function me(token: string) {
  const t = String(token || '').trim(); if (!/^[a-f0-9]{20,}$/i.test(t)) return null;
  const rows = await sbGet(`users?select=id,username,full_name,role,status,token,token_created,vtoken,vtoken_created&limit=1&or=(token.eq.${t},vtoken.eq.${t})`);
  const u = rows && rows[0]; if (!u || String(u.status || 'Active') !== 'Active') return null;
  const viaV = u.vtoken === t && u.token !== t;
  if (viaV && String(u.role) !== SAUDI_ROLE) return null;          // visitors: Messenger only
  const stamp = viaV ? u.vtoken_created : u.token_created;
  const c = stamp ? new Date(stamp).getTime() : 0;
  return c && Date.now() - c <= SESSION_MAX_AGE_MS ? u : null;
}
const isAdmin = (u: any) => String(u.role || '').toLowerCase() === 'admin';
const txt = (v: unknown, n: number) => String(v ?? '').replace(/\r/g, '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, n);   // keeps line breaks
const who = (u: any) => txt(u && (u.full_name || u.username), 60);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = (v: unknown) => { const n = Number(String(v ?? '').trim()); return String(v ?? '').trim() !== '' && Number.isFinite(n) && n >= 0 && n < 1e6 ? Math.round(n * 1000) / 1000 : null; };
const BR = (v: unknown) => txt(v, 40) || null;

// ---- photos (private bucket) ----
const BUCKET = 'cafe-photos';
const PUB = `${SB_URL}/storage/v1/object/public/${BUCKET}/`;
async function savePhoto(b64: string): Promise<string> {
  if (!b64) return '';
  const i = b64.indexOf(','), meta = i !== -1 ? b64.slice(0, i) : '', clean = i !== -1 ? b64.slice(i + 1) : b64;
  const m = meta.match(/data:([^;]+);/), ct = m ? m[1] : 'image/jpeg';
  if (!/^image\/(jpeg|png|webp)$/.test(ct)) return '';
  let bytes: Uint8Array; try { bytes = Uint8Array.from(atob(clean), c => c.charCodeAt(0)); } catch { return ''; }
  if (!bytes.length || bytes.length > 2_800_000) return '';
  const path = `cafe-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ct.split('/')[1]}`;
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': ct, 'x-upsert': 'true' }, body: bytes });
  if (!r.ok) { console.error('photo upload', r.status, (await r.text()).slice(0, 200)); return ''; }
  return PUB + path;
}
async function sign(urls: string[]): Promise<Record<string, string>> {
  const paths = [...new Set(urls.filter(u => u && u.startsWith(PUB)).map(u => u.slice(PUB.length)))]; const out: Record<string, string> = {};
  if (!paths.length) return out;
  try {
    const r = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}`, { method: 'POST', headers: H, body: JSON.stringify({ expiresIn: 3600, paths }) });
    if (r.ok) (await r.json() || []).forEach((x: any) => { if (x && x.path && x.signedURL && !x.error) out[PUB + x.path] = `${SB_URL}/storage/v1${x.signedURL}`; });
  } catch (e) { console.error('sign', e); }
  return out;
}

const monthOf = (v: unknown) => { const m = String(v || '').match(/^(\d{4})-(\d{2})/); return m ? `${m[1]}-${m[2]}-01` : ''; };
function prevMonth(m: string) { const d = new Date(m + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); }

async function list(p: any, u: any) {
  const month = monthOf(p.month) || monthOf(new Date(Date.now() + 3 * 3600000).toISOString());
  const prev = prevMonth(month);
  const [items, cur, old, months] = await Promise.all([
    sbGetAll('cafe_items?select=*&active=eq.true&order=sort_order.asc,id.asc'),
    sbGetAll(`cafe_counts?select=*&month=eq.${month}`),
    sbGetAll(`cafe_counts?select=item_id,qty,expiry&month=eq.${prev}`),
    sbGetAll('cafe_counts?select=month&order=month.desc'),
  ]);
  const signed = await sign(items.map((i: any) => i.photo_url || ''));
  const c: Record<string, any> = {}; cur.forEach((r: any) => { c[r.item_id] = r; });
  const o: Record<string, any> = {}; old.forEach((r: any) => { o[r.item_id] = r; });
  return { success: true, admin: isAdmin(u), me: who(u), month, prev,
    months: [...new Set(months.map((m: any) => String(m.month).slice(0, 7)))],
    items: items.map((i: any) => ({ id: i.id, name: i.name, category: i.category || '', unit: i.unit || 'pcs', sort: i.sort_order, code: i.item_code || '',
      photo: i.photo_url ? (signed[i.photo_url] || '') : '',
      qty: c[i.id] ? (c[i.id].qty == null ? null : Number(c[i.id].qty)) : null, expiry: c[i.id] ? c[i.id].expiry || '' : '', note: c[i.id] ? c[i.id].note || '' : '',
      by: c[i.id] ? c[i.id].counted_by || '' : '', at: c[i.id] ? c[i.id].updated_at : null,
      prevQty: o[i.id] && o[i.id].qty != null ? Number(o[i.id].qty) : null, prevExpiry: o[i.id] ? o[i.id].expiry || '' : '' })) };
}
async function saveCounts(p: any, u: any) {
  const month = monthOf(p.month); if (!month) return { success: false, error: 'Pick the month.' };
  let rows: any[] = []; try { rows = JSON.parse(p.rows || '[]'); } catch { rows = []; }
  const ids = new Set((await sbGetAll('cafe_items?select=id')).map((i: any) => i.id));
  const out = rows.filter((r: any) => ids.has(Number(r.id))).map((r: any) => {
    const e = String(r.expiry || ''); return { month, item_id: Number(r.id), qty: num(r.qty), expiry: isDate(e) ? e : null, note: txt(r.note, 200) || null, counted_by: who(u), updated_at: new Date().toISOString() };
  });
  if (!out.length) return { success: false, error: 'Nothing to save.' };
  const r = await fetch(`${SB_URL}/rest/v1/cafe_counts?on_conflict=month,item_id`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(out) });
  if (!r.ok) throw new Error(`db ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return { success: true, saved: out.length };
}
const UNITS = ['pcs', 'kg', 'g', 'liters', 'ml', 'boxes', 'packs', 'bottles', 'sets'];
async function addItem(p: any, u: any) {
  const name = txt(p.name, 120); if (!name) return { success: false, error: 'Type the item name.' };
  const unit = UNITS.indexOf(String(p.unit)) !== -1 ? String(p.unit) : 'pcs';
  const last = (await sbGet('cafe_items?select=sort_order&order=sort_order.desc&limit=1'))[0];
  let photo = ''; if (p.photo) { photo = await savePhoto(String(p.photo)); if (!photo) return { success: false, error: 'The picture could not be saved (too big or not a picture).' }; }
  const r = await sbPost('cafe_items', [{ name, category: txt(p.category, 60) || null, unit, photo_url: photo || null, sort_order: (last ? Number(last.sort_order) : 0) + 1, created_by: who(u) }]);
  return { success: true, id: r[0] && r[0].id };
}
async function editItem(p: any, u: any) {
  const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid item.' };
  const f: any = { updated_by: who(u), updated_at: new Date().toISOString() };
  if (p.name !== undefined) { const n = txt(p.name, 120); if (!n) return { success: false, error: 'Type the item name.' }; f.name = n; }
  if (p.category !== undefined) f.category = txt(p.category, 60) || null;
  if (p.code !== undefined) f.item_code = txt(p.code, 40) || null;
  if (p.unit !== undefined && UNITS.indexOf(String(p.unit)) !== -1) f.unit = String(p.unit);
  if (p.sort !== undefined && num(p.sort) != null) f.sort_order = Math.round(num(p.sort)!);
  await sbPatch('cafe_items', `id=eq.${id}`, f);
  return { success: true };
}
async function setPhoto(p: any, u: any) {
  const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid item.' };
  if (!p.photo) { await sbPatch('cafe_items', `id=eq.${id}`, { photo_url: null, updated_by: who(u), updated_at: new Date().toISOString() }); return { success: true }; }
  const url = await savePhoto(String(p.photo)); if (!url) return { success: false, error: 'The picture could not be saved (too big or not a picture).' };
  await sbPatch('cafe_items', `id=eq.${id}`, { photo_url: url, updated_by: who(u), updated_at: new Date().toISOString() });
  return { success: true };
}
async function deleteItem(p: any, u: any) {
  const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid item.' };
  await sbPatch('cafe_items', `id=eq.${id}`, { active: false, updated_by: who(u), updated_at: new Date().toISOString() });   // hidden, counts kept
  return { success: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = new URL(req.url); const p: any = Object.fromEntries(url.searchParams);
    if (req.method === 'POST') { const ct = req.headers.get('content-type') || ''; const t = await req.text();
      Object.assign(p, ct.includes('json') ? JSON.parse(t || '{}') : Object.fromEntries(new URLSearchParams(t))); }
    const u = await me(p.token); if (!u) return json({ success: false, error: 'Please log in again.' }, 401);
    if (String(u.role) === SAUDI_ROLE) return json({ success: false, error: 'Not for this account.' }, 403);
    const a = String(p.action || '');
    if (a === 'list') return json(await list(p, u));
    if (a === 'saveCounts') return json(await saveCounts(p, u));
    if (!isAdmin(u)) return json({ success: false, error: 'Only an admin can change the item list.' });
    if (a === 'addItem') return json(await addItem(p, u));
    if (a === 'editItem') return json(await editItem(p, u));
    if (a === 'setPhoto') return json(await setPhoto(p, u));
    if (a === 'deleteItem') return json(await deleteItem(p, u));
    return json({ success: false, error: 'Unknown action.' });
  } catch (e) { console.error(e); return json({ success: false, error: 'Something went wrong. Please try again.' }, 500); }
});
