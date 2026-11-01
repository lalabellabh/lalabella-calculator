// LALABELLA ACTIVITY HISTORY (audit-fast) — Supabase Edge Function, verify_jwt OFF
// Reads audit.log (what changed / what was deleted), can put back a deleted row / undo an update, and shows the Bug History (error_log).
// Same gate as User Management and System Health: own session token + Admin + "can manage users" + the 15-minute password unlock.
// Actions: tables, list {table,op,pk,q,from,to,before,limit}, restore {id}, errors {q,before,limit}, clearErrors

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
const enc = encodeURIComponent;

async function rest(method: string, path: string, body?: unknown, prefer?: string) {
  const headers: Record<string, string> = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function manager(token: string) {
  const t = String(token || '').trim();
  if (!/^[a-f0-9]{20,}$/i.test(t)) return null;
  const rows = await rest('GET', `users?select=id,username,role,status,token_created,can_manage_users&limit=1&token=eq.${enc(t)}`);
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
  const rows = await rest('GET', `admin_unlock?select=*&unlock_key=eq.${enc(key)}&limit=1`);
  const row = rows && rows[0];
  const now = Date.now();
  if (!row || !row.unlocked_until || new Date(row.unlocked_until).getTime() <= now) return false;
  await rest('PATCH', `admin_unlock?unlock_key=eq.${enc(key)}`, { unlocked_until: new Date(now + ADMIN_UNLOCK_MINUTES * 60000).toISOString() }, 'return=minimal');
  return true;
}

async function readParams(req: Request): Promise<Record<string, any>> {
  if (req.method === 'GET') return Object.fromEntries(new URL(req.url).searchParams.entries());
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await req.json();
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

const iso = (v: unknown) => { const d = new Date(String(v || '')); return isNaN(d.getTime()) ? null : d.toISOString(); };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const p = await readParams(req);
    const me = await manager(p.token);
    if (!me) return json({ success: false, error: 'Unauthorized. Please log in again.' }, 401);
    if (String(me.role || '') !== 'Admin' || me.can_manage_users !== true)
      return json({ success: false, error: 'You do not have access to Activity History.' }, 403);
    if (!(await checkAndExtendUnlock(p.token))) return json({ success: false, reauth: true, error: 'Please confirm your password (reload the page).' });

    if (p.action === 'tables') {
      return json({ success: true, tables: await rest('POST', 'rpc/audit_tables', {}) });
    }
    if (p.action === 'list') {
      const rows = await rest('POST', 'rpc/audit_list', {
        p_table: String(p.table || '').slice(0, 80), p_op: String(p.op || '').slice(0, 10), p_pk: String(p.pk || '').slice(0, 80),
        p_q: String(p.q || '').slice(0, 80), p_from: iso(p.from), p_to: iso(p.to),
        p_before: Number(p.before) > 0 ? Number(p.before) : null, p_limit: Number(p.limit) || 50,
      });
      return json({ success: true, rows });
    }
    if (p.action === 'restore') {
      const id = Number(p.id);
      if (!Number.isInteger(id) || id < 1) return json({ success: false, error: 'Invalid entry.' });
      const r = await rest('POST', 'rpc/audit_restore', { p_id: id });
      if (r && r.error) return json({ success: false, error: r.error });
      console.log('[audit-fast] restore by', me.username, 'entry', id);
      return json({ success: true, message: r && r.restored });
    }
    if (p.action === 'errors') {
      let q = 'error_log?select=id,at,page,username,kind,message,detail,ua,hits&order=id.desc&limit=' + Math.min(Math.max(Number(p.limit) || 50, 1), 200);
      const s = String(p.q || '').replace(/[%*,()]/g, ' ').trim().slice(0, 60);
      if (s) q += `&or=(message.ilike.*${enc(s)}*,page.ilike.*${enc(s)}*,username.ilike.*${enc(s)}*)`;
      if (Number(p.before) > 0) q += `&id=lt.${Number(p.before)}`;
      const rows = await rest('GET', q);
      const day = await rest('GET', `error_log?select=id&at=gt.${enc(new Date(Date.now() - 86400000).toISOString())}&limit=1000`);
      return json({ success: true, rows: rows || [], last24h: (day || []).length });
    }
    if (p.action === 'clearErrors') {
      await rest('DELETE', 'error_log?id=gt.0', undefined, 'return=minimal');
      console.log('[audit-fast] errors cleared by', me.username);
      return json({ success: true });
    }
    if (p.action === 'office') {
      return json({ success: true, status: await rest('POST', 'rpc/office_status', {}) });
    }
    return json({ success: false, error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[audit-fast]', err);
    return json({ success: false, error: 'Server error. Please try again.' }, 500);
  }
});
