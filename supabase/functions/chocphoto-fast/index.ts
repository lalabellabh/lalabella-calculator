// LALABELLA CHOCOLATE PHOTOS (Supabase Edge Function)  v4
// One small picture per chocolate, shown wherever a chocolate name is picked or listed.
// Pictures live in the public storage bucket `chocolate-photos` as <item id>.jpg; the table chocolate_photos
// remembers which chocolates have one (and when it changed, so phones refresh it).
//
// Actions (POST JSON {action, token, ...}; staff session token like every other function):
//   list                       -> {items:[{id,name,category,code,flavor,photo}]}   any logged-in user; photo '' = none yet
//   upload {itemId, image}     -> Admin only. image = data URL (image/jpeg), max ~400 KB after the page shrinks it
//   remove {itemId}            -> Admin only.
//   setFlavor {itemId, flavor} -> Admin only (v4). Short description of the chocolate (max 200 chars), shown with the picture.
//   deleteItem {name}          -> Admin only (v2). Deletes a chocolate from the catalog (chocolate_item_list) + its picture,
//                                but ONLY if no history uses it (batches, releases, arrangements, counts, adjustments).

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BUCKET = 'chocolate-photos';
const MAX_BYTES = 450 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
  const rows = await rest('GET', `users?select=id,username,role,status,token_created&token=eq.${encodeURIComponent(t)}&limit=1`);
  const u = rows && rows[0];
  if (!u || String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}
const isAdmin = (u: any) => String(u && u.role || '').toLowerCase() === 'admin';

const photoUrl = (id: number, updatedAt: string) => `${SB_URL}/storage/v1/object/public/${BUCKET}/${id}.jpg?v=${Date.parse(updatedAt) || 0}`;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function itemExists(id: number) {
  const r = await rest('GET', `chocolate_item_list?select=id&id=eq.${id}&limit=1`);
  return !!(r && r.length);
}

async function readParams(req: Request): Promise<Record<string, any>> {
  if (req.method === 'GET') return Object.fromEntries(new URL(req.url).searchParams.entries());
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await req.json();
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

const USAGE_TABLES: [string, string][] = [
  ['chocolate_database', 'received/stock batches'],
  ['chocolate_release_database', 'releases'],
  ['chocolate_arrangement_items', 'arrangements'],
  ['chocolate_stock_count_history', 'stock counts'],
  ['chocolate_stock_adjustment_history', 'stock adjustments'],
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const p = await readParams(req);
    const me = await sessionUser(p.token);
    if (!me) return json({ success: false, error: 'Unauthorized. Please log in again.' });
    const action = String(p.action || '');

    if (action === 'list') {
      const [items, photos] = await Promise.all([
        rest('GET', 'chocolate_item_list?select=id,chocolate_name,category,product_code,flavor&order=category.asc,chocolate_name.asc&limit=1000'),
        rest('GET', 'chocolate_photos?select=item_id,updated_at&limit=1000'),
      ]);
      const at = new Map<number, string>((photos || []).map((r: any) => [Number(r.item_id), String(r.updated_at)]));
      return json({
        success: true,
        items: (items || []).map((r: any) => ({
          id: r.id, name: String(r.chocolate_name || ''), category: String(r.category || ''), code: String(r.product_code || ''),
          flavor: String(r.flavor || ''),
          photo: at.has(Number(r.id)) ? photoUrl(Number(r.id), at.get(Number(r.id))!) : '',
        })),
      });
    }

    if (action === 'setFlavor') {
      if (!isAdmin(me)) return json({ success: false, error: 'Only an Admin can change the chocolate description.' });
      const id = Number(p.itemId);
      if (!Number.isInteger(id) || id < 1 || !(await itemExists(id))) return json({ success: false, error: 'Chocolate not found.' });
      const flavor = String(p.flavor == null ? '' : p.flavor).replace(/\s+/g, ' ').trim().slice(0, 200);
      await rest('PATCH', `chocolate_item_list?id=eq.${id}`, { flavor: flavor || null }, 'return=minimal');
      return json({ success: true, flavor });
    }

    if (action === 'deleteItem') {
      if (!isAdmin(me)) return json({ success: false, error: 'Only an Admin can delete a chocolate.' });
      const name = String(p.name || '').trim();
      if (!name) return json({ success: false, error: 'Chocolate name is required.' });
      const found = await rest('GET', `chocolate_item_list?select=id&chocolate_name=eq.${encodeURIComponent(name)}`);
      if (!found || !found.length) return json({ success: false, error: 'Item not found in catalog: ' + name });
      if (found.length > 1) return json({ success: false, error: 'More than one catalog row has this name. Please fix the duplicate first.' });
      const used: string[] = [];
      for (const [tbl, label] of USAGE_TABLES) {
        const r = await rest('GET', `${tbl}?select=chocolate_name&chocolate_name=eq.${encodeURIComponent(name)}&limit=1`);
        if (r && r.length) used.push(label);
      }
      if (used.length) {
        return json({ success: false, inUse: true, error: 'Cannot delete "' + name + '" — it is already used in: ' + used.join(', ') + '. Deleting it would break that history.' });
      }
      const id = Number(found[0].id);
      await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${id}.jpg`, { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
      await rest('DELETE', `chocolate_item_list?id=eq.${id}`, undefined, 'return=minimal');
      return json({ success: true });
    }

    if (action === 'upload' || action === 'remove') {
      if (!isAdmin(me)) return json({ success: false, error: 'Only an Admin can change chocolate pictures.' });
      const id = Number(p.itemId);
      if (!Number.isInteger(id) || id < 1 || !(await itemExists(id))) return json({ success: false, error: 'Chocolate not found.' });

      if (action === 'remove') {
        await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${id}.jpg`, { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
        await rest('DELETE', `chocolate_photos?item_id=eq.${id}`, undefined, 'return=minimal');
        return json({ success: true });
      }

      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(p.image || ''));
      if (!m) return json({ success: false, error: 'The picture must be a JPEG image.' });
      const bytes = b64ToBytes(m[1]);
      if (!bytes.length || bytes.length > MAX_BYTES) return json({ success: false, error: 'The picture is too large. Please try a smaller one.' });
      if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return json({ success: false, error: 'That file is not a valid JPEG picture.' });

      const up = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${id}.jpg`, {
        method: 'POST',
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': 'max-age=3600' },
        body: bytes,
      });
      if (!up.ok) { console.error('storage upload', up.status, (await up.text()).slice(0, 200)); return json({ success: false, error: 'Could not save the picture. Please try again.' }); }
      const now = new Date().toISOString();
      await rest('POST', 'chocolate_photos?on_conflict=item_id', [{ item_id: id, updated_at: now, updated_by: me.username || '' }], 'resolution=merge-duplicates,return=minimal');
      return json({ success: true, photo: photoUrl(id, now) });
    }

    return json({ success: false, error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return json({ success: false, error: 'Server error. Please try again.' }, 500);
  }
});
