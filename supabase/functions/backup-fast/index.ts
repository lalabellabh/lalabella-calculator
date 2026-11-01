// LALABELLA BACKUP (Supabase Edge Function)
// Gives an admin a full copy of the database (every table in schema public) as one JSON file. Read-only.
// Same gate as User Management: own session token + "can manage users" + the 15-minute password unlock.
// Action: export
//
// Left out on purpose: admin_unlock and write_action_dedup (temporary), and login sessions
// (users.token, token_created, failed_attempts, locked_until) so the file holds no live session.
// It DOES contain password hashes and the invite code, so the file must be kept private.
// Not included: the files in storage (profile photos); those are small and re-uploadable.

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ADMIN_UNLOCK_MINUTES = 15;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function rest(method: string, path: string, body?: unknown, prefer = 'return=representation') {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 300)}`);
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

async function sessionUser(token: string) {
  const t = String(token || '').trim();
  if (!t) return null;
  const rows = await rest('GET', `users?select=id,username,role,status,token_created,can_manage_users&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0];
  if (!u) return null;
  if (String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}
async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// Same unlock as User Management (table admin_unlock); extends it by 15 minutes like every admin action does.
async function checkAndExtendUnlock(token: string): Promise<boolean> {
  const key = 'unlock:' + await sha256Hex(String(token || '').trim());
  const rows = await rest('GET', `admin_unlock?select=*&unlock_key=eq.${encodeURIComponent(key)}&limit=1`);
  const row = rows && rows[0];
  const now = Date.now();
  if (!row || !row.unlocked_until || new Date(row.unlocked_until).getTime() <= now) return false;
  await rest('PATCH', `admin_unlock?unlock_key=eq.${encodeURIComponent(key)}`, { unlocked_until: new Date(now + ADMIN_UNLOCK_MINUTES * 60000).toISOString() }, 'return=minimal');
  return true;
}

const SKIP_TABLES = new Set(['admin_unlock', 'write_action_dedup']);
const STRIP_COLUMNS: Record<string, string[]> = { users: ['token', 'token_created', 'failed_attempts', 'locked_until'] };
const PAGE = 1000;

async function tableNames(): Promise<string[]> {
  const res = await fetch(`${SB_URL}/rest/v1/`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: 'application/openapi+json' } });
  if (!res.ok) throw new Error('could not list tables (' + res.status + ')');
  const spec = await res.json();
  const names = Object.keys(spec.definitions || {}).filter(n => !SKIP_TABLES.has(n)).sort();
  if (!names.length) throw new Error('no tables found to back up');
  return names;
}

async function readTable(name: string): Promise<any[]> {
  const rows: any[] = [];
  for (let off = 0; off < 500000; off += PAGE) {
    const page = await rest('GET', `${encodeURIComponent(name)}?select=*&limit=${PAGE}&offset=${off}`);
    if (!Array.isArray(page)) break;
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  const strip = STRIP_COLUMNS[name];
  if (strip) for (const r of rows) for (const c of strip) delete r[c];
  return rows;
}

async function exportAll() {
  const names = await tableNames();
  const tables: Record<string, any[]> = {};
  const failed: { table: string; error: string }[] = [];
  const counts: Record<string, number> = {};
  for (let i = 0; i < names.length; i += 6) {
    await Promise.all(names.slice(i, i + 6).map(async n => {
      try { const rows = await readTable(n); tables[n] = rows; counts[n] = rows.length; }
      catch (e: any) { failed.push({ table: n, error: String(e && e.message || e).slice(0, 200) }); }
    }));
  }
  return { success: failed.length === 0, partial: failed.length > 0, exportedAt: new Date().toISOString(), tableCount: Object.keys(tables).length, counts, failed, tables };
}

async function readParams(req: Request): Promise<Record<string, string>> {
  const p: Record<string, string> = {};
  new URL(req.url).searchParams.forEach((v, k) => { p[k] = v; });
  if (req.method === 'POST') {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) Object.assign(p, await req.json().catch(() => ({})));
    else new URLSearchParams(await req.text()).forEach((v, k) => { p[k] = v; });
  }
  return p;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const p = await readParams(req);
    const user = await sessionUser(p.token);
    if (!user) return json({ success: false, error: 'Unauthorized. Please log in again.' });
    if (String(p.action || '') !== 'export') return json({ success: false, error: 'Unknown action' });
    if (!user.can_manage_users) return json({ success: false, error: 'Only admins can download a backup.' });
    if (!(await checkAndExtendUnlock(p.token))) return json({ success: false, reauth: true, error: 'Please confirm your password.' });
    return json(await exportAll());
  } catch (err) {
    console.error(err);
    return json({ success: false, error: 'Server error. Please try again.' }, 500);
  }
});
