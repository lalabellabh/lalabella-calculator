// LALABELLA FLOWER — FAST PATH (Supabase Edge Function)
// Full migration off Google Apps Script. Ported action-for-action from
// Flower Code.gs + FlowerArrangements.gs, reading/writing the SAME
// Supabase tables — identical response shapes. WRITE actions use the
// same duplicate-save guard as Chocolate (write_action_dedup table,
// atomic UNIQUE-key claim) in place of Apps Script's LockService.
//
// Auth: same session token, checked directly against `users`.

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
// PostgREST returns at most 1000 rows per request. For tables that grow every day this reads them all, page by page (query must include a stable order).
async function sbGetAll(table: string, query: string) {
  const out: any[] = [];
  for (let off = 0; ; off += 1000) {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}&limit=1000&offset=${off}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    if (!res.ok) throw new Error(`db ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const part = await res.json();
    out.push(...part);
    if (part.length < 1000) break;
  }
  return out;
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
// Like sbRpc but turns a Postgres "raise exception" into {error} instead
// of throwing — used by save_flower_arrangement (e.g. "Add at least one flower.").
async function sbRpcSafe(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let bodyJson: any = null;
  try { bodyJson = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (res.ok) return { data: bodyJson };
  const msg = bodyJson && bodyJson.message ? bodyJson.message : `Server error ${res.status}`;
  console.error(fn, res.status, text.slice(0, 500));
  return { error: msg };
}

async function isValidToken(token: string) {
  const t = String(token || '').trim();
  if (!t) return null;
  const rows = await sbGet('users', `select=id,username,full_name,role,status,token_created&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0];
  if (!u) return null;
  if (String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}
function currentUserName(u: any) { return String((u && (u.full_name || u.username)) || '').trim(); }
function canManageArrangement(row: any, u: any) {
  if (String((u && u.role) || '').toLowerCase() === 'admin') return true;
  const me = currentUserName(u).toLowerCase();
  return !!me && String(row.created_by || '').trim().toLowerCase() === me;
}

// ---------------------------------------------------------------
// DUPLICATE-SAVE GUARD — same write_action_dedup table as Chocolate.
// ---------------------------------------------------------------
const DUP_WRITE_ACTIONS = new Set([
  'saveReceiving', 'saveStockCount', 'saveTransfer', 'addFlowerItem', 'approveRate',
  'rejectRate', 'saveFlowerArrangement', 'fulfillFlowerArrangement',
]);
async function dedupKeyFor(action: string, p: Record<string, any>) {
  const parts = Object.keys(p).filter(k => !['token', '_ts', 'apikey', 'callback', 'action'].includes(k)).sort().map(k => `${k}=${p[k]}`).join('&');
  const bytes = new TextEncoder().encode('flower:' + action + '|' + parts);
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
// HELPERS
// ---------------------------------------------------------------
function calculateCompanyRate(supplierRate: any, unit: any, stemsPerBunch: any) {
  const rate = Number(supplierRate) || 0;
  const stems = Number(stemsPerBunch) || 1;
  const u = String(unit || '').trim().toLowerCase();
  const perStem = (u === 'bunch' && stems > 0) ? rate / stems : rate;
  // rounded to 3 decimals (half-up); +1e-9 stops float errors (e.g. 0.5774999…) from rounding down
  return Math.round((perStem * 3 * 1.10 + 1e-9) * 1000) / 1000;
}
async function generateItemCode(flowerName: string) {
  const prefix = String(flowerName || 'FLW').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'FLW';
  const num = await sbRpc('get_next_flower_counter', { counter_key: 'Next Item ID', start_at: 1 });
  return prefix + '-' + String(num).padStart(5, '0');
}
function getStockEquivalent(qty: any, unit: any, stemsPerBunch: any) {
  const u = String(unit || '').trim().toLowerCase();
  const stems = Number(stemsPerBunch) || 1;
  if (u === 'bunch' && stems > 0) return Number(qty) * stems;
  return Number(qty) || 0;
}
function getWeekRange(refDate: Date) {
  const d = new Date(refDate); d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const start = new Date(d); start.setDate(d.getDate() - day);
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
  return { start, end };
}
async function getStrictLegacyMasterRate(flowerName: string) {
  const rows = await sbGet('flower_item', `select=rate,origin,status&flower_name=eq.${encodeURIComponent(flowerName)}&status=eq.Active`);
  let hollandFallback: number | null = null;
  for (const r of rows) {
    const origin = String(r.origin || '').trim();
    if (origin === 'Legacy/Unknown') return Number(r.rate) || 0;
    if (origin === 'Holland' && hollandFallback === null) hollandFallback = Number(r.rate) || 0;
  }
  return hollandFallback !== null ? hollandFallback : 0;
}

// ---------------------------------------------------------------
// ROW MAPPERS
// ---------------------------------------------------------------
function mapFlowerItemRow(r: any) {
  return { 'Flowers': r.flower_name, 'Rate': r.rate, 'Min Stock': r.min_stock, 'Item Code': r.item_code, 'Origin': r.origin, 'Unit': r.unit,
    'Stems per Bunch': r.stems_per_bunch, 'Status': r.status, 'Created Date': r.created_date, 'Last Updated Date': r.last_updated_date,
    'Rate Status': r.rate_status, 'Suggested Rate': r.suggested_rate, 'Supplier Rate Used': r.supplier_rate_used };
}
function mapDbRow(r: any) {
  return { 'ID': r.legacy_id || String(r.id), 'Date': r.entry_date, 'Branch': r.branch, 'Invoice No': r.invoice_no, 'Supplier': r.supplier,
    'Flower': r.flower_name, 'Item Code': r.item_code, 'Origin': r.origin, 'Unit': r.unit, 'Stems per Bunch': r.stems_per_bunch, 'Qty': r.qty,
    'Rate': r.rate, 'Subtotal': r.subtotal, 'Tax%': r.tax_percent, 'Tax': r.tax, 'Amount': r.amount, 'StandardRate': r.standard_rate,
    'Invoice Total': r.invoice_total, 'Received By': r.received_by, 'Type': r.type || 'Flower',
    'Approval Status': r.approval_status || 'Approved', 'Batch': r.batch_ref || '', 'Paper Total': r.paper_total };
}
function arrangementRateMap(flowerRows: any[]) {
  const legacy: Record<string, number> = {}, holland: Record<string, number> = {};
  flowerRows.forEach(r => {
    const key = String(r.flower_name || '').trim().toLowerCase(); if (!key) return;
    const origin = String(r.origin || '').trim();
    if (origin === 'Legacy/Unknown') legacy[key] = Number(r.rate) || 0;
    else if (origin === 'Holland' && !(key in holland)) holland[key] = Number(r.rate) || 0;
  });
  Object.keys(holland).forEach(k => { if (!(k in legacy)) legacy[k] = holland[k]; });
  return legacy;
}
function mapArrangement(a: any, items: any[], rates: Record<string, number>) {
  let totalStems = 0, estValue = 0, unpriced = 0;
  const list = items.map(it => {
    const qty = Number(it.qty) || 0;
    const key = String(it.flower_name || '').trim().toLowerCase();
    const hasRate = key in rates;
    const rate = hasRate ? rates[key] : 0;
    if (!hasRate) unpriced++;
    totalStems += qty; estValue += qty * rate;
    return { flowerName: it.flower_name, qty, rate, hasRate };
  });
  return { id: a.id, arrangementCode: a.arrangement_code, arrangementName: a.arrangement_name, displayName: a.display_name || '',
    florist: a.florist || '', notes: a.notes || '', photoData: a.photo_data || '', createdBy: a.created_by || '', createdDate: a.created_date,
    updatedBy: a.updated_by || '', updatedDate: a.updated_date || '', items: list, totalStems, estValue: Math.round(estValue * 1000) / 1000, unpricedCount: unpriced };
}

// ---------------------------------------------------------------
// SAVE RECEIVING
// ---------------------------------------------------------------
async function processSupplyItem(item: any, ctx: any) {
  const supplyName = item.supplyName;
  let itemCode = item.itemCode || '', unit = item.unit || '';
  const qty = Number(item.qty) || 0, cost = Number(item.cost) || 0;
  const existing = await sbGet('flower_supply_item', `select=*&supply_name=eq.${encodeURIComponent(supplyName)}&status=neq.Inactive`);
  if (existing.length) { itemCode = existing[0].item_code; unit = existing[0].default_unit || unit; }
  else {
    const allSupply = await sbGet('flower_supply_item', 'select=item_code');
    let maxNum = 0;
    allSupply.forEach((r: any) => { const code = String(r.item_code || ''); if (code.slice(0, 3) === 'SUP') { const n = parseInt(code.slice(3), 10); if (!isNaN(n) && n > maxNum) maxNum = n; } });
    itemCode = 'SUP' + String(maxNum + 1).padStart(6, '0');
    await sbPost('flower_supply_item', [{ supply_name: supplyName, item_code: itemCode, default_unit: unit, cost_rate: cost, status: 'Active' }]);
  }
  const subtotal = qty * cost, tax = subtotal * (ctx.taxPercent / 100);
  await sbPost('flower_database', [{ entry_date: ctx.date, branch: ctx.branch, invoice_no: ctx.invoiceNo, supplier: ctx.supplier, flower_name: supplyName,
    item_code: itemCode, origin: '', unit, stems_per_bunch: null, qty, rate: cost, subtotal, tax_percent: ctx.taxPercent, tax, amount: subtotal,
    standard_rate: cost, invoice_total: ctx.invoiceTotal, received_by: ctx.receivedBy, type: 'Supply',
    approval_status: 'Pending', batch_ref: ctx.batchRef, paper_total: ctx.paperTotal }]);
  return { flowerName: supplyName, itemCode, approvalStatus: 'N/A', suggestedRate: cost, finalRate: cost, amount: subtotal, type: 'Supply' };
}
async function processFlowerItem(item: any, ctx: any) {
  let flowerName = String(item.flowerName || '').replace(/\s+/g, ' ').trim(); const origin = item.origin || '';
  let itemCode = item.itemCode || '';
  const unit = item.unit || '', stemsPerBunch = Number(item.stemsPerBunch) || 1, qty = Number(item.qty) || 0, supplierRate = Number(item.supplierRate) || 0;
  const suggestedRate = calculateCompanyRate(supplierRate, unit, stemsPerBunch);
  // Nov 2026: match the name WITHOUT caring about capitals ("gerbera" = "Gerbera"), and keep the existing spelling,
  // so receiving never creates a second copy of the same flower (that split the stock count into two rows).
  const likeName = flowerName.replace(/[\\%_*]/g, (c) => '\\' + c);
  const sameName = (await sbGet('flower_item', `select=*&flower_name=ilike.${encodeURIComponent(likeName)}&order=id.asc`)) || [];
  const canon = sameName.find((r: any) => String(r.status || 'Active') === 'Active') || sameName[0];
  if (canon && canon.flower_name) flowerName = String(canon.flower_name);
  const matchingRows = sameName.filter((r: any) => String(r.flower_name) === flowerName);
  let existingRow: any = null, legacyRate: number | null = null, hollandFallbackRate: number | null = null;
  matchingRows.forEach((r: any) => {
    const rowOrigin = String(r.origin || '').trim();
    if (rowOrigin === String(origin).trim()) { existingRow = r; itemCode = r.item_code; }
    if (rowOrigin === 'Legacy' || rowOrigin === 'Unknown Origin' || rowOrigin === 'Legacy/Unknown') legacyRate = Number(r.rate);
    if (rowOrigin === 'Holland' && hollandFallbackRate === null) hollandFallbackRate = Number(r.rate);
  });
  if (legacyRate === null && hollandFallbackRate !== null) legacyRate = hollandFallbackRate;
  if (!itemCode) itemCode = await generateItemCode(flowerName);

  let approvalStatus = 'Approved';
  const compareRate = legacyRate !== null ? legacyRate : (existingRow ? Number(existingRow.rate) : null);
  // Needs approval only when the suggested rate really differs from the current standard (legacy/holland) rate.
  // Same rate (to 3 decimals) = nothing to approve.
  if (compareRate !== null && !isNaN(compareRate) && compareRate !== 0 && Math.round(suggestedRate * 1000) !== Math.round(compareRate * 1000)) approvalStatus = 'Pending Approval';

  let finalRate: number;
  if (existingRow) {
    finalRate = existingRow.rate;
    await sbPatch('flower_item', `id=eq.${existingRow.id}`, { rate_status: approvalStatus, suggested_rate: suggestedRate, supplier_rate_used: supplierRate, last_updated_date: new Date().toISOString() });
  } else {
    const startingRate = (legacyRate !== null && !isNaN(legacyRate)) ? legacyRate : suggestedRate;
    finalRate = startingRate;
    await sbPost('flower_item', [{ flower_name: flowerName, rate: startingRate, min_stock: 0, item_code: itemCode, origin, unit, stems_per_bunch: stemsPerBunch,
      status: 'Active', created_date: new Date().toISOString(), last_updated_date: new Date().toISOString(), rate_status: approvalStatus,
      suggested_rate: suggestedRate, supplier_rate_used: supplierRate }]);
  }

  const subtotal = qty * supplierRate, tax = subtotal * (ctx.taxPercent / 100);
  // Receiving approval (Nov 2026): saved as Pending — not in stock until an Admin approves the whole invoice.
  const ins = await sbPost('flower_database', [{ entry_date: ctx.date, branch: ctx.branch, invoice_no: ctx.invoiceNo, supplier: ctx.supplier, flower_name: flowerName,
    item_code: itemCode, origin, unit, stems_per_bunch: stemsPerBunch, qty, rate: supplierRate, subtotal, tax_percent: ctx.taxPercent, tax, amount: subtotal,
    standard_rate: finalRate, invoice_total: ctx.invoiceTotal, received_by: ctx.receivedBy, type: 'Flower',
    approval_status: 'Pending', batch_ref: ctx.batchRef, paper_total: ctx.paperTotal }]);
  const sourceId = ins && ins[0] ? ins[0].id : null;

  if (approvalStatus === 'Pending Approval') {
    const diff = suggestedRate - (compareRate || 0);
    const marginPercent = compareRate ? (diff / compareRate) * 100 : 0;
    await sbPost('flower_rate_change_history', [{ change_date: new Date().toISOString(), flower_name: flowerName, origin, item_code: itemCode,
      old_company_rate: compareRate || 0, new_company_rate: suggestedRate, supplier_rate_used: supplierRate, difference: diff, margin_percent: marginPercent,
      margin_status: Math.abs(marginPercent) > 5 ? 'High Change' : 'Normal', approval_status: 'Pending Approval', approved_by: '', remarks: '', source_id: sourceId }]);
  }
  return { flowerName, itemCode, approvalStatus, suggestedRate, finalRate, amount: subtotal, type: 'Flower' };
}
async function saveReceiving(p: Record<string, any>) {
  let items: any[] = [];
  try { items = JSON.parse(p.items || '[]'); } catch { items = []; }
  if (!items.length) return { error: 'No items to save' };
  const taxPercent = Number(p.taxPercent) || 10;
  let invoiceGrandTotal = 0;
  items.forEach(it => { const rate = it.type === 'Supply' ? (Number(it.cost) || 0) : (Number(it.supplierRate) || 0); const qty = Number(it.qty) || 0; const subtotal = qty * rate; invoiceGrandTotal += subtotal + (subtotal * (taxPercent / 100)); });
  const batchRef = 'FR-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const paperTotal = (p.paperTotal === undefined || p.paperTotal === '' || isNaN(Number(p.paperTotal))) ? null : Number(p.paperTotal);
  const ctx = { branch: p.branch, supplier: p.supplier || '', invoiceNo: p.invoiceNo || '', receivedBy: p.receivedBy || '', date: p.date || new Date().toISOString().slice(0, 10), taxPercent, invoiceTotal: invoiceGrandTotal, batchRef, paperTotal };
  const results = [];
  for (const it of items) results.push(it.type === 'Supply' ? await processSupplyItem(it, ctx) : await processFlowerItem(it, ctx));
  return { success: true, results, batchRef, waitingApproval: true };
}
async function editEntry(p: Record<string, any>) {
  const id = p.id, qty = Number(p.qty) || 0, supplierRate = Number(p.supplierRate) || 0, taxPercent = Number(p.taxPercent) || 10;
  const subtotal = qty * supplierRate, tax = subtotal * (taxPercent / 100);
  let query = `legacy_id=eq.${encodeURIComponent(id)}`;
  let existing = await sbGet('flower_database', `select=id&${query}`);
  if (!existing.length && /^\d+$/.test(String(id))) { query = `id=eq.${id}`; existing = await sbGet('flower_database', `select=id&${query}`); }
  if (!existing.length) return { error: 'Entry not found' };
  const upd = await sbPatch('flower_database', query, { entry_date: p.date || null, invoice_no: p.invoiceNo || '', supplier: p.supplier || '', flower_name: p.flowerName || '',
    origin: p.origin || '', unit: p.unit || '', stems_per_bunch: Number(p.stemsPerBunch) || 1, qty, rate: supplierRate, subtotal, tax_percent: taxPercent, tax,
    amount: subtotal, received_by: p.receivedBy || '' });
  // Keep the waiting rate approval of this line in step with the edit (the 19.800 Rose case, Nov 2026).
  const rowId = upd && upd[0] && upd[0].id;
  if (rowId && String(upd[0].type || 'Flower') !== 'Supply') {
    const rc = await sbGet('flower_rate_change_history', `select=id,old_company_rate&approval_status=eq.Pending%20Approval&source_id=eq.${rowId}&limit=1`);
    if (rc.length) {
      const newRate = calculateCompanyRate(supplierRate, p.unit, Number(p.stemsPerBunch) || 1);
      const oldRate = Number(rc[0].old_company_rate) || 0;
      const diff = newRate - oldRate, pct = oldRate ? diff / oldRate * 100 : 0;
      await sbPatch('flower_rate_change_history', `id=eq.${rc[0].id}`, { new_company_rate: newRate, supplier_rate_used: supplierRate, difference: diff, margin_percent: pct, margin_status: Math.abs(pct) > 5 ? 'High Change' : 'Normal' });
    }
  }
  return { success: true };
}

// ---------------------------------------------------------------
// RATE APPROVAL / ITEMS
// ---------------------------------------------------------------
async function approveRejectRate(p: Record<string, any>, action: string) {
  const rowId = Number(p.row);
  if (!Number.isInteger(rowId) || rowId < 1) return { error: 'Invalid row.' };
  const rows = await sbGet('flower_rate_change_history', `select=*&id=eq.${rowId}`);
  if (!rows.length) return { error: 'Rate change not found.' };
  const rc = rows[0];
  if (String(rc.approval_status || '').trim() !== 'Pending Approval') return { error: 'This rate change is no longer pending — it may have already been reviewed.' };
  const newStatus = action === 'approveRate' ? 'Approved' : 'Rejected';
  await sbPatch('flower_rate_change_history', `id=eq.${rowId}`, { approval_status: newStatus, approved_by: p.approvedBy || '' });
  if (action === 'approveRate') {
    await sbPatch('flower_item', `item_code=eq.${encodeURIComponent(rc.item_code)}`, { rate: rc.new_company_rate, rate_status: 'Approved', last_updated_date: new Date().toISOString() });
  } else {
    // Rejected = keep the current company rate as it is (Nov 2026, Bench: "mananatili sa original").
    await sbPatch('flower_item', `item_code=eq.${encodeURIComponent(rc.item_code)}`, { rate_status: 'Approved', last_updated_date: new Date().toISOString() });
  }
  return { success: true };
}
async function addFlowerItem(p: Record<string, any>) {
  const flowerName = (p.flowerName || '').trim();
  if (!flowerName) return { error: 'Flower name is required' };
  const origin = p.origin || '', itemCode = await generateItemCode(flowerName);
  const pendingSuggestedRate = p.pendingSuggestedRate;
  const fields: Record<string, any> = { flower_name: flowerName, origin, item_code: itemCode, unit: p.unit || '', stems_per_bunch: Number(p.stemsPerBunch) || 1,
    rate: Number(p.rate) || 0, min_stock: Number(p.minStock) || 0, status: 'Active', created_date: new Date().toISOString(), last_updated_date: new Date().toISOString() };
  if (pendingSuggestedRate !== undefined && pendingSuggestedRate !== '') { fields.rate_status = 'Pending Approval'; fields.suggested_rate = Number(pendingSuggestedRate) || 0; fields.supplier_rate_used = Number(p.hollandOdooPrice) || 0; }
  else { fields.rate_status = 'Approved'; fields.suggested_rate = Number(p.rate) || 0; fields.supplier_rate_used = Number(p.rate) || 0; }
  await sbPost('flower_item', [fields]);
  return { success: true, itemCode };
}
async function updateFlowerRates(p: Record<string, any>) {
  let updates: any[] = [];
  try { updates = JSON.parse(p.updates || '[]'); } catch { updates = []; }
  let updatedCount = 0;
  for (const u of updates) { if (!u.itemCode) continue; const result = await sbPatch('flower_item', `item_code=eq.${encodeURIComponent(u.itemCode)}`, { rate: Number(u.newRate) || 0, last_updated_date: new Date().toISOString() }); if (result.length) updatedCount++; }
  return { success: true, updated: updatedCount };
}
async function setMinStockBulk(p: Record<string, any>) {
  let updates: any[] = [];
  try { updates = JSON.parse(p.updates || '[]'); } catch { updates = []; }
  let appliedCount = 0, skippedCount = 0;
  for (const u of updates) {
    const rowId = Number(u.row);
    if (!Number.isInteger(rowId) || rowId < 1) { skippedCount++; continue; }
    const value = (u.minStock === '' || u.minStock === null) ? null : Number(u.minStock);
    const result = await sbPatch('flower_item', `id=eq.${rowId}`, { min_stock: value });
    if (result.length) appliedCount++; else skippedCount++;
  }
  return { success: true, updated: appliedCount, skipped: skippedCount };
}

// ---------------------------------------------------------------
// RECEIVING APPROVAL (Nov 2026): a saved invoice waits here until an Admin approves it.
// Approve = goes into stock + its rate changes are approved together. Reject = never counts.
// ---------------------------------------------------------------
// Old receiving (before Nov 2026) has no batch_ref: group it by branch + date + invoice instead.
const batchKey = (r: any) => String(r.batch_ref || (r.invoice_no ? 'INV|' + r.branch + '|' + r.entry_date + '|' + r.invoice_no : 'ROW-' + r.id));
async function getPendingReceiving(p: Record<string, any>) {
  // status: Pending (default) | History = approved + rejected of the last N days (to edit old mistakes).
  const history = String(p.status || '') === 'History';
  const days = Math.min(120, Math.max(1, parseInt(p.days, 10) || 30));
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  let q = history ? `select=*&approval_status=neq.Pending&entry_date=gte.${since}&order=id.desc&limit=400` : 'select=*&approval_status=eq.Pending&order=id.asc';
  if (p.batch) q += `&batch_ref=eq.${encodeURIComponent(String(p.batch))}`;
  const rows = await sbGet('flower_database', q);
  // Rate approval lives on this page too (Nov 2026, Bench): pending company-rate changes that are ready to decide
  // (loose ones, or ones whose receiving is already approved = in stock).
  const rates: any[] = [];
  if (!history && !p.batch) {
    const rr = await sbGet('flower_rate_change_history', 'select=id,source_id,flower_name,origin,item_code,old_company_rate,new_company_rate,supplier_rate_used,change_date&approval_status=eq.Pending%20Approval&order=id.asc&limit=100');
    const sids = rr.filter((r: any) => r.source_id).map((r: any) => Number(r.source_id));
    const src = sids.length ? await sbGet('flower_database', `select=id,branch,supplier,invoice_no,entry_date,unit,approval_status&id=in.(${sids.join(',')})`) : [];
    const sBy: Record<string, any> = {}; src.forEach((r: any) => { sBy[r.id] = r; });
    rr.forEach((r: any) => {
      const s0 = r.source_id ? sBy[r.source_id] : null;
      if (r.source_id && (!s0 || s0.approval_status !== 'Approved')) return;
      rates.push({ id: r.id, flower: r.flower_name || '', origin: r.origin || '', oldRate: Number(r.old_company_rate) || 0, newRate: Number(r.new_company_rate) || 0,
        supplierRate: Number(r.supplier_rate_used) || 0, date: s0 ? s0.entry_date : r.change_date, branch: s0 ? s0.branch : '', supplier: s0 ? s0.supplier : '', invoiceNo: s0 ? s0.invoice_no : '', unit: s0 ? s0.unit : '' });
    });
  }
  if (!rows.length) return { success: true, batches: [], rates };
  const ids = rows.map((r: any) => r.id);
  const [rcs, hist] = await Promise.all([
    sbGet('flower_rate_change_history', `select=id,source_id,old_company_rate,new_company_rate&approval_status=eq.Pending%20Approval&source_id=in.(${ids.join(',')})`),
    sbGet('flower_database', 'select=id,supplier,flower_name,origin,unit,stems_per_bunch,rate,entry_date&approval_status=eq.Approved&order=id.desc&limit=600'),
  ]);
  const rcBy: Record<string, any> = {}; rcs.forEach((r: any) => { rcBy[r.source_id] = r; });
  const low = (v: any) => String(v || '').trim().toLowerCase();
  const out: Record<string, any> = {};
  for (const r of rows) {
    const k = batchKey(r);
    const b = out[k] = out[k] || { batch: k, kind: 'flower', branch: r.branch, date: r.entry_date, supplier: r.supplier || '', invoiceNo: r.invoice_no || '', receivedBy: r.received_by || '', paperTotal: r.paper_total == null ? null : Number(r.paper_total), taxPercent: Number(r.tax_percent) || 10, lines: [], typedSubtotal: 0,
      status: r.approval_status || 'Approved', approvedBy: r.approved_by || '', approvedAt: r.approved_at || '' };
    const same = hist.filter((h: any) => h.id !== r.id && h.id < r.id && low(h.supplier) === low(r.supplier) && low(h.flower_name) === low(r.flower_name) && low(h.unit) === low(r.unit) && (!r.origin || low(h.origin) === low(r.origin)));
    const warns: string[] = [];
    if (r.type !== 'Supply') {
      const last = same.find((h: any) => Number(h.stems_per_bunch) > 1);
      if (low(r.unit) === 'bunch' && last && Number(last.stems_per_bunch) !== Number(r.stems_per_bunch)) warns.push(`Stems ${Number(r.stems_per_bunch)} — last time ${Number(last.stems_per_bunch)}`);
      const rates = same.map((h: any) => Number(h.rate) || 0).filter((x: number) => x > 0);
      if (rates.length) { const mn = Math.min(...rates), mx = Math.max(...rates); if (Number(r.rate) > mx * 1.5 || Number(r.rate) < mn * 0.5) warns.push(`Price ${Number(r.rate).toFixed(3)} — usual ${mn.toFixed(3)}–${mx.toFixed(3)}`); }
    }
    const rc = rcBy[r.id];
    b.lines.push({ id: r.id, type: r.type || 'Flower', name: r.flower_name, origin: r.origin || '', unit: r.unit || '', stems: Number(r.stems_per_bunch) || null, qty: Number(r.qty) || 0, rate: Number(r.rate) || 0, subtotal: Number(r.subtotal) || 0,
      rateChange: rc ? { oldRate: Number(rc.old_company_rate) || 0, newRate: Number(rc.new_company_rate) || 0 } : null, warnings: warns });
    b.typedSubtotal += Number(r.subtotal) || 0;
  }
  const batches = Object.values(out).map((b: any) => { b.typedTotal = Math.round(b.typedSubtotal * (1 + b.taxPercent / 100) * 1000) / 1000; b.tally = b.paperTotal == null ? null : Math.abs(b.typedTotal - b.paperTotal) <= 0.01; return b; });
  return { success: true, batches, rates };
}
async function decideReceiving(p: Record<string, any>, authUser: any, approve: boolean) {
  const batch = String(p.batch || '').trim();
  if (!batch) return { success: false, error: 'No receiving selected.' };
  const filter = batch.startsWith('ROW-') ? `id=eq.${Number(batch.slice(4)) || 0}` : `batch_ref=eq.${encodeURIComponent(batch)}`;
  const who = currentUserName(authUser);
  const done = await sbPatch('flower_database', `${filter}&approval_status=eq.Pending`, { approval_status: approve ? 'Approved' : 'Rejected', approved_by: who, approved_at: new Date().toISOString() });
  if (!done.length) return { success: false, error: 'This receiving was already checked by someone else.' };
  const ids = done.map((r: any) => r.id);
  // Nov 2026 (Bench): approving a receiving adds stock ONLY. Its rate change stays Pending and is approved
  // separately in Rate Approval, like before. Rejecting a receiving also rejects its rate change (no stock = no new rate).
  if (approve) return { success: true, lines: done.length, rates: 0 };
  const rcs = await sbGet('flower_rate_change_history', `select=id&approval_status=eq.Pending%20Approval&source_id=in.(${ids.join(',')})`);
  for (const rc of rcs) await approveRejectRate({ row: rc.id, approvedBy: who }, 'rejectRate');
  return { success: true, lines: done.length, rates: rcs.length };
}

// ---------------------------------------------------------------
// STOCK COUNT
// ---------------------------------------------------------------
async function saveStockCount(p: Record<string, any>) {
  const branch = p.branch, dateStr = p.date;
  let items: any[] = [];
  try { items = JSON.parse(p.items || '[]'); } catch { items = []; }
  const countedBy = p.countedBy || '';
  if (!branch || !dateStr || !items.length) return { error: 'Missing branch, date, or items' };
  const countDate = new Date(dateStr); countDate.setHours(0, 0, 0, 0);

  const [allHist, allDb, allTransfers, allFulfillments, allActiveItems] = await Promise.all([
    sbGet('flower_stock_history', 'select=*&item_code=eq.CONSOLIDATED'),
    sbGet('flower_database', 'select=*&approval_status=eq.Approved'),
    sbGet('flower_transfer_history', 'select=*'),
    sbGet('flower_arrangement_fulfillments', 'select=*'),
    sbGet('flower_item', 'select=flower_name,origin,rate,status&status=eq.Active'),
  ]);
  const rateByFlowerLower: Record<string, number> = {};
  {
    const hollandFallback: Record<string, number> = {};
    allActiveItems.forEach((r: any) => { const nameLower = String(r.flower_name || '').trim().toLowerCase(); const origin = String(r.origin || '').trim(); if (origin === 'Legacy/Unknown') rateByFlowerLower[nameLower] = Number(r.rate) || 0; else if (origin === 'Holland' && !(nameLower in hollandFallback)) hollandFallback[nameLower] = Number(r.rate) || 0; });
    Object.keys(hollandFallback).forEach(nameLower => { if (!(nameLower in rateByFlowerLower)) rateByFlowerLower[nameLower] = hollandFallback[nameLower]; });
  }
  function transferQtySince(branch: string, flowerNameLower: string, direction: string, fromExclusive: Date, toInclusive: Date) {
    let total = 0;
    allTransfers.forEach((row: any) => { const branchVal = direction === 'In' ? row.to_branch : row.from_branch; if (String(branchVal || '').trim() !== branch) return; if (String(row.flower_name || '').trim().toLowerCase() !== flowerNameLower) return; const d = row.transfer_date ? new Date(row.transfer_date) : null; if (!d || isNaN(d.getTime())) return; if (!(d > fromExclusive && d <= toInclusive)) return; total += Number(row.qty) || 0; });
    return total;
  }
  function fulfilledQtySince(branch: string, flowerNameLower: string, fromExclusive: Date, toInclusive: Date) {
    let total = 0;
    allFulfillments.forEach((row: any) => { if (String(row.branch || '').trim() !== branch) return; if (String(row.flower_name || '').trim().toLowerCase() !== flowerNameLower) return; const d = row.fulfilled_date ? new Date(row.fulfilled_date) : null; if (!d || isNaN(d.getTime())) return; if (!(d > fromExclusive && d <= toInclusive)) return; total += Number(row.qty) || 0; });
    return total;
  }

  const results: any[] = [];
  let savedCount = 0;

  for (const item of items) {
    const flowerName = String(item.flowerName || '').trim();
    if (!flowerName) continue;
    const rawCount = item.physicalCount;
    const hasPhysical = rawCount !== '' && rawCount !== null && rawCount !== undefined && !isNaN(rawCount);
    const wastageVal = Number(item.wastage) || 0;
    const hasWastageOnly = !hasPhysical && wastageVal > 0;
    if (!hasPhysical && !hasWastageOnly) continue;
    const physicalCount = hasPhysical ? Number(rawCount) : 0;
    const flowerNameLower = flowerName.toLowerCase();

    let found = false, lastDate: Date | null = null, openingStock = 0;
    allHist.forEach((row: any) => { if (String(row.branch || '').trim() !== branch) return; if (String(row.flower_name || '').trim().toLowerCase() !== flowerNameLower) return; const rDate = row.count_date ? new Date(row.count_date) : null; if (!rDate || isNaN(rDate.getTime()) || !(rDate < countDate)) return; if (!found || rDate > (lastDate as Date)) { found = true; lastDate = rDate; openingStock = Number(row.physical_count) || 0; } });

    let purchasedQty = 0, transferIn = 0, transferOut = 0, fulfilledQty = 0, expectedStock = 0, stockUsed = 0, variance = 0, countType = '';
    if (hasPhysical) {
      if (found) {
        const fromDate = lastDate as Date;
        allDb.forEach((dbRow: any) => { if (dbRow.type === 'Supply') return; if (String(dbRow.branch || '').trim() !== branch) return; if (String(dbRow.flower_name || '').trim().toLowerCase() !== flowerNameLower) return; const d = dbRow.entry_date ? new Date(dbRow.entry_date) : null; if (!d || isNaN(d.getTime()) || !(d > fromDate && d <= countDate)) return; purchasedQty += getStockEquivalent(dbRow.qty, dbRow.unit, dbRow.stems_per_bunch); });
        transferIn = transferQtySince(branch, flowerNameLower, 'In', fromDate, countDate);
        transferOut = transferQtySince(branch, flowerNameLower, 'Out', fromDate, countDate);
        fulfilledQty = fulfilledQtySince(branch, flowerNameLower, fromDate, countDate);
        expectedStock = openingStock + purchasedQty + transferIn - transferOut - fulfilledQty;
        stockUsed = expectedStock - physicalCount - wastageVal;
        variance = physicalCount - expectedStock;
        countType = 'Saturday Stock Count';
      } else countType = 'Baseline';
    } else countType = 'Wastage Only';

    const standardRate = rateByFlowerLower[flowerNameLower] || 0;
    const stockValue = hasPhysical ? physicalCount * standardRate : 0;
    const dateOnly = countDate.toISOString().slice(0, 10);
    const existing = allHist.filter((row: any) => { const rd = row.count_date ? new Date(row.count_date) : null; return rd && !isNaN(rd.getTime()) && rd.toISOString().slice(0, 10) === dateOnly && String(row.branch || '').trim() === branch && String(row.flower_name || '').trim().toLowerCase() === flowerNameLower; });

    const payload = { count_date: countDate.toISOString(), branch, flower_name: flowerName, opening_stock: openingStock, purchased_qty: purchasedQty,
      expected_stock: expectedStock, physical_count: physicalCount, stock_used: stockUsed, variance, wastage: wastageVal, stock_value: stockValue,
      count_type: countType, transfer_in: transferIn, transfer_out: transferOut, fulfilled_qty: fulfilledQty, item_code: 'CONSOLIDATED', origin: 'CONSOLIDATED',
      rate_at_count: standardRate, contributing_item_codes: item.contributingItemCodes || '', counted_by: countedBy };

    if (existing.length) await sbPatch('flower_stock_history', `id=eq.${existing[0].id}`, payload);
    else await sbPost('flower_stock_history', [payload]);

    savedCount++;
    results.push({ flowerName, countType, openingStock, purchasedQty, expectedStock, physicalCount, stockUsed, variance, stockValue, standardRate });
  }
  return { success: true, savedCount, results };
}
async function getStockCountByDate(p: Record<string, any>) {
  const branch = p.branch, dateStr = p.date;
  const targetDate = new Date(dateStr); targetDate.setHours(0, 0, 0, 0);
  const dateOnly = targetDate.toISOString().slice(0, 10);
  const rows = await sbGet('flower_stock_history', `select=*&branch=eq.${encodeURIComponent(branch)}`);
  const filtered = rows.filter((row: any) => { const d = row.count_date ? new Date(row.count_date) : null; return d && !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateOnly; });
  return filtered.map((r: any) => ({ Date: r.count_date, Branch: r.branch, Flower: r.flower_name, 'Opening Stock': r.opening_stock, 'Purchased Qty': r.purchased_qty,
    'Expected Stock': r.expected_stock, 'Physical Count': r.physical_count, 'Stock Used': r.stock_used, Variance: r.variance, Wastage: r.wastage, 'Stock Value': r.stock_value,
    'Count Type': r.count_type, 'Transfer In': r.transfer_in, 'Transfer Out': r.transfer_out, 'Item Code': r.item_code, Origin: r.origin, 'Rate At Count': r.rate_at_count,
    'Contributing Item Codes': r.contributing_item_codes, 'Counted By': r.counted_by }));
}
async function saveTransfer(p: Record<string, any>) {
  const fromBranch = p.fromBranch, toBranch = p.toBranch, flowerName = p.flowerName, qty = Number(p.qty) || 0;
  const remarks = p.remarks || '', transferredBy = p.transferredBy || '', dateStr = p.date || new Date().toISOString().slice(0, 10);
  if (!fromBranch || !toBranch || !flowerName || qty <= 0) return { error: 'From Branch, To Branch, Flower and Qty > 0 are required.' };
  if (fromBranch === toBranch) return { error: 'From and To Branch cannot be the same.' };
  const counter = await sbRpc('get_next_flower_counter', { counter_key: 'Next Transfer No', start_at: 1 });
  const transferNo = 'TRF-' + String(counter).padStart(5, '0');
  const rate = await getStrictLegacyMasterRate(flowerName);
  const value = qty * rate;
  await sbPost('flower_transfer_history', [{ transfer_date: dateStr, transfer_no: transferNo, from_branch: fromBranch, to_branch: toBranch, flower_name: flowerName, qty, remarks, transferred_by: transferredBy, rate_legacy: rate, value }]);
  return { success: true, transferNo, rate, value };
}

// ---------------------------------------------------------------
// WEEKLY BUDGET
// ---------------------------------------------------------------
async function getWeeklyBudget(p: Record<string, any>) {
  const branch = p.branch;
  const budgetRows = await sbGet('flower_budgets', `select=*&branch=eq.${encodeURIComponent(branch)}`);
  const weeklyLimit = budgetRows.length ? (Number(budgetRows[0].weekly_budget) || 350) : 350;
  const nowBH = new Date(Date.now() + 3 * 3600 * 1000);
  const now = new Date(Date.UTC(nowBH.getUTCFullYear(), nowBH.getUTCMonth(), nowBH.getUTCDate())); const day = now.getDay();
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(now.getDate() - day);
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
  const dbRows = await sbGet('flower_database', `select=amount,entry_date&approval_status=neq.Rejected&branch=eq.${encodeURIComponent(branch)}`);
  let actual = 0;
  dbRows.forEach((r: any) => { const d = new Date(r.entry_date); if (isNaN(d.getTime()) || d < start || d > end) return; actual += Number(r.amount) || 0; });
  return { branch, weeklyLimit, actual, remaining: weeklyLimit - actual, percentUsed: weeklyLimit > 0 ? Math.round((actual / weeklyLimit) * 100) : 0 };
}

// ---------------------------------------------------------------
// DASHBOARD (unchanged from earlier slice)
// ---------------------------------------------------------------
async function getFlowerDashboard(selBranch: string) {
  const branches = ['ModaMall', 'Hamala', 'Galali'];
  const activeBranches = selBranch === 'All' ? branches : [selBranch];
  const [dbRows, itemRows, histRows, transferRows, budgetRows, rateRows, fulfillmentRows] = await Promise.all([
    sbGetAll('flower_database', 'select=*&approval_status=neq.Rejected&order=id.asc'), sbGet('flower_item', 'select=*&status=eq.Active'), sbGetAll('flower_stock_history', 'select=*&order=id.asc'),
    sbGetAll('flower_transfer_history', 'select=*&order=id.asc'), sbGet('flower_budgets', 'select=*'), sbGet('flower_rate_change_history', 'select=*'),
    sbGetAll('flower_arrangement_fulfillments', 'select=*&order=id.asc'),
  ]);
  const dbFlowerRows = dbRows.filter((r: any) => r.type !== 'Supply');
  const flowerMaster: Record<string, { legacyRate: number; minStock: number | null; unit: string }> = {};
  itemRows.forEach((r: any) => { const name = String(r.flower_name || '').trim(); const origin = String(r.origin || '').trim(); if (!name) return; if (origin === 'Legacy/Unknown') flowerMaster[name] = { legacyRate: Number(r.rate) || 0, minStock: r.min_stock === null ? null : Number(r.min_stock), unit: r.unit || '' }; else if (origin === 'Holland' && !flowerMaster[name]) flowerMaster[name] = { legacyRate: Number(r.rate) || 0, minStock: r.min_stock === null ? null : Number(r.min_stock), unit: r.unit || '' }; });
  const distinctFlowerCount = Object.keys(flowerMaster).length;
  const now = new Date();
  // 'today' / this week are Bahrain (UTC+3) days, not the server's UTC day.
  const nowBH = new Date(Date.now() + 3 * 3600 * 1000);
  const today = new Date(Date.UTC(nowBH.getUTCFullYear(), nowBH.getUTCMonth(), nowBH.getUTCDate()));
  const { start: weekStart, end: weekEnd } = getWeekRange(today);
  const lastConsolidatedIndex: Record<string, { found: boolean; lastDate: Date; qty: number }> = {};
  histRows.forEach((row: any) => { if (String(row.item_code || '').trim() !== 'CONSOLIDATED') return; const branch = String(row.branch || '').trim(); const flower = String(row.flower_name || '').trim(); if (!branch || !flower) return; const d = row.count_date ? new Date(row.count_date) : null; if (!d || isNaN(d.getTime()) || d > now) return; const key = branch + '|' + flower; const prev = lastConsolidatedIndex[key]; if (!prev || d > prev.lastDate) lastConsolidatedIndex[key] = { found: true, lastDate: d, qty: Number(row.physical_count) || 0 }; });
  const purchasedIndex: Record<string, number> = {}, purchasedCostIndex: Record<string, number> = {};
  dbFlowerRows.forEach((row: any) => { if (String(row.approval_status || 'Approved') !== 'Approved') return; const branch = String(row.branch || '').trim(); const flower = String(row.flower_name || '').trim(); if (!branch || !flower || activeBranches.indexOf(branch) === -1) return; const d = row.entry_date ? new Date(row.entry_date) : null; if (!d || isNaN(d.getTime()) || d > now) return; const key = branch + '|' + flower; const last = lastConsolidatedIndex[key]; const fromDate = last ? last.lastDate : new Date(0); if (!(d > fromDate && d <= now)) return; const qty = Number(row.qty) || 0; const stockQty = getStockEquivalent(qty, row.unit, row.stems_per_bunch); const rate = Number(row.rate) || 0; const companyCost = qty * rate * 3 * 1.10; purchasedIndex[key] = (purchasedIndex[key] || 0) + stockQty; purchasedCostIndex[key] = (purchasedCostIndex[key] || 0) + companyCost; });
  const transferIndex: Record<string, { In: number; Out: number }> = {};
  transferRows.forEach((row: any) => { const d = row.transfer_date ? new Date(row.transfer_date) : null; if (!d || isNaN(d.getTime()) || d > now) return; const flower = String(row.flower_name || '').trim(); const qty = Number(row.qty) || 0; if (!flower || !qty) return; const toBranch = String(row.to_branch || '').trim(); if (toBranch && activeBranches.indexOf(toBranch) !== -1) { const key = toBranch + '|' + flower; const last = lastConsolidatedIndex[key]; if (d > (last ? last.lastDate : new Date(0))) { transferIndex[key] = transferIndex[key] || { In: 0, Out: 0 }; transferIndex[key].In += qty; } } const fromBranch = String(row.from_branch || '').trim(); if (fromBranch && activeBranches.indexOf(fromBranch) !== -1) { const key = fromBranch + '|' + flower; const last = lastConsolidatedIndex[key]; if (d > (last ? last.lastDate : new Date(0))) { transferIndex[key] = transferIndex[key] || { In: 0, Out: 0 }; transferIndex[key].Out += qty; } } });
  // Transfers in the selected scope (a transfer counts once even if both its branches are in scope), by transfer number.
  const trTodaySet = new Set<string>(), trWeekSet = new Set<string>();
  let lastTransfer: any = null, lastTransferDate: Date | null = null;
  transferRows.forEach((row: any) => {
    const d = row.transfer_date ? new Date(row.transfer_date) : null; if (!d || isNaN(d.getTime())) return;
    const inScope = activeBranches.indexOf(String(row.to_branch || '').trim()) !== -1 || activeBranches.indexOf(String(row.from_branch || '').trim()) !== -1; if (!inScope) return;
    const no = String(row.transfer_no || row.id);
    if (d.getTime() === today.getTime()) trTodaySet.add(no);
    if (d >= weekStart && d <= weekEnd) trWeekSet.add(no);
    if (d <= today && (!lastTransferDate || d > lastTransferDate)) { lastTransferDate = d; lastTransfer = { Date: row.transfer_date, Flower: row.flower_name, Qty: row.qty, From: row.from_branch, To: row.to_branch }; }
  });
  const fulfillmentIndex: Record<string, number> = {};
  fulfillmentRows.forEach((row: any) => { const d = row.fulfilled_date ? new Date(row.fulfilled_date) : null; if (!d || isNaN(d.getTime()) || d > now) return; const branch = String(row.branch || '').trim(); const flower = String(row.flower_name || '').trim(); const qty = Number(row.qty) || 0; if (!branch || !flower || !qty || activeBranches.indexOf(branch) === -1) return; const key = branch + '|' + flower; const last = lastConsolidatedIndex[key]; if (d > (last ? last.lastDate : new Date(0))) fulfillmentIndex[key] = (fulfillmentIndex[key] || 0) + qty; });
  const availableStockCache: Record<string, number> = {};
  function availableStock(branch: string, flowerName: string) { const key = branch + '|' + flowerName; if (key in availableStockCache) return availableStockCache[key]; const last = lastConsolidatedIndex[key]; const opening = last ? last.qty : 0; const purchased = purchasedIndex[key] || 0; const transfers = transferIndex[key] || { In: 0, Out: 0 }; const fulfilled = fulfillmentIndex[key] || 0; const result = opening + purchased + transfers.In - transfers.Out - fulfilled; availableStockCache[key] = result; return result; }
  function availableStockRawCost(branch: string, flowerName: string) { return purchasedCostIndex[branch + '|' + flowerName] || 0; }
  const availableByFlower: Record<string, number> = {};
  Object.keys(flowerMaster).forEach(name => { let total = 0; activeBranches.forEach(b => { total += availableStock(b, name); }); availableByFlower[name] = total; });
  let currentAvailableFlowers = 0, companyInventoryValue = 0, currentInventoryCost = 0;
  Object.keys(availableByFlower).forEach(name => { const qty = availableByFlower[name]; currentAvailableFlowers += qty; companyInventoryValue += qty * (flowerMaster[name].legacyRate || 0); activeBranches.forEach(b => { currentInventoryCost += availableStockRawCost(b, name); }); });
  const standardX3Reference = currentInventoryCost * 3;
  const itemStockLevels = Object.keys(availableByFlower).map(name => ({ name, stock: availableByFlower[name], unit: (flowerMaster[name] && flowerMaster[name].unit) || '' })).sort((a, b) => a.name.localeCompare(b.name));
  let todayPurchases = 0, weekPurchases = 0, newReceivedThisWeekQty = 0;
  const weekAmountByBranch: Record<string, number> = { ModaMall: 0, Hamala: 0, Galali: 0 };
  const recentReceiving: any[] = [];
  dbFlowerRows.forEach((row: any) => { const branchVal = String(row.branch || '').trim(); const d = row.entry_date ? new Date(row.entry_date) : null; const subtotal = Number(row.subtotal) || 0; const tax = Number(row.tax) || 0; const amountWithVat = subtotal + tax; if (activeBranches.indexOf(branchVal) === -1) return; if (!d || isNaN(d.getTime())) return; if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()) todayPurchases += amountWithVat; if (d >= weekStart && d <= weekEnd) { weekPurchases += amountWithVat; newReceivedThisWeekQty += getStockEquivalent(row.qty, row.unit, row.stems_per_bunch); } recentReceiving.push({ Date: row.entry_date, Flower: row.flower_name, Origin: row.origin, Branch: branchVal, Qty: row.qty, Unit: row.unit, Subtotal: subtotal, Supplier: row.supplier, 'Received By': row.received_by }); });
  // Supplies (Oasis foam, ribbon...) are money spent too: they count in today's / this week's purchases (incl. VAT),
  // but not in the stems/pieces count or the recent-receiving flower list.
  dbRows.forEach((row: any) => { if (row.type !== 'Supply') return; const branchVal = String(row.branch || '').trim(); const d = row.entry_date ? new Date(row.entry_date) : null; if (activeBranches.indexOf(branchVal) === -1 || !d || isNaN(d.getTime())) return; const amountWithVat = (Number(row.subtotal) || 0) + (Number(row.tax) || 0); if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()) todayPurchases += amountWithVat; if (d >= weekStart && d <= weekEnd) weekPurchases += amountWithVat; recentReceiving.push({ Date: row.entry_date, Flower: row.flower_name, Origin: '', Branch: branchVal, Qty: row.qty, Unit: row.unit, Subtotal: Number(row.subtotal) || 0, Supplier: row.supplier, 'Received By': row.received_by, Type: 'Supply', Invoice: row.invoice_no || '' }); });
  // Weekly budget = supplier cost (qty x unit cost, no VAT), same as the receiving page; supplies count too.
  dbRows.forEach((row: any) => { const bv = String(row.branch || '').trim(); const d = row.entry_date ? new Date(row.entry_date) : null; if (branches.indexOf(bv) !== -1 && d && !isNaN(d.getTime()) && d >= weekStart && d <= weekEnd) weekAmountByBranch[bv] += Number(row.amount) || 0; });
  recentReceiving.sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime());
  const recentReceivingTop = recentReceiving.slice(0, 15);
  const limitByBranch: Record<string, number> = { ModaMall: 350, Hamala: 350, Galali: 350 };
  budgetRows.forEach((r: any) => { const bName = String(r.branch || '').trim(); if (bName in limitByBranch) limitByBranch[bName] = Number(r.weekly_budget) || 350; });
  const weeklyLimit = activeBranches.reduce((s, b) => s + limitByBranch[b], 0);
  const actualBudget = activeBranches.reduce((s, b) => s + weekAmountByBranch[b], 0);
  const pctUsed = weeklyLimit > 0 ? Math.round((actualBudget / weeklyLimit) * 100) : 0;
  const weeklyBudget = { weeklyLimit, actual: actualBudget, remaining: weeklyLimit - actualBudget, percentUsed: pctUsed, status: pctUsed >= 100 ? 'OVER BUDGET' : (pctUsed >= 85 ? 'WARNING' : 'OK') };
  let usedThisWeekQty = 0, usedCostThisWeek = 0, wastedThisWeekQty = 0, wastedCostThisWeek = 0;
  histRows.forEach((row: any) => { const branchVal = String(row.branch || '').trim(); if (activeBranches.indexOf(branchVal) === -1) return; if (String(row.item_code || '').trim() !== 'CONSOLIDATED') return; const d = row.count_date ? new Date(row.count_date) : null; if (!d || isNaN(d.getTime()) || !(d >= weekStart && d <= weekEnd)) return; const flowerName = String(row.flower_name || '').trim(); const rate = (flowerMaster[flowerName] && flowerMaster[flowerName].legacyRate) || 0; const used = Number(row.stock_used) || 0; const waste = Number(row.wastage) || 0; usedThisWeekQty += used; usedCostThisWeek += used * rate; wastedThisWeekQty += waste; wastedCostThisWeek += waste * rate; });
  let lastPurchase: any = null;
  dbFlowerRows.forEach((row: any) => { const d = row.entry_date ? new Date(row.entry_date) : null; if (!d || isNaN(d.getTime())) return; if (!lastPurchase || d > new Date(lastPurchase.Date)) lastPurchase = { Date: row.entry_date, Supplier: row.supplier, Flower: row.flower_name, Qty: row.qty }; });
  let lastStockCount: any = null;
  { let bestDate: Date | null = null; const scopeBranches = selBranch === 'All' ? branches : [selBranch]; scopeBranches.forEach(b => { let localBestDate: Date | null = null, totalPhysical = 0, totalWastage = 0, totalCost = 0; histRows.forEach((row: any) => { if (String(row.branch || '').trim() !== b) return; if (String(row.item_code || '').trim() !== 'CONSOLIDATED') return; const d = row.count_date ? new Date(row.count_date) : null; if (!d || isNaN(d.getTime())) return; if (!localBestDate || d > localBestDate) localBestDate = d; }); if (localBestDate) { histRows.forEach((row: any) => { if (String(row.branch || '').trim() !== b) return; if (String(row.item_code || '').trim() !== 'CONSOLIDATED') return; const d = row.count_date ? new Date(row.count_date) : null; if (!d || isNaN(d.getTime()) || d.getTime() !== (localBestDate as Date).getTime()) return; const flowerName = String(row.flower_name || '').trim(); const rate = (flowerMaster[flowerName] && flowerMaster[flowerName].legacyRate) || 0; totalPhysical += Number(row.physical_count) || 0; totalWastage += Number(row.wastage) || 0; totalCost += (Number(row.physical_count) || 0) * rate; }); if (!bestDate || localBestDate > bestDate) { bestDate = localBestDate; lastStockCount = { Branch: b, Date: (localBestDate as Date).toISOString(), TotalPhysicalCount: totalPhysical, TotalWastage: totalWastage, TotalCostLegacyRate: totalCost }; } } }); }
  const approvedSrc = new Set<number>(dbRows.filter((d: any) => d.approval_status === 'Approved').map((d: any) => Number(d.id)));
  const pendingApprovals = rateRows.filter((r: any) => String(r.approval_status || '').trim() === 'Pending Approval' && (!r.source_id || approvedSrc.has(Number(r.source_id)))).map((r: any) => { const matchItem = itemRows.find((ir: any) => String(ir.item_code || '').trim() === String(r.item_code || '').trim()); const unit = matchItem ? (matchItem.unit || '') : ''; const oldRate = Number(r.old_company_rate) || 0; const newRate = Number(r.new_company_rate) || 0; const diff = Number(r.difference) || (newRate - oldRate); const pctDiff = oldRate !== 0 ? diff / oldRate : 0; return { Row: r.id, Flower: r.flower_name, Origin: r.origin, ItemCode: r.item_code, Unit: unit, CurrentRate: oldRate, SupplierRateUsed: Number(r.supplier_rate_used) || 0, Difference: diff, PercentDiff: pctDiff, SuggestedRate: newRate, MarginAmt: diff, MarginPercent: Number(r.margin_percent) || 0, MarginStatus: r.margin_status || '', ApprovalStatus: 'PENDING' }; });
  const pendingApprovalsCount = pendingApprovals.length;
  const branchSummary = branches.map(b => { let branchAvailable = 0, branchValue = 0, lowStockCount = 0; Object.keys(flowerMaster).forEach(name => { const qty = availableStock(b, name); branchAvailable += qty; branchValue += qty * (flowerMaster[name].legacyRate || 0); const minStock = flowerMaster[name].minStock; if (minStock !== null && minStock > 0 && qty < minStock) lowStockCount++; }); let lastCountDate = 'Never'; let bestDate: Date | null = null; histRows.forEach((row: any) => { if (String(row.branch || '').trim() !== b) return; const d = row.count_date ? new Date(row.count_date) : null; if (!d || isNaN(d.getTime())) return; if (!bestDate || d > bestDate) bestDate = d; }); if (bestDate) lastCountDate = (bestDate as Date).toISOString(); const limit = limitByBranch[b]; const actual = weekAmountByBranch[b]; const pct = limit > 0 ? Math.round((actual / limit) * 100) : 0; return { branch: b, availableFlowers: branchAvailable, inventoryValue: branchValue, lowStockItems: lowStockCount, lastStockCount: lastCountDate, weeklyBudget: limit, actualThisWeek: actual, percentUsed: pct, status: pct >= 100 ? 'OVER BUDGET' : (pct >= 85 ? 'WARNING' : 'OK') }; });
  const lowStockList: any[] = [];
  activeBranches.forEach(b => { Object.keys(flowerMaster).forEach(name => { const minStock = flowerMaster[name].minStock; if (minStock === null || minStock <= 0) return; const qty = availableStock(b, name); if (qty < minStock) lowStockList.push({ Flower: name, Branch: b, AvailableQty: qty, MinStock: minStock }); }); });
  lowStockList.sort((a, b) => (a.AvailableQty - a.MinStock) - (b.AvailableQty - b.MinStock));
  return { branch: selBranch, topSummary: { currentAvailableFlowers, newReceivedThisWeekQty, companyInventoryValue, currentInventoryCost, standardX3Reference, todayPurchases, todaysTransfers: trTodaySet.size, weeklyBudget },
    quickStats: { flowersAvailable: currentAvailableFlowers, purchasedThisWeek: newReceivedThisWeekQty, transferredThisWeek: trWeekSet.size, usedThisWeek: usedThisWeekQty, usedCostThisWeek, wastedThisWeek: wastedThisWeekQty, wastedCostThisWeek, currentInventoryValue: companyInventoryValue },
    lastActivity: { lastPurchase, lastStockCount, lastTransfer }, branchSummary, lowStockList, pendingApprovals, pendingApprovalsCount, distinctFlowerCount, recentReceiving: recentReceivingTop, itemStockLevels };
}

