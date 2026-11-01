// LALABELLA BRAIN — reminders, smart checks & the note vault (Supabase Edge Function)  v3
// v2: noteList / noteSave / noteDelete — the Brain Vault (brain.html), an Obsidian-style set of linked notes.
// v3: auto rule admin-storage (warns admins at 70% of free storage / database).
//
// This is the server half of the system "core". Two kinds of items reach a user:
//   1. DB reminders   — written by an admin in User Management → Reminders (table `reminders`).
//   2. Auto rules     — the RULES list below. To teach the system a NEW check, add ONE entry there.
//
// Actions
//   due        (any logged-in user)  → items to show this user right now
//   ack {id}   (any logged-in user)  → "Got it" for a DB reminder (once → forever, monthly → this month)
//   adminList / adminSave / adminDelete, noteList / noteSave / noteDelete  → User Management only (can_manage_users + password unlock,
//                                           same gate as every other User Management action)
//
// Auth: own session token checked against `users`; verify_jwt is OFF; service-role only.

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
  const rows = await rest('GET', `users?select=id,username,full_name,branch,role,status,token_created,can_manage_users&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0];
  if (!u) return null;
  if (String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}
const isAdmin = (u: any) => String(u.role || '').toLowerCase() === 'admin';

// ---- User Management unlock (same table/logic as auth-fast) ----
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

// ---- dates (Bahrain = UTC+3, no DST) ----
function bahrainToday() {
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), iso: d.toISOString().slice(0, 10) };
}
const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function shiftMonth(y: number, m: number, by: number) { const t = y * 12 + (m - 1) + by; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; }
// A schedule week (Sunday = week_of) belongs to the month of its Thursday → Sundays from (1st − 4 days) to (last − 4 days).
function weekRangeOfMonth(y: number, m: number) {
  const first = new Date(Date.UTC(y, m - 1, 1)), last = new Date(Date.UTC(y, m, 0));
  const a = new Date(first); a.setUTCDate(a.getUTCDate() - 4);
  const b = new Date(last); b.setUTCDate(b.getUTCDate() - 4);
  return { from: a.toISOString().slice(0, 10), to: b.toISOString().slice(0, 10) };
}

// ---- who is this person on the duty schedule? ----
const ALIAS: Record<string, string> = { aguinaldo: 'Aldo', mohammed: 'Mohamed', mahmoud: 'Mahmood', nabadda: 'Zaharah' };
const ROSTER_FIRST = new Set(['janice', 'aldo', 'mohamed', 'moses', 'agus', 'stephen', 'oliver', 'joyce', 'mahmood', 'louielyn', 'rohit', 'zaharah', 'vincent', 'rhene', 'antonio', 'benjamin', 'baneesh']);
function firstName(u: any) { return String(u.full_name || '').trim().split(/\s+/)[0] || ''; }
function myNames(u: any): string[] {
  const f = firstName(u); const a = ALIAS[f.toLowerCase()];
  return [...new Set([a, f].filter(Boolean) as string[])];
}

interface Ctx { user: any; isAdmin: boolean; canManage: boolean; today: ReturnType<typeof bahrainToday> }
interface Item { id: string; text: string; link?: string; linkText?: string }

async function monthHasRows(y: number, m: number, employee?: string): Promise<boolean> {
  const r = weekRangeOfMonth(y, m);
  let q = `duty_schedule?select=id&limit=1&week_of=gte.${r.from}&week_of=lte.${r.to}`;
  if (employee) q += `&employee=ilike.${encodeURIComponent(employee)}`;
  const rows = await rest('GET', q);
  return !!(rows && rows.length);
}
async function iAmOnSchedule(c: Ctx): Promise<{ on: boolean; name: string }> {
  const names = myNames(c.user);
  for (const n of names) {
    const rows = await rest('GET', `duty_schedule?select=id&limit=1&employee=ilike.${encodeURIComponent(n)}`);
    if (rows && rows.length) return { on: true, name: n };
  }
  const on = names.some(n => ROSTER_FIRST.has(n.toLowerCase()));
  return { on, name: names[0] || '' };
}
async function iHaveMonth(c: Ctx, y: number, m: number): Promise<boolean> {
  for (const n of myNames(c.user)) if (await monthHasRows(y, m, n)) return true;
  return false;
}

// =====================================================================
//  RULES — the system's "brain". Each rule looks at the situation and
//  returns an Item to show, or null. Add a new check = add one object.
// =====================================================================
const RULES: { id: string; run: (c: Ctx) => Promise<Item | null> }[] = [
  {
    // Admin / IT: next month's schedule not uploaded yet (from the 20th)
    id: 'admin-next-month-schedule',
    run: async c => {
      if (!(c.canManage || c.isAdmin) || c.today.d < 20) return null;
      const n = shiftMonth(c.today.y, c.today.m, 1);
      if (await monthHasRows(n.y, n.m)) return null;
      return { id: 'auto:admin-next-month-schedule', text: `Next month's schedule (${MONTHS[n.m - 1]} ${n.y}) is not uploaded yet.`, link: 'schedule-admin.html', linkText: 'Upload it' };
    },
  },
  {
    // Staff on the duty schedule: nothing at all for this month
    id: 'my-schedule-this-month',
    run: async c => {
      const me = await iAmOnSchedule(c);
      if (!me.on) return null;
      if (await iHaveMonth(c, c.today.y, c.today.m)) return null;
      return { id: 'auto:my-schedule-this-month', text: `You have no schedule for ${MONTHS[c.today.m - 1]} yet. Please add yours.`, link: 'schedule.html#me', linkText: 'Add my schedule' };
    },
  },
  {
    // Staff on the duty schedule: next month empty, from the 25th
    id: 'my-schedule-next-month',
    run: async c => {
      if (c.today.d < 25) return null;
      const me = await iAmOnSchedule(c);
      if (!me.on) return null;
      const n = shiftMonth(c.today.y, c.today.m, 1);
      if (await iHaveMonth(c, n.y, n.m)) return null;
      return { id: 'auto:my-schedule-next-month', text: `Next month's schedule (${MONTHS[n.m - 1]}) is not entered yet. Please add yours.`, link: 'schedule.html#me', linkText: 'Add my schedule' };
    },
  },
  {
    // Admin / IT: free Supabase space is getting full (storage 1 GB, database 500 MB)
    id: 'admin-storage',
    run: async c => {
      if (!(c.canManage || c.isAdmin)) return null;
      try {
        const r = await fetch(`${SB_URL}/rest/v1/rpc/lb_usage`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }, body: '{}' });
        const u = await r.json();
        const st = (Number(u.storage_bytes) || 0) / 1e9 / 1.0;       // of 1 GB
        const db = (Number(u.db_bytes) || 0) / 1e6 / 500;            // of 500 MB
        if (st < 0.7 && db < 0.7) return null;
        const what = st >= db ? `Storage ${Math.round(st * 100)}% of 1 GB` : `Database ${Math.round(db * 100)}% of 500 MB`;
        return { id: 'auto:admin-storage', text: `${what} used on the free Supabase plan. Clean up old files/data before it fills up.`, link: 'brain.html', linkText: 'Open Brain Vault' };
      } catch (_) { return null; }
    },
  },
];

