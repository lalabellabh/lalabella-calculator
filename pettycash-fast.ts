// LALABELLA PETTY CASH & CASH — FAST PATH (Supabase Edge Function)  v9
// v9 (Oct 2026): receipt photo per entry (photo_url, bucket petty-cash-photos). addPettyCashEntry takes `photo` (base64 data URL, POST) —
//                the entry is NOT saved if the photo can't be stored. editPettyCashEntry (admin) can replace `photo` or `removePhoto=1`.
//                getPettyCash returns photoUrl.
// v8 (Oct 2026): car_plate + driver columns on petty_cash_transactions (for petrol entries) — saved on add/edit, returned by getPettyCash.
// v7 (Oct 2026): setPettyCashBalance (ADMIN ONLY) — set the money currently inside the petty cash. Saved as a visible
//                'Balance adjustment' entry (top-up or expense of the difference) so history and totals stay consistent.
// v6 (Oct 2026): editPettyCashEntry (ADMIN ONLY) — fix the date / purpose / amount / type of a saved entry (back-dating).
//                dates are validated as YYYY-MM-DD on add and edit.
// v5 (Oct 2026): setting the petty cash target is ADMIN ONLY too.
// v4 (Oct 2026): deleting a petty cash entry or a cash count is ADMIN ONLY (role Admin).
// Ported action-for-action from the Petty Cash Apps Script — same tables, same response shapes.
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
  return text ? JSON.parse(text) : null;
}
async function sbDelete(table: string, query: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!res.ok) throw new Error(`db ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// Returns the logged-in user (id, role) or null.
async function sessionUser(token: string) {
  const t = String(token || '').trim();
  if (!t) return null;
  const rows = await sbGet('users', `select=id,role,status,token_created&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0];
  if (!u) return null;
  if (String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}
