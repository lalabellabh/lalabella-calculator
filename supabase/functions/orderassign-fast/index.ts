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
  const rows = await sbGet('users', `select=id,status,token_created,role&limit=1&token=eq.${encodeURIComponent(t)}`);
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
  const extra = { pendingApprovals: total, approvalsDetail: appr };
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

async function readParams(req: Request): Promise<Record<string, any>> {
  if (req.method === 'GET') { const u = new URL(req.url); return Object.fromEntries(u.searchParams.entries()); }
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await req.json();
  const t = await req.text();
  return Object.fromEntries(new URLSearchParams(t));
}

const AUTOMATION_ACTIONS = new Set(['getBranchConfig', 'reportUnassignedStatus']);

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
