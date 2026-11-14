// LALABELLA FLOWER PHOTOS — photo per flower + "add a new flower" (Supabase Edge Function, verify_jwt OFF)
// Admin only (role checked from the session token), except action `names` (read-only name + picture list for any logged-in user).
// Actions: list | names | upload(flowerName,image) | remove(flowerName) | addFlower(flowerName,unit,stemsPerBunch,rate,[minStock],[image])
// One photo per flower NAME: saved on every flower_item row with that name (all origins).
// addFlower creates the working-rate row (origin Legacy/Unknown, rate Approved) so the flower shows up
// everywhere (catalog, receiving, stock, barcode) with its price right away.
// v5 (Nov 2026): list() falls back to an origin price (approved first) when a flower has no Legacy/Unknown price; returns rateFrom = that origin.

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BUCKET = 'flower-photos';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const enc = encodeURIComponent;

async function sb(method: string, path: string, body?: unknown) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}
async function sbAll(path: string) {
  const out: any[] = [];
  for (let off = 0; ; off += 1000) {
    const part = await sb('GET', `${path}&limit=1000&offset=${off}`);
    out.push(...part);
    if (part.length < 1000) break;
  }
  return out;
}
async function nextCounter(): Promise<number> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/get_next_flower_counter`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ counter_key: 'Next Item ID', start_at: 1 }),
  });
  if (!res.ok) throw new Error('counter ' + res.status);
  return Number(await res.json());
}
async function adminUser(token: string) {
  const t = String(token || '').trim();
  if (!/^[a-f0-9]{20,}$/i.test(t)) return null;
  const rows = await sb('GET', `users?select=role,status,token_created&limit=1&token=eq.${enc(t)}`);
  const u = rows && rows[0];
  if (!u || String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}

async function savePhotoFile(base64Data: string, flowerName: string): Promise<string> {
  if (!base64Data) return '';
  const i = base64Data.indexOf(',');
  const meta = i !== -1 ? base64Data.slice(0, i) : '';
  const clean = i !== -1 ? base64Data.slice(i + 1) : base64Data;
  const m = meta.match(/data:([^;]+);/);
  const contentType = m ? m[1] : 'image/jpeg';
  if (!/^image\//.test(contentType)) return '';
  const ext = (contentType.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '');
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(clean), c => c.charCodeAt(0)); } catch { return ''; }
  if (!bytes.length || bytes.length > 3_000_000) return '';
  const path = `${flowerName.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'flower'}-${Date.now()}.${ext}`;
  const res = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: bytes,
  });
  if (!res.ok) { console.error('photo upload failed', res.status, (await res.text()).slice(0, 300)); return ''; }
  return `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function list() {
  const rows = await sbAll('flower_item?select=id,flower_name,item_code,origin,photo_url,rate,rate_status,unit,stems_per_bunch&status=neq.Inactive&order=id.asc');
  const map = new Map<string, any>();
  rows.forEach((r: any) => {
    const name = String(r.flower_name || '').trim(); if (!name) return;
    const key = name.toLowerCase();
    let g = map.get(key);
    if (!g) { g = { name, code: '', codes: [], photo: '', rate: 0, unit: '', stems: 1 }; map.set(key, g); }
    g.codes.push({ code: r.item_code, origin: r.origin });
    if (r.photo_url && !g.photo) g.photo = r.photo_url;
    if (String(r.origin || '').trim() === 'Legacy/Unknown') { g.code = r.item_code; g.rate = Number(r.rate) || 0; g.unit = r.unit || ''; g.stems = Number(r.stems_per_bunch) || 1; }
    // v5: remember an origin price too (approved first), for flowers that have no Legacy/Unknown price
    else if (Number(r.rate) > 0) {
      const ok = String(r.rate_status || '') === 'Approved';
      if (!g.alt || (ok && !g.alt.ok)) g.alt = { ok, rate: Number(r.rate), unit: r.unit || '', stems: Number(r.stems_per_bunch) || 1, origin: String(r.origin || '').trim() };
    }
  });
  const items = [...map.values()].map(g => {
    if (!g.code && g.codes[0]) { g.code = g.codes[0].code; }
    if (!g.rate && g.alt) { g.rate = g.alt.rate; g.rateFrom = g.alt.origin; if (!g.unit) g.unit = g.alt.unit; if (g.stems === 1) g.stems = g.alt.stems; }
    delete g.alt; return g;
  });
  items.sort((a, b) => a.name.localeCompare(b.name));
  return { success: true, items };
}