// ---- DB reminders ----
function audienceOk(aud: string, u: any): boolean {
  const a = String(aud || 'all');
  if (a === 'all') return true;
  if (a.startsWith('branch:')) return String(u.branch || '').trim().toLowerCase() === a.slice(7).trim().toLowerCase();
  if (a.startsWith('user:')) {
    const want = a.slice(5).trim().toLowerCase();
    return myNames(u).some(n => n.toLowerCase() === want) || String(u.username || '').toLowerCase() === want;
  }
  return false;
}
function periodOf(r: any, today: { y: number; m: number }) { return r.kind === 'monthly' ? `${today.y}-${pad(today.m)}` : 'once'; }
function isDue(r: any, today: ReturnType<typeof bahrainToday>): boolean {
  if (r.kind === 'monthly') return today.d >= (Number(r.day_of_month) || 1);
  return !r.start_date || String(r.start_date).slice(0, 10) <= today.iso;
}

async function handleDue(user: any) {
  const c: Ctx = { user, isAdmin: isAdmin(user), canManage: !!user.can_manage_users, today: bahrainToday() };
  const items: any[] = [];

  const rows = (await rest('GET', 'reminders?select=*&active=eq.true&order=id.asc')) || [];
  const mine = rows.filter((r: any) => audienceOk(r.audience, user) && isDue(r, c.today));
  if (mine.length) {
    const acks = (await rest('GET', `reminder_acks?select=reminder_id,period&user_id=eq.${user.id}`)) || [];
    const done = new Set(acks.map((a: any) => `${a.reminder_id}|${a.period}`));
    for (const r of mine) {
      if (done.has(`${r.id}|${periodOf(r, c.today)}`)) continue;
      items.push({ id: `db:${r.id}`, text: r.message, link: r.link || undefined, linkText: r.link ? 'Open' : undefined, ackable: true });
    }
  }
  for (const rule of RULES) {
    try { const it = await rule.run(c); if (it) items.push({ ...it, ackable: false }); }
    catch (e) { console.error('[brain rule]', rule.id, e); }
  }
  return { success: true, items };
}