const isAdmin = (u: any) => String(u && u.role || '').toLowerCase() === 'admin';
const ADMIN_ONLY_MSG = 'Only an Admin can delete this. Please ask an Admin.';
const ADMIN_ONLY_TARGET_MSG = 'Only an Admin can change the target amount. Please ask an Admin.';
const ADMIN_ONLY_EDIT_MSG = 'Only an Admin can edit an entry. Please ask an Admin.';
const PHOTO_BUCKET = 'petty-cash-photos';
// Returns the public URL, or '' when the image is missing / not an image / too big (> 2.5 MB) / the upload failed.
async function savePettyPhoto(base64Data: string): Promise<string> {
  if (!base64Data) return '';
  const i = base64Data.indexOf(',');
  const meta = i !== -1 ? base64Data.slice(0, i) : '';
  const clean = i !== -1 ? base64Data.slice(i + 1) : base64Data;
  const m = meta.match(/data:([^;]+);/);
  const contentType = m ? m[1] : 'image/jpeg';
  if (!/^image\/(jpeg|png|webp)$/.test(contentType)) return '';
  const ext = contentType.split('/')[1];
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(clean), c => c.charCodeAt(0)); } catch { return ''; }
  if (!bytes.length || bytes.length > 2_500_000) return '';
  const path = `pc-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const res = await fetch(`${SB_URL}/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: bytes,
  });
  if (!res.ok) { console.error('petty photo upload failed', res.status, (await res.text()).slice(0, 300)); return ''; }
  return `${SB_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

function validDate(d: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + 'T00:00:00Z');
  return !isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

// ---------------------------------------------------------------
// PETTY CASH
// ---------------------------------------------------------------
async function handleGetPettyCash(p: any) {
  const branch = p.branch;
  let query = 'select=*&order=entry_date.desc,id.desc';
  if (branch && branch !== 'All') query += `&branch=eq.${encodeURIComponent(branch)}`;
  const rows = await sbGet('petty_cash_transactions', query);

  let netFromTransactions = 0;
  (rows || []).forEach((r: any) => { netFromTransactions += r.entry_type === 'topup' ? Number(r.amount) : -Number(r.amount); });

  let targetAmount = null, balance = netFromTransactions;
  if (branch && branch !== 'All') {
    const settingRows = await sbGet('petty_cash_settings', `select=target_amount&branch=eq.${encodeURIComponent(branch)}`);
    targetAmount = settingRows.length ? Number(settingRows[0].target_amount) : 0;
    balance = targetAmount + netFromTransactions;
  }

  return {
    balance, targetAmount,
    transactions: (rows || []).map((r: any) => ({ id: r.id, branch: r.branch, date: r.entry_date, purpose: r.purpose, amount: Number(r.amount), type: r.entry_type, enteredBy: r.entered_by, carPlate: r.car_plate || '', driver: r.driver || '', photoUrl: r.photo_url || '' })),
  };
}
async function handleSetPettyCashTarget(p: any, user: any) {
  if (!isAdmin(user)) return { error: ADMIN_ONLY_TARGET_MSG };
  const branch = p.branch;
  const targetAmount = Number(p.targetAmount);
  if (!branch || branch === 'All') return { error: 'Please select a specific branch.' };
  if (isNaN(targetAmount) || targetAmount < 0) return { error: 'Invalid amount.' };
  await sbUpsert('petty_cash_settings', [{ branch, target_amount: targetAmount }], 'branch');
  return { success: true };
}
async function handleAddPettyCashEntry(p: any) {
  const branch = p.branch;
  const entryDate = p.date || new Date().toISOString().slice(0, 10);
  const purpose = String(p.purpose || '').trim();
  const amount = Number(p.amount) || 0;
  const entryType = p.type === 'topup' ? 'topup' : 'expense';
  const enteredBy = p.enteredBy || '';
  const carPlate = String(p.carPlate || '').trim().slice(0, 30).toUpperCase();
  const driver = String(p.driver || '').trim().slice(0, 60);
  if (!branch) return { error: 'Branch is required.' };
  if (!validDate(entryDate)) return { error: 'Invalid date.' };
  if (!purpose) return { error: 'Purpose is required.' };
  if (amount <= 0) return { error: 'Amount must be greater than zero.' };
  let photoUrl = '';
  if (p.photo) {
    photoUrl = await savePettyPhoto(String(p.photo));
    if (!photoUrl) return { error: 'The photo could not be saved (too big or not a picture). Nothing was saved — please try again.' };
  }
  await sbPost('petty_cash_transactions', [{ branch, entry_date: entryDate, purpose, amount, entry_type: entryType, entered_by: enteredBy, car_plate: carPlate, driver, photo_url: photoUrl || null }]);
  return { success: true, photoUrl };
}
// Admin only: fix the date (back-date), purpose, amount or type of a saved entry.
async function handleEditPettyCashEntry(p: any, user: any) {
  if (!isAdmin(user)) return { error: ADMIN_ONLY_EDIT_MSG };
  const id = Number(p.id);
  if (!Number.isInteger(id) || id < 1) return { error: 'Invalid entry.' };
  const rows = await sbGet('petty_cash_transactions', `select=id&id=eq.${id}`);
  if (!rows.length) return { error: 'Entry not found.' };
  const fields: Record<string, unknown> = {};
  if (p.date !== undefined && p.date !== '') {
    if (!validDate(String(p.date))) return { error: 'Invalid date.' };
    fields.entry_date = String(p.date);
  }
  if (p.purpose !== undefined) {
    const purpose = String(p.purpose).trim();
    if (!purpose) return { error: 'Purpose is required.' };
    fields.purpose = purpose.slice(0, 200);
  }
  if (p.amount !== undefined && p.amount !== '') {
    const amount = Number(p.amount);
    if (!(amount > 0)) return { error: 'Amount must be greater than zero.' };
    fields.amount = amount;
  }
  if (p.carPlate !== undefined) fields.car_plate = String(p.carPlate).trim().slice(0, 30).toUpperCase();
  if (p.driver !== undefined) fields.driver = String(p.driver).trim().slice(0, 60);
  if (p.type !== undefined && p.type !== '') fields.entry_type = p.type === 'topup' ? 'topup' : 'expense';
  if (p.photo) {
    const url = await savePettyPhoto(String(p.photo));
    if (!url) return { error: 'The photo could not be saved (too big or not a picture). Nothing was changed.' };
    fields.photo_url = url;
  } else if (String(p.removePhoto || '') === '1') fields.photo_url = null;
  if (!Object.keys(fields).length) return { success: true, unchanged: true };
  await sbPatch('petty_cash_transactions', `id=eq.${id}`, fields);
  return { success: true };
}
async function handleSetPettyCashBalance(p: any, user: any) {
  if (!isAdmin(user)) return { error: 'Only an Admin can set the balance. Please ask an Admin.' };
  const branch = p.branch;
  const newBalance = Number(p.balance);
  if (!branch || branch === 'All') return { error: 'Please select a specific branch.' };
  if (p.balance === undefined || p.balance === '' || isNaN(newBalance) || newBalance < 0) return { error: 'Invalid balance.' };
  const cur = await handleGetPettyCash({ branch });
  const current = Number(cur.balance) || 0;
  const diff = Math.round((newBalance - current) * 1000) / 1000;
  if (diff === 0) return { success: true, unchanged: true, balance: current };
  const entryDate = p.date && validDate(String(p.date)) ? String(p.date) : new Date().toISOString().slice(0, 10);
  await sbPost('petty_cash_transactions', [{
    branch, entry_date: entryDate,
    purpose: `Balance adjustment (${current.toFixed(3)} → ${newBalance.toFixed(3)})`,
    amount: Math.abs(diff), entry_type: diff > 0 ? 'topup' : 'expense', entered_by: String(p.enteredBy || '').slice(0, 80),
  }]);
  return { success: true, previous: current, balance: newBalance, adjustment: diff };
}
async function handleDeletePettyCashEntry(p: any, user: any) {
  if (!isAdmin(user)) return { error: ADMIN_ONLY_MSG };
  const id = Number(p.id);
  if (!Number.isInteger(id) || id < 1) return { error: 'Invalid entry.' };
  await sbDelete('petty_cash_transactions', `id=eq.${id}`);
  return { success: true };
}

// ---------------------------------------------------------------
// CASH
// ---------------------------------------------------------------
async function handleGetCashCounts(p: any) {
  const branch = p.branch;
  let query = 'select=*&order=count_date.desc,id.desc';
  if (branch && branch !== 'All') query += `&branch=eq.${encodeURIComponent(branch)}`;
  const rows = await sbGet('cash_daily_counts', query);

  const ids = (rows || []).map((r: any) => r.id);
  const allDenoms = ids.length ? await sbGet('cash_count_denominations', `select=*&cash_count_id=in.(${ids.join(',')})&order=denomination_value.desc`) : [];
  const denomsByCount: Record<string, any[]> = {};
  (allDenoms || []).forEach((d: any) => { (denomsByCount[d.cash_count_id] = denomsByCount[d.cash_count_id] || []).push({ value: Number(d.denomination_value), label: d.denomination_label, count: d.piece_count }); });

  const balance = (rows || []).filter((r: any) => !r.sent_to_qalali).reduce((sum: number, r: any) => sum + Number(r.amount), 0);

  return {
    balance,
    counts: (rows || []).map((r: any) => ({ id: r.id, branch: r.branch, date: r.count_date, amount: Number(r.amount), countedBy: r.counted_by, sentToQalali: r.sent_to_qalali, sentDate: r.sent_date, breakdown: denomsByCount[r.id] || [] })),
  };
}
async function handleAddCashCount(p: any) {
  const branch = p.branch;
  const countDate = p.date || new Date().toISOString().slice(0, 10);
  const countedBy = p.countedBy || '';
  let breakdown: any[] = [];
  try { breakdown = JSON.parse(p.breakdown || '[]'); } catch { breakdown = []; }
  if (!branch) return { error: 'Branch is required.' };
  const usable = breakdown.filter((b: any) => Number(b.count) > 0);
  if (!usable.length) return { error: 'Please enter the count for at least one denomination.' };
  const amount = usable.reduce((sum: number, b: any) => sum + (Number(b.value) * Number(b.count)), 0);
  const inserted = await sbPost('cash_daily_counts', [{ branch, count_date: countDate, amount, counted_by: countedBy }]);
  const cashCountId = inserted[0].id;
  const denomRows = usable.map((b: any) => ({ cash_count_id: cashCountId, denomination_value: b.value, denomination_label: b.label, piece_count: Number(b.count) }));
  await sbPost('cash_count_denominations', denomRows);
  return { success: true, amount };
}
async function handleDeleteCashCount(p: any, user: any) {
  if (!isAdmin(user)) return { error: ADMIN_ONLY_MSG };
  const id = Number(p.id);
  if (!Number.isInteger(id) || id < 1) return { error: 'Invalid entry.' };
  const rows = await sbGet('cash_daily_counts', `select=sent_to_qalali&id=eq.${id}`);
  if (!rows.length) return { error: 'Entry not found.' };
  if (rows[0].sent_to_qalali) return { error: 'Cannot delete — this has already been sent to Qalali branch.' };
  await sbDelete('cash_daily_counts', `id=eq.${id}`);
  return { success: true };
}
async function handleMarkSentToQalali(p: any) {
  const id = Number(p.id);
  if (!Number.isInteger(id) || id < 1) return { error: 'Invalid entry.' };
  const rows = await sbGet('cash_daily_counts', `select=*&id=eq.${id}`);
  if (!rows.length) return { error: 'Entry not found.' };
  if (rows[0].sent_to_qalali) return { error: 'This entry was already marked as sent.' };
  await sbPatch('cash_daily_counts', `id=eq.${id}`, { sent_to_qalali: true, sent_date: new Date().toISOString() });
  return { success: true };
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
    const user = await sessionUser(p.token);
    if (!user) return json({ error: 'Unauthorized. Please log in again.' });

    if (action === 'getPettyCash') return json(await handleGetPettyCash(p));
    if (action === 'addPettyCashEntry') return json(await handleAddPettyCashEntry(p));
    if (action === 'editPettyCashEntry') return json(await handleEditPettyCashEntry(p, user));
    if (action === 'setPettyCashBalance') return json(await handleSetPettyCashBalance(p, user));
    if (action === 'deletePettyCashEntry') return json(await handleDeletePettyCashEntry(p, user));
    if (action === 'setPettyCashTarget') return json(await handleSetPettyCashTarget(p, user));
    if (action === 'getCashCounts') return json(await handleGetCashCounts(p));
    if (action === 'addCashCount') return json(await handleAddCashCount(p));
    if (action === 'deleteCashCount') return json(await handleDeleteCashCount(p, user));
    if (action === 'markSentToQalali') return json(await handleMarkSentToQalali(p));

    return json({ error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return json({ error: 'Server error. Please try again.' }, 500);
  }
});
