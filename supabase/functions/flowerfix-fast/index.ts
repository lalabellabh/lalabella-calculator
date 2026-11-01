// LALABELLA FLOWER ADMIN — "Fix an existing flower item" (Supabase Edge Function, verify_jwt OFF)
// Admin only (role checked from the session token). Edits ONE item in flower_item, found by item_code.
//
// Actions (POST form/JSON or GET query):
//   updateFlowerItem  itemCode, [newName], [unit], [stemsPerBunch], [rate], [minStock], [status]
//     - rename also updates the same name in the history tables that carry the item code;
//       tables that only carry the NAME are updated only when no other flower item shares the old name
//       (otherwise a `warning` is returned and they are left alone, so nothing is mixed up).
//     - origin is not editable here on purpose (the Legacy/Unknown master logic depends on it).
//   deleteFlowerItem  itemCode
//     - removes ONE item from the catalog, only if nothing has ever been recorded for it
//       (receiving, stock, rate history, transfers, arrangements, Holland tracking).
//     - items of the original Legacy/Unknown list can never be deleted (set them Inactive instead).

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

async function updateFlowerItem(p: Record<string, any>) {
  const itemCode = String(p.itemCode || '').trim();
  if (!itemCode) return { error: 'Item code is required.' };
  const rows = await sb('GET', `flower_item?select=*&item_code=eq.${enc(itemCode)}&limit=1`);
  if (!rows.length) return { error: 'Flower item not found: ' + itemCode };
  const cur = rows[0];
  const fields: Record<string, any> = {};

  const newName = String(p.newName || '').replace(/\s+/g, ' ').trim();
  const oldName = String(cur.flower_name || '');
  let renamed = false;
  if (newName && newName !== oldName) {
    if (newName.length > 60) return { error: 'The name is too long (max 60 characters).' };
    const clash = await sb('GET', `flower_item?select=item_code&flower_name=eq.${enc(newName)}&origin=eq.${enc(cur.origin || '')}&item_code=neq.${enc(itemCode)}&limit=1`);
    if (clash.length) return { error: `"${newName}" (${cur.origin || 'no origin'}) already exists as ${clash[0].item_code}.` };
    fields.flower_name = newName; renamed = true;
  }
  if (p.unit !== undefined && String(p.unit).trim()) fields.unit = String(p.unit).trim();
  if (p.stemsPerBunch !== undefined && p.stemsPerBunch !== '') {
    const n = Number(p.stemsPerBunch);
    if (!(n >= 1)) return { error: 'Stems per bunch must be 1 or more.' };
    fields.stems_per_bunch = n;
  }
  if (p.rate !== undefined && p.rate !== '') {
    const n = Number(p.rate);
    if (!(n >= 0)) return { error: 'Rate cannot be negative.' };
    fields.rate = n;
  }
  if (p.minStock !== undefined && p.minStock !== '') {
    const n = Number(p.minStock);
    if (!(n >= 0)) return { error: 'Min stock cannot be negative.' };
    fields.min_stock = n;
  }
  if (p.status !== undefined && p.status !== '') {
    const st = String(p.status);
    if (st !== 'Active' && st !== 'Inactive') return { error: 'Status must be Active or Inactive.' };
    fields.status = st;
  }
  if (!Object.keys(fields).length) return { success: true, unchanged: true };
  fields.last_updated_date = new Date().toISOString();
  await sb('PATCH', `flower_item?item_code=eq.${enc(itemCode)}`, fields);

  let warning = '';
  if (renamed) {
    // tables that carry the item code: safe to follow the rename exactly
    for (const t of ['flower_database', 'flower_rate_change_history', 'flower_stock_history']) {
      try { await sb('PATCH', `${t}?item_code=eq.${enc(itemCode)}`, { flower_name: newName }); }
      catch (e) { console.error('rename sync failed', t, String(e).slice(0, 200)); warning += ` Could not update ${t}.`; }
    }
    // tables that carry only the name: only when this name is not shared by another flower item
    const shared = await sb('GET', `flower_item?select=item_code&flower_name=eq.${enc(oldName)}&item_code=neq.${enc(itemCode)}&limit=1`);
    if (!shared.length) {
      for (const t of ['flower_transfer_history', 'flower_arrangement_items', 'flower_arrangement_fulfillments', 'flower_holland_tracking']) {
        try { await sb('PATCH', `${t}?flower_name=eq.${enc(oldName)}`, { flower_name: newName }); }
        catch (e) { console.error('rename sync failed', t, String(e).slice(0, 200)); warning += ` Could not update ${t}.`; }
      }
    } else {
      warning += ` "${oldName}" is also used by ${shared[0].item_code}, so transfer / arrangement history keeps the old name.`;
    }
  }
  return { success: true, itemCode, renamed, warning: warning.trim() || undefined };
}

async function deleteFlowerItem(p: Record<string, any>) {
  const itemCode = String(p.itemCode || '').trim();
  if (!itemCode) return { error: 'Item code is required.' };
  const rows = await sb('GET', `flower_item?select=*&item_code=eq.${enc(itemCode)}&limit=1`);
  if (!rows.length) return { error: 'Flower item not found: ' + itemCode };
  const cur = rows[0];
  if (String(cur.origin || '') === 'Legacy/Unknown') return { error: 'This item is part of the original flower list and cannot be deleted. Set it to Inactive instead.' };
  const used: string[] = [];
  for (const t of ['flower_database', 'flower_stock_history', 'flower_rate_change_history']) {
    const r = await sb('GET', `${t}?select=item_code&item_code=eq.${enc(itemCode)}&limit=1`);
    if (r.length) used.push(t);
  }
  const name = String(cur.flower_name || '');
  const shared = await sb('GET', `flower_item?select=item_code&flower_name=eq.${enc(name)}&item_code=neq.${enc(itemCode)}&limit=1`);
  if (!shared.length) {
    for (const t of ['flower_transfer_history', 'flower_arrangement_items', 'flower_arrangement_fulfillments', 'flower_holland_tracking']) {
      const r = await sb('GET', `${t}?select=flower_name&flower_name=eq.${enc(name)}&limit=1`);
      if (r.length) used.push(t);
    }
  }
  if (used.length) return { error: `"${name}" already has records (${used.join(', ')}), so it cannot be deleted. Set it to Inactive instead.` };
  await sb('DELETE', `flower_item?item_code=eq.${enc(itemCode)}`);
  return { success: true, deleted: itemCode, name };
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
    if (String(me.role || '') !== 'Admin') return json({ error: 'Only an Admin can edit flower items.' }, 403);
    if (p.action === 'updateFlowerItem') return json(await updateFlowerItem(p));
    if (p.action === 'deleteFlowerItem') return json(await deleteFlowerItem(p));
    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[flowerfix-fast]', err);
    return json({ error: 'Server error. Please try again.' }, 500);
  }
});
