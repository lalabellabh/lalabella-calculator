// LALABELLA — Android home-screen widget API (Supabase Edge Function)  v7
// v7: `reminders` now also carries the day's note (notes without a reminder, and reminders already done, are included with done/reminder fields).
// v6: summary also returns `reminders` (my open day reminders, for the schedule widget) and `att` (today's attendance state + next buttons + branch location, for the attendance widget). Read-only.
// Staff actions (session token):  createKey {device?} -> {key}   (long-lived widget key, shown once)
//                                  listKeys, revokeKey {id}
//                                  syncSeen {seen:{group,dm:{},grp:{},theme}}  -> remembers what this user has already read in chat + the menu animation theme
// Widget actions (widget key, read-only):
//   summary {key, employee?} -> unassigned orders + UNREAD messages + me {name,position,role,branch,photo,theme}
//                               + schedule (my duty days, sparse) + view (that employee's days, only when `employee` is given)
//   employees {key}          -> names on the duty schedule (for the schedule widget's picker)
// Widget keys are stored hashed (sha256). Max 3 active keys per user. Read-only: a key can only read.

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_KEYS = 3;
const LABEL: Record<string, string> = { voice: '🎤 Voice message', image: '📷 Photo', gif: 'GIF', sticker: 'Sticker' };
const PHOTO_PREFIX = SB_URL + '/storage/v1/object/public/';
// A few people are written differently on the schedule than in their login name (same list as schedule-fast).
const ALIAS: Record<string, string> = { aguinaldo: 'Aldo', mohammed: 'Mohamed', mahmoud: 'Mahmood', nabadda: 'Zaharah' };
const DAY_ORDER = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const THEMES = new Set(['fish', 'snow', 'fire', 'petals', 'off']);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

