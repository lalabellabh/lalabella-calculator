// LALABELLA ORDER ASSIGNMENT — FAST PATH (Supabase Edge Function)
// Reads/writes branch_config, unassigned_status, assigned_log. Auth: live staff session token;
// getBranchConfig + reportUnassignedStatus are also reachable with AUTOMATION_KEY (Tampermonkey userscript).
// v7: getUnassignedStatus also returns flower rate changes waiting for approval (Admin only).
// v12: Nov 1 2026 — Admin bell also lists chocolate stock-count approvals (one row, kind 'choc', n = how many).
//      Approvals are silent reminders in the bell only (no popup / push).

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// The Tampermonkey automation key is NOT in the code (the repo is public). It is read from the secret
// ORDER_AUTOMATION_KEY, else from order_settings 'automation_key' (saved by an Admin in Branch Config).
const ENV_AUTOMATION_KEY = Deno.env.get('ORDER_AUTOMATION_KEY') || '';
let keyCache = { v: '', at: 0 };
async function automationKey(): Promise<string> {
  if (ENV_AUTOMATION_KEY) return ENV_AUTOMATION_KEY;
  if (Date.now() - keyCache.at < 60000) return keyCache.v;
  try {
    const r = await sbGet('order_settings', 'select=value&key=eq.automation_key&limit=1');
    keyCache = { v: String((r && r[0] && r[0].value) || ''), at: Date.now() };
  } catch (e) { console.error('automation key', e); }
  return keyCache.v;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const preflight = (req: Request) => new Response('ok', {
  headers: {
    ...CORS,
    'Access-Control-Allow-Headers': req.headers.get('access-control-request-headers') || CORS['Access-Control-Allow-Headers'],
    'Access-Control-Max-Age': '86400',
  },
});
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

async function sessionUser(token: string) {
  const t = String(token || '').trim();
  if (!t) return null;
  const rows = await sbGet('users', `select=id,username,full_name,branch,status,token_created,role&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0];
  if (!u) return null;
  if (String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}

async function getBranchConfig() {
  const rows = await sbGet('branch_config', 'select=name,latitude,longitude,keywords&order=id.asc');
  return (rows || []).map((r: any) => ({ Name: r.name, Latitude: r.latitude, Longitude: r.longitude, Keywords: r.keywords }));
}
async function saveBranchConfig(p: any) {
  await sbUpsert('branch_config', [{ name: p.branch || '', keywords: p.config || '' }], 'name');
  return { success: true };
}

const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
function cleanDetails(raw: unknown): any[] {
  let arr: any = raw;
  if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch { arr = []; } }
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 50).map((o: any) => ({
    orderNo: clip(o && o.orderNo, 20),
    address: clip(o && o.address, 200),
    branch: clip(o && o.branch, 60),
    method: clip(o && o.method, 20),
    note: clip(o && o.note, 160),
  })).filter((o: any) => o.orderNo);
}

async function reportUnassignedStatus(p: any) {
  const existing = await sbGet('unassigned_status', 'select=id,order_numbers,details&order=id.desc&limit=1');
  let orderNumbers: string[] = existing.length ? (existing[0].order_numbers || []) : [];
  let details: any[] = existing.length && Array.isArray(existing[0].details) ? existing[0].details : [];
  const orderId = p.orderId || '', status = String(p.status || '');
  if (status.toLowerCase() === 'assigned' || status.toLowerCase() === 'resolved') {
    orderNumbers = orderNumbers.filter((o: string) => o !== orderId);
  } else if (orderId && orderNumbers.indexOf(orderId) === -1) {
    orderNumbers.push(orderId);
  }
  if (p.orderNumbers !== undefined) {
    orderNumbers = String(p.orderNumbers || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    details = cleanDetails(p.ordersDetail);
  }
  details = details.filter((d: any) => orderNumbers.indexOf(d.orderNo) !== -1);
  const payload = { count: orderNumbers.length, order_numbers: orderNumbers, details, last_updated: new Date().toISOString() };
  if (existing.length) await sbPatch('unassigned_status', `id=eq.${existing[0].id}`, payload);
  else await sbPost('unassigned_status', [payload]);
  return { success: true };
}

// Approvals waiting for an Admin (bell, Admin only): flower rate changes + chocolate stock counts.
async function pendingApprovals() {
  // Rate changes are approved separately (Nov 2026, Bench). A rate change from a receiving shows here only
  // after that receiving is approved (while it waits, it is part of the 'recv' card below).
  let rows: any[] = await sbGet('flower_rate_change_history', 'select=id,source_id,flower_name,origin,old_company_rate,new_company_rate&approval_status=eq.Pending%20Approval&order=id.asc&limit=50') || [];
  const srcIds = rows.filter((r: any) => r.source_id).map((r: any) => Number(r.source_id));
  if (srcIds.length) {
    const ok = await sbGet('flower_database', `select=id&approval_status=eq.Approved&id=in.(${srcIds.join(',')})`) || [];
    const okSet = new Set(ok.map((r: any) => Number(r.id)));
    rows = rows.filter((r: any) => !r.source_id || okSet.has(Number(r.source_id)));
  }
  const out: any[] = rows.map((r: any) => ({
    flower: clip(r.flower_name, 60), origin: clip(r.origin, 40),
    oldRate: Number(r.old_company_rate) || 0, newRate: Number(r.new_company_rate) || 0,
  }));
  try {
    const ch = await sbGet('chocolate_stock_count_history', 'select=status&status=eq.Pending%20Approval&limit=500');
    if (ch && ch.length) out.push({ kind: 'choc', n: ch.length });
  } catch (e) { console.error('choc approvals', e); }
  // Receiving waiting for approval (Nov 2026): one row per invoice / delivery note, with a direct link.
  try {
    const [fr, cr] = await Promise.all([
      sbGet('flower_database', 'select=id,batch_ref,branch,supplier,invoice_no,entry_date,subtotal&approval_status=eq.Pending&order=id.asc&limit=300'),
      sbGet('chocolate_database', 'select=id,batch_ref,branch,supplier,delivery_note_no,receive_date,total_amount&approval_status=eq.Pending&order=id.asc&limit=300'),
    ]);
    const groups: Record<string, any> = {};
    (fr || []).forEach((r: any) => { const k = 'flower|' + (r.batch_ref || 'ROW-' + r.id); const g = groups[k] = groups[k] || { kind: 'recv', module: 'flower', batch: r.batch_ref || 'ROW-' + r.id, branch: clip(r.branch, 30), supplier: clip(r.supplier, 40), invoice: clip(r.invoice_no, 30), date: r.entry_date, lines: 0, total: 0 }; g.lines++; g.total += Number(r.subtotal) || 0; });
    (cr || []).forEach((r: any) => { const k = 'choc|' + (r.batch_ref || 'ROW-' + r.id); const g = groups[k] = groups[k] || { kind: 'recv', module: 'chocolate', batch: r.batch_ref || 'ROW-' + r.id, branch: clip(r.branch, 30), supplier: clip(r.supplier, 40), invoice: clip(r.delivery_note_no, 30), date: r.receive_date, lines: 0, total: 0 }; g.lines++; g.total += Number(r.total_amount) || 0; });
    Object.values(groups).forEach((g: any) => { g.total = Math.round(g.total * 1000) / 1000; out.push(g); });
  } catch (e) { console.error('receiving approvals', e); }
  return out;
}

async function getUnassignedStatus(isAdmin: boolean) {
  const rows = await sbGet('unassigned_status', 'select=count,order_numbers,details,last_updated&order=id.desc&limit=1');
  let appr: any[] = [];
  if (isAdmin) { try { appr = await pendingApprovals(); } catch (e) { console.error('approvals', e); } }
  const total = appr.reduce((s: number, r: any) => s + (r.kind === 'choc' ? Number(r.n) || 0 : 1), 0);
  // Live Orders (Nov 2026): orders just given to a branch that nobody marked "seen" yet -> gift alarm in the bell.
  let newAssigned: any[] = [];
  try { newAssigned = ((await sbGet('live_orders', 'select=id,order_no,branch,assigned_at&section=eq.new&ack_at=is.null&order=assigned_at.desc&limit=20')) || []).map((r: any) => ({ id: r.id, orderNo: r.order_no, branch: r.branch, assignedAt: r.assigned_at })); } catch (e) { console.error('live orders', e); }
  const extra = { pendingApprovals: total, approvalsDetail: appr, newAssigned };
  if (!rows.length) return { count: 0, ordersDetail: [], ...extra };
  const row = rows[0];
  const det: any[] = Array.isArray(row.details) ? row.details : [];
  return {
    count: row.count || 0,
    lastUpdated: row.last_updated || null,
    ordersDetail: (row.order_numbers || []).map((o: string) => {
      const d = det.find((x: any) => x && x.orderNo === o) || {};
      return { orderNo: o, address: d.address || '', branch: d.branch || '', method: d.method || '', note: d.note || '' };
    }),
    ...extra,
  };
}
async function logAssignedOrder(p: any) {
  await sbPost('assigned_log', [{ order_id: p.orderId || '', branch: p.branch || '', assigned_to: p.assignedTo || '' }]);
  return { success: true };
}
async function getAssignedLog() {
  const rows = await sbGet('assigned_log', 'select=order_id,branch,assigned_to,assigned_at&order=id.asc');
  return (rows || []).map((r: any) => ({ OrderId: r.order_id, Branch: r.branch, AssignedTo: r.assigned_to, AssignedAt: r.assigned_at }));
}

// ---------- LIVE ORDERS (Nov 2026) ----------
// The Tampermonkey script reads the "New Orders" list of lalabella.web.app (orders already given to a branch)
// and sends the whole list every few seconds (reportNewOrders). live-orders.html shows it per branch:
// newest assignment on top with a red NEW + gift alarm until someone taps "Nakita ko" (ackLiveOrder).
const T = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
function cleanLive(o: any) {
  return { orderNo: T(o && o.orderNo, 30), branch: T(o && o.branch, 40), tag: T(o && o.tag, 40), method: T(o && o.method, 20), date: T(o && o.date, 40), time: T(o && o.time, 40),
    sender: T(o && o.sender, 60), senderPhone: T(o && o.senderPhone, 30), receiver: T(o && o.receiver, 60), receiverPhone: T(o && o.receiverPhone, 30), address: T(o && o.address, 200), price: T(o && o.price, 30) };
}
async function reportNewOrders(p: any) {
  if (String(p.found || '') !== '1') return { success: true, skipped: 'list not on screen' };
  let list: any[] = [];
  try { list = JSON.parse(p.orders || '[]'); } catch { return { success: false, error: 'bad list' }; }
  list = (Array.isArray(list) ? list : []).map(cleanLive).filter((o) => o.orderNo).slice(0, 200);
  const now = new Date().toISOString();
  const cur: any[] = await sbGet('live_orders', 'select=id,order_no,branch,section&source=eq.web') || [];
  const byNo: Record<string, any> = {}; cur.forEach((r) => { byNo[r.order_no] = r; });
  const seen = new Set<string>();
  const inserts: any[] = [];
  for (const o of list) {
    if (seen.has(o.orderNo)) continue; seen.add(o.orderNo);
    const r = byNo[o.orderNo];
    if (!r) { inserts.push({ source: 'web', order_no: o.orderNo, branch: o.branch, section: 'new', details: o, first_seen_at: now, assigned_at: now, last_seen_at: now }); continue; }
    const patch: any = { details: o, last_seen_at: now, section: 'new', gone_at: null };
    if (T(r.branch, 40).toLowerCase() !== o.branch.toLowerCase()) { patch.branch = o.branch; patch.assigned_at = now; patch.ack_at = null; patch.ack_by = null; }
    else if (r.section !== 'new') { patch.assigned_at = now; patch.ack_at = null; patch.ack_by = null; }   // came back to New
    await sbPatch('live_orders', `id=eq.${r.id}`, patch);
  }
  if (inserts.length) await sbPost('live_orders', inserts);
  const goneIds = cur.filter((r) => r.section === 'new' && !seen.has(r.order_no)).map((r) => r.id);
  if (goneIds.length) await sbPatch('live_orders', `id=in.(${goneIds.join(',')})`, { section: 'gone', gone_at: now });
  // keep the table small: forget orders gone for more than 3 days
  try { await fetch(`${SB_URL}/rest/v1/live_orders?section=eq.gone&gone_at=lt.${new Date(Date.now() - 3 * 86400000).toISOString()}`, { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }); } catch (_) { /* ignore */ }
  return { success: true, now: list.length, added: inserts.length, gone: goneIds.length };
}
function liveOut(r: any) {
  const d = r.details || {};
  return { id: r.id, source: r.source, orderNo: r.order_no, branch: r.branch, section: r.section, assignedAt: r.assigned_at, goneAt: r.gone_at, ackAt: r.ack_at, ackBy: r.ack_by || '',
    tag: d.tag || '', method: d.method || '', date: d.date || '', time: d.time || '', sender: d.sender || '', senderPhone: d.senderPhone || '', receiver: d.receiver || '', receiverPhone: d.receiverPhone || '', address: d.address || '', price: d.price || '' };
}
async function getLiveOrders() {
  const since = new Date(Date.now() - 6 * 3600000).toISOString();
  const [rows, gone, st] = await Promise.all([
    sbGet('live_orders', 'select=*&section=eq.new&order=assigned_at.desc&limit=200'),
    sbGet('live_orders', `select=*&section=eq.gone&gone_at=gte.${since}&order=gone_at.desc&limit=30`),
    sbGet('unassigned_status', 'select=order_numbers,details,last_updated&order=id.desc&limit=1'),
  ]);
  const u = st && st[0];
  const det: any[] = u && Array.isArray(u.details) ? u.details : [];
  const unassigned = ((u && u.order_numbers) || []).map((o: string) => { const d = det.find((x: any) => x && x.orderNo === o) || {}; return { orderNo: o, address: d.address || '', branch: d.branch || '', note: d.note || '' }; });
  const lastSeen = (rows || []).reduce((m: string, r: any) => (r.last_seen_at > m ? r.last_seen_at : m), '');
  return { success: true, serverTime: new Date().toISOString(), unassigned, unassignedUpdated: (u && u.last_updated) || null, lastReport: lastSeen || null,
    orders: (rows || []).map(liveOut), recentlyDone: (gone || []).map(liveOut) };
}
async function ackLiveOrder(p: any, me: any) {
  const id = Number(p.id);
  const who = T(me && (me.full_name || me.username), 60) || 'staff';
  if (String(p.all || '') === '1') {
    const br = T(p.branch, 40);
    const q = 'section=eq.new&ack_at=is.null' + (br && br !== 'All' ? `&branch=ilike.${encodeURIComponent(br)}` : '');
    await sbPatch('live_orders', q, { ack_at: new Date().toISOString(), ack_by: who });
    return { success: true };
  }
  if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid order.' };
  await sbPatch('live_orders', `id=eq.${id}&ack_at=is.null`, { ack_at: new Date().toISOString(), ack_by: who });
  return { success: true, by: who };
}

async function readParams(req: Request): Promise<Record<string, any>> {
  if (req.method === 'GET') { const u = new URL(req.url); return Object.fromEntries(u.searchParams.entries()); }
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await req.json();
  const t = await req.text();
  return Object.fromEntries(new URLSearchParams(t));
}

const AUTOMATION_ACTIONS = new Set(['getBranchConfig', 'reportUnassignedStatus', 'reportNewOrders']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const p = await readParams(req);
    const action = p.action || '';

    const autoKey = AUTOMATION_ACTIONS.has(action) ? await automationKey() : '';
    const viaAutomation = !!autoKey && String(p.automationKey || '') === autoKey;
    if (action === 'reportUnassignedStatus') console.log('reportUnassignedStatus', viaAutomation ? 'key ok' : 'key MISSING/WRONG', 'count=' + String(p.count ?? ''), 'orders=' + String(p.orderNumbers ?? p.orderId ?? ''));
    const me = viaAutomation ? null : await sessionUser(p.token);
    if (!viaAutomation && !me) {
      return json({ success: false, error: 'Unauthorized. Please log in again.' });
    }

    if (action === 'getBranchConfig') return json(await getBranchConfig());
    if (action === 'saveBranchConfig') return json(await saveBranchConfig(p));
    if (action === 'reportUnassignedStatus') return json(await reportUnassignedStatus(p));
    if (action === 'getUnassignedStatus') return json(await getUnassignedStatus(!!me && String(me.role || '').toLowerCase() === 'admin'));
    if (action === 'reportNewOrders') { if (!viaAutomation) return json({ success: false, error: 'Automation key needed.' }); return json(await reportNewOrders(p)); }
    if (action === 'getLiveOrders') return json(await getLiveOrders());
    if (action === 'ackLiveOrder') return json(await ackLiveOrder(p, me));
    if (action === 'logAssignedOrder') return json(await logAssignedOrder(p));
    if (action === 'getAssignedLog') return json(await getAssignedLog());
    if (action === 'setAutomationKey') {
      if (!me || String(me.role || '').toLowerCase() !== 'admin') return json({ success: false, error: 'Admin only.' });
      const k = String(p.key || '').trim();
      if (k.length < 8) return json({ success: false, error: 'The key looks too short. Copy it from the Tampermonkey script.' });
      await sbUpsert('order_settings', [{ key: 'automation_key', value: k }], 'key');
      keyCache = { v: k, at: Date.now() };
      return json({ success: true });
    }
    if (action === 'getAutomationInfo') {
      const st = await sbGet('unassigned_status', 'select=last_updated&order=id.desc&limit=1');
      return json({ success: true, keySet: !!(await automationKey()), lastReport: (st && st[0] && st[0].last_updated) || null });
    }

    return json({ success: false, error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return json({ success: false, error: 'Server error. Please try again.' }, 500);
  }
});
