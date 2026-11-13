// LALABELLA SYSTEM HEALTH (Supabase Edge Function) v12
// v12: also checks datacheck-fast (32 functions).
// v11: also checks odoo-fast and branch-start (31 functions).
// v10: also checks audit-fast (29 functions).
// v9: also checks applogin-fast, sessionkeep-fast, bleems-fast and shopify-orders-fast (28 functions).
// v8: also checks visitor-fast and flowerfix-fast (24 functions).
// Read-only health report for the System Health page (system-health.html). Admin only.
// Same gate as User Management: own session token + "can manage users" + the 15-minute password unlock.
// It never changes any data. Action: report

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ADMIN_UNLOCK_MINUTES = 15;

// Supabase Free plan limits (change here if the plan changes).
const DB_LIMIT_BYTES = 500 * 1024 * 1024;
const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;

// Every Edge Function of the system (this one is checked by answering, so it is left out).
const FUNCTIONS = ['chat', 'chatx', 'auth-fast', 'applogin-fast', 'sessionkeep-fast', 'profile-fast', 'brain-fast', 'brain-autolog', 'chocolate-fast', 'chocolate-bb', 'chocphoto-fast', 'flower-fast', 'flowerfix-fast', 'item-fast',
  'schedule-fast', 'pettycash-fast', 'orderassign-fast', 'notes-fast', 'orderform-fast', 'nova-fast',
  'backup-fast', 'push-fast', 'widget-fast', 'attendance-fast', 'delivery-fast', 'visitor-fast', 'bleems-fast', 'shopify-orders-fast', 'audit-fast', 'odoo-fast', 'branch-start', 'datacheck-fast', 'calcsale-fast', 'saudi-fast'];

const APP_VERSION_URL = 'https://mysystemlla.com/downloads/app-version.json';

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
async function checkAndExtendUnlock(token: string): Promise<boolean> {
  const key = 'unlock:' + await sha256Hex(String(token || '').trim());
  const rows = await rest('GET', `admin_unlock?select=*&unlock_key=eq.${encodeURIComponent(key)}&limit=1`);
  const row = rows && rows[0];
  const now = Date.now();
  if (!row || !row.unlocked_until || new Date(row.unlocked_until).getTime() <= now) return false;
  await rest('PATCH', `admin_unlock?unlock_key=eq.${encodeURIComponent(key)}`, { unlocked_until: new Date(now + ADMIN_UNLOCK_MINUTES * 60000).toISOString() }, 'return=minimal');
  return true;
}

type Level = 'ok' | 'warn' | 'fail' | 'info';
interface Check { id: string; label: string; level: Level; value: string; detail?: string; pct?: number }

const mb = (b: number) => (b / 1048576);
const fmtBytes = (b: number) => b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? mb(b).toFixed(1) + ' MB' : Math.max(0, Math.round(b / 1024)) + ' KB';
const usageLevel = (pct: number): Level => pct >= 90 ? 'fail' : pct >= 70 ? 'warn' : 'ok';

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value?: T; error?: string }> {
  const t0 = Date.now();
  try { const value = await fn(); return { ms: Date.now() - t0, value }; }
  catch (e: any) { return { ms: Date.now() - t0, error: String(e && e.message || e).slice(0, 160) }; }
}

async function pingFunction(slug: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const t0 = Date.now();
  try {
    const res = await fetch(`${SB_URL}/functions/v1/${slug}`, { method: 'OPTIONS', signal: ctrl.signal });
    await res.text();
    return { slug, ms: Date.now() - t0, status: res.status, up: res.status < 500 };
  } catch (e: any) {
    return { slug, ms: Date.now() - t0, status: 0, up: false, error: e && e.name === 'AbortError' ? 'timed out (8 s)' : String(e && e.message || e).slice(0, 80) };
  } finally { clearTimeout(timer); }
}