async function upload(p: Record<string, any>) {
  const name = String(p.flowerName || '').trim();
  if (!name) return { error: 'Flower name is required.' };
  const rows = await sb('GET', `flower_item?select=id&flower_name=eq.${enc(name)}&limit=1`);
  if (!rows.length) return { error: 'Flower not found.' };
  const photo = await savePhotoFile(String(p.image || ''), name);
  if (!photo) return { error: 'Photo upload failed (too big or not an image). Nothing was changed.' };
  await sb('PATCH', `flower_item?flower_name=eq.${enc(name)}`, { photo_url: photo });
  return { success: true, photo };
}
async function remove(p: Record<string, any>) {
  const name = String(p.flowerName || '').trim();
  if (!name) return { error: 'Flower name is required.' };
  await sb('PATCH', `flower_item?flower_name=eq.${enc(name)}`, { photo_url: null });
  return { success: true };
}
async function addFlower(p: Record<string, any>) {
  const name = String(p.flowerName || '').trim().replace(/\s+/g, ' ');
  if (!name) return { error: 'Flower name is required.' };
  if (name.length > 60) return { error: 'Name is too long.' };
  const safe = name.replace(/[%_*,()]/g, '');
  const dup = await sb('GET', `flower_item?select=item_code&flower_name=ilike.${enc(safe)}&limit=1`);
  if (dup.length) return { error: `"${name}" is already on the list (${dup[0].item_code}).` };
  const rate = Number(p.rate);
  if (!(rate >= 0) || isNaN(rate)) return { error: 'Price is not valid.' };
  const unit = ['Stem', 'Bunch', 'Piece'].includes(String(p.unit)) ? String(p.unit) : 'Stem';
  const stems = Math.max(1, Math.floor(Number(p.stemsPerBunch) || 1));
  let photo = '';
  if (p.image) { photo = await savePhotoFile(String(p.image), name); if (!photo) return { error: 'Photo upload failed. Nothing was added.' }; }
  // Nov 2026: same numbering as the original list (FLW000xxx)
  const itemCode = String(await sb('POST', 'rpc/next_flw_code', {}));
  const now = new Date().toISOString();
  await sb('POST', 'flower_item', [{ flower_name: name, origin: 'Legacy/Unknown', item_code: itemCode, unit, stems_per_bunch: stems, rate,
    min_stock: Math.max(0, Number(p.minStock) || 0), status: 'Active', created_date: now, last_updated_date: now,
    rate_status: 'Approved', suggested_rate: rate, supplier_rate_used: rate, photo_url: photo || null }]);
  return { success: true, itemCode, name, photo };
}

async function readParams(req: Request): Promise<Record<string, any>> {
  if (req.method === 'GET') return Object.fromEntries(new URL(req.url).searchParams.entries());
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await req.json();
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const p = await readParams(req);
    const me = await adminUser(p.token);
    if (!me) return json({ error: 'Unauthorized. Please log in again.' }, 401);
    // Any logged-in staff may READ names + pictures (used for the thumbnails in Receiving / Stock Count / Transfer pick lists).
    if (p.action === 'names') { const l = await list(); return json({ success: true, items: l.items.map((g: any) => ({ name: g.name, photo: g.photo })) }); }
    if (String(me.role || '') !== 'Admin') return json({ error: 'Only an Admin can manage flower photos.' }, 403);
    if (p.action === 'list') return json(await list());
    if (p.action === 'upload') return json(await upload(p));
    if (p.action === 'remove') return json(await remove(p));
    if (p.action === 'addFlower') return json(await addFlower(p));
    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[flowerphoto-fast]', err);
    return json({ error: 'Server error. Please try again.' }, 500);
  }
});
