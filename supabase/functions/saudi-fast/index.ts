// LALABELLA — SAUDI TRANSFERS (Supabase Edge Function, verify_jwt OFF). Nov 2026.
// Things lent from Bahrain to KSA (events) and what came back. Records only — no stock is added or taken.
//   saudi_transfers = one line per item SENT (a "transfer" = the lines with the same date + name)
//   saudi_returns   = every RETURN (back in a branch) or KEEP (stays in Saudi, "c/o Saudi") for a line — never overwritten
//   Still in Saudi  = qty sent − returned − kept (when the quantities are numbers)
// Who: staff (users.token) and the limited "Saudi Team" accounts (users.vtoken, role 'Saudi Team') can list, Send and Return.
//      Editing or deleting anything = Admin only.
// Photos: private bucket saudi-photos, signed links (1 h).
// Actions: list | send | returnItems | editLine (Admin) | editReturn (Admin) | deleteLine (Admin) | deleteReturn (Admin)
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
const SAUDI_ROLE = 'Saudi Team';
async function me(token: string) {
  const t = String(token || '').trim(); if (!/^[a-f0-9]{20,}$/i.test(t)) return null;
  const rows = await sbGet(`users?select=id,username,full_name,role,status,token,token_created,vtoken,vtoken_created&limit=1&or=(token.eq.${t},vtoken.eq.${t})`);
  const u = rows && rows[0]; if (!u || String(u.status || 'Active') !== 'Active') return null;
  const viaV = u.vtoken === t && u.token !== t;
  if (viaV && String(u.role) !== SAUDI_ROLE) return null;          // visitors: Messenger only
  const stamp = viaV ? u.vtoken_created : u.token_created;
  const c = stamp ? new Date(stamp).getTime() : 0;
  return c && Date.now() - c <= SESSION_MAX_AGE_MS ? u : null;
}
const isAdmin = (u: any) => String(u.role || '').toLowerCase() === 'admin';
const txt = (v: unknown, n: number) => String(v ?? '').replace(/\r/g, '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, n);   // keeps line breaks
const who = (u: any) => txt(u && (u.full_name || u.username), 60);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = (v: unknown) => { const n = Number(String(v ?? '').trim()); return String(v ?? '').trim() !== '' && Number.isFinite(n) && n >= 0 && n < 1e6 ? Math.round(n * 1000) / 1000 : null; };
const BR = (v: unknown) => txt(v, 40) || null;

// ---- photos (private bucket) ----
const BUCKET = 'saudi-photos';
const PUB = `${SB_URL}/storage/v1/object/public/${BUCKET}/`;
async function savePhoto(b64: string): Promise<string> {
  if (!b64) return '';
  const i = b64.indexOf(','), meta = i !== -1 ? b64.slice(0, i) : '', clean = i !== -1 ? b64.slice(i + 1) : b64;
  const m = meta.match(/data:([^;]+);/), ct = m ? m[1] : 'image/jpeg';
  if (!/^image\/(jpeg|png|webp)$/.test(ct)) return '';
  let bytes: Uint8Array; try { bytes = Uint8Array.from(atob(clean), c => c.charCodeAt(0)); } catch { return ''; }
  if (!bytes.length || bytes.length > 2_800_000) return '';
  const path = `sa-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ct.split('/')[1]}`;
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': ct, 'x-upsert': 'true' }, body: bytes });
  if (!r.ok) { console.error('photo upload', r.status, (await r.text()).slice(0, 200)); return ''; }
  return PUB + path;
}
async function sign(urls: string[]): Promise<Record<string, string>> {
  const paths = [...new Set(urls.filter(u => u && u.startsWith(PUB)).map(u => u.slice(PUB.length)))]; const out: Record<string, string> = {};
  if (!paths.length) return out;
  try {
    const r = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}`, { method: 'POST', headers: H, body: JSON.stringify({ expiresIn: 3600, paths }) });
    if (r.ok) (await r.json() || []).forEach((x: any) => { if (x && x.path && x.signedURL && !x.error) out[PUB + x.path] = `${SB_URL}/storage/v1${x.signedURL}`; });
  } catch (e) { console.error('sign', e); }
  return out;
}

async function list(u: any) {
  const [lines, rets] = await Promise.all([
    sbGetAll('saudi_transfers?select=*&order=batch_date.desc,batch_label.asc,sort_order.asc,id.asc'),
    sbGetAll('saudi_returns?select=*&order=return_date.asc.nullsfirst,id.asc'),
  ]);
  const signed = await sign([...lines.map((r: any) => r.photo_url), ...rets.map((r: any) => r.photo_url)].filter(Boolean));
  const byLine: Record<string, any[]> = {};
  rets.forEach((r: any) => { (byLine[r.line_id] = byLine[r.line_id] || []).push({ id: r.id, kind: r.kind, qty: r.qty == null ? null : Number(r.qty), date: r.return_date || '', branch: r.branch || '',
    by: r.received_by || '', notes: r.notes || '', photo: r.photo_url ? (signed[r.photo_url] || '') : '', source: r.source, savedBy: r.created_by || '', at: r.created_at }); });
  const rows = lines.map((r: any) => {
    const moves = byLine[r.id] || [];
    const sent = r.qty_sent == null ? null : Number(r.qty_sent);
    const back = moves.filter((m: any) => m.kind === 'return'), kept = moves.filter((m: any) => m.kind === 'keep');
    const sum = (a: any[]) => a.some((m: any) => m.qty == null) ? null : a.reduce((s: number, m: any) => s + m.qty, 0);
    const nBack = sum(back), nKept = sum(kept);
    let left: number | null = null, status = '';
    if (sent != null && nBack != null && nKept != null) { left = Math.max(0, Math.round((sent - nBack - nKept) * 1000) / 1000); status = left > 0 ? 'still' : (nKept > 0 && nBack === 0 ? 'kept' : 'back'); }
    else if (back.length || kept.length) status = kept.length && !back.length ? 'kept' : 'back';
    else status = /^\s*-\s*$/.test(String(r.returned || '')) ? 'unknown' : 'still';
    return { id: r.id, batch: r.batch_label, batchDate: r.batch_date, no: r.line_no, reference: r.reference || '', quantity: r.quantity || '', qtySent: sent, unit: r.unit || '',
      notes: r.notes || '', notesRows: r.notes_rows || 1, excelReturned: r.source === 'excel' ? (r.returned || '') : '', from: r.from_branch || '', givenTo: r.given_to || '',
      photo: r.photo_url ? (signed[r.photo_url] || '') : '', source: r.source, order: r.sort_order, by: r.created_by || '', at: r.created_at,
      moves, returned: nBack, kept: nKept, left, status };
  });
  return { success: true, rows, admin: isAdmin(u), limited: String(u.role) === SAUDI_ROLE, me: who(u) };
}

async function send(p: any, u: any) {
  const bd = String(p.batchDate || ''); if (!isDate(bd)) return { success: false, error: 'Pick the date it was sent.' };
  let lines: any[] = []; try { lines = JSON.parse(String(p.lines || '[]')); } catch { return { success: false, error: 'Bad list.' }; }
  lines = (Array.isArray(lines) ? lines : []).slice(0, 100).filter((l: any) => txt(l.reference, 400));
  if (!lines.length) return { success: false, error: 'Add at least one item.' };
  if (!p.photo) return { success: false, error: 'Add a picture of what was sent.' };
  const photo = await savePhoto(String(p.photo)); if (!photo) return { success: false, error: 'The picture could not be saved (too big or not a picture). Nothing was saved.' };
  const label = txt(p.batch, 60) || new Date(bd + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', timeZone: 'UTC' }).replace(' ', '-');
  const last = await sbGet(`saudi_transfers?select=sort_order,line_no&batch_date=eq.${bd}&batch_label=eq.${encodeURIComponent(label)}&order=sort_order.desc&limit=1`);
  const start = (last[0] && last[0].sort_order) || 0, notes = txt(p.notes, 400) || null;
  const rows = lines.map((l: any, i: number) => {
    const q = num(l.qty), unit = txt(l.unit, 20) || (q != null ? 'pcs' : null), det = txt(l.details, 300);
    return { batch_label: label, batch_date: bd, line_no: start + i + 1, sort_order: start + i + 1, reference: txt(l.reference, 400),
      qty_sent: q, unit, quantity: [q != null ? q + ' ' + (unit || '') : '', det].filter(Boolean).join('\n') || null,
      notes: i === 0 ? notes : null, notes_rows: i === 0 && notes ? lines.length : 1, from_branch: BR(p.from), given_to: txt(p.givenTo, 60) || null,
      photo_url: photo, source: 'manual', created_by: who(u) };
  });
  const r = await sbPost('saudi_transfers', rows);
  return { success: true, added: r.length, batch: label };
}

async function returnItems(p: any, u: any) {
  const kind = p.kind === 'keep' ? 'keep' : 'return';
  const d = String(p.date || ''); if (kind === 'return' && !isDate(d)) return { success: false, error: 'Pick the date it came back.' };
  const branch = BR(p.branch); if (kind === 'return' && !branch) return { success: false, error: 'Choose the branch that received it.' };
  let items: any[] = []; try { items = JSON.parse(String(p.items || '[]')); } catch { return { success: false, error: 'Bad list.' }; }
  items = (Array.isArray(items) ? items : []).slice(0, 200).filter((x: any) => Number.isInteger(Number(x.lineId)) && Number(x.lineId) > 0);
  if (!items.length) return { success: false, error: 'Tick at least one item.' };
  const ids = [...new Set(items.map((x: any) => Number(x.lineId)))];
  const found = await sbGet(`saudi_transfers?select=id&id=in.(${ids.join(',')})`);
  if ((found || []).length !== ids.length) return { success: false, error: 'Some items were not found. Refresh and try again.' };
  if (!p.photo) return { success: false, error: kind === 'keep' ? 'Add a picture.' : 'Add a picture of what came back.' };
  const photo = await savePhoto(String(p.photo)); if (!photo) return { success: false, error: 'The picture could not be saved (too big or not a picture). Nothing was saved.' };
  const rows = items.map((x: any) => ({ line_id: Number(x.lineId), kind, qty: num(x.qty), return_date: isDate(d) ? d : null, branch: kind === 'return' ? branch : null,
    received_by: txt(p.receivedBy, 60) || who(u), notes: txt(x.notes || p.notes, 300) || null, photo_url: photo, source: 'manual', created_by: who(u) }));
  const r = await sbPost('saudi_returns', rows);
  return { success: true, saved: r.length };
}

async function editLine(p: any, u: any) {
  const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid.' };
  const f: any = { updated_by: who(u), updated_at: new Date().toISOString() };
  if (p.reference !== undefined) { f.reference = txt(p.reference, 400); if (!f.reference) return { success: false, error: 'Reference cannot be empty.' }; }
  if (p.quantity !== undefined) f.quantity = txt(p.quantity, 300) || null;
  if (p.qtySent !== undefined) f.qty_sent = num(p.qtySent);
  if (p.unit !== undefined) f.unit = txt(p.unit, 20) || null;
  if (p.notes !== undefined) f.notes = txt(p.notes, 400) || null;
  if (p.no !== undefined) { const n = parseInt(String(p.no), 10); f.line_no = Number.isFinite(n) && n > 0 ? n : null; }
  if (p.from !== undefined) f.from_branch = BR(p.from);
  if (p.givenTo !== undefined) f.given_to = txt(p.givenTo, 60) || null;
  if (p.photo) { const ph = await savePhoto(String(p.photo)); if (!ph) return { success: false, error: 'The picture could not be saved.' }; f.photo_url = ph; }
  await sbPatch('saudi_transfers', `id=eq.${id}`, f);
  return { success: true };
}
async function editReturn(p: any, u: any) {
  const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid.' };
  const f: any = { updated_by: who(u), updated_at: new Date().toISOString() };
  if (p.qty !== undefined) f.qty = num(p.qty);
  if (p.date !== undefined) f.return_date = isDate(String(p.date)) ? String(p.date) : null;
  if (p.branch !== undefined) f.branch = BR(p.branch);
  if (p.receivedBy !== undefined) f.received_by = txt(p.receivedBy, 60) || null;
  if (p.notes !== undefined) f.notes = txt(p.notes, 300) || null;
  if (p.kind === 'keep' || p.kind === 'return') f.kind = p.kind;
  if (p.photo) { const ph = await savePhoto(String(p.photo)); if (!ph) return { success: false, error: 'The picture could not be saved.' }; f.photo_url = ph; }
  await sbPatch('saudi_returns', `id=eq.${id}`, f);
  return { success: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = new URL(req.url); const p: any = Object.fromEntries(url.searchParams);
    if (req.method === 'POST') { const ct = req.headers.get('content-type') || ''; const t = await req.text();
      Object.assign(p, ct.includes('json') ? JSON.parse(t || '{}') : Object.fromEntries(new URLSearchParams(t))); }
    const u = await me(p.token); if (!u) return json({ success: false, error: 'Please log in again.' }, 401);
    const a = String(p.action || '');
    if (a === 'list') return json(await list(u));
    if (a === 'send') return json(await send(p, u));
    if (a === 'returnItems') return json(await returnItems(p, u));
    if (['editLine', 'editReturn', 'deleteLine', 'deleteReturn'].includes(a)) {
      if (!isAdmin(u)) return json({ success: false, error: 'Only an admin can change or delete. Tell the admin what to fix.' });
      if (a === 'editLine') return json(await editLine(p, u));
      if (a === 'editReturn') return json(await editReturn(p, u));
      const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return json({ success: false, error: 'Invalid.' });
      await sbDelete(a === 'deleteLine' ? 'saudi_transfers' : 'saudi_returns', `id=eq.${id}`);
      return json({ success: true });
    }
    return json({ success: false, error: 'Unknown action.' }, 400);
  } catch (e) { console.error(e); return json({ success: false, error: 'Server error. Please try again.' }, 500); }
});
