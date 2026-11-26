// LALABELLA — EVENT RECEIVING (Supabase Edge Function, verify_jwt OFF). Nov 26 2026.
// Bench: "parang flower receiving — may invoice, flower list, may total — pero may pangalan, used by events,
// para makita lang na ginamit sa events". Decisions (Bench, Nov 26): it does NOT go into the branch stock and it is
// NOT counted in the weekly flower budget. It is a record of what was bought for each event, with its total.
// Table: event_receiving (RLS on, only this function reads/writes it).
// Actions: list | save (new or edit) | remove (soft delete: creator same day, Admin any time) | names (event names typed before)

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BRANCHES = ['ModaMall', 'Hamala', 'Galali'];
const TYPES = ['Flower', 'Chocolate', 'Other'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
async function sbGet(path: string) { const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H }); if (!r.ok) throw new Error(await r.text()); return await r.json(); }
async function sbPost(table: string, rows: unknown) { const r = await fetch(`${SB_URL}/rest/v1/${table}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(rows) }); if (!r.ok) throw new Error(await r.text()); return await r.json(); }
async function sbPatch(table: string, filter: string, fields: unknown) { const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(fields) }); if (!r.ok) throw new Error(await r.text()); return await r.json(); }
async function me(token: string) {
  const t = String(token || '').trim(); if (!t) return null;
  const rows = await sbGet(`users?select=username,full_name,role,status,token_created,branch&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0]; if (!u || String(u.status || 'Active') === 'Inactive') return null;
  const c = u.token_created ? new Date(u.token_created).getTime() : 0;
  return c && Date.now() - c <= SESSION_MAX_AGE_MS ? u : null;
}
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const txt = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const who = (u: any) => txt(u && (u.full_name || u.username), 60);
const day = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
const bhToday = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);

function out(r: any) {
  return { id: r.id, eventName: r.event_name, eventDate: r.event_date, branch: r.branch || '', supplier: r.supplier || '', invoiceNo: r.invoice_no || '',
    date: r.entry_date, items: Array.isArray(r.items) ? r.items : [], subtotal: Number(r.subtotal) || 0, vatPercent: Number(r.vat_percent) || 0, vat: Number(r.vat) || 0,
    total: Number(r.total) || 0, paperTotal: r.paper_total == null ? null : Number(r.paper_total), notes: r.notes || '', by: r.created_by || '', at: r.created_at,
    editedBy: r.edited_by || '', editedAt: r.edited_at || null };
}
async function list(p: any) {
  let q = 'event_receiving?select=*&deleted_at=is.null&order=entry_date.desc,id.desc';
  if (BRANCHES.indexOf(String(p.branch || '')) !== -1) q += '&branch=eq.' + encodeURIComponent(p.branch);
  if (day(p.from)) q += '&entry_date=gte.' + p.from;
  if (day(p.to)) q += '&entry_date=lte.' + p.to;
  q += '&limit=' + Math.min(1000, Math.max(1, Number(p.limit) || 300));
  const rows = (await sbGet(q)).map(out);
  return { success: true, rows };
}
async function save(p: any, u: any, admin: boolean) {
  const ev = txt(p.eventName, 80);
  if (!ev) return { success: false, error: 'Type the event name.' };
  let items: any[] = []; try { items = JSON.parse(p.items || '[]'); } catch { items = []; }
  items = (Array.isArray(items) ? items : []).slice(0, 200).map((it: any) => {
    const qty = r3(Number(it && it.qty) || 0), rate = r3(Number(it && it.rate) || 0);
    return { type: TYPES.indexOf(String(it && it.type)) !== -1 ? String(it.type) : 'Other', name: txt(it && it.name, 120), code: txt(it && it.code, 40), qty, unit: txt(it && it.unit, 20) || 'pcs', rate, subtotal: r3(qty * rate) };
  }).filter((it: any) => it.name && it.qty > 0);
  if (!items.length) return { success: false, error: 'Add at least one item with a Qty.' };
  const vp = Math.max(0, Math.min(100, Number(p.vatPercent) || 0));
  const subtotal = r3(items.reduce((s: number, it: any) => s + it.subtotal, 0)), vat = r3(subtotal * vp / 100);
  const paper = p.paperTotal === '' || p.paperTotal == null || isNaN(Number(p.paperTotal)) ? null : r3(Number(p.paperTotal));
  const br = BRANCHES.indexOf(String(p.branch || '')) !== -1 ? String(p.branch) : null;
  const row: any = { event_name: ev, event_date: day(p.eventDate), branch: br, supplier: txt(p.supplier, 80) || null, invoice_no: txt(p.invoiceNo, 40) || null,
    entry_date: day(p.date) || bhToday(), items, subtotal, vat_percent: vp, vat, total: r3(subtotal + vat), paper_total: paper, notes: txt(p.notes, 300) || null };
  const id = Number(p.id) || 0;
  if (id) {
    const old = (await sbGet(`event_receiving?select=id,created_by,created_at&id=eq.${id}&deleted_at=is.null`))[0];
    if (!old) return { success: false, error: 'This event receiving is gone. Refresh.' };
    if (!admin && old.created_by !== who(u)) return { success: false, error: 'Only the one who saved it (or an Admin) can edit it.' };
    const r = await sbPatch('event_receiving', `id=eq.${id}`, { ...row, edited_by: who(u), edited_at: new Date().toISOString() });
    return { success: true, row: out(r[0]) };
  }
  // the same invoice saved twice for the same event = a double tap -> keep the first one
  if (row.invoice_no) {
    const dup = await sbGet(`event_receiving?select=*&deleted_at=is.null&invoice_no=eq.${encodeURIComponent(row.invoice_no)}&event_name=eq.${encodeURIComponent(ev)}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 10 * 60000).toISOString())}&limit=1`);
    if (dup.length) return { success: true, duplicate: true, row: out(dup[0]) };
  }
  const r = await sbPost('event_receiving', [{ ...row, created_by: who(u) }]);
  return { success: true, row: out(r[0]) };
}
async function remove(p: any, u: any, admin: boolean) {
  const id = Number(p.id) || 0;
  const r = (await sbGet(`event_receiving?select=id,created_by,created_at&id=eq.${id}&deleted_at=is.null`))[0];
  if (!r) return { success: false, error: 'Already removed. Refresh.' };
  const sameDay = new Date(r.created_at).getTime() > Date.now() - 24 * 3600000;
  if (!admin && !(r.created_by === who(u) && sameDay)) return { success: false, error: 'Only an Admin can remove it (or the one who saved it, within 24 hours).' };
  await sbPatch('event_receiving', `id=eq.${id}`, { deleted_at: new Date().toISOString(), deleted_by: who(u) });   // kept in the table, just hidden
  return { success: true };
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
    const u = await me(p.token);
    if (!u) return json({ success: false, error: 'Please log in again.' });
    const admin = String(u.role || '').toLowerCase() === 'admin';
    const a = String(p.action || '');
    if (a === 'list') return json({ ...(await list(p)), admin, me: who(u), userBranch: u.branch || '' });
    if (a === 'save') return json(await save(p, u, admin));
    if (a === 'remove') return json(await remove(p, u, admin));
    if (a === 'names') { const r = await sbGet('event_receiving?select=event_name&deleted_at=is.null&order=id.desc&limit=300'); return json({ success: true, names: [...new Set(r.map((x: any) => x.event_name))].slice(0, 60) }); }
    return json({ success: false, error: 'Unknown action.' });
  } catch (e) {
    return json({ success: false, error: 'Server error: ' + String((e as Error).message || e).slice(0, 200) });
  }
});