async function handleAck(p: any, user: any) {
  const id = parseInt(String(p.id || '').replace(/^db:/, ''), 10);
  if (!id) return { success: false, error: 'Bad reminder.' };
  const rows = await rest('GET', `reminders?select=*&id=eq.${id}&limit=1`);
  const r = rows && rows[0];
  if (!r) return { success: true };
  const t = bahrainToday();
  await rest('POST', 'reminder_acks?on_conflict=reminder_id,user_id,period', { reminder_id: id, user_id: user.id, period: periodOf(r, t) }, 'resolution=merge-duplicates,return=minimal');
  return { success: true };
}

// ---- admin (User Management only) ----
const LINK_RE = /^[A-Za-z0-9._-]+\.html(#[A-Za-z0-9_-]*)?$/;
async function handleAdminList() {
  const rows = (await rest('GET', 'reminders?select=*&order=id.desc')) || [];
  const acks = (await rest('GET', 'reminder_acks?select=reminder_id,period')) || [];
  const t = bahrainToday();
  const out = rows.map((r: any) => {
    const per = periodOf(r, t);
    return { id: r.id, message: r.message, audience: r.audience, kind: r.kind, startDate: r.start_date, dayOfMonth: r.day_of_month, link: r.link || '', active: r.active, seen: acks.filter((a: any) => a.reminder_id === r.id && a.period === per).length };
  });
  return { success: true, reminders: out };
}
async function handleAdminSave(p: any, admin: any) {
  const message = String(p.message || '').trim().slice(0, 500);
  if (!message) return { success: false, error: 'Write the reminder message.' };
  const audience = String(p.audience || 'all').trim();
  if (!(audience === 'all' || /^branch:(ModaMall|Hamala|Galali)$/.test(audience) || /^user:[A-Za-z][A-Za-z .'-]{1,30}$/.test(audience))) return { success: false, error: 'Pick who it is for.' };
  const kind = String(p.kind || 'once');
  if (kind !== 'once' && kind !== 'monthly') return { success: false, error: 'Pick once or monthly.' };
  const row: any = { message, audience, kind, active: String(p.active) !== 'false', link: null, start_date: null, day_of_month: null };
  if (kind === 'once') {
    const sd = String(p.startDate || bahrainToday().iso).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sd)) return { success: false, error: 'Pick a valid date.' };
    row.start_date = sd;
  } else {
    const dom = parseInt(p.dayOfMonth, 10);
    if (!(dom >= 1 && dom <= 28)) return { success: false, error: 'Day of the month must be 1 to 28.' };
    row.day_of_month = dom;
  }
  const link = String(p.link || '').trim();
  if (link) { if (!LINK_RE.test(link)) return { success: false, error: 'Link must be a page like schedule.html.' }; row.link = link; }
  const id = parseInt(p.id, 10);
  if (id) { await rest('PATCH', `reminders?id=eq.${id}`, row, 'return=minimal'); return { success: true, id }; }
  row.created_by = admin.username;
  const made = await rest('POST', 'reminders', row);
  return { success: true, id: made && made[0] && made[0].id };
}
async function handleAdminDelete(p: any) {
  const id = parseInt(p.id, 10);
  if (!id) return { success: false, error: 'Bad reminder.' };
  await rest('DELETE', `reminders?id=eq.${id}`, undefined, 'return=minimal');
  return { success: true };
}

// ---- Brain Vault notes (User Management only) ----
async function handleNoteList() {
  const rows = (await rest('GET', 'brain_notes?select=id,title,body,tags,updated_by,updated_at&order=updated_at.desc')) || [];
  return { success: true, notes: rows.map((r: any) => ({ id: r.id, title: r.title, body: r.body || '', tags: r.tags || [], updatedBy: r.updated_by || '', updatedAt: r.updated_at })) };
}
async function handleNoteSave(p: any, admin: any) {
  const title = String(p.title || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!title) return { success: false, error: 'Give the note a title.' };
  if (/[\[\]]/.test(title)) return { success: false, error: 'The title cannot contain [ or ].' };
  const body = String(p.body || '').slice(0, 30000);
  const tags = [...new Set(String(p.tags || '').split(',').map((t: string) => t.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')).filter(Boolean))].slice(0, 8).map((t: string) => t.slice(0, 24));
  const id = parseInt(p.id, 10);
  const same = (await rest('GET', `brain_notes?select=id&title=ilike.${encodeURIComponent(title.replace(/[%_*]/g, ''))}`)) || [];
  if (same.filter((r: any) => r.id !== id).length) return { success: false, error: 'A note with that title already exists.' };
  const row = { title, body, tags, updated_by: admin.username, updated_at: new Date().toISOString() };
  if (id) { await rest('PATCH', `brain_notes?id=eq.${id}`, row, 'return=minimal'); return { success: true, id }; }
  const made = await rest('POST', 'brain_notes', row);
  return { success: true, id: made && made[0] && made[0].id };
}
async function handleNoteDelete(p: any) {
  const id = parseInt(p.id, 10);
  if (!id) return { success: false, error: 'Bad note.' };
  await rest('DELETE', `brain_notes?id=eq.${id}`, undefined, 'return=minimal');
  return { success: true };
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
    const user = await sessionUser(p.token);
    if (!user) return json({ success: false, error: 'Unauthorized. Please log in again.' });

    if (action === 'due') return json(await handleDue(user));
    if (action === 'ack') return json(await handleAck(p, user));

    if (['adminList', 'adminSave', 'adminDelete', 'noteList', 'noteSave', 'noteDelete'].includes(action)) {
      if (!user.can_manage_users) return json({ success: false, error: 'You do not have access to User Management.' });
      if (!(await checkAndExtendUnlock(p.token))) return json({ success: false, reauth: true, error: 'Please confirm your password.' });
      if (action === 'adminList') return json(await handleAdminList());
      if (action === 'adminSave') return json(await handleAdminSave(p, user));
      if (action === 'noteList') return json(await handleNoteList());
      if (action === 'noteSave') return json(await handleNoteSave(p, user));
      if (action === 'noteDelete') return json(await handleNoteDelete(p));
      return json(await handleAdminDelete(p));
    }
    return json({ success: false, error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return json({ success: false, error: 'Server error. Please try again.' }, 500);
  }
});