async function sha256(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function sessionUser(token: string) {
  const t = String(token || '').trim();
  if (!t || !/^[a-f0-9]{20,}$/i.test(t)) return null;
  const rows = await rest('GET', `users?select=id,username,full_name,status,token_created&token=eq.${encodeURIComponent(t)}&limit=1`);
  const u = rows && rows[0];
  if (!u || String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}

// Widget key -> {wk, urow} or a ready-made error response.
async function widgetUser(keyRaw: unknown): Promise<{ wk?: any; urow?: any; err?: Response }> {
  const k = String(keyRaw || '');
  if (!/^[a-f0-9]{40}$/.test(k)) return { err: json({ success: false, error: 'Invalid key.' }, 401) };
  const h = await sha256(k);
  const rows = await rest('GET', `widget_keys?select=id,user_id,revoked&key_hash=eq.${h}&limit=1`);
  const wk = rows && rows[0];
  if (!wk || wk.revoked) return { err: json({ success: false, error: 'Key revoked.', revoked: true }, 401) };
  const us = await rest('GET', `users?select=id,status,full_name,position,role,branch,photo_link&id=eq.${wk.user_id}&limit=1`);
  if (!us || !us[0] || String(us[0].status || 'Active') === 'Inactive') return { err: json({ success: false, error: 'Inactive.', revoked: true }, 401) };
  rest('PATCH', `widget_keys?id=eq.${wk.id}`, { last_used: new Date().toISOString() }, 'return=minimal').catch(() => {});
  return { wk, urow: us[0] };
}

const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };

// Keep only valid {id: number} maps, max 200 entries.
function cleanMap(m: any): Record<string, number> {
  const out: Record<string, number> = {};
  if (!m || typeof m !== 'object') return out;
  for (const k of Object.keys(m).slice(0, 200)) { if (/^\d{1,12}$/.test(k)) { const n = num(m[k]); if (n) out[k] = n; } }
  return out;
}

// ---- schedule for the widget: same name matching as schedule-fast getMySchedule ----
const bahrainToday = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => new Date(new Date(ymd + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
function myNames(user: any): string[] {
  const first = String(user.full_name || '').trim().split(/\s+/)[0] || '';
  const alias = ALIAS[first.toLowerCase()];
  return [...new Set([alias, first].filter(Boolean) as string[])];
}
const SCHED_SEL = 'duty_schedule?select=employee,home_branch,day,schedule_detail,week_of';
function rangeQuery(today: string, name: string) {
  return `${SCHED_SEL}&employee=ilike.${encodeURIComponent(name)}&week_of=gte.${addDays(today, -52)}&week_of=lte.${addDays(today, 80)}&limit=300`;
}
// duty rows -> sparse list of {date, detail} from 45 days ago to 75 days ahead
function toDays(rows: any[], today: string) {
  const lo = addDays(today, -45), hi = addDays(today, 75);
  const byDate: Record<string, string> = {};
  for (const r of rows) {
    const idx = DAY_ORDER.indexOf(String(r.day || '').toUpperCase().slice(0, 3));
    const wk = String(r.week_of || '').slice(0, 10);
    if (idx < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(wk)) continue;
    const d = addDays(wk, idx);
    if (d >= lo && d <= hi) byDate[d] = clip(r.schedule_detail, 160);
  }
  return Object.keys(byDate).sort().map((d) => ({ date: d, detail: byDate[d] }));
}
async function mySchedule(user: any) {
  const today = bahrainToday();
  const myBranch = String(user.branch || '').trim().toLowerCase();
  let rows: any[] = [];
  for (const name of myNames(user)) {
    const r = await rest('GET', rangeQuery(today, name));
    if (r && r.length) {
      rows = r;
      const distinct = [...new Set(r.map((x: any) => String(x.employee).trim()))];
      if (distinct.length > 1 && myBranch) {
        const bf = r.filter((x: any) => String(x.home_branch || '').trim().toLowerCase() === myBranch);
        const d2 = [...new Set(bf.map((x: any) => String(x.employee).trim()))];
        if (d2.length === 1) rows = bf;
      }
      break;
    }
  }
  return { today, days: toDays(rows, today), hasAny: rows.length > 0 };
}
async function otherSchedule(nameRaw: string) {
  const name = String(nameRaw || '').replace(/[*%,()]/g, '').trim().slice(0, 40);
  if (!name) return null;
  const today = bahrainToday();
  const rows = await rest('GET', rangeQuery(today, name));
  const shown = rows && rows[0] ? clip(rows[0].employee, 40) : name;
  return { name: shown, today, days: toDays(rows || [], today), hasAny: !!(rows && rows.length) };
}

// ---- my day notes + open reminders (schedule_day_notes) for the schedule widget ----
async function myReminders(user: any) {
  const today = bahrainToday();
  const keys = myNames(user).map((n) => n.replace(/[*%,()"]/g, '').toLowerCase()).filter(Boolean);
  if (!keys.length) return [];
  const list = keys.map((k) => '"' + encodeURIComponent(k) + '"').join(',');
  const rows = await rest('GET', `schedule_day_notes?select=day,reminder,remind_time,note,done&employee_key=in.(${list})&or=(and(reminder.not.is.null,done.eq.false),note.not.is.null)&day=gte.${addDays(today, -7)}&day=lte.${addDays(today, 75)}&order=day.asc&limit=100`);
  return (rows || []).map((r: any) => {
    const open = !!r.reminder && !r.done;
    return { date: String(r.day).slice(0, 10), time: open ? clip(r.remind_time, 5) : '', text: open ? clip(r.reminder, 80) : '', note: clip(r.note, 100) };
  }).filter((r: any) => r.text || r.note);
}

// ---- today's attendance state + which buttons make sense + where the branch is (for the attendance widget) ----
const normName = (s: unknown) => String(s || '').toLowerCase().replace(/\s+/g, '');
async function myAttendance(user: any) {
  const day = bahrainToday();
  const logs = ((await rest('GET', `attendance_logs?select=kind,at&user_id=eq.${user.id}&day=eq.${day}&order=at.asc&limit=100`)) || []).filter((l: any) => l.kind !== 'blocked');
  const last = logs.length ? logs[logs.length - 1] : null;
  const state = last ? String(last.kind) : '';
  const next = !state ? ['in'] : (state === 'in' || state === 'break_in') ? ['break_out', 'out'] : state === 'break_out' ? ['break_in'] : [];
  let branch: any = null;
  try {
    const bs = (await rest('GET', 'branch_config?select=name,latitude,longitude&latitude=not.is.null')) || [];
    const mine = bs.find((b: any) => normName(b.name) === normName(user.branch)) || bs[0];
    if (mine && Number.isFinite(Number(mine.latitude)) && Number.isFinite(Number(mine.longitude))) branch = { name: clip(mine.name, 40), lat: Number(mine.latitude), lng: Number(mine.longitude) };
  } catch { branch = null; }
  return { day, state, last: last ? String(last.at) : '', next, branch };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ success: false, error: 'Use POST.' }, 405);
  let p: any = {};
  try { p = await req.json(); } catch { return json({ success: false, error: 'Bad request.' }, 400); }

  try {
    // ---- widget (read-only, widget key) ----
    if (p.action === 'employees') {
      const w = await widgetUser(p.key);
      if (w.err) return w.err;
      const today = bahrainToday();
      const rows = await rest('GET', `duty_schedule?select=employee,home_branch&week_of=gte.${addDays(today, -60)}&limit=3000`);
      const seenN: Record<string, string> = {};
      for (const r of rows || []) {
        const n = clip(r.employee, 40);
        if (n && !seenN[n.toLowerCase()]) seenN[n.toLowerCase()] = JSON.stringify({ name: n, branch: clip(r.home_branch, 30) });
      }
      const list = Object.values(seenN).map((s) => JSON.parse(s)).sort((a: any, b: any) => a.name.localeCompare(b.name)).slice(0, 200);
      return json({ success: true, employees: list });
    }

    if (p.action === 'summary') {
      const w = await widgetUser(p.key);
      if (w.err) return w.err;
      const urow = w.urow;
      const uid = w.wk.user_id;

      const st = await rest('GET', 'unassigned_status?select=count,order_numbers,details,last_updated&order=id.asc&limit=1');
      const s = (st && st[0]) || { count: 0, order_numbers: [], details: [] };
      const det: any[] = Array.isArray(s.details) ? s.details : [];
      const numsRaw: any[] = Array.isArray(s.order_numbers) ? s.order_numbers : [];
      const nums = numsRaw.map((x: any) => clip(typeof x === 'object' && x ? (x.orderNo ?? x.order_no ?? x.number ?? '') : x, 20)).filter(Boolean);
      const list = nums.slice(0, 5).map((no: string) => {
        const d = det.find((x: any) => x && String(x.orderNo ?? '') === no) || {};
        return { no, branch: clip(d.branch, 40) };   // branch '' = needs manual assign
      });

      // ---- unread chat messages (same rules as the chat badge) ----
      const mem = await rest('GET', `chat_group_members?select=group_id&user_id=eq.${uid}`);
      const gids = (mem || []).map((r: any) => r.group_id);
      let filter = `or=(and(recipient_id.is.null,group_id.is.null),recipient_id.eq.${uid}`;
      if (gids.length) filter += `,group_id.in.(${gids.join(',')})`;
      filter += ')';
      const cand = await rest('GET', `chat_messages?select=id,user_id,username,full_name,body,kind,recipient_id,group_id,created_at&deleted_at=is.null&user_id=neq.${uid}&${filter}&order=id.desc&limit=150`);
      const sr = await rest('GET', `widget_seen?select=seen&user_id=eq.${uid}&limit=1`);
      const seen = sr && sr[0] ? sr[0].seen || {} : null;
      const cut24 = Date.now() - 24 * 3600 * 1000;
      const unread = (cand || []).filter((m: any) => {
        if (!seen) return new Date(m.created_at).getTime() >= cut24;   // not synced yet: fall back to the last 24h
        if (m.group_id) return m.id > (num(seen.grp?.[String(m.group_id)]));
        if (m.recipient_id) return m.id > (num(seen.dm?.[String(m.user_id)]));
        return m.id > num(seen.group);
      });

      // ---- profile + schedules (for the other widgets); never allowed to break the summary ----
      let me: any = null; let schedule: any = null; let view: any = null; let reminders: any = null; let att: any = null;
      try {
        const photo = String(urow.photo_link || '');
        const th = String(seen && seen.theme || '');
        me = {
          name: clip(urow.full_name, 60), position: clip(urow.position, 40), role: clip(urow.role, 20), branch: clip(urow.branch, 40),
          photo: photo.startsWith(PHOTO_PREFIX) && photo.length < 300 ? photo : '',
          theme: THEMES.has(th) ? th : '',
        };
      } catch { me = null; }
      try { schedule = await mySchedule(urow); } catch { schedule = null; }
      try { if (p.employee) view = await otherSchedule(String(p.employee)); } catch { view = null; }
      try { reminders = await myReminders(urow); } catch { reminders = null; }
      try { att = await myAttendance(urow); } catch { att = null; }

      return json({
        success: true,
        orders: { count: Number(s.count) || nums.length, items: nums.slice(0, 5), list, updated: s.last_updated },
        messages: {
          unread: unread.length,
          recent24h: unread.length,   // older widget builds read this name
          synced: !!seen,
          items: unread.slice(0, 3).map((m: any) => ({
            from: clip(m.full_name || m.username || 'Someone', 30),
            text: clip((m.kind || 'text') === 'text' ? m.body : (LABEL[m.kind] || 'New message'), 80),
            at: m.created_at,
            mine: false,
          })),
        },
        me,
        schedule,
        view,
        reminders,
        att,
        serverTime: new Date().toISOString(),
      });
    }

    // ---- staff actions ----
    const me = await sessionUser(p.token);
    if (!me) return json({ success: false, error: 'Please log in again.' }, 401);

    switch (p.action) {
      case 'syncSeen': {
        const inc = p.seen && typeof p.seen === 'object' ? p.seen : {};
        const cur = await rest('GET', `widget_seen?select=seen&user_id=eq.${me.id}&limit=1`);
        const old = cur && cur[0] ? cur[0].seen || {} : {};
        const merge = (a: Record<string, number>, b: Record<string, number>) => {
          const o: Record<string, number> = { ...a };
          for (const k of Object.keys(b)) o[k] = Math.max(o[k] || 0, b[k]);
          return o;
        };
        const incTheme = String(inc.theme || '');
        const next = {
          group: Math.max(num(old.group), num(inc.group)),
          dm: merge(cleanMap(old.dm), cleanMap(inc.dm)),
          grp: merge(cleanMap(old.grp), cleanMap(inc.grp)),
          theme: THEMES.has(incTheme) ? incTheme : (THEMES.has(String(old.theme || '')) ? String(old.theme) : ''),
        };
        await rest('POST', 'widget_seen?on_conflict=user_id', { user_id: me.id, seen: next, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
        return json({ success: true });
      }
      case 'createKey': {
        const act = await rest('GET', `widget_keys?select=id&user_id=eq.${me.id}&revoked=eq.false&order=id.asc`);
        if ((act || []).length >= MAX_KEYS) {
          const drop = act.slice(0, act.length - MAX_KEYS + 1).map((r: any) => r.id);
          await rest('PATCH', `widget_keys?id=in.(${drop.join(',')})`, { revoked: true }, 'return=minimal');
        }
        const raw = new Uint8Array(20); crypto.getRandomValues(raw);
        const key = Array.from(raw).map((x) => x.toString(16).padStart(2, '0')).join('');
        await rest('POST', 'widget_keys', { user_id: me.id, key_hash: await sha256(key), device: clip(p.device || req.headers.get('user-agent'), 120) }, 'return=minimal');
        return json({ success: true, key });
      }
      case 'listKeys': {
        const r = await rest('GET', `widget_keys?select=id,device,created_at,last_used&user_id=eq.${me.id}&revoked=eq.false&order=id.desc`);
        return json({ success: true, keys: r || [] });
      }
      case 'revokeKey': {
        const id = Number(p.id);
        if (!Number.isInteger(id) || id < 1) return json({ success: false, error: 'Invalid.' });
        await rest('PATCH', `widget_keys?id=eq.${id}&user_id=eq.${me.id}`, { revoked: true }, 'return=minimal');
        return json({ success: true });
      }
      default:
        return json({ success: false, error: 'Unknown action.' }, 400);
    }
  } catch (err) {
    console.error(err);
    return json({ success: false, error: 'Server error. Please try again.' }, 500);
  }
});
