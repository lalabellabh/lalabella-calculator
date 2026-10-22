// LALABELLA ITEM INVENTORY — FAST PATH (Supabase Edge Function)
// Full migration off Google Apps Script. Ported action-for-action from
// Item Inventory Code.gs, reading/writing the SAME Supabase tables.
// WRITE actions use the same duplicate-save guard as Chocolate/Flower
// (write_action_dedup table, atomic UNIQUE-key claim).
//
// PHOTOS: New photo uploads go to Supabase Storage (bucket "item-photos").
// Older items whose photo_link is still a bare Google Drive file ID keep
// working: resolvePhotoUrl() turns that into a public Drive thumbnail URL.
//
// Auth: same session token, checked directly against `users`.
// updateItemInventory (Edit Item) is Admin-only (role checked server-side).

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PHOTO_BUCKET = 'item-photos';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function sbGet(table: string, query: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!res.ok) throw new Error(`db ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
async function sbPost(table: string, rows: unknown[]) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}
async function sbPatch(table: string, filter: string, fields: Record<string, unknown>) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(fields),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}
async function sbRpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// Returns the session user row (status/role) when the token is valid, else null.
async function sessionUser(token: string) {
  const t = String(token || '').trim();
  if (!t) return null;
  const rows = await sbGet('users', `select=status,role,token_created&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0];
  if (!u) return null;
  if (String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}

// ---------------------------------------------------------------
// DUPLICATE-SAVE GUARD (same write_action_dedup table as Chocolate/Flower)
// ---------------------------------------------------------------
const DUP_WRITE_ACTIONS = new Set(['addNewItem', 'receiveItem', 'releaseItem', 'transferItem', 'saveNovaCount', 'editReceivingEntry', 'editReleaseEntry']);
async function dedupKeyFor(action: string, p: Record<string, any>) {
  const parts = Object.keys(p).filter(k => !['token', '_ts', 'apikey', 'callback', 'action', 'photoBase64'].includes(k)).sort().map(k => `${k}=${p[k]}`).join('&');
  // photoBase64 is excluded from the key (it can differ slightly between
  // identical retries due to re-encoding) but its PRESENCE still matters.
  const hasPhoto = p.photoBase64 ? '1' : '0';
  const bytes = new TextEncoder().encode('item:' + action + '|photo=' + hasPhoto + '|' + parts);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function tryClaimDedup(key: string, action: string): Promise<boolean> {
  const res = await fetch(`${SB_URL}/rest/v1/write_action_dedup?on_conflict=dedup_key`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify([{ dedup_key: key, action, response: null }]),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`dedup insert ${res.status}: ${text.slice(0, 300)}`);
  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) && rows.length > 0;
}
async function startDedup(key: string, action: string): Promise<{ shouldRun: true } | { shouldRun: false; response: any }> {
  const claimed = await tryClaimDedup(key, action);
  if (claimed) return { shouldRun: true };
  for (let i = 0; i < 20; i++) {
    const rows = await sbGet('write_action_dedup', `select=response&dedup_key=eq.${key}`);
    const row = rows && rows[0];
    if (row && row.response !== null) return { shouldRun: false, response: row.response };
    if (!row) return { shouldRun: true };
    await new Promise(r => setTimeout(r, 400));
  }
  return { shouldRun: false, response: { error: 'This save is still being processed. Please wait a moment and check History before trying again.' } };
}
async function finishDedup(key: string, response: any, ok: boolean) {
  if (ok) await sbPatch('write_action_dedup', `dedup_key=eq.${key}`, { response }).catch(() => {});
  else await fetch(`${SB_URL}/rest/v1/write_action_dedup?dedup_key=eq.${key}`, { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }).catch(() => {});
}

