// LALABELLA AUTO-BACKUP (Supabase Edge Function, verify_jwt OFF)  v2
// Every day (pg_cron, 2:00 AM Bahrain) it copies every table of schema public AND the database structure (schema.sql text:
// tables, indexes, RLS, functions, triggers, cron jobs, buckets) into ONE gzip-ed JSON file in the PRIVATE bucket
// 'db-backups' (lalabella-YYYY-MM-DD.json.gz, Bahrain date) and keeps the newest 14. Also cleans error_log older than 30 days.
// Actions:
//   run      - internal only: needs `key` = push_config.internal_key (the cron job sends it from the database)
//   runNow   - admin (session + can manage users + 15-min password unlock): make a backup right now
//   list     - admin: the backup files + the last runs
//   sign     - admin: {file} -> a 5-minute download link
// The file holds password hashes (needed to restore logins) - it never leaves the private bucket except by a signed link to an admin.
// Left out: admin_unlock, write_action_dedup, backup_runs, error_log; users.token/token_created/failed_attempts/locked_until.

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ADMIN_UNLOCK_MINUTES = 15;
const BUCKET = 'db-backups';
const KEEP = 14;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

async function rest(method: string, path: string, body?: unknown, prefer = 'return=representation') {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method, headers: { ...H, 'Content-Type': 'application/json', Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 300)}`);
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

async function sessionUser(token: string) {
  const t = String(token || '').trim();
  if (!/^[a-f0-9]{20,}$/i.test(t)) return null;
  const rows = await rest('GET', `users?select=id,username,role,status,token_created,can_manage_users&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0];
  if (!u || String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}
async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function checkAndExtendUnlock(token: string): Promise<boolean> {
  const key = 'unlock:' + await sha256Hex(String(token || '').trim());
  const rows = await rest('GET', `admin_unlock?select=*&unlock_key=eq.${encodeURIComponent(key)}&limit=1`);
  const row = rows && rows[0];
  const now = Date.now();
  if (!row || !row.unlocked_until || new Date(row.unlocked_until).getTime() <= now) return false;
  await rest('PATCH', `admin_unlock?unlock_key=eq.${encodeURIComponent(key)}`, { unlocked_until: new Date(now + ADMIN_UNLOCK_MINUTES * 60000).toISOString() }, 'return=minimal');
  return true;
}

const SKIP_TABLES = new Set(['admin_unlock', 'write_action_dedup', 'backup_runs', 'error_log']);
const STRIP_COLUMNS: Record<string, string[]> = { users: ['token', 'token_created', 'failed_attempts', 'locked_until'] };
const PAGE = 1000;

async function tableNames(): Promise<string[]> {
  const res = await fetch(`${SB_URL}/rest/v1/`, { headers: { ...H, Accept: 'application/openapi+json' } });
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

const bhDate = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);

async function runBackup(by: string) {
  const file = `lalabella-${bhDate()}.json.gz`;
  try {
    const names = await tableNames();
    const tables: Record<string, any[]> = {};
    const failed: { table: string; error: string }[] = [];
    for (let i = 0; i < names.length; i += 6) {
      await Promise.all(names.slice(i, i + 6).map(async n => {
        try { tables[n] = await readTable(n); }
        catch (e: any) { failed.push({ table: n, error: String(e && e.message || e).slice(0, 200) }); }
      }));
    }
    if (failed.length) throw new Error('could not read: ' + failed.map(f => f.table).join(', '));
    let schema = '';
    try { const s = await rest('POST', 'rpc/lb_schema_snapshot', {}); if (typeof s === 'string') schema = s; } catch (e) { console.error('[autobackup] schema', e); }
    const rowsTotal = Object.values(tables).reduce((a, r) => a + r.length, 0);
    const text = JSON.stringify({ app: 'lalabella', exportedAt: new Date().toISOString(), by, tableCount: names.length, rowsTotal, schema, tables });
    const gz = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(gz).arrayBuffer());
    const up = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${file}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/gzip', 'x-upsert': 'true' }, body: buf });
    if (!up.ok) throw new Error('upload failed ' + up.status + ' ' + (await up.text()).slice(0, 150));
    await rest('POST', 'backup_runs', { file, bytes: buf.length, tables: names.length, rows_total: rowsTotal, ok: true }, 'return=minimal');
    await prune();
    try { await rest('DELETE', `error_log?at=lt.${encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString())}`, undefined, 'return=minimal'); } catch (_) { /* ignore */ }
    return { success: true, file, bytes: buf.length, tables: names.length, rows: rowsTotal, schema: schema.length > 0 };
  } catch (e: any) {
    const msg = String(e && e.message || e).slice(0, 300);
    try { await rest('POST', 'backup_runs', { file, ok: false, error: msg }, 'return=minimal'); } catch (_) { /* ignore */ }
    console.error('[autobackup]', msg);
    return { success: false, error: msg };
  }
}

async function listFiles(): Promise<{ name: string; size: number; at: string }[]> {
  const r = await fetch(`${SB_URL}/storage/v1/object/list/${BUCKET}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 200, sortBy: { column: 'name', order: 'desc' } }) });
  if (!r.ok) throw new Error('list failed ' + r.status);
  const arr = await r.json();
  return (arr || []).filter((o: any) => /^lalabella-.*\.json\.gz$/.test(o.name)).map((o: any) => ({ name: o.name, size: Number(o.metadata && o.metadata.size) || 0, at: o.created_at || o.updated_at || '' }));
}
async function prune() {
  const files = await listFiles();
  const old = files.slice(KEEP).map(f => f.name);
  if (!old.length) return;
  await fetch(`${SB_URL}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: old }) });
}

async function readParams(req: Request): Promise<Record<string, any>> {
  if (req.method === 'GET') return Object.fromEntries(new URL(req.url).searchParams.entries());
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await req.json();
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const p = await readParams(req);
    const action = String(p.action || '');

    if (action === 'run') {
      const c = await rest('GET', 'push_config?select=internal_key&id=eq.1&limit=1');
      if (!c || !c[0] || !p.key || String(p.key) !== c[0].internal_key) return json({ success: false, error: 'Unauthorized.' }, 401);
      return json(await runBackup('schedule'));
    }

    const user = await sessionUser(p.token);
    if (!user) return json({ success: false, error: 'Unauthorized. Please log in again.' }, 401);
    if (String(user.role || '') !== 'Admin' || user.can_manage_users !== true) return json({ success: false, error: 'You do not have access to backups.' }, 403);
    if (!(await checkAndExtendUnlock(p.token))) return json({ success: false, reauth: true, error: 'Please confirm your password (reload the page).' });

    if (action === 'runNow') return json(await runBackup(user.username));
    if (action === 'list') {
      const [files, runs] = await Promise.all([listFiles(), rest('GET', 'backup_runs?select=at,file,bytes,tables,rows_total,ok,error&order=id.desc&limit=15')]);
      return json({ success: true, files, runs: runs || [] });
    }
    if (action === 'sign') {
      const file = String(p.file || '');
      if (!/^lalabella-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(file)) return json({ success: false, error: 'Invalid file.' });
      const r = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${file}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.signedURL) return json({ success: false, error: 'Could not make a link.' });
      console.log('[autobackup] download link by', user.username, file);
      return json({ success: true, url: SB_URL + '/storage/v1' + d.signedURL });
    }
    return json({ success: false, error: 'Unknown action' }, 400);
  } catch (err) {
    console.error(err);
    return json({ success: false, error: 'Server error. Please try again.' }, 500);
  }
});
