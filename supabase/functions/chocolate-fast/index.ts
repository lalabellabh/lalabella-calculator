// LALABELLA CHOCOLATE — FAST PATH (Supabase Edge Function)
// Full migration off Google Apps Script. Ported action-for-action from
// Chocolate Code.gs, reading/writing the SAME Supabase tables — no data
// migration, identical response shapes. See repo chocolate-fast.ts for the full version history (v5–v10 + transfers visible to both branches).

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
async function sbUpsert(table: string, rows: unknown[], onConflict: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify(rows),
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

// Returns the logged-in user (role, name) or null.
async function isValidToken(token: string) {
  const t = String(token || '').trim();
  if (!t) return null;
  const rows = await sbGet('users', `select=status,token_created,role,full_name,username&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0];
  if (!u) return null;
  if (String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  return (!!created && Date.now() - created <= SESSION_MAX_AGE_MS) ? u : null;
}
// Security audit 2026-11-10: these actions are Admin only on the server (not only on the page).
const ADMIN_ONLY = new Set(['approveCount', 'rejectCount', 'requestRecount', 'addChocolateItem', 'updateChocolateItem', 'updateChocolateRates', 'backfillItemList', 'checkFixBarcodes', 'getPendingReceiving', 'approveReceiving', 'rejectReceiving']);

const DUP_WRITE_ACTIONS = new Set([
  'saveRelease', 'addEntry', 'editEntry', 'addInitialStock', 'saveCountSession',
  'approveCount', 'rejectCount', 'requestRecount', 'saveDisplay', 'addArrangement',
  'addChocolateItem', 'addSupplier', 'addReceivedBy',
]);

async function dedupKeyFor(action: string, p: Record<string, any>) {
  const parts = Object.keys(p).filter(k => !['token', '_ts', 'apikey', 'callback', 'action'].includes(k)).sort().map(k => `${k}=${p[k]}`).join('&');
  const bytes = new TextEncoder().encode(action + '|' + parts);
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

function branchPrefix(branch: string) {
  const map: Record<string, string> = { ModaMall: 'MM', Hamala: 'HM', Galali: 'GL' };
  return map[branch] || 'XX';
}
function numOrNull(v: any) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function isPieceUnit(unit: any) {
  return ['piece', 'pcs', 'pc'].includes(String(unit || '').trim().toLowerCase());
}
function priceFieldForUnit(unit: any) {
  return isPieceUnit(unit) ? 'price_per_piece' : 'price_per_kg';
}
function priceForRow(row: any) {
  return Number(row[priceFieldForUnit(row.unit)]) || 0;
}
async function addIfNotExists(table: string, name: string) {
  if (!name) return;
  const existing = await sbGet(table, 'select=name');
  const already = existing.some((r: any) => String(r.name).toLowerCase() === String(name).toLowerCase());
  if (!already) await sbPost(table, [{ name }]);
}
// Nov 2026: names are matched WITHOUT caring about capitals, and the catalog's own spelling is returned,
// so "ferrero rocher" never becomes a second item next to "Ferrero Rocher" (that split the flower stock count).
const likeEq = (v: string) => encodeURIComponent(String(v).replace(/[\\%_*]/g, (c) => '\\' + c));
async function catalogName(name: string): Promise<string> {
  const n = String(name || '').replace(/\s+/g, ' ').trim(); if (!n) return n;
  const rows = await sbGet('chocolate_item_list', `select=chocolate_name&chocolate_name=ilike.${likeEq(n)}&order=id.asc&limit=1`);
  return rows && rows[0] ? String(rows[0].chocolate_name) : n;
}
async function ensureItemListEntry(name: string, category: string, brand: string, unit: string, pricePerKg: any, grams: any, packagingType: string | null): Promise<string> {
  name = String(name || '').replace(/\s+/g, ' ').trim();
  if (!name) return name;
  const existing = await sbGet('chocolate_item_list', `select=id,chocolate_name&chocolate_name=ilike.${likeEq(name)}&order=id.asc&limit=1`);
  if (existing.length) return String(existing[0].chocolate_name);
  const prefix = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'CHO';
  const num = await sbRpc('get_next_chocolate_counter', { counter_key: 'Next Chocolate Item Code', start_at: 1 });
  const productCode = prefix + '-' + String(num).padStart(5, '0');
  await sbPost('chocolate_item_list', [{
    chocolate_name: name, category: category || 'Uncategorized', brand: brand || null,
    standard_price_per_kg: Number(pricePerKg) > 0 ? Number(pricePerKg) : null,
    grams: Number(grams) > 0 ? Number(grams) : null, product_code: productCode,
    packaging_type: packagingType || 'Piece',
  }]);
  return name;
}

function mapItemRow(r: any) { return { 'Chocolate Name': r.chocolate_name, 'Product Code': r.product_code, 'Brand': r.brand, 'Category': r.category, 'Standard Price / Kg': r.standard_price_per_kg, 'Grams': r.grams, 'Min Stock': r.min_stock, 'Packaging Type': r.packaging_type }; }
function mapDbRow(r: any) {
  return {
    'ID': r.legacy_id || String(r.id), 'Receive Date': r.receive_date, 'Delivery Date': r.delivery_date, 'Delivery Note No': r.delivery_note_no,
    'Supplier': r.supplier, 'Chocolate Name': r.chocolate_name, 'Product Code': r.product_code, 'Brand': r.brand, 'Category': r.category,
    'Batch No.': r.batch_no, 'Expiry Date': r.expiry_date, 'Qty Received': r.qty_received, 'Qty Used': r.qty_used, 'Current Stock': r.current_stock,
    'Unit': r.unit, 'Price / Kg': r.price_per_kg, 'Price Per Kg': r.price_per_kg, 'Total Amount': r.total_amount, 'Status': r.status, 'Branch': r.branch,
    'Storage Location': r.storage_location, 'Remarks': r.remarks, 'Created Date & Time': r.created_at, 'Created By': r.created_by,
    'Last Updated Date & Time': r.updated_at, 'Updated By': r.updated_by, 'Weight Per Piece': r.weight_per_piece, 'Price Per Piece': r.price_per_piece,
    'Unit Price': priceForRow(r),
    'Approval Status': r.approval_status || 'Approved', 'Batch Ref': r.batch_ref || '',
  };
}
function mapCountRow(r: any) {
  return { 'Count ID': r.count_id, 'Session ID': r.session_id, 'Count Date': r.count_date, 'Branch': r.branch, 'Chocolate Name': r.chocolate_name,
    'Batch No.': r.batch_no, 'Expiry Date': r.expiry_date, 'Database ID': r.database_id, 'System Stock': r.system_stock, 'Physical Count': r.physical_count,
    'Variance': r.variance, 'Reason': r.variance_reason, 'Counted By': r.counted_by, 'Status': r.status };
}
function mapReleaseRow(r: any, expiryDate: string) {
  return { 'Release No': r.release_no, 'Transaction Type': r.transaction_type, 'Branch': r.branch, 'Customer/Dept': r.customer_department,
    'Chocolate Name': r.chocolate_name, 'Product Code': r.product_code, 'Batch No.': r.batch_no, 'Qty Release': r.qty_release, 'Unit': r.unit,
    'Price': r.price, 'Total': r.total, 'Remarks': r.remarks, 'Prepared By': r.prepared_by, 'Realese Date': r.release_date,
    'Database ID': r.database_id, 'To Branch': r.to_branch, 'ExpiryDate': expiryDate };
}

async function getArrangements() {
  const [arrangements, allItems] = await Promise.all([
    sbGet('chocolate_arrangements', 'select=*&order=arrangement_name.asc'),
    sbGet('chocolate_arrangement_items', 'select=*&order=id.asc'),
  ]);
  const itemsByArrangement: Record<string, any[]> = {};
  allItems.forEach((it: any) => { (itemsByArrangement[it.arrangement_id] = itemsByArrangement[it.arrangement_id] || []).push({ chocolateName: it.chocolate_name, qty: Number(it.qty) }); });
  return arrangements.map((a: any) => ({
    id: a.id, arrangementCode: a.arrangement_code, arrangementName: a.arrangement_name, displayName: a.display_name || '',
    createdBy: a.created_by, createdDate: a.created_date, notes: a.notes || '', photoData: a.photo_data || '',
    items: itemsByArrangement[a.id] || [],
  }));
}
async function getArrangementByCode(code: string) {
  code = (code || '').trim();
  if (!code) return { error: 'No code provided.' };
  const rows = await sbGet('chocolate_arrangements', `select=*&arrangement_code=eq.${encodeURIComponent(code)}`);
  if (!rows.length) return { error: 'No arrangement found for this code.' };
  const a = rows[0];
  const items = await sbGet('chocolate_arrangement_items', `select=*&arrangement_id=eq.${a.id}&order=id.asc`);
  return { success: true, id: a.id, arrangementCode: a.arrangement_code, arrangementName: a.arrangement_name, displayName: a.display_name || '',
    createdBy: a.created_by, createdDate: a.created_date, notes: a.notes || '', photoData: a.photo_data || '',
    items: items.map((it: any) => ({ chocolateName: it.chocolate_name, qty: Number(it.qty) })) };
}
async function addArrangement(p: Record<string, any>) {
  const arrangementName = (p.arrangementName || '').trim();
  const createdBy = p.createdBy || '', notes = p.notes || '', photoData = p.photoData || '', displayName = p.displayName || '';
  let items: any[] = [];
  try { items = JSON.parse(p.items || '[]'); } catch { items = []; }
  if (!arrangementName) return { error: 'Arrangement name is required.' };
  if (!items.length) return { error: 'Add at least one chocolate to the arrangement.' };
  const existing = await sbGet('chocolate_arrangements', `select=id&arrangement_name=eq.${encodeURIComponent(arrangementName)}`);
  if (existing.length) return { error: 'An arrangement with this name already exists.' };
  const codeNum = await sbRpc('get_next_chocolate_counter', { counter_key: 'Next Arrangement Code', start_at: 1 });
  const arrangementCode = 'ARR-' + String(codeNum).padStart(5, '0');
  const inserted = await sbPost('chocolate_arrangements', [{ arrangement_name: arrangementName, created_by: createdBy, notes, arrangement_code: arrangementCode, photo_data: photoData, display_name: displayName }]);
  const arrangementId = inserted[0].id;
  const itemRows = items.filter((it: any) => it.chocolateName && Number(it.qty) > 0).map((it: any) => ({ arrangement_id: arrangementId, chocolate_name: it.chocolateName, qty: Number(it.qty) }));
  if (itemRows.length) await sbPost('chocolate_arrangement_items', itemRows);
  return { success: true, id: arrangementId, arrangementCode };
}

async function addEntry(p: Record<string, any>) {
  const branch = p.branch;
  const prefix = branchPrefix(branch);
  const nextNum = await sbRpc('get_next_chocolate_counter', { counter_key: 'Next Chocolate ID', start_at: 1 });
  const newID = prefix + '-CHO' + String(nextNum).padStart(6, '0');
  const qty = Number(p.qty) || 0, price = Number(p.price) || 0;
  const priceField = priceFieldForUnit(p.unit);

  p.chocolateName = (await ensureItemListEntry(p.chocolateName, p.category, p.brand, p.unit, price, p.weightPerPiece, p.packagingType)) || p.chocolateName;

  await sbPost('chocolate_database', [{
    legacy_id: newID, receive_date: p.receiveDate || null, delivery_date: p.receiveDate || null,
    delivery_note_no: p.deliveryNo || '', supplier: p.supplier || '', chocolate_name: p.chocolateName || '',
    product_code: p.productCode || '', brand: p.brand || '', category: p.category || '', batch_no: p.batchNo || '',
    expiry_date: p.expiryDate || null, qty_received: qty, qty_used: 0, current_stock: 0, unit: p.unit || '',
    [priceField]: price, total_amount: qty * price, status: 'GOOD', branch, storage_location: p.storageLocation || '',
    tray_colour_code: p.trayCode || '', remarks: p.remarks || '', created_by: p.receivedBy || '', updated_by: p.receivedBy || '',
    updated_at: new Date().toISOString(), weight_per_piece: numOrNull(p.weightPerPiece),
    // Receiving approval (Nov 2026): not in stock (current_stock 0) until an Admin approves the delivery note.
    approval_status: 'Pending', batch_ref: 'CH|' + branch + '|' + (p.deliveryNo || newID),
  }]);
  return { success: true, id: newID, waitingApproval: true };
}
async function editEntry(p: Record<string, any>) {
  const id = String(p.id || '').trim();
  let query = `legacy_id=eq.${encodeURIComponent(id)}`;
  let existingRows = await sbGet('chocolate_database', `select=qty_used,unit,approval_status&${query}`);
  if (!existingRows.length && /^\d+$/.test(id)) {
    query = `id=eq.${id}`;
    existingRows = await sbGet('chocolate_database', `select=qty_used,unit,approval_status&${query}`);
  }
  const stillPending = String(existingRows[0] && existingRows[0].approval_status || 'Approved') !== 'Approved';
  if (!existingRows.length) return { error: 'Entry not found' };
  const qtyUsed = Number(existingRows[0].qty_used) || 0;
  const newQty = Number(p.qty) || 0;
  if (newQty < qtyUsed) return { error: `Cannot set quantity below ${qtyUsed} — that much has already been used or released.` };
  const newPrice = Number(p.price) || 0;
  const priceField = priceFieldForUnit(p.unit || existingRows[0].unit);

  p.chocolateName = (await ensureItemListEntry(p.chocolateName, '', '', p.unit, newPrice, p.weightPerPiece, null)) || p.chocolateName;

  await sbPatch('chocolate_database', query, {
    receive_date: p.receiveDate || null, delivery_date: p.receiveDate || null, delivery_note_no: p.deliveryNo || '',
    supplier: p.supplier || '', chocolate_name: p.chocolateName || '', batch_no: p.batchNo || '', expiry_date: p.expiryDate || null,
    qty_received: newQty, current_stock: stillPending ? 0 : newQty - qtyUsed, unit: p.unit || '', [priceField]: newPrice, total_amount: newQty * newPrice,
    branch: p.branch || '', storage_location: p.storageLocation || '', remarks: p.remarks || '', updated_by: p.receivedBy || '',
    updated_at: new Date().toISOString(),
  });
  return { success: true };
}
async function addInitialStock(p: Record<string, any>) {
  const branch = p.branch;
  const prefix = branchPrefix(branch);
  const nextNum = await sbRpc('get_next_chocolate_counter', { counter_key: 'Next Chocolate ID', start_at: 1 });
  const newID = prefix + '-CHO' + String(nextNum).padStart(6, '0');
  const qty = Number(p.qty) || 0, price = Number(p.price) || 0;
  const entryDate = p.entryDate;
  const priceField = priceFieldForUnit(p.unit);

  let batch = p.batch;
  if (!batch) {
    const d = entryDate ? new Date(entryDate) : new Date();
    const datePart = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    const searchPrefix = prefix + '-INITBATCH-' + datePart + '-';
    const existingBatches = await sbGet('chocolate_database', `select=batch_no&batch_no=like.${encodeURIComponent(searchPrefix + '*')}`);
    let maxSeq = 0;
    existingBatches.forEach((r: any) => { const seq = parseInt(String(r.batch_no).slice(searchPrefix.length), 10); if (!isNaN(seq) && seq > maxSeq) maxSeq = seq; });
    batch = searchPrefix + String(maxSeq + 1).padStart(2, '0');
  }

  p.chocolateName = (await ensureItemListEntry(p.chocolateName, p.category, '', p.unit, price, null, null)) || p.chocolateName;
  let catalogGramsForNewBatch = 0;
  const itemRows = await sbGet('chocolate_item_list', `select=grams&chocolate_name=eq.${encodeURIComponent(p.chocolateName)}`);
  if (itemRows.length) catalogGramsForNewBatch = Number(itemRows[0].grams) || 0;

  await sbPost('chocolate_database', [{
    legacy_id: newID, receive_date: entryDate || null, delivery_date: entryDate || null, delivery_note_no: 'INITIAL STOCK',
    supplier: 'Initial Stock Entry', chocolate_name: p.chocolateName || '', product_code: p.internalCode || '', category: p.category || '',
    batch_no: batch, expiry_date: p.expiryDate || null, qty_received: qty, qty_used: 0, current_stock: qty, unit: p.unit || '',
    [priceField]: price, total_amount: qty * price, status: 'GOOD', branch, storage_location: p.storageLocation || '',
    remarks: 'Opening balance entered during system setup', created_by: p.enteredBy || '', updated_by: p.enteredBy || '',
    updated_at: new Date().toISOString(), weight_per_piece: catalogGramsForNewBatch > 0 ? catalogGramsForNewBatch : null,
  }]);
  return { success: true, id: newID, batch };
}

async function saveCountSession(p: Record<string, any>) {
  const branch = p.branch, countedBy = p.countedBy, countDate = p.countDate;
  let lines: any[] = [];
  try { lines = JSON.parse(p.lines); } catch { lines = []; }
  const sessionId = 'SES-' + branchPrefix(branch) + '-' + Date.now();

  const dbIdList = [...new Set(lines.map((l: any) => parseInt(String(l.databaseId), 10)).filter((n: number) => Number.isInteger(n) && n > 0))];
  if (dbIdList.length) {
    const pending = await sbGet('chocolate_stock_count_history', `select=chocolate_name,batch_no&status=eq.Pending%20Approval&database_id=in.(${dbIdList.join(',')})`);
    if (pending.length) {
      const names = [...new Set(pending.map((r: any) => String(r.chocolate_name || '').trim()))];
      const shown = names.slice(0, 6).join(', ') + (names.length > 6 ? ' and ' + (names.length - 6) + ' more' : '');
      return { error: 'Some items still have a count waiting for approval: ' + shown + '. Approve or reject those in Stock Approval first, then count again.' };
    }
  }

  const rows = lines.map((line: any) => {
    const variance = Number(line.physicalCount) - Number(line.systemStock);
    const status = variance === 0 ? 'Confirmed' : 'Pending Approval';
    return { line, variance, status };
  });
  for (const r of rows) {
    const countNum = await sbRpc('get_next_chocolate_counter', { counter_key: 'Next Count ID', start_at: 1 });
    const countId = 'CNT' + String(countNum).padStart(6, '0');
    await sbPost('chocolate_stock_count_history', [{
      count_id: countId, session_id: sessionId, count_date: countDate || null, branch, chocolate_name: r.line.chocolateName,
      batch_no: r.line.batch, expiry_date: r.line.expiryDate || null, database_id: r.line.databaseId, system_stock: Number(r.line.systemStock),
      physical_count: Number(r.line.physicalCount), variance: r.variance, variance_reason: r.line.reason || '', counted_by: countedBy, status: r.status,
    }]);
  }
  return { success: true, sessionId };
}
async function approveCount(p: Record<string, any>) {
  const countId = String(p.countId || '').trim(), approvedBy = p.approvedBy || '';
  if (!countId) return { error: 'Count not found' };
  const countRows = await sbGet('chocolate_stock_count_history', `select=*&count_id=eq.${encodeURIComponent(countId)}`);
  if (!countRows.length) return { error: 'Count not found' };
  const count = countRows[0];
  if (String(count.status || '').trim() !== 'Pending Approval') return { error: 'This count was already handled (' + (count.status || 'no status') + '). Nothing was changed.' };
  const dbRows = await sbGet('chocolate_database', `select=id,current_stock&id=eq.${count.database_id}`);
  if (!dbRows.length) return { error: 'Original batch not found in Chocolate Database' };

  const claimed = await sbPatch('chocolate_stock_count_history', `count_id=eq.${encodeURIComponent(countId)}&status=eq.Pending%20Approval`, { status: 'Approved' });
  if (!claimed.length) return { error: 'This count was already handled. Nothing was changed.' };

  try {
    const adjNum = await sbRpc('get_next_chocolate_counter', { counter_key: 'Next Adjustment ID', start_at: 1 });
    const adjId = 'ADJ' + String(adjNum).padStart(6, '0');
    await sbPost('chocolate_stock_adjustment_history', [{
      adjustment_id: adjId, adjustment_date: new Date().toISOString().slice(0, 10), branch: count.branch, chocolate_name: count.chocolate_name,
      batch_no: count.batch_no, database_id: count.database_id, adjustment_qty: count.variance, reason: count.variance_reason,
      source_count_id: countId, approved_by: approvedBy,
    }]);
    const fresh = await sbGet('chocolate_database', `select=id,current_stock&id=eq.${count.database_id}`);
    const newStock = Number(fresh[0].current_stock) + Number(count.variance);
    await sbPatch('chocolate_database', `id=eq.${fresh[0].id}`, { current_stock: newStock });
  } catch (err) {
    try { await sbPatch('chocolate_stock_count_history', `count_id=eq.${encodeURIComponent(countId)}`, { status: 'Pending Approval' }); } catch (_) { /* ignore */ }
    throw err;
  }
  return { success: true };
}
async function setCountStatus(countId: string, status: string) {
  const id = String(countId || '').trim();
  if (!id) return { error: 'Count not found' };
  const done = await sbPatch('chocolate_stock_count_history', `count_id=eq.${encodeURIComponent(id)}&status=eq.Pending%20Approval`, { status });
  if (!done.length) return { error: 'This count was already handled. Nothing was changed.' };
  return { success: true };
}

async function backfillItemList() {
  const dbRows = await sbGet('chocolate_database', 'select=chocolate_name,category,brand,unit,product_code,price_per_kg,weight_per_piece');
  const existingRows = await sbGet('chocolate_item_list', 'select=chocolate_name');
  const existingNames = new Set(existingRows.map((r: any) => String(r.chocolate_name).trim().toLowerCase()));
  const added: string[] = [];
  const seenThisRun = new Set<string>();
  for (const row of dbRows) {
    const name = String(row.chocolate_name || '').trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    if (existingNames.has(lower) || seenThisRun.has(lower)) continue;
    seenThisRun.add(lower);
    let productCode = String(row.product_code || '').trim();
    if (!productCode) {
      const prefix = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'CHO';
      const num = await sbRpc('get_next_chocolate_counter', { counter_key: 'Next Chocolate Item Code', start_at: 1 });
      productCode = prefix + '-' + String(num).padStart(5, '0');
    }
    await sbPost('chocolate_item_list', [{ chocolate_name: name, category: row.category || 'Uncategorized', brand: row.brand || null,
      standard_price_per_kg: Number(row.price_per_kg) || 0, grams: Number(row.weight_per_piece) > 0 ? Number(row.weight_per_piece) : null,
      product_code: productCode, packaging_type: 'Piece' }]);
    added.push(name);
  }
  return { success: true, addedCount: added.length, added };
}
async function checkFixBarcodes() {
  const rows = await sbGet('chocolate_item_list', 'select=id,chocolate_name,product_code&order=id.asc');
  const seenCodes: Record<string, number> = {};
  const fixedMissing: any[] = [], fixedDuplicates: any[] = [];
  for (const row of rows) {
    const name = String(row.chocolate_name || '').trim();
    const code = String(row.product_code || '').trim();
    if (!name) continue;
    if (!code || code === 'N/A') {
      const prefix = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'CHO';
      const num = await sbRpc('get_next_chocolate_counter', { counter_key: 'Next Chocolate Item Code', start_at: 1 });
      const newCode = prefix + '-' + String(num).padStart(5, '0');
      await sbPatch('chocolate_item_list', `id=eq.${row.id}`, { product_code: newCode });
      fixedMissing.push({ name, newCode }); seenCodes[newCode] = row.id; continue;
    }
    if (seenCodes.hasOwnProperty(code)) {
      const words = name.split(/\s+/).filter(Boolean);
      const variant = words.length > 1 ? words[words.length - 1] : name;
      const newCode = code + '-' + variant;
      await sbPatch('chocolate_item_list', `id=eq.${row.id}`, { product_code: newCode });
      fixedDuplicates.push({ name, oldCode: code, newCode }); seenCodes[newCode] = row.id;
    } else { seenCodes[code] = row.id; }
  }
  return { success: true, missingFixed: fixedMissing.length, duplicatesFixed: fixedDuplicates.length, details: fixedMissing.concat(fixedDuplicates) };
}
async function addChocolateItem(p: Record<string, any>) {
  const name = String(p.chocolateName || '').replace(/\s+/g, ' ').trim();
  if (!name) return { error: 'Chocolate name is required' };
  const dupe = await catalogName(name);
  if (dupe.toLowerCase() === name.toLowerCase() && (await sbGet('chocolate_item_list', `select=id&chocolate_name=ilike.${likeEq(name)}&limit=1`)).length) return { error: `"${dupe}" already exists in the catalog.` };
  const prefix = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'CHO';
  const num = await sbRpc('get_next_chocolate_counter', { counter_key: 'Next Chocolate Item Code', start_at: 1 });
  const productCode = prefix + '-' + String(num).padStart(5, '0');
  await sbPost('chocolate_item_list', [{ chocolate_name: name, category: p.category || '', brand: p.brand || '', grams: numOrNull(p.grams),
    product_code: productCode, standard_price_per_kg: Number(p.pricePerKg) || 0, min_stock: Number(p.minStock) || 0,
    packaging_type: p.packagingType || 'Piece' }]);
  return { success: true, productCode };
}
async function updateChocolateItem(p: Record<string, any>) {
  const name = String(p.chocolateName || '').trim();
  if (!name) return { error: 'Chocolate name is required' };

  const newName = String(p.newChocolateName || '').trim();
  if (newName && newName.toLowerCase() !== name.toLowerCase()) {
    const clash = await sbGet('chocolate_item_list', `select=id&chocolate_name=ilike.${likeEq(newName)}`);
    if (clash.length) return { error: `"${newName}" already exists in the catalog — choose a different name, or edit that item instead.` };
  }

  const fields: Record<string, any> = {};
  if (p.category) fields.category = p.category;
  if (p.brand) fields.brand = p.brand;
  if (p.grams !== undefined && p.grams !== '') fields.grams = Number(p.grams) || 0;
  if (p.pricePerKg !== undefined && p.pricePerKg !== '') fields.standard_price_per_kg = Number(p.pricePerKg) || 0;
  if (p.minStock !== undefined && p.minStock !== '') fields.min_stock = Number(p.minStock) || 0;
  if (p.productCode) fields.product_code = p.productCode;
  if (p.packagingType) fields.packaging_type = p.packagingType;
  if (newName && newName.toLowerCase() !== name.toLowerCase()) fields.chocolate_name = newName;

  const result = await sbPatch('chocolate_item_list', `chocolate_name=eq.${encodeURIComponent(name)}`, fields);
  if (!result.length) return { error: 'Item not found in catalog: ' + name };

  if (fields.chocolate_name) {
    await sbPatch('chocolate_database', `chocolate_name=eq.${encodeURIComponent(name)}`, { chocolate_name: newName });
  }
  return { success: true, renamedTo: fields.chocolate_name || undefined };
}
async function updateChocolateRates(p: Record<string, any>) {
  let updates: any[] = [];
  try { updates = JSON.parse(p.updates || '[]'); } catch { updates = []; }
  let updatedCount = 0;
  for (const u of updates) {
    if (!u.itemCode) continue;
    const result = await sbPatch('chocolate_item_list', `product_code=eq.${encodeURIComponent(u.itemCode)}`, { standard_price_per_kg: Number(u.newRate) || 0 });
    if (result.length) updatedCount++;
  }
  return { success: true, updated: updatedCount };
}

// ---------------------------------------------------------------
// RECEIVING APPROVAL (Nov 2026): grouped by delivery note; Approve puts it into stock.
// ---------------------------------------------------------------
async function getPendingReceivingChoc(p: Record<string, any>) {
  // status: Pending (default) | History = approved + rejected receiving of the last N days (not Initial Stock), to edit old mistakes.
  const history = String(p.status || '') === 'History';
  const days = Math.min(120, Math.max(1, parseInt(p.days, 10) || 30));
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  let q = history ? `select=*&approval_status=neq.Pending&delivery_note_no=neq.INITIAL%20STOCK&receive_date=gte.${since}&order=id.desc&limit=400` : 'select=*&approval_status=eq.Pending&order=id.asc';
  if (p.batch) q += `&batch_ref=eq.${encodeURIComponent(String(p.batch))}`;
  const rows = await sbGet('chocolate_database', q);
  if (!rows.length) return { success: true, batches: [] };
  const hist = await sbGet('chocolate_database', 'select=id,supplier,chocolate_name,unit,price_per_kg,price_per_piece&approval_status=eq.Approved&order=id.desc&limit=600');
  const low = (v: any) => String(v || '').trim().toLowerCase();
  const out: Record<string, any> = {};
  for (const r of rows) {
    const k = String(r.batch_ref || (r.delivery_note_no ? 'CH|' + r.branch + '|' + r.delivery_note_no : 'ROW-' + r.id));
    const b = out[k] = out[k] || { batch: k, kind: 'chocolate', branch: r.branch, date: r.receive_date, supplier: r.supplier || '', invoiceNo: r.delivery_note_no || '', receivedBy: r.created_by || '', paperTotal: null, lines: [], typedTotal: 0,
      status: r.approval_status || 'Approved', approvedBy: r.approved_by || '', approvedAt: r.approved_at || '' };
    const price = priceForRow(r);
    const warns: string[] = [];
    if (!r.expiry_date) warns.push('No expiry date');
    else { const y = Number(String(r.expiry_date).slice(0, 4)); if (y < 2020 || y > 2100) warns.push('Expiry year looks wrong'); }
    const prev = hist.filter((h: any) => h.id < r.id && low(h.chocolate_name) === low(r.chocolate_name) && low(h.unit) === low(r.unit)).map((h: any) => priceForRow(h)).filter((x: number) => x > 0);
    if (prev.length && price > 0) { const mn = Math.min(...prev), mx = Math.max(...prev); if (price > mx * 1.5 || price < mn * 0.5) warns.push(`Price ${price.toFixed(3)} — usual ${mn.toFixed(3)}–${mx.toFixed(3)}`); }
    if (!(price > 0)) warns.push('No price');
    b.lines.push({ id: r.id, legacyId: r.legacy_id || String(r.id), type: 'Chocolate', name: r.chocolate_name, batchNo: r.batch_no || '', expiry: r.expiry_date || '', unit: r.unit || '', qty: Number(r.qty_received) || 0, rate: price, subtotal: Number(r.total_amount) || 0, warnings: warns,
      storageLocation: r.storage_location || '', remarks: r.remarks || '', weightPerPiece: r.weight_per_piece == null ? '' : Number(r.weight_per_piece) });
    b.typedTotal = Math.round((b.typedTotal + (Number(r.total_amount) || 0)) * 1000) / 1000;
  }
  return { success: true, batches: Object.values(out) };
}
async function decideReceivingChoc(p: Record<string, any>, me: any, approve: boolean) {
  const batch = String(p.batch || '').trim();
  if (!batch) return { success: false, error: 'No receiving selected.' };
  const filter = batch.startsWith('ROW-') ? `id=eq.${Number(batch.slice(4)) || 0}` : `batch_ref=eq.${encodeURIComponent(batch)}`;
  const rows = await sbGet('chocolate_database', `select=id,qty_received,qty_used&${filter}&approval_status=eq.Pending`);
  if (!rows.length) return { success: false, error: 'This receiving was already checked by someone else.' };
  const who = String(me.full_name || me.username || '');
  let n = 0;
  for (const r of rows) {
    const done = await sbPatch('chocolate_database', `id=eq.${r.id}&approval_status=eq.Pending`, approve
      ? { approval_status: 'Approved', approved_by: who, approved_at: new Date().toISOString(), current_stock: (Number(r.qty_received) || 0) - (Number(r.qty_used) || 0) }
      : { approval_status: 'Rejected', approved_by: who, approved_at: new Date().toISOString(), current_stock: 0 });
    n += done.length;
  }
  return { success: true, lines: n };
}

async function getLastInventoryCount(selBranch: string) {
  let q = 'select=*&order=id.desc&limit=300';
  if (selBranch !== 'All') q += `&branch=eq.${encodeURIComponent(selBranch)}`;
  const rows = await sbGet('chocolate_stock_count_history', q);
  if (!rows.length) return null;

  const latestSessionId = rows[0].session_id;
  const sessionRows = rows.filter((r: any) => r.session_id === latestSessionId);
  if (!sessionRows.length) return null;

  const dbIds = [...new Set(sessionRows.map((r: any) => r.database_id).filter(Boolean))];
  const dbRows = dbIds.length ? await sbGet('chocolate_database', `select=id,unit,price_per_kg,price_per_piece&id=in.(${dbIds.join(',')})`) : [];
  const rowById: Record<string, any> = {};
  dbRows.forEach((r: any) => { rowById[r.id] = r; });

  let itemsWithVariance = 0, totalVarianceValue = 0, totalVarianceQty = 0;
  sessionRows.forEach((r: any) => {
    const variance = Number(r.variance) || 0;
    if (variance !== 0) itemsWithVariance++;
    totalVarianceQty += variance;
    const dbRow = rowById[r.database_id];
    if (dbRow) totalVarianceValue += variance * priceForRow(dbRow);
  });

  return {
    date: sessionRows[0].count_date, branch: sessionRows[0].branch,
    itemsCounted: sessionRows.length, itemsWithVariance,
    totalVarianceQty: Math.round(totalVarianceQty * 1000) / 1000,
    totalVarianceValue: Math.round(totalVarianceValue * 1000) / 1000,
  };
}

async function getDashboardData(selBranch: string) {
  const branches = ['ModaMall', 'Hamala', 'Galali'];
  const [dbData, itemData, relData, countData, settingsRows, lastInventoryCount] = await Promise.all([
    sbGet('chocolate_database', 'select=*'), sbGet('chocolate_item_list', 'select=*'),
    sbGet('chocolate_release_database', 'select=*'), sbGet('chocolate_stock_count_history', 'select=*'),
    sbGet('chocolate_settings', 'select=*'), getLastInventoryCount(selBranch),
  ]);
  const minStockDict: Record<string, number> = {}, gramsByName: Record<string, number> = {};
  itemData.forEach((row: any) => { const name = String(row.chocolate_name || '').trim(); if (name) { minStockDict[name] = Number(row.min_stock) || 0; gramsByName[name] = Number(row.grams) || 0; } });
  const kgOfRow = (row: any) => { const s = Number(row.current_stock) || 0; if (!isPieceUnit(row.unit)) return { kg: s, pcs: 0, noW: 0 }; const w = Number(row.weight_per_piece) || gramsByName[String(row.chocolate_name || '').trim()] || 0; return w > 0 ? { kg: s * w / 1000, pcs: s, noW: 0 } : { kg: 0, pcs: s, noW: s }; };
  let nearExpiryDays = 30;
  const nearExpirySetting = settingsRows.find((s: any) => s.key === 'Near Expiry Days');
  if (nearExpirySetting) nearExpiryDays = Number(nearExpirySetting.value) || 30;
  const nowBH = new Date(Date.now() + 3 * 3600 * 1000);
  const today = new Date(Date.UTC(nowBH.getUTCFullYear(), nowBH.getUTCMonth(), nowBH.getUTCDate()));
  const dayOfWeek = today.getDay();
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - dayOfWeek);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const inBranch = (b: string) => selBranch === 'All' || String(b).trim() === selBranch;
  const isSameDay = (d1: Date, d2: Date) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
  const inRange = (d: Date, s: Date, en: Date) => d >= s && d <= en;
  let totalAvailable = 0, totalPieces = 0, piecesNoWeight = 0, totalValue = 0, todayReceiving = 0, weekReceiving = 0;
  const lowStockAgg: Record<string, number> = {}, topMovingAgg: Record<string, number> = {};
  let nearExpiryList: any[] = [], expiredList: any[] = [];
  let lastReceivingRow: any = null, lastReceivingDate: Date | null = null;
  dbData.forEach((row: any) => {
    const branch = row.branch; if (!inBranch(branch)) return;
    const stock = Number(row.current_stock) || 0, price = priceForRow(row);
    { const k = kgOfRow(row); totalAvailable += k.kg; totalPieces += k.pcs; piecesNoWeight += k.noW; } totalValue += stock * price;
    const name = String(row.chocolate_name || '').trim(); const used = Number(row.qty_used) || 0;
    if (name) topMovingAgg[name] = (topMovingAgg[name] || 0) + used;
    const lowKey = name + '|' + branch; lowStockAgg[lowKey] = (lowStockAgg[lowKey] || 0) + stock;
    const receiveDateRaw = row.receive_date, deliveryNote = String(row.delivery_note_no || '').trim();
    if (receiveDateRaw && deliveryNote !== 'INITIAL STOCK') {
      const rDate = new Date(receiveDateRaw);
      if (!isNaN(rDate.getTime())) {
        const total = Number(row.total_amount) || 0;
        if (isSameDay(rDate, today)) todayReceiving += total;
        if (inRange(rDate, weekStart, weekEnd)) weekReceiving += total;
        if (!lastReceivingDate || rDate > lastReceivingDate) { lastReceivingDate = rDate; lastReceivingRow = row; }
      }
    }
    const expDateRaw = row.expiry_date;
    if (stock > 0 && expDateRaw) {
      const expDate = new Date(expDateRaw);
      if (!isNaN(expDate.getTime())) {
        const daysLeft = Math.round((expDate.getTime() - today.getTime()) / 86400000);
        if (daysLeft < 0) expiredList.push({ name, branch, expiryDate: expDateRaw, daysLeft });
        else if (daysLeft <= nearExpiryDays) nearExpiryList.push({ name, branch, expiryDate: expDateRaw, daysLeft });
      }
    }
  });
  const lowStockList: any[] = [];
  Object.keys(lowStockAgg).forEach(key => { const [name, branch] = key.split('|'); const min = minStockDict[name] || 0; const avail = lowStockAgg[key]; if (min > 0 && avail < min) lowStockList.push({ name, branch, available: avail, min, deficit: min - avail }); });
  lowStockList.sort((a, b) => b.deficit - a.deficit);
  const topMovingList = Object.keys(topMovingAgg).map(name => ({ name, used: topMovingAgg[name] })).sort((a, b) => b.used - a.used).slice(0, 10);
  nearExpiryList.sort((a, b) => a.daysLeft - b.daysLeft); expiredList.sort((a, b) => a.daysLeft - b.daysLeft);
  let todayReleases = 0, weekReleases = 0, todayTransfers = 0, weekTransfers = 0;
  let lastReleaseRow: any = null, lastReleaseDate: Date | null = null, lastTransferRow: any = null, lastTransferDate: Date | null = null;
  const recentTransfers: any[] = [];
  relData.forEach((row: any) => {
    const branch = row.branch;
    const type = String(row.transaction_type || '').trim();
    if (!(inBranch(branch) || (type === 'Transfer' && inBranch(row.to_branch)))) return;
    const rDate = row.release_date ? new Date(row.release_date) : null;
    const total = Number(row.total) || 0;
    if (type === 'Transfer') {
      if (rDate && !isNaN(rDate.getTime())) { if (isSameDay(rDate, today)) todayTransfers++; if (inRange(rDate, weekStart, weekEnd)) weekTransfers++; if (!lastTransferDate || rDate > lastTransferDate) { lastTransferDate = rDate; lastTransferRow = row; } }
      recentTransfers.push({ date: row.release_date, fromBranch: branch, toBranch: row.to_branch, chocolateName: row.chocolate_name, qty: row.qty_release, unit: row.unit, by: row.prepared_by, releaseNo: row.release_no });
    } else {
      if (rDate && !isNaN(rDate.getTime())) { if (isSameDay(rDate, today)) todayReleases += total; if (inRange(rDate, weekStart, weekEnd)) weekReleases += total; if (!lastReleaseDate || rDate > lastReleaseDate) { lastReleaseDate = rDate; lastReleaseRow = row; } }
    }
  });
  recentTransfers.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  let pendingApprovalsCount = 0;
  countData.forEach((row: any) => { if (String(row.status || '').trim() === 'Pending Approval' && (selBranch === 'All' || String(row.branch).trim() === selBranch)) pendingApprovalsCount++; });
  const branchSummary = branches.map(b => {
    let avail = 0, val = 0, low = 0, near = 0, exp = 0, receivedWeek = 0;
    dbData.forEach((row: any) => {
      if (String(row.branch).trim() !== b) return;
      const stock = Number(row.current_stock) || 0, price = priceForRow(row);
      avail += kgOfRow(row).kg; val += stock * price;
      const receiveDateRaw = row.receive_date, deliveryNote = String(row.delivery_note_no || '').trim();
      if (receiveDateRaw && deliveryNote !== 'INITIAL STOCK') { const rDate = new Date(receiveDateRaw); if (!isNaN(rDate.getTime()) && inRange(rDate, weekStart, weekEnd)) receivedWeek += Number(row.total_amount) || 0; }
      const expDateRaw = row.expiry_date;
      if (stock > 0 && expDateRaw) { const expDate = new Date(expDateRaw); if (!isNaN(expDate.getTime())) { const daysLeft = Math.round((expDate.getTime() - today.getTime()) / 86400000); if (daysLeft < 0) exp++; else if (daysLeft <= nearExpiryDays) near++; } }
    });
    Object.keys(lowStockAgg).forEach(key => { if (key.endsWith('|' + b)) { const [name] = key.split('|'); const min = minStockDict[name] || 0; if (min > 0 && lowStockAgg[key] < min) low++; } });
    const lockSetting = settingsRows.find((s: any) => s.key === 'Initial Stock Locked: ' + b);
    const locked = lockSetting ? String(lockSetting.value).trim() === 'Yes' : false;
    return { branch: b, available: avail, value: val, lowStock: low, nearExpiry: near, expired: exp, receivedWeek, locked };
  });
  function rowSummary(row: any, isRelease: boolean) { if (!row) return null; return { chocolateName: row.chocolate_name, branch: row.branch, date: isRelease ? row.release_date : row.receive_date, qty: isRelease ? row.qty_release : row.qty_received }; }
  const catalogByCategory: Record<string, string[]> = {};
  itemData.forEach((row: any) => { const name = String(row.chocolate_name || '').trim(); const cat = String(row.category || '').trim() || 'Uncategorized'; if (!name) return; if (!catalogByCategory[cat]) catalogByCategory[cat] = []; catalogByCategory[cat].push(name); });
  const availableNames = new Set<string>();
  dbData.forEach((row: any) => { if (!inBranch(row.branch)) return; if ((Number(row.current_stock) || 0) > 0) availableNames.add(String(row.chocolate_name).trim()); });
  const categoryBreakdown = Object.keys(catalogByCategory).map(cat => { const allItems = [...new Set(catalogByCategory[cat])]; const available = allItems.filter(n => availableNames.has(n)); const missing = allItems.filter(n => !availableNames.has(n)); return { category: cat, totalInCatalog: allItems.length, availableCount: available.length, availableItems: available, missingItems: missing }; }).sort((a, b) => b.availableCount - a.availableCount);
  const distinctVariantsAvailable = availableNames.size;
  const stockByItem: Record<string, { name: string; stock: number; unit: string }> = {};
  dbData.forEach((row: any) => { if (!inBranch(row.branch)) return; const name = String(row.chocolate_name || '').trim(); if (!name) return; const stock = Number(row.current_stock) || 0, unit = String(row.unit || '').trim(); if (!stockByItem[name]) stockByItem[name] = { name, stock: 0, unit }; stockByItem[name].stock += stock; });
  const itemStockLevels = Object.values(stockByItem).sort((a, b) => a.name.localeCompare(b.name));
  return { totalAvailable: Math.round(totalAvailable * 1000) / 1000, totalPieces, piecesNoWeight, totalValue, todayReceiving, todayReleases, todayTransfers, nearExpiryCount: nearExpiryList.length, expiredCount: expiredList.length, lowStockCount: lowStockList.length, weekReceiving, weekReleases, weekTransfers, pendingApprovalsCount, lastReceiving: rowSummary(lastReceivingRow, false), lastRelease: rowSummary(lastReleaseRow, true), lastTransfer: rowSummary(lastTransferRow, true), lastInventoryCount, branchSummary, lowStockList, nearExpiryList, expiredList, topMovingList, recentTransfers: recentTransfers.slice(0, 10), distinctVariantsAvailable, categoryBreakdown, itemStockLevels };
}

async function saveRelease(p: Record<string, any>) {
  let items: any[] = [], extras: any[] = [];
  try { items = JSON.parse(p.items || '[]'); } catch { items = []; }
  try { extras = JSON.parse(p.extras || '[]'); } catch { extras = []; }
  if (!items.length) return { error: 'No items to save.' };
  if (items.some((it: any) => !(Number(it && it.qty) > 0))) return { error: 'Quantity must be more than 0.' };
  const branch = p.branch, toBranch = p.toBranch || '', transactionType = p.transactionType, customerDept = p.customerDept || '',
    preparedBy = p.preparedBy || '', remarks = p.remarks || '', releaseDate = p.releaseDate;
  const neededIds = [...new Set(items.map(it => String(it.databaseId)))];
  const batchRows = neededIds.length ? await sbGet('chocolate_database', `select=*&id=in.(${neededIds.join(',')})`) : [];
  const batchById: Record<string, any> = {};
  batchRows.forEach((r: any) => { batchById[String(r.id)] = r; });
  for (const it of items) {
    const row = batchById[String(it.databaseId)];
    if (!row) return { error: 'Batch not found for ' + it.chocolateName };
    if (Number(it.qty) > Number(row.current_stock)) return { error: 'Insufficient stock for ' + it.chocolateName };
  }
  const counter = await sbRpc('get_next_chocolate_counter', { counter_key: 'Next Release No', start_at: 1 });
  const releaseNo = 'REL-' + String(counter).padStart(6, '0');
  for (const it of items) {
    await sbPost('chocolate_release_database', [{ release_no: releaseNo, transaction_type: transactionType, branch, customer_department: customerDept, chocolate_name: it.chocolateName, product_code: it.productCode || '', batch_no: it.batch, qty_release: Number(it.qty), unit: it.unit, price: Number(it.price), total: Number(it.total), remarks, prepared_by: preparedBy, release_date: releaseDate || null, database_id: String(it.databaseId), to_branch: toBranch }]);
    const src = batchById[String(it.databaseId)];
    const newUsed = Number(src.qty_used) + Number(it.qty), newStock = Number(src.current_stock) - Number(it.qty);
    await sbPatch('chocolate_database', `id=eq.${it.databaseId}`, { qty_used: newUsed, current_stock: newStock });
    if (transactionType === 'Transfer' && toBranch && toBranch !== branch) {
      const destRows = await sbGet('chocolate_database', `select=id,current_stock&chocolate_name=eq.${encodeURIComponent(it.chocolateName)}&batch_no=eq.${encodeURIComponent(it.batch)}&branch=eq.${encodeURIComponent(toBranch)}&approval_status=eq.Approved`);
      if (destRows.length) { await sbPatch('chocolate_database', `id=eq.${destRows[0].id}`, { current_stock: Number(destRows[0].current_stock) + Number(it.qty) }); }
      else {
        const branchPrefixMap: Record<string, string> = { ModaMall: 'MM', Hamala: 'HM', Galali: 'GL' };
        const transferCounter = await sbRpc('get_next_chocolate_counter', { counter_key: 'Next Chocolate ID (Transfer)', start_at: 1 });
        const newID = (branchPrefixMap[toBranch] || 'XX') + '-CHO' + String(transferCounter).padStart(6, '0');
        await sbPost('chocolate_database', [{ legacy_id: newID, chocolate_name: it.chocolateName, batch_no: it.batch, branch: toBranch, product_code: it.productCode || '', brand: src.brand || '', category: src.category || '', expiry_date: src.expiry_date || null, current_stock: Number(it.qty), qty_used: 0, status: 'GOOD', unit: src.unit || '', price_per_kg: src.price_per_kg ?? null, price_per_piece: src.price_per_piece ?? null, weight_per_piece: src.weight_per_piece ?? null }]);
      }
    }
  }
  const now = new Date().toISOString();
  for (const ex of extras) { await sbPost('chocolate_release_extras', [{ release_no: releaseNo, description: ex.description, amount: Number(ex.amount), added_at: now, added_by: preparedBy }]); }
  return { success: true, releaseNo };
}

async function saveDisplay(p: Record<string, any>) {
  const displayName = p.displayName || '';
  let items: any[] = [];
  try { items = JSON.parse(p.items || '[]'); } catch { items = []; }
  const createdBy = p.createdBy || '';
  if (!displayName || items.length === 0) return { error: 'A Display Name and at least one chocolate are required.' };
  const totalPrice = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const inserted = await sbPost('chocolate_display', [{ display_code: 'DISP-PENDING', display_name: displayName, items, total_price: totalPrice, created_by: createdBy }]);
  const newId = inserted[0].id;
  const displayCode = 'DISP-' + String(newId).padStart(5, '0');
  await sbPatch('chocolate_display', `id=eq.${newId}`, { display_code: displayCode });
  return { success: true, displayCode, totalPrice };
}

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
    const me = await isValidToken(p.token);
    if (!me) return json({ error: 'Unauthorized. Please log in again.' }, 401);
    const isAdmin = String(me.role || '') === 'Admin';
    const unlocking = action === 'setLock' && String(p.value || '').trim() !== 'Yes';
    if ((ADMIN_ONLY.has(action) || unlocking) && !isAdmin) return json({ error: 'Admin only. Please ask an Admin.' }, 403);
    // The approver name always comes from the login, not from the page.
    if (action === 'approveCount') p.approvedBy = String(me.full_name || me.username || '');

    if (action === 'getDashboardData') return json(await getDashboardData(p.branch || 'All'));
    if (action === 'getDisplayList') return json((await sbGet('chocolate_display', 'select=*&order=id.desc')).map((r: any) => ({ Date: r.created_at, 'Display Code': r.display_code, 'Display Name': r.display_name, Items: r.items || [], 'Total Price': r.total_price, 'Created By': r.created_by })));
    if (action === 'getItems') return json((await sbGet('chocolate_item_list', 'select=*&order=id.asc')).map(mapItemRow));
    if (action === 'getSuppliers') return json((await sbGet('chocolate_suppliers', 'select=name&order=id.asc')).map((r: any) => r.name));
    if (action === 'getReceivedBy') return json((await sbGet('chocolate_received_by', 'select=name&order=id.asc')).map((r: any) => r.name));
    if (action === 'getStorageLocations') return json((await sbGet('chocolate_storage_locations', 'select=name&order=id.asc')).map((r: any) => r.name));
    if (action === 'getUnits') return json((await sbGet('chocolate_units', 'select=name&order=id.asc')).map((r: any) => r.name));
    if (action === 'getCategories') { const rows = await sbGet('chocolate_item_list', 'select=category'); return json([...new Set(rows.map((r: any) => r.category).filter((c: any) => c))]); }
    if (action === 'getLockStatus') { const key = 'Initial Stock Locked: ' + p.branch; const rows = await sbGet('chocolate_settings', `select=value&key=eq.${encodeURIComponent(key)}`); return json({ locked: rows.length ? String(rows[0].value).trim() === 'Yes' : false }); }
    if (action === 'checkDuplicateBatch') { const rows = await sbGet('chocolate_database', `select=id&chocolate_name=eq.${encodeURIComponent(p.chocolateName)}&batch_no=eq.${encodeURIComponent(p.batch)}&branch=eq.${encodeURIComponent(p.branch)}`); return json({ exists: rows.length > 0 }); }
    if (action === 'getEntries') return json((await sbGet('chocolate_database', 'select=*&order=id.asc')).map(mapDbRow));
    if (action === 'getStockableItems') {
      const rows = await sbGet('chocolate_database', `select=id,chocolate_name,batch_no,expiry_date,current_stock,category,unit&branch=eq.${encodeURIComponent(p.branch)}&current_stock=gt.0`);
      return json(rows.map((r: any) => ({ ChocolateName: r.chocolate_name, Batch: r.batch_no, ExpiryDate: r.expiry_date, DatabaseID: String(r.id), SystemStock: Number(r.current_stock), Category: r.category || '', Unit: r.unit || '' })));
    }
    if (action === 'getCountHistory') { let q = 'select=*&order=id.asc'; if (p.branch) q += `&branch=eq.${encodeURIComponent(p.branch)}`; return json((await sbGet('chocolate_stock_count_history', q)).map(mapCountRow)); }
    if (action === 'getPendingApprovals') return json((await sbGet('chocolate_stock_count_history', 'select=*&status=eq.Pending Approval&order=id.asc')).map(mapCountRow));
    if (action === 'getAdjustmentHistory') return json((await sbGet('chocolate_stock_adjustment_history', 'select=*&order=id.asc')).map((r: any) => ({ 'Adjustment ID': r.adjustment_id, Date: r.adjustment_date, Branch: r.branch, 'Chocolate Name': r.chocolate_name, 'Batch No.': r.batch_no, 'Database ID': r.database_id, Variance: r.adjustment_qty, Reason: r.reason, 'Count ID': r.source_count_id, 'Approved By': r.approved_by })));
    if (action === 'getBatchesForChocolate') {
      const itemRows = await sbGet('chocolate_item_list', `select=grams,packaging_type&chocolate_name=eq.${encodeURIComponent(p.chocolateName)}`);
      const catalogGrams = itemRows.length ? (Number(itemRows[0].grams) || 0) : 0;
      const packagingType = itemRows.length ? (itemRows[0].packaging_type || 'Piece') : 'Piece';
      const dbRows = await sbGet('chocolate_database', `select=*&branch=eq.${encodeURIComponent(p.branch)}&chocolate_name=eq.${encodeURIComponent(p.chocolateName)}&current_stock=gt.0`);
      return json(dbRows.map((r: any) => ({ Batch: r.batch_no, DatabaseID: String(r.id), AvailableStock: Number(r.current_stock), Unit: r.unit, WeightPerPiece: catalogGrams > 0 ? catalogGrams : r.weight_per_piece, PricePerKg: r.price_per_kg, PricePerPiece: r.price_per_piece, ProductCode: r.product_code, ExpiryDate: r.expiry_date, PackagingType: packagingType })));
    }
    if (action === 'getReleaseByNo') {
      const items = await sbGet('chocolate_release_database', `select=*&release_no=eq.${encodeURIComponent(p.releaseNo)}`);
      const extras = await sbGet('chocolate_release_extras', `select=*&release_no=eq.${encodeURIComponent(p.releaseNo)}`);
      const itemsOut = [];
      for (const r of items) { let expiryDate = ''; const dbRows = await sbGet('chocolate_database', `select=expiry_date&id=eq.${r.database_id}`); if (dbRows.length) expiryDate = dbRows[0].expiry_date || ''; itemsOut.push(mapReleaseRow(r, expiryDate)); }
      return json({ items: itemsOut, extras: extras.map((r: any) => ({ 'Release No': r.release_no, Description: r.description, Amount: r.amount })) });
    }
    if (action === 'getReleaseHistory') { let q = 'select=*&order=id.asc'; if (p.branch) q += `&branch=eq.${encodeURIComponent(p.branch)}`; return json((await sbGet('chocolate_release_database', q)).map((r: any) => mapReleaseRow(r, ''))); }
    if (action === 'getLatestBatchInfo') {
      const rows = await sbGet('chocolate_database', `select=weight_per_piece,price_per_kg,price_per_piece,receive_date&chocolate_name=eq.${encodeURIComponent(p.chocolateName)}&order=receive_date.desc&limit=1`);
      if (!rows.length) return json({ found: false });
      return json({ found: true, WeightPerPiece: rows[0].weight_per_piece || '', PricePerKg: rows[0].price_per_kg || '', PricePerPiece: rows[0].price_per_piece || '' });
    }
    if (action === 'getArrangements') return json(await getArrangements());
    if (action === 'getArrangementByCode') return json(await getArrangementByCode(p.code));

    if (DUP_WRITE_ACTIONS.has(action)) {
      const key = await dedupKeyFor(action, p);
      const gate = await startDedup(key, action);
      if (!gate.shouldRun) return json(gate.response);
      let result: any;
      try {
        if (action === 'saveRelease') result = await saveRelease(p);
        else if (action === 'addEntry') result = await addEntry(p);
        else if (action === 'editEntry') result = await editEntry(p);
        else if (action === 'addInitialStock') result = await addInitialStock(p);
        else if (action === 'saveCountSession') result = await saveCountSession(p);
        else if (action === 'approveCount') result = await approveCount(p);
        else if (action === 'rejectCount') result = await setCountStatus(p.countId, 'Rejected');
        else if (action === 'requestRecount') result = await setCountStatus(p.countId, 'Recount Requested');
        else if (action === 'saveDisplay') result = await saveDisplay(p);
        else if (action === 'addArrangement') result = await addArrangement(p);
        else if (action === 'addChocolateItem') result = await addChocolateItem(p);
        else if (action === 'addSupplier') { await addIfNotExists('chocolate_suppliers', p.name || ''); result = { success: true }; }
        else if (action === 'addReceivedBy') { await addIfNotExists('chocolate_received_by', p.name || ''); result = { success: true }; }
        else result = { error: 'Unknown action' };
      } catch (err) {
        await finishDedup(key, null, false);
        throw err;
      }
      const ok = !!result && !result.error;
      await finishDedup(key, result, ok);
      return json(result);
    }

    if (action === 'setLock') { const key = 'Initial Stock Locked: ' + p.branch; await sbUpsert('chocolate_settings', [{ key, value: p.value }], 'key'); return json({ success: true }); }
    if (action === 'updateChocolateItem') return json(await updateChocolateItem(p));
    if (action === 'updateChocolateRates') return json(await updateChocolateRates(p));
    if (action === 'backfillItemList') return json(await backfillItemList());
    if (action === 'checkFixBarcodes') return json(await checkFixBarcodes());
    if (action === 'getPendingReceiving') return json(await getPendingReceivingChoc(p));
    if (action === 'approveReceiving') return json(await decideReceivingChoc(p, me, true));
    if (action === 'rejectReceiving') return json(await decideReceivingChoc(p, me, false));

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: 'Server error. Please try again.' }, 500);
  }
});