// ---------------------------------------------------------------
// FLOWER ARRANGEMENTS
// ---------------------------------------------------------------
async function getFlowerArrangements() {
  const [arrRows, itemRows, flowerRows] = await Promise.all([
    sbGet('flower_arrangements', 'select=*&status=eq.Active&order=created_date.desc'),
    sbGet('flower_arrangement_items', 'select=*&order=arrangement_id.asc,sort_order.asc'),
    sbGet('flower_item', 'select=flower_name,origin,rate&status=eq.Active'),
  ]);
  const rates = arrangementRateMap(flowerRows);
  const itemsByArr: Record<string, any[]> = {};
  itemRows.forEach((r: any) => { (itemsByArr[r.arrangement_id] = itemsByArr[r.arrangement_id] || []).push(r); });
  return arrRows.map((a: any) => mapArrangement(a, itemsByArr[a.id] || [], rates));
}
async function getFlowerArrangementByCode(codeRaw: string) {
  const code = String(codeRaw || '').trim().toUpperCase();
  if (!code) return { success: false, error: 'No code given.' };
  const rows = await sbGet('flower_arrangements', `select=*&status=eq.Active&arrangement_code=eq.${encodeURIComponent(code)}`);
  if (!rows.length) return { success: false, error: 'No arrangement found for this code.' };
  const [itemRows, flowerRows] = await Promise.all([
    sbGet('flower_arrangement_items', `select=*&order=sort_order.asc&arrangement_id=eq.${rows[0].id}`),
    sbGet('flower_item', 'select=flower_name,origin,rate&status=eq.Active'),
  ]);
  const result: any = mapArrangement(rows[0], itemRows, arrangementRateMap(flowerRows));
  result.success = true;
  return result;
}
async function saveFlowerArrangement(p: Record<string, any>, authUser: any) {
  let items: any[] = [];
  try { items = JSON.parse(p.items || '[]'); } catch { items = []; }
  items = items.map((it: any) => ({ flowerName: String(it.flowerName || '').trim(), qty: Number(it.qty) || 0 })).filter((it: any) => it.flowerName && it.qty > 0);
  const name = String(p.arrangementName || '').trim();
  if (!name) return { success: false, error: 'Arrangement name is required.' };
  if (!items.length) return { success: false, error: 'Add at least one flower with a quantity.' };
  const id = /^\d+$/.test(String(p.id || '')) ? Number(p.id) : null;
  if (id) {
    const existing = await sbGet('flower_arrangements', `select=id,created_by&status=eq.Active&id=eq.${id}`);
    if (!existing.length) return { success: false, error: 'Arrangement not found.' };
    if (!canManageArrangement(existing[0], authUser)) return { success: false, error: 'Only an admin or the person who recorded this arrangement can edit it.' };
  }
  const photo = p.photoData;
  const out = await sbRpcSafe('save_flower_arrangement', {
    p_id: id, p_name: name, p_display_name: p.displayName || '', p_florist: p.florist || '', p_notes: p.notes || '',
    p_photo_data: (photo === undefined) ? (id ? null : '') : photo, p_user: currentUserName(authUser), p_items: items,
  });
  if (out.error) return { success: false, error: out.error };
  const row = out.data && out.data[0];
  return { success: true, id: row.id, arrangementCode: row.arrangement_code };
}
async function deleteFlowerArrangement(p: Record<string, any>, authUser: any) {
  const id = Number(p.id);
  if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid arrangement.' };
  const rows = await sbGet('flower_arrangements', `select=id,created_by&status=eq.Active&id=eq.${id}`);
  if (!rows.length) return { success: false, error: 'Arrangement not found.' };
  if (!canManageArrangement(rows[0], authUser)) return { success: false, error: 'Only an admin or the person who recorded this arrangement can delete it.' };
  await sbPatch('flower_arrangements', `id=eq.${id}`, { status: 'Inactive', updated_by: currentUserName(authUser), updated_date: new Date().toISOString() });
  return { success: true };
}
async function fulfillFlowerArrangement(p: Record<string, any>, authUser: any) {
  const code = String(p.code || '').trim().toUpperCase();
  const branch = String(p.branch || '').trim();
  if (!code) return { success: false, error: 'No arrangement code given.' };
  if (!branch) return { success: false, error: 'Branch is required.' };
  const arrRows = await sbGet('flower_arrangements', `select=*&status=eq.Active&arrangement_code=eq.${encodeURIComponent(code)}`);
  if (!arrRows.length) return { success: false, error: 'No arrangement found for this code.' };
  const arrangement = arrRows[0];
  const itemRows = await sbGet('flower_arrangement_items', `select=*&order=sort_order.asc&arrangement_id=eq.${arrangement.id}`);
  if (!itemRows.length) return { success: false, error: 'This arrangement has no flowers recorded.' };
  const flowerNamesLower = itemRows.map((it: any) => String(it.flower_name || '').trim().toLowerCase());
  const [histRows, dbRows, transferRows, fulfillRows] = await Promise.all([
    sbGet('flower_stock_history', `select=*&item_code=eq.CONSOLIDATED&branch=eq.${encodeURIComponent(branch)}`),
    sbGet('flower_database', `select=*&approval_status=eq.Approved&branch=eq.${encodeURIComponent(branch)}`),
    sbGet('flower_transfer_history', 'select=*'),
    sbGet('flower_arrangement_fulfillments', `select=*&branch=eq.${encodeURIComponent(branch)}`),
  ]);
  const now = new Date();
  function currentAvailableStock(flowerNameLower: string) {
    let lastDate: Date | null = null, opening = 0;
    histRows.forEach((row: any) => { if (String(row.flower_name || '').trim().toLowerCase() !== flowerNameLower) return; const d = row.count_date ? new Date(row.count_date) : null; if (!d || isNaN(d.getTime()) || d > now) return; if (!lastDate || d > lastDate) { lastDate = d; opening = Number(row.physical_count) || 0; } });
    const fromDate = lastDate || new Date(0);
    let purchased = 0;
    dbRows.forEach((row: any) => { if (row.type === 'Supply') return; if (String(row.flower_name || '').trim().toLowerCase() !== flowerNameLower) return; const d = row.entry_date ? new Date(row.entry_date) : null; if (!d || isNaN(d.getTime()) || !(d > fromDate && d <= now)) return; purchased += getStockEquivalent(row.qty, row.unit, row.stems_per_bunch); });
    let transferIn = 0, transferOut = 0;
    transferRows.forEach((row: any) => { if (String(row.flower_name || '').trim().toLowerCase() !== flowerNameLower) return; const d = row.transfer_date ? new Date(row.transfer_date) : null; if (!d || isNaN(d.getTime()) || !(d > fromDate && d <= now)) return; const qty = Number(row.qty) || 0; if (String(row.to_branch || '').trim() === branch) transferIn += qty; if (String(row.from_branch || '').trim() === branch) transferOut += qty; });
    let fulfilled = 0;
    fulfillRows.forEach((row: any) => { if (String(row.flower_name || '').trim().toLowerCase() !== flowerNameLower) return; const d = row.fulfilled_date ? new Date(row.fulfilled_date) : null; if (!d || isNaN(d.getTime()) || !(d > fromDate && d <= now)) return; fulfilled += Number(row.qty) || 0; });
    return opening + purchased + transferIn - transferOut - fulfilled;
  }
  const shortages: any[] = [];
  itemRows.forEach((it: any, i: number) => { const need = Number(it.qty) || 0; const available = currentAvailableStock(flowerNamesLower[i]); if (available < need) shortages.push({ flowerName: it.flower_name, need, available }); });
  if (shortages.length) return { success: false, error: 'Not enough stock at ' + branch + ' for: ' + shortages.map((s: any) => s.flowerName + ' (need ' + s.need + ', only ' + s.available + ' available)').join(', '), shortages };
  const fulfilledBy = currentUserName(authUser), fulfilledDate = new Date().toISOString();
  const rows = itemRows.map((it: any) => ({ arrangement_id: arrangement.id, arrangement_code: arrangement.arrangement_code, branch, flower_name: it.flower_name, qty: Number(it.qty) || 0, fulfilled_by: fulfilledBy, fulfilled_date: fulfilledDate }));
  await sbPost('flower_arrangement_fulfillments', rows);
  return { success: true, arrangementName: arrangement.arrangement_name, branch, items: itemRows.map((it: any) => ({ flowerName: it.flower_name, qty: Number(it.qty) || 0 })) };
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
    const authUser = await isValidToken(p.token);
    if (!authUser) return json({ error: 'Unauthorized. Please log in again.' }, 401);
    // Security audit 2026-11-10: Admin only on the server (not only on the page). Approver name comes from the login.
    if (['approveRate', 'rejectRate', 'updateFlowerRates', 'addFlowerItem', 'setWeeklyBudget', 'getPendingReceiving', 'approveReceiving', 'rejectReceiving'].includes(action) && String(authUser.role || '') !== 'Admin')
      return json({ error: 'Admin only. Please ask an Admin.' }, 403);
    if (action === 'approveRate' || action === 'rejectRate') p.approvedBy = String(authUser.full_name || authUser.username || '');

    // ---- READ-ONLY ----
    if (action === 'getFlowerDashboard') return json(await getFlowerDashboard(p.branch || 'All'));
    if (action === 'getFlowerItems') return json((await sbGet('flower_item', 'select=*&order=id.asc')).map(mapFlowerItemRow));
    if (action === 'getBranches') return json((await sbGet('flower_branches', 'select=name&order=id.asc')).map((r: any) => r.name));
    if (action === 'getStaff') return json((await sbGet('flower_staff', 'select=name&order=id.asc')).map((r: any) => r.name));
    if (action === 'getSuppliers') return json((await sbGet('flower_suppliers', 'select=name&order=id.asc')).map((r: any) => r.name));
    if (action === 'getOrigins') return json((await sbGet('flower_origins', 'select=name&order=id.asc')).map((r: any) => r.name));
    if (action === 'getSupplyItems') return json((await sbGet('flower_supply_item', 'select=*&order=id.asc')).map((r: any) => ({ 'Supply Name': r.supply_name, 'Item Code': r.item_code, 'Default Unit': r.default_unit, 'Cost/Rate': r.cost_rate, 'Status': r.status })));
    if (action === 'getEntries') { let q = 'select=*&order=id.desc'; if (p.branch) q += `&branch=eq.${encodeURIComponent(p.branch)}`; return json((await sbGet('flower_database', q)).map(mapDbRow)); }
    if (action === 'getWeeklyBudget') return json(await getWeeklyBudget(p));
    if (action === 'getRateChangeHistory') return json((await sbGet('flower_rate_change_history', 'select=*&approval_status=neq.Pending Approval&order=change_date.desc&limit=20')).map((r: any) => ({ Date: r.change_date, Flower: r.flower_name, Origin: r.origin, ItemCode: r.item_code, OldRate: Number(r.old_company_rate) || 0, NewRate: Number(r.new_company_rate) || 0, Status: r.approval_status, ApprovedBy: r.approved_by })));
    if (action === 'getPendingRateApprovals') return json((await sbGet('flower_rate_change_history', 'select=*&approval_status=eq.Pending Approval&order=id.asc')).map((r: any) => ({ Date: r.change_date, Flower: r.flower_name, Origin: r.origin, 'Item Code': r.item_code, 'Old Company Rate': r.old_company_rate, 'New Company Rate': r.new_company_rate, 'Supplier Rate Used': r.supplier_rate_used, Difference: r.difference, 'Margin %': r.margin_percent, 'Margin Status': r.margin_status, 'Approval Status': r.approval_status, 'Approved By': r.approved_by, _row: r.id })));
    if (action === 'getFlowerCatalogWithMinStock') {
      const [legacyRows, hollandRows] = await Promise.all([
        sbGet('flower_item', 'select=id,flower_name,rate,min_stock&origin=eq.Legacy/Unknown&status=neq.Inactive'),
        sbGet('flower_item', 'select=id,flower_name,rate,min_stock&origin=eq.Holland&status=neq.Inactive'),
      ]);
      const seen = new Set<string>(); const list: any[] = [];
      legacyRows.forEach((r: any) => { const name = String(r.flower_name || '').trim(); if (!name) return; seen.add(name.toLowerCase()); list.push({ row: r.id, name, rate: Number(r.rate) || 0, minStock: r.min_stock === null ? null : Number(r.min_stock) }); });
      hollandRows.forEach((r: any) => { const name = String(r.flower_name || '').trim(); if (!name || seen.has(name.toLowerCase())) return; seen.add(name.toLowerCase()); list.push({ row: r.id, name, rate: Number(r.rate) || 0, minStock: r.min_stock === null ? null : Number(r.min_stock) }); });
      list.sort((a, b) => a.name.localeCompare(b.name));
      return json(list);
    }
    if (action === 'getFlowerStockList') { const rows = await sbGet('flower_item', 'select=flower_name,item_code&origin=eq.Legacy/Unknown&status=neq.Inactive'); return json(rows.filter((r: any) => r.flower_name && r.item_code).map((r: any) => ({ flowerName: r.flower_name, contributingItemCodes: r.item_code })).sort((a: any, b: any) => a.flowerName.localeCompare(b.flowerName))); }
    if (action === 'getFlowerTransferList') { const rows = await sbGet('flower_item', 'select=flower_name&origin=eq.Legacy/Unknown&status=neq.Inactive'); return json(rows.map((r: any) => r.flower_name).filter((n: any) => n).sort()); }
    if (action === 'getTransferHistoryList') {
      const branch = p.branch || '';
      const rows = await sbGet('flower_transfer_history', 'select=*&order=transfer_date.desc&limit=30');
      const filtered = (!branch || branch === 'All') ? rows : rows.filter((r: any) => r.from_branch === branch || r.to_branch === branch);
      return json(filtered.map((r: any) => ({ Date: r.transfer_date, 'Transfer No.': r.transfer_no, 'From Branch': r.from_branch, 'To Branch': r.to_branch, Flower: r.flower_name, Qty: r.qty, Remarks: r.remarks, 'Transferred By': r.transferred_by, 'Rate (Legacy)': r.rate_legacy, Value: r.value })));
    }
    if (action === 'getHollandTracking') return json((await sbGet('flower_holland_tracking', 'select=*&order=id.asc')).map((r: any) => ({ 'Flower Name': r.flower_name, 'Odoo Price (BHD)': r.odoo_price_bhd, 'Date Checked': r.date_checked })));
    if (action === 'getStockCountByDate') return json(await getStockCountByDate(p));
    if (action === 'getFlowerArrangements') return json(await getFlowerArrangements());
    if (action === 'getFlowerArrangementByCode') return json(await getFlowerArrangementByCode(p.code));

    // ---- WRITE (duplicate-guarded) ----
    if (DUP_WRITE_ACTIONS.has(action)) {
      const key = await dedupKeyFor(action, p);
      const gate = await startDedup(key, action);
      if (!gate.shouldRun) return json(gate.response);
      let result: any;
      try {
        if (action === 'saveReceiving') result = await saveReceiving(p);
        else if (action === 'saveStockCount') result = await saveStockCount(p);
        else if (action === 'saveTransfer') result = await saveTransfer(p);
        else if (action === 'addFlowerItem') result = await addFlowerItem(p);
        else if (action === 'approveRate' || action === 'rejectRate') result = await approveRejectRate(p, action);
        else if (action === 'saveFlowerArrangement') result = await saveFlowerArrangement(p, authUser);
        else if (action === 'fulfillFlowerArrangement') result = await fulfillFlowerArrangement(p, authUser);
        else result = { error: 'Unknown action' };
      } catch (err) {
        await finishDedup(key, null, false);
        throw err;
      }
      const ok = !!result && !result.error && result.success !== false;
      await finishDedup(key, result, ok);
      return json(result);
    }

    // ---- Other writes (not duplicate-critical) ----
    if (action === 'editEntry') return json(await editEntry(p));
    if (action === 'setWeeklyBudget') { await sbUpsert('flower_budgets', [{ branch: p.branch, weekly_budget: Number(p.value) || 0 }], 'branch'); return json({ success: true }); }
    if (action === 'updateFlowerRates') return json(await updateFlowerRates(p));
    if (action === 'setMinStockBulk') return json(await setMinStockBulk(p));
    if (action === 'deleteFlowerArrangement') return json(await deleteFlowerArrangement(p, authUser));
    if (action === 'getPendingReceiving') return json(await getPendingReceiving(p));
    if (action === 'approveReceiving') return json(await decideReceiving(p, authUser, true));
    if (action === 'rejectReceiving') return json(await decideReceiving(p, authUser, false));

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: 'Server error. Please try again.' }, 500);
  }
});
