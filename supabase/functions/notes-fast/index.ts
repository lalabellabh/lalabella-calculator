// LALABELLA NOTES — FAST PATH (Supabase Edge Function)
// Ported from the Notes Apps Script (already reading from Supabase
// tables notes, card_notes) — same action + field names, no data
// migration.
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
async function sbDelete(table: string, query: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'return=representation' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}

async function isValidSession(token: string) {
  const t = String(token || '').trim();
  if (!t) return false;
  const rows = await sbGet('users', `select=id,status,token_created&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0];
  if (!u) return false;
  if (String(u.status || 'Active') === 'Inactive') return false;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  return !!created && Date.now() - created <= SESSION_MAX_AGE_MS;
}

function mapNoteRow(row: any) {
  return { ID: String(row.id), Title: row.title || '', Message: row.message || '', Created: row.created_at, Edited: row.edited_at || '' };
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
    if (!(await isValidSession(p.token))) return json({ success: false, error: 'Unauthorized. Please log in again.' });

    if (action === 'getNotes') {
      const rows = await sbGet('notes', 'select=id,title,message,created_at,edited_at&order=id.asc');
      return json(rows.map(mapNoteRow));
    }
    if (action === 'addNote') {
      const inserted = await sbPost('notes', [{ title: p.title || '', message: p.message || '' }]);
      return json({ success: true, id: String(inserted[0].id) });
    }
    if (action === 'updateNote') {
      const result = await sbPatch('notes', `id=eq.${encodeURIComponent(p.id)}`, { title: p.title || '', message: p.message || '', edited_at: new Date().toISOString() });
      if (!result.length) return json({ success: false, error: 'Note not found' });
      return json({ success: true });
    }
    if (action === 'deleteNote') {
      const result = await sbDelete('notes', `id=eq.${encodeURIComponent(p.id)}`);
      if (!result.length) return json({ success: false, error: 'Note not found' });
      return json({ success: true });
    }
    if (action === 'getCardNotes') {
      const rows = await sbGet('card_notes', 'select=id,title,message&order=id.asc');
      return json(rows.map((r: any) => ({ row: r.id, title: r.title || '', message: r.message || '' })));
    }
    if (action === 'addCardNote') {
      const inserted = await sbPost('card_notes', [{ title: p.title || '', message: p.message || '' }]);
      return json({ success: true, row: inserted[0].id });
    }
    if (action === 'updateCardNote') {
      const rowNum = Number(p.row);
      await sbPatch('card_notes', `id=eq.${rowNum}`, { title: p.title || '', message: p.message || '' });
      return json({ success: true });
    }
    if (action === 'deleteCardNote') {
      const rowNum = Number(p.row);
      await sbDelete('card_notes', `id=eq.${rowNum}`);
      return json({ success: true });
    }

    return json({ error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return json({ error: 'Server error. Please try again.' }, 500);
  }
});
