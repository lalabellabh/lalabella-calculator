// LALABELLA — SAUDI TRANSFERS (Supabase Edge Function, verify_jwt OFF). Nov 2026.
// Things lent from Bahrain to KSA (events) and what came back — same layout as Bench's Excel "TRANSFERS (BAHRAIN TO KSA)":
// NO. · REFERENCE · QUANTITY · NOTES · DATE RETURNED / RECEIVED IN GALALI. One "batch" = one transfer date.
// Table saudi_transfers. Imported from TRANSFERS_TO_SAUDI.xlsx (source 'excel'); new ones added on saudi-transfers.html.
// Actions: list | save (add / edit one line, any logged-in staff) | addBatch (several lines at once) | delete (Admin)
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BRANCHES = ['ModaMall', 'Hamala', 'Galali'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
async function sbGet(path: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`db ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}
async function sbGetAll(path: string) {
  const out: any[] = []; let from = 0;
  for (;;) {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { ...H, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`db ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const rows = await r.json(); out.push(...rows);
    if (rows.length < 1000) return out; from += 1000;
  }
}
async function sbPost(table: string, rows: unknown[]) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(rows) });
  const t = await r.text(); if (!r.ok) throw new Error(`db ${r.status}: ${t.slice(0, 300)}`); return t ? JSON.parse(t) : [];
}
async function sbPatch(table: string, filter: string, fields: unknown) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(fields) });
  if (!r.ok) throw new Error(`db ${r.status}: ${(await r.text()).slice(0, 300)}`);
}
async function sbDelete(table: string, filter: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, { method: 'DELETE', headers: H });
  if (!r.ok) throw new Error(`db ${r.status}: ${(await r.text()).slice(0, 300)}`);
}
async function sbRpc(fn: string, args: unknown) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`rpc ${r.status}: ${(await r.text()).slice(0, 300)}`); return r.json();
}
async function me(token: string) {
  const t = String(token || '').trim(); if (!t) return null;
  const rows = await sbGet(`users?select=username,full_name,role,status,token_created,branch&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0]; if (!u || String(u.status || 'Active') === 'Inactive') return null;
  const c = u.token_created ? new Date(u.token_created).getTime() : 0;
  return c && Date.now() - c <= SESSION_MAX_AGE_MS ? u : null;
}
const txt = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').replace(/\r/g, '').trim().slice(0, n);   // keeps line breaks
const who = (u: any) => txt(u && (u.full_name || u.username), 60);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const outRow = (r: any) => ({ id: r.id, batch: r.batch_label, batchDate: r.batch_date, no: r.line_no, reference: r.reference || '', quantity: r.quantity || '',
  notes: r.notes || '', notesRows: r.notes_rows || 1, returned: r.returned || '', returnedDate: r.returned_date || '', source: r.source, order: r.sort_order,
  by: r.created_by || '', at: r.created_at, editedBy: r.updated_by || '', editedAt: r.updated_at || '' });
function lineFields(p: any) {
  const f: Record<string, unknown> = {
    reference: txt(p.reference, 400) || null, quantity: txt(p.quantity, 300) || null, notes: txt(p.notes, 400) || null,
    returned: txt(p.returned, 300) || null, returned_date: isDate(String(p.returnedDate || '')) ? String(p.returnedDate) : null,
  };
  const n = parseInt(String(p.no ?? ''), 10); f.line_no = Number.isFinite(n) && n > 0 && n < 10000 ? n : null;
  return f;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = new URL(req.url); let p: any = Object.fromEntries(url.searchParams);
    if (req.method === 'POST') { const ct = req.headers.get('content-type') || ''; const t = await req.text();
      Object.assign(p, ct.includes('json') ? JSON.parse(t || '{}') : Object.fromEntries(new URLSearchParams(t))); }
    const u = await me(p.token); if (!u) return json({ success: false, error: 'Please log in again.' }, 401);
    const a = String(p.action || '');
    if (a === 'list') {
      const rows = await sbGetAll('saudi_transfers?select=*&order=batch_date.desc,batch_label.asc,sort_order.asc,id.asc');
      return json({ success: true, rows: (rows || []).map(outRow), admin: String(u.role || '').toLowerCase() === 'admin' });
    }
    if (a === 'save') {
      const f = lineFields(p); const id = Number(p.id);
      if (!f.reference) return json({ success: false, error: 'Write what was sent (Reference).' });
      if (Number.isInteger(id) && id > 0) {
        await sbPatch('saudi_transfers', `id=eq.${id}`, { ...f, updated_by: who(u), updated_at: new Date().toISOString() });
        return json({ success: true, id });
      }
      const bd = String(p.batchDate || ''); if (!isDate(bd)) return json({ success: false, error: 'Pick the transfer date.' });
      const label = txt(p.batch, 60) || bd;
      const last = await sbGet(`saudi_transfers?select=sort_order&batch_date=eq.${bd}&batch_label=eq.${encodeURIComponent(label)}&order=sort_order.desc&limit=1`);
      const r = await sbPost('saudi_transfers', [{ ...f, batch_label: label, batch_date: bd, sort_order: ((last[0] && last[0].sort_order) || 0) + 1, notes_rows: 1, source: 'manual', created_by: who(u) }]);
      return json({ success: true, id: r[0] && r[0].id });
    }
    if (a === 'addBatch') {
      const bd = String(p.batchDate || ''); if (!isDate(bd)) return json({ success: false, error: 'Pick the transfer date.' });
      const label = txt(p.batch, 60) || bd; let lines: any[] = [];
      try { lines = JSON.parse(String(p.lines || '[]')); } catch { return json({ success: false, error: 'Bad list.' }); }
      lines = (Array.isArray(lines) ? lines : []).slice(0, 100).map((l: any) => lineFields(l)).filter((f: any) => f.reference);
      if (!lines.length) return json({ success: false, error: 'Add at least one item.' });
      const notes = txt(p.notes, 400) || null;
      const rows = lines.map((f: any, i: number) => ({ ...f, line_no: f.line_no || i + 1, notes: i === 0 ? (notes || f.notes) : f.notes, notes_rows: i === 0 && notes ? lines.length : 1,
        batch_label: label, batch_date: bd, sort_order: i + 1, source: 'manual', created_by: who(u) }));
      const r = await sbPost('saudi_transfers', rows);
      return json({ success: true, added: r.length });
    }
    if (a === 'delete') {
      if (String(u.role || '').toLowerCase() !== 'admin') return json({ success: false, error: 'Admin only.' });
      const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return json({ success: false, error: 'Invalid.' });
      await sbDelete('saudi_transfers', `id=eq.${id}`);
      return json({ success: true });
    }
    return json({ success: false, error: 'Unknown action.' }, 400);
  } catch (e) { console.error(e); return json({ success: false, error: 'Server error. Please try again.' }, 500); }
});