// ---------------------------------------------------------------
// PHOTOS
// ---------------------------------------------------------------
// A stored photo_link is one of: empty, a full URL (new Supabase Storage
// upload), or a bare Google Drive file ID (older item, never re-uploaded).
function resolvePhotoUrl(link: string) {
  if (!link) return '';
  const s = String(link).trim();
  if (/^https?:\/\//i.test(s)) return s;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(s)}&sz=w400`;
}

async function saveItemPhoto(base64Data: string, itemCode: string): Promise<string> {
  if (!base64Data) return '';
  const commaIdx = base64Data.indexOf(',');
  const meta = commaIdx !== -1 ? base64Data.slice(0, commaIdx) : '';
  const cleanBase64 = commaIdx !== -1 ? base64Data.slice(commaIdx + 1) : base64Data;
  const contentTypeMatch = meta.match(/data:([^;]+);/);
  const contentType = contentTypeMatch ? contentTypeMatch[1] : 'image/jpeg';
  const ext = contentType.split('/')[1] || 'jpg';
  const bytes = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0));
  const path = `${(itemCode || 'item').replace(/[^A-Za-z0-9_-]/g, '_')}-${Date.now()}.${ext}`;
  const res = await fetch(`${SB_URL}/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: bytes,
  });
  if (!res.ok) { console.error('photo upload failed', res.status, (await res.text()).slice(0, 300)); return ''; }
  return `${SB_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

async function genItemCode(itemName: string) {
  const prefix = String(itemName || 'ITM').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'ITM';
  const num = await sbRpc('get_next_item_counter', { counter_key: 'Next ItemInventory Code', start_at: 1 });
  return prefix + '-' + String(num).padStart(5, '0');
}

// ---------------------------------------------------------------
// ROW MAPPERS
// ---------------------------------------------------------------
function mapInventoryRow(r: any) {
  return { 'Item Code': r.item_code, 'Item Name': r.item_name, 'Item Type': r.item_type, 'Category': r.category, 'Branch': r.branch,
    'Qty': r.qty, 'Unit': r.unit, 'Price (BHD)': r.price_bhd, 'Min Stock': r.min_stock,
    'Photo Link (Drive)': resolvePhotoUrl(r.photo_link), 'Date Added': r.date_added, 'Notes': r.notes, 'Entered By': r.entered_by };
}

// ---------------------------------------------------------------
// READS
// ---------------------------------------------------------------
async function getItemStaff() {
  const names = new Set<string>();
  (await sbGet('item_inventory', 'select=entered_by')).forEach((r: any) => { if (r.entered_by) names.add(r.entered_by); });
  (await sbGet('item_release_history', 'select=released_by')).forEach((r: any) => { if (r.released_by) names.add(r.released_by); });
  return [...names].sort();
}
async function getItemInventory(branchFilter: string) {
  let q = 'select=*&order=id.asc';
  if (branchFilter && branchFilter !== 'All') q += `&branch=eq.${encodeURIComponent(branchFilter)}`;
  return (await sbGet('item_inventory', q)).map(mapInventoryRow);
}
async function getItemDashboard(branchFilterRaw: string) {
  const branchFilter = branchFilterRaw || 'All';
  let rows = await sbGet('item_inventory', 'select=*');
  if (branchFilter !== 'All') rows = rows.filter((r: any) => String(r.branch || '').trim().toLowerCase() === branchFilter.trim().toLowerCase());

  const byName: Record<string, any> = {};
  const lowStockList: any[] = [];
  rows.forEach((r: any) => {
    const name = String(r.item_name || '').trim(); if (!name) return;
    const qty = Number(r.qty) || 0, price = Number(r.price_bhd) || 0;
    const hasMinStock = r.min_stock !== null && r.min_stock !== undefined && r.min_stock !== '';
    if (!byName[name]) byName[name] = { name, code: r.item_code, type: String(r.item_type || 'Consumable').trim(), qty: 0, unit: r.unit, price, photo: resolvePhotoUrl(r.photo_link) };
    byName[name].qty += qty;
    if (hasMinStock && qty < Number(r.min_stock)) lowStockList.push({ name, code: r.item_code, qty, unit: r.unit, minStock: Number(r.min_stock), branch: r.branch });
  });
  const allItemsList = Object.values(byName).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  let totalItems = 0, consumableCount = 0, fixedAssetCount = 0, totalInventoryValue = 0;
  allItemsList.forEach((it: any) => { totalItems++; if (it.type === 'Fixed Asset') fixedAssetCount++; else consumableCount++; totalInventoryValue += it.qty * it.price; });
  lowStockList.sort((a, b) => (a.qty - a.minStock) - (b.qty - b.minStock));

  const histRows = (await sbGet('item_release_history', 'select=*&order=id.desc&limit=15'))
    .filter((r: any) => branchFilter === 'All' || String(r.branch || '').trim().toLowerCase() === branchFilter.trim().toLowerCase());
  const recentReleases = histRows.map((r: any) => ({ Date: r.released_at, 'Item Code': r.item_code, 'Item Name': r.item_name, Branch: r.branch, 'Qty Released': r.qty_released, 'Reason/Event': r.reason_event, 'Released By': r.released_by, 'Photo Link': resolvePhotoUrl(r.photo_link) }));

  return { branch: branchFilter, totalItems, consumableCount, fixedAssetCount, totalInventoryValue, lowStockList, allItemsList, recentReleases };
}
async function getItemHistory(branchFilter: string) {
  const entries: any[] = [];
  const matches = (b: string) => !branchFilter || branchFilter === 'All' || String(b || '').trim().toLowerCase() === branchFilter.trim().toLowerCase();
  (await sbGet('item_receiving_history', 'select=*')).forEach((r: any) => { if (!matches(r.branch)) return; entries.push({ _type: 'receive', _row: r.id, Date: r.received_at, 'Item Code': r.item_code, 'Item Name': r.item_name, Branch: r.branch, 'Qty Received': r.qty_received, 'Received By': r.received_by, 'Photo Link': resolvePhotoUrl(r.photo_link) }); });
  (await sbGet('item_release_history', 'select=*')).forEach((r: any) => { if (!matches(r.branch)) return; entries.push({ _type: 'release', _row: r.id, Date: r.released_at, 'Item Code': r.item_code, 'Item Name': r.item_name, Branch: r.branch, 'Qty Released': r.qty_released, 'Reason/Event': r.reason_event, 'Released By': r.released_by, 'Photo Link': resolvePhotoUrl(r.photo_link) }); });
  (await sbGet('item_transfer_history', 'select=*')).forEach((r: any) => {
    if (branchFilter && branchFilter !== 'All') { const mf = String(r.from_branch || '').trim().toLowerCase() === branchFilter.trim().toLowerCase(); const mt = String(r.to_branch || '').trim().toLowerCase() === branchFilter.trim().toLowerCase(); if (!mf && !mt) return; }
    entries.push({ _type: 'transfer', _row: r.id, Date: r.transferred_at, 'Item Code': r.item_code, 'Item Name': r.item_name, 'From Branch': r.from_branch, 'To Branch': r.to_branch, Qty: r.qty, 'Transferred By': r.transferred_by });
  });
  entries.sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime());
  return entries.slice(0, 100);
}

// ---------------------------------------------------------------
// WRITES
// ---------------------------------------------------------------
async function editReceivingEntry(p: Record<string, any>) {
  const rowId = Number(p.row), newQty = Number(p.qty) || 0;
  const recvRows = await sbGet('item_receiving_history', `select=*&id=eq.${rowId}`);
  if (!recvRows.length) return { error: 'Entry not found' };
  const recv = recvRows[0];
  const oldQty = Number(recv.qty_received) || 0, diff = newQty - oldQty;
  const invRows = await sbGet('item_inventory', `select=id,qty&item_code=eq.${encodeURIComponent(recv.item_code)}&branch=eq.${encodeURIComponent(recv.branch)}`);
  if (!invRows.length) return { error: 'Item not found in catalog for that branch.' };
  const newStockTotal = (Number(invRows[0].qty) || 0) + diff;
  await sbPatch('item_inventory', `id=eq.${invRows[0].id}`, { qty: newStockTotal });
  const updateFields: Record<string, any> = { qty_received: newQty };
  if (p.date) updateFields.received_at = p.date;
  if (p.receivedBy !== undefined) updateFields.received_by = p.receivedBy;
  await sbPatch('item_receiving_history', `id=eq.${rowId}`, updateFields);
  return { success: true, newStockTotal };
}
async function editReleaseEntry(p: Record<string, any>) {
  const rowId = Number(p.row), newQty = Number(p.qty) || 0;
  const relRows = await sbGet('item_release_history', `select=*&id=eq.${rowId}`);
  if (!relRows.length) return { error: 'Entry not found' };
  const rel = relRows[0];
  const oldQty = Number(rel.qty_released) || 0, diff = newQty - oldQty;
  const invRows = await sbGet('item_inventory', `select=id,qty&item_code=eq.${encodeURIComponent(rel.item_code)}&branch=eq.${encodeURIComponent(rel.branch)}`);
  if (!invRows.length) return { error: 'Item not found in catalog for that branch.' };
  const newStockTotal = (Number(invRows[0].qty) || 0) - diff;
  if (newStockTotal < 0) return { error: 'Not allowed — the stock would become negative.' };
  await sbPatch('item_inventory', `id=eq.${invRows[0].id}`, { qty: newStockTotal });
  const updateFields: Record<string, any> = { qty_released: newQty };
  if (p.date) updateFields.released_at = p.date;
  if (p.reason !== undefined) updateFields.reason_event = p.reason;
  if (p.releasedBy !== undefined) updateFields.released_by = p.releasedBy;
  await sbPatch('item_release_history', `id=eq.${rowId}`, updateFields);
  return { success: true, newStockTotal };
}
async function updateItemRates(p: Record<string, any>) {
  let updates: any[] = [];
  try { updates = JSON.parse(p.updates || '[]'); } catch { updates = []; }
  let updatedCount = 0;
  for (const u of updates) { const result = await sbPatch('item_inventory', `item_code=eq.${encodeURIComponent(u.itemCode)}`, { price_bhd: Number(u.newRate) || 0 }); updatedCount += result.length; }
  return { success: true, updated: updatedCount };
}
async function checkFixBarcodes() {
  const rows = await sbGet('item_inventory', 'select=id,item_name,item_code&order=id.asc');
  const codeToName: Record<string, string> = {};
  const fixedMissing: any[] = [], fixedDuplicates: any[] = [];
  for (const r of rows) {
    const name = String(r.item_name || '').trim(); if (!name) continue;
    const code = String(r.item_code || '').trim();
    if (!code) { const newCode = await genItemCode(name); await sbPatch('item_inventory', `id=eq.${r.id}`, { item_code: newCode }); fixedMissing.push({ name, newCode }); codeToName[newCode] = name; continue; }
    if (codeToName.hasOwnProperty(code) && codeToName[code] !== name) { const newCode = await genItemCode(name); await sbPatch('item_inventory', `id=eq.${r.id}`, { item_code: newCode }); fixedDuplicates.push({ name, oldCode: code, newCode }); codeToName[newCode] = name; }
    else codeToName[code] = name;
  }
  return { success: true, missingFixed: fixedMissing.length, duplicatesFixed: fixedDuplicates.length, details: fixedMissing.concat(fixedDuplicates) };
}

// Edit Item (Admin only). Applies to EVERY branch row of the item (matched by name).
// Optional: newName (rename), notes, removePhoto=1, photoBase64 (new photo).
async function updateItemInventory(p: Record<string, any>) {
  const itemName = (p.itemName || '').trim();
  if (!itemName) return { error: 'Item name is required.' };
  const matchingRows = await sbGet('item_inventory', `select=*&item_name=eq.${encodeURIComponent(itemName)}`);
  if (!matchingRows.length) return { error: 'Item not found: ' + itemName };
  const oldCode = String(matchingRows[0].item_code || '');
  const fields: Record<string, any> = {};

  const newName = (p.newName || '').trim();
  if (newName && newName !== itemName) {
    const clash = await sbGet('item_inventory', `select=item_code&item_name=eq.${encodeURIComponent(newName)}&limit=1`);
    if (clash.length) return { error: `Another item is already named "${newName}" (${clash[0].item_code}).` };
    fields.item_name = newName;
  }
  const newCode = (p.itemCode || '').trim();
  if (newCode && newCode !== oldCode) {
    const clash = await sbGet('item_inventory', `select=item_name&item_code=eq.${encodeURIComponent(newCode)}&item_name=neq.${encodeURIComponent(itemName)}&limit=1`);
    if (clash.length) return { error: `Code ${newCode} is already used by "${clash[0].item_name}".` };
    fields.item_code = newCode;
  }
  if (p.itemType) fields.item_type = p.itemType;
  if (p.category !== undefined) fields.category = p.category;
  if (p.unit) fields.unit = p.unit;
  if (p.price !== undefined && p.price !== '') fields.price_bhd = Number(p.price) || 0;
  if (p.minStock !== undefined) fields.min_stock = p.minStock === '' ? null : Number(p.minStock);
  if (p.notes !== undefined) fields.notes = String(p.notes);

  if (p.photoBase64) {
    const photoLink = await saveItemPhoto(p.photoBase64, fields.item_code || oldCode);
    if (!photoLink) return { error: 'Photo upload failed. Nothing was changed — please try again.' };
    fields.photo_link = photoLink;
  } else if (String(p.removePhoto || '') === '1') {
    fields.photo_link = '';
  }

  if (!Object.keys(fields).length) return { success: true, rowsUpdated: 0, unchanged: true };
  await sbPatch('item_inventory', `item_name=eq.${encodeURIComponent(itemName)}`, fields);

  // Keep the history tables pointing at the renamed / re-coded item (best effort).
  const tables = ['item_receiving_history', 'item_release_history', 'item_transfer_history', 'item_count_history'];
  for (const t of tables) {
    try {
      const hist: Record<string, any> = {};
      if (fields.item_name) hist.item_name = fields.item_name;
      if (fields.item_code) hist.item_code = fields.item_code;
      if (Object.keys(hist).length) await sbPatch(t, `item_name=eq.${encodeURIComponent(itemName)}`, hist);
    } catch (e) { console.error('history sync failed', t, String(e).slice(0, 200)); }
  }
  return { success: true, rowsUpdated: matchingRows.length, photoLink: fields.photo_link ? resolvePhotoUrl(fields.photo_link) : undefined, itemName: fields.item_name || itemName, itemCode: fields.item_code || oldCode };
}
async function addNewItem(p: Record<string, any>) {
  const itemName = (p.itemName || '').trim(), branch = (p.branch || '').trim();
  if (!itemName) return { error: 'Item name is required' };
  if (!branch) return { error: 'Branch is required' };
  const existing = await sbGet('item_inventory', `select=item_code&item_name=eq.${encodeURIComponent(itemName)}`);
  if (existing.length) return { error: `This item already exists (${existing[0].item_code}). Use Receiving to add stock for this branch instead.` };
  let itemCode = (p.itemCode || '').trim();
  if (!itemCode) itemCode = await genItemCode(itemName);
  let photoLink = '';
  if (p.photoBase64) photoLink = await saveItemPhoto(p.photoBase64, itemCode);
  await sbPost('item_inventory', [{ item_code: itemCode, item_name: itemName, item_type: p.itemType || 'Consumable', category: p.category || '', branch,
    qty: Number(p.qty) || 0, unit: p.unit || 'Piece', price_bhd: Number(p.price) || 0,
    min_stock: (p.minStock !== undefined && p.minStock !== '') ? Number(p.minStock) : null,
    photo_link: photoLink, date_added: new Date().toISOString(), notes: p.notes || '', entered_by: p.enteredBy || '' }]);
  return { success: true, itemCode, photoLink };
}
async function receiveItem(p: Record<string, any>) {
  const itemName = (p.itemName || '').trim(), branch = (p.branch || '').trim(), qtyReceived = Number(p.qty) || 0;
  if (!itemName || qtyReceived <= 0) return { error: 'Item name and a Qty greater than 0 are required.' };
  if (!branch) return { error: 'Branch is required.' };
  const branchRows = await sbGet('item_inventory', `select=*&item_name=eq.${encodeURIComponent(itemName)}&branch=eq.${encodeURIComponent(branch)}`);
  let currentQty: number, newQty: number, receivingItemCode: string;
  if (!branchRows.length) {
    const anyRows = await sbGet('item_inventory', `select=*&item_name=eq.${encodeURIComponent(itemName)}`);
    if (!anyRows.length) return { error: 'Item not found. Use "Add New Item" first if this is a brand-new item.' };
    const source = anyRows[0];
    currentQty = 0; newQty = qtyReceived; receivingItemCode = source.item_code;
    await sbPost('item_inventory', [{ item_code: source.item_code, item_name: itemName, item_type: source.item_type, category: source.category, branch,
      qty: qtyReceived, unit: source.unit, price_bhd: source.price_bhd, min_stock: source.min_stock, photo_link: source.photo_link,
      date_added: new Date().toISOString(), notes: source.notes, entered_by: source.entered_by }]);
  } else {
    currentQty = Number(branchRows[0].qty) || 0; newQty = currentQty + qtyReceived; receivingItemCode = branchRows[0].item_code;
    await sbPatch('item_inventory', `id=eq.${branchRows[0].id}`, { qty: newQty });
  }
  const receivingPhotoLink = p.photoBase64 ? await saveItemPhoto(p.photoBase64, receivingItemCode + '-recv-' + Date.now()) : '';
  await sbPost('item_receiving_history', [{ received_at: p.date || new Date().toISOString(), item_code: receivingItemCode, item_name: itemName, branch, qty_received: qtyReceived, received_by: p.receivedBy || '', photo_link: receivingPhotoLink }]);
  return { success: true, itemName, branch, previousQty: currentQty, received: qtyReceived, newQty };
}
async function releaseItem(p: Record<string, any>) {
  const itemName = (p.itemName || '').trim(), branch = (p.branch || '').trim(), qtyReleased = Number(p.qty) || 0;
  if (!itemName || qtyReleased <= 0) return { error: 'Item name and a Qty greater than 0 are required.' };
  if (!branch) return { error: 'Branch is required.' };
  const rows = await sbGet('item_inventory', `select=*&item_name=eq.${encodeURIComponent(itemName)}&branch=eq.${encodeURIComponent(branch)}`);
  if (!rows.length) return { error: `This item has no stock recorded at ${branch}.` };
  const currentQty = Number(rows[0].qty) || 0;
  if (qtyReleased > currentQty) return { error: `Not enough stock at ${branch}. Available: ${currentQty}, tried to release: ${qtyReleased}` };
  const newQty = currentQty - qtyReleased;
  await sbPatch('item_inventory', `id=eq.${rows[0].id}`, { qty: newQty });
  const releasePhotoLink = p.photoBase64 ? await saveItemPhoto(p.photoBase64, rows[0].item_code + '-rel-' + Date.now()) : '';
  await sbPost('item_release_history', [{ released_at: p.date || new Date().toISOString(), item_code: rows[0].item_code, item_name: itemName, branch, qty_released: qtyReleased, reason_event: p.reason || '', released_by: p.releasedBy || '', photo_link: releasePhotoLink }]);
  return { success: true, itemName, branch, previousQty: currentQty, released: qtyReleased, newQty };
}
async function saveNovaCount(p: Record<string, any>) {
  const branch = (p.branch || '').trim(), countedBy = p.countedBy || '';
  let counts: any[] = [];
  try { counts = JSON.parse(p.counts || '[]'); } catch { counts = []; }
  if (!branch || !counts.length) return { error: 'Branch and at least one counted item are required.' };
  const results: any[] = [];
  for (const c of counts) {
    const rows = await sbGet('item_inventory', `select=*&item_name=eq.${encodeURIComponent(c.name)}&branch=eq.${encodeURIComponent(branch)}`);
    if (!rows.length) { results.push({ name: c.name, error: 'not found for this branch' }); continue; }
    const previousQty = Number(rows[0].qty) || 0, countedQty = Number(c.qty) || 0, variance = countedQty - previousQty;
    await sbPatch('item_inventory', `id=eq.${rows[0].id}`, { qty: countedQty });
    await sbPost('item_count_history', [{ branch, item_code: rows[0].item_code, item_name: c.name, previous_qty: previousQty, counted_qty: countedQty, variance, counted_by: countedBy }]);
    results.push({ name: c.name, previousQty, countedQty, variance });
  }
  return { success: true, results };
}
async function transferItem(p: Record<string, any>) {
  const itemName = (p.itemName || '').trim(), fromBranch = (p.fromBranch || '').trim(), toBranch = (p.toBranch || '').trim(), qty = Number(p.qty) || 0;
  if (!itemName || !fromBranch || !toBranch || qty <= 0) return { error: 'Item, From Branch, To Branch, and a Qty greater than 0 are required.' };
  if (fromBranch.toLowerCase() === toBranch.toLowerCase()) return { error: 'From Branch and To Branch cannot be the same.' };
  const fromRows = await sbGet('item_inventory', `select=*&item_name=eq.${encodeURIComponent(itemName)}&branch=eq.${encodeURIComponent(fromBranch)}`);
  if (!fromRows.length) return { error: `This item has no stock recorded at ${fromBranch}.` };
  const fromQty = Number(fromRows[0].qty) || 0;
  if (qty > fromQty) return { error: `Not enough stock at ${fromBranch}. Available: ${fromQty}, tried to transfer: ${qty}` };
  await sbPatch('item_inventory', `id=eq.${fromRows[0].id}`, { qty: fromQty - qty });
  const toRows = await sbGet('item_inventory', `select=*&item_name=eq.${encodeURIComponent(itemName)}&branch=eq.${encodeURIComponent(toBranch)}`);
  if (!toRows.length) {
    const src = fromRows[0];
    await sbPost('item_inventory', [{ item_code: src.item_code, item_name: itemName, item_type: src.item_type, category: src.category, branch: toBranch, qty, unit: src.unit, price_bhd: src.price_bhd, min_stock: src.min_stock, photo_link: src.photo_link, date_added: new Date().toISOString(), notes: src.notes, entered_by: src.entered_by }]);
  } else {
    const toQty = Number(toRows[0].qty) || 0;
    await sbPatch('item_inventory', `id=eq.${toRows[0].id}`, { qty: toQty + qty });
  }
  await sbPost('item_transfer_history', [{ transferred_at: p.date || new Date().toISOString(), item_code: fromRows[0].item_code, item_name: itemName, from_branch: fromBranch, to_branch: toBranch, qty, transferred_by: p.transferredBy || '' }]);
  return { success: true, itemName, fromBranch, toBranch, qty };
}

// ---------------------------------------------------------------
// PARAM PARSING + ROUTER
// ---------------------------------------------------------------
async function readParams(req: Request): Promise<Record<string, any>> {
  if (req.method === 'GET') { const u = new URL(req.url); return Object.fromEntries(u.searchParams.entries()); }
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await req.json();
  const t = await req.text();
  return Object.fromEntries(new URLSearchParams(t));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const p = await readParams(req);
    const action = p.action || '';
    const me = await sessionUser(p.token);
    if (!me) return json({ error: 'Unauthorized. Please log in again.' }, 401);

    if (action === 'getItemStaff') return json(await getItemStaff());
    if (action === 'getItemInventory') return json(await getItemInventory(p.branch));
    if (action === 'getItemDashboard') return json(await getItemDashboard(p.branch));
    if (action === 'getItemHistory') return json(await getItemHistory(p.branch));
    if (action === 'updateItemRates') return json(await updateItemRates(p));
    if (action === 'checkFixBarcodes') return json(await checkFixBarcodes());
    if (action === 'updateItemInventory') {
      if (String(me.role || '') !== 'Admin') return json({ error: 'Only an Admin can edit items.' }, 403);
      return json(await updateItemInventory(p));
    }

    if (DUP_WRITE_ACTIONS.has(action)) {
      const key = await dedupKeyFor(action, p);
      const gate = await startDedup(key, action);
      if (!gate.shouldRun) return json(gate.response);
      let result: any;
      try {
        if (action === 'addNewItem') result = await addNewItem(p);
        else if (action === 'receiveItem') result = await receiveItem(p);
        else if (action === 'releaseItem') result = await releaseItem(p);
        else if (action === 'transferItem') result = await transferItem(p);
        else if (action === 'saveNovaCount') result = await saveNovaCount(p);
        else if (action === 'editReceivingEntry') result = await editReceivingEntry(p);
        else if (action === 'editReleaseEntry') result = await editReleaseEntry(p);
        else result = { error: 'Unknown action' };
      } catch (err) {
        await finishDedup(key, null, false);
        throw err;
      }
      const ok = !!result && !result.error;
      await finishDedup(key, result, ok);
      return json(result);
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: 'Server error. Please try again.' }, 500);
  }
});