async function fetchAppVersion() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${APP_VERSION_URL}?t=${Date.now()}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function buildReport() {
  const checks: Check[] = [];
  const nowMs = Date.now();
  const bhDay = new Date(nowMs + 3 * 3600000).toISOString().slice(0, 10); // Bahrain day (UTC+3)

  const [dbPing, health, fnResults, sessions, inactive, stale, attToday, appVer] = await Promise.all([
    timed(() => rest('GET', 'users?select=id&limit=1')),
    timed(async () => {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/lb_health`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }, body: '{}' });
      const t = await r.text();
      if (!r.ok) throw new Error(`rpc ${r.status}: ${t.slice(0, 160)}`);
      return JSON.parse(t);
    }),
    Promise.all(FUNCTIONS.map(pingFunction)),
    timed(() => rest('GET', `users?select=id&token_created=gt.${encodeURIComponent(new Date(nowMs - SESSION_MAX_AGE_MS).toISOString())}`)),
    timed(() => rest('GET', `users?select=id&status=eq.Inactive`)),
    timed(() => rest('GET', `profile_status?select=id&expires_at=lt.${encodeURIComponent(new Date(nowMs - 2 * 86400000).toISOString())}`)),
    timed(() => rest('GET', `attendance_logs?select=user_id,kind,in_range&day=eq.${bhDay}`)),
    timed(() => fetchAppVersion()),
  ]);

  if (dbPing.error) checks.push({ id: 'db', label: 'Database', level: 'fail', value: 'Not reachable', detail: dbPing.error });
  else checks.push({ id: 'db', label: 'Database', level: dbPing.ms > 2000 ? 'warn' : 'ok', value: `Online · ${dbPing.ms} ms`, detail: dbPing.ms > 2000 ? 'Slower than usual.' : 'Answering normally.' });

  const h: any = health.value;
  if (health.error || !h) {
    checks.push({ id: 'usage', label: 'Usage report', level: 'fail', value: 'Could not read', detail: health.error || 'No data' });
  } else {
    const dbPct = h.db_bytes / DB_LIMIT_BYTES * 100;
    checks.push({ id: 'dbsize', label: 'Database size', level: usageLevel(dbPct), value: `${fmtBytes(h.db_bytes)} of ${fmtBytes(DB_LIMIT_BYTES)}`, pct: Math.round(dbPct * 10) / 10, detail: dbPct >= 70 ? 'Getting full — clean up old data or upgrade the plan.' : 'Plenty of room.' });
    const stBytes = (h.buckets || []).reduce((a: number, b: any) => a + (Number(b.bytes) || 0), 0);
    const stPct = stBytes / STORAGE_LIMIT_BYTES * 100;
    checks.push({ id: 'storage', label: 'File storage', level: usageLevel(stPct), value: `${fmtBytes(stBytes)} of ${fmtBytes(STORAGE_LIMIT_BYTES)}`, pct: Math.round(stPct * 100) / 100, detail: stPct >= 70 ? 'Getting full — delete old files or upgrade the plan.' : 'Plenty of room.' });
    const cPct = h.conns / h.max_conns * 100;
    checks.push({ id: 'conns', label: 'Database connections', level: usageLevel(cPct), value: `${h.conns} of ${h.max_conns}`, pct: Math.round(cPct) });
    const jobs: any[] = h.jobs || [];
    if (!jobs.length) checks.push({ id: 'jobs', label: 'Scheduled jobs', level: 'info', value: 'None set up' });
    for (const j of jobs) {
      const last = j.last_run ? new Date(j.last_run).getTime() : 0;
      const ageH = last ? (nowMs - last) / 3600000 : null;
      let level: Level = 'ok', detail = '';
      if (!j.active) { level = 'warn'; detail = 'Switched off.'; }
      else if (!last) { level = 'warn'; detail = 'Has not run yet.'; }
      else if (j.last_status !== 'succeeded') { level = 'fail'; detail = `Last run: ${j.last_status}.`; }
      else if (ageH! > 26) { level = 'warn'; detail = `Last ran ${Math.round(ageH!)} h ago (expected daily).`; }
      else detail = `Last ran ${ageH! < 1 ? 'less than an hour' : Math.round(ageH!) + ' h'} ago · succeeded.`;
      checks.push({ id: 'job:' + j.name, label: `Job · ${j.name}`, level, value: j.active ? 'On' : 'Off', detail });
    }
  }

  const down = fnResults.filter(f => !f.up), slow = fnResults.filter(f => f.up && f.ms > 3000);
  checks.push({
    id: 'functions', label: 'Server functions', level: down.length ? 'fail' : slow.length ? 'warn' : 'ok',
    value: `${fnResults.length - down.length} of ${fnResults.length} answering`,
    detail: down.length ? `Not answering: ${down.map(f => f.slug).join(', ')}` : slow.length ? `Slow: ${slow.map(f => f.slug).join(', ')}` : 'All answering normally.',
  });

  if (!sessions.error) checks.push({ id: 'sessions', label: 'Logged-in sessions (24 h)', level: 'info', value: String((sessions.value || []).length) });
  if (!inactive.error && (inactive.value || []).length) checks.push({ id: 'inactive', label: 'Inactive accounts', level: 'info', value: String(inactive.value.length) });
  if (!stale.error) {
    const n = (stale.value || []).length;
    checks.push({ id: 'stale', label: 'Old statuses not cleaned', level: n ? 'warn' : 'ok', value: n ? `${n} left over` : 'None', detail: n ? 'Expired statuses should delete themselves when someone opens Profile.' : 'Expired statuses are being cleaned.' });
  }

  if (attToday.error) {
    checks.push({ id: 'attendance', label: 'Attendance today', level: 'warn', value: 'Could not read', detail: attToday.error });
  } else {
    const rows: any[] = attToday.value || [];
    const timedIn = new Set(rows.filter(r => r.kind === 'in').map(r => r.user_id)).size;
    const outside = rows.filter(r => r.in_range === false).length;
    checks.push({ id: 'attendance', label: 'Attendance today', level: 'info', value: `${timedIn} timed in · ${outside} outside-shop punch${outside === 1 ? '' : 'es'}`, detail: `Bahrain day ${bhDay}. Details are in Attendance Records.` });
  }

  if (appVer.error || !appVer.value || !appVer.value.version) {
    checks.push({ id: 'appver', label: 'Android app (latest)', level: 'warn', value: 'Could not read', detail: appVer.error || 'downloads/app-version.json has no version.' });
  } else {
    checks.push({ id: 'appver', label: 'Android app (latest)', level: 'info', value: 'v' + String(appVer.value.version), detail: 'Published in downloads/app-version.json. Installed apps compare against this.' });
  }

  const worst: Level = checks.some(c => c.level === 'fail') ? 'fail' : checks.some(c => c.level === 'warn') ? 'warn' : 'ok';
  return {
    success: true,
    checkedAt: new Date().toISOString(),
    overall: worst,
    checks,
    functions: fnResults.map(f => ({ name: f.slug, ms: f.ms, up: f.up, error: (f as any).error || '' })).sort((a, b) => a.name.localeCompare(b.name)),
    buckets: h ? (h.buckets || []).map((b: any) => ({ bucket: b.bucket, files: Number(b.files) || 0, bytes: Number(b.bytes) || 0 })) : [],
    tables: h ? (h.tables || []).map((t: any) => ({ name: t.name, bytes: Number(t.bytes) || 0, rows: Number(t.rows) || 0 })) : [],
  };
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
    const user = await sessionUser(p.token);
    if (!user) return json({ success: false, error: 'Unauthorized. Please log in again.' });
    if (String(p.action || '') !== 'report') return json({ success: false, error: 'Unknown action' });
    if (!user.can_manage_users) return json({ success: false, error: 'You do not have access to System Health.' });
    if (!(await checkAndExtendUnlock(p.token))) return json({ success: false, reauth: true, error: 'Please confirm your password.' });
    return json(await buildReport());
  } catch (err) {
    console.error(err);
    return json({ success: false, error: 'Server error. Please try again.' }, 500);
  }
});
