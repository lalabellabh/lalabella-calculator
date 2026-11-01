// LALABELLA SCHEDULE — FAST PATH (Supabase Edge Function)  v8
// v8: per-day notes + reminders (table schedule_day_notes). getDayNotes {employee?, from?} | saveDayNote {employee?, date, note, reminder, remindTime}
//     | setReminderDone {employee?, date, done} | getMyReminders. Private: only the owner and Admins can read or write them.
// v7: saveDay {date, detail, employee?} — edit/clear ONE day. Admin: any employee. Staff: only themselves, never a finished day.
// v6: admin-only deleteOldSchedule {before} — removes every row of weeks before a date.
// Reads the duty_schedule table. Admin-only writes: replaceScheduleWeek, generateMonthSchedule.
// v5: saveMySchedule — any logged-in staff can save THEIR OWN Mon–Sun (one or many weeks).
//     Only rows of the caller's own schedule name are replaced; past weeks are never touched.
//     getMySchedule now understands alias names (Aguinaldo -> Aldo, ...).
// Auth: session token checked directly against `users`.

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
async function sbDelete(table: string, query: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`db ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function sessionUser(token: string) {
  const t = String(token || '').trim();
  if (!t) return null;
  const rows = await sbGet('users', `select=id,full_name,branch,role,status,token_created&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0];
  if (!u) return null;
  if (String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}
function isAdmin(u: any) { return String(u.role || '').toLowerCase() === 'admin'; }

function mapDutyRow(row: any) {
  return { Employee: row.employee, Role: row.role, HomeBranch: row.home_branch, Day: row.day, ScheduleDetail: row.schedule_detail, WeekOf: row.week_of };
}

async function handleGetEmployees() {
  const rows = await sbGet('duty_schedule', 'select=employee,role,home_branch');
  const seen: Record<string, boolean> = {};
  const employees: any[] = [];
  (rows || []).forEach((row: any) => {
    const name = String(row.employee || '').trim();
    if (!name || seen[name]) return;
    seen[name] = true;
    employees.push({ name, role: row.role || '', branch: row.home_branch || '' });
  });
  return { success: true, employees };
}
async function handleGetSchedule(p: any) {
  const filterName = (p.employee || '').trim();
  let query = 'select=*';
  if (filterName) query += `&employee=ilike.${encodeURIComponent(filterName)}`;
  const rows = await sbGet('duty_schedule', query);
  return { success: true, schedule: (rows || []).map(mapDutyRow) };
}

// A few people are written differently on the schedule than in their login name.
const ALIAS: Record<string, string> = { aguinaldo: 'Aldo', mohammed: 'Mohamed', mahmoud: 'Mahmood', nabadda: 'Zaharah' };
function myNames(user: any): string[] {
  const first = String(user.full_name || '').trim().split(/\s+/)[0] || '';
  const alias = ALIAS[first.toLowerCase()];
  return [...new Set([alias, first].filter(Boolean) as string[])];
}
// Rows for this user: try each candidate name (alias first); optionally narrow by branch if several people share it.
async function myRows(user: any) {
  const myBranch = String(user.branch || '').trim().toLowerCase();
  for (const name of myNames(user)) {
    const rows = await sbGet('duty_schedule', `select=*&employee=ilike.${encodeURIComponent(name)}`);
    if (rows && rows.length) {
      const distinct = [...new Set(rows.map((r: any) => String(r.employee).trim()))];
      let use = rows; let ambiguous = distinct.length > 1; let name2 = name;
      if (ambiguous && myBranch) {
        const bf = rows.filter((r: any) => String(r.home_branch || '').trim().toLowerCase() === myBranch);
        const d2 = [...new Set(bf.map((r: any) => String(r.employee).trim()))];
        if (d2.length === 1) { use = bf; ambiguous = false; }
      }
      return { rows: use, ambiguous, name: name2 };
    }
  }
  return { rows: [], ambiguous: false, name: myNames(user)[0] || '' };
}
async function handleGetMySchedule(user: any) {
  const r = await myRows(user);
  return {
    success: true, schedule: r.rows.map(mapDutyRow), matchedName: r.name, ambiguous: r.ambiguous,
    warning: r.ambiguous ? `More than one employee named "${r.name}" was found and branch could not tell them apart — please confirm these shifts are yours.` : undefined,
  };
}

// ---------------------------------------------------------------
// STAFF: save my own Mon–Sun for one or more weeks
// ---------------------------------------------------------------
const VALID_DAYS = new Set(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);
const DAY_ORDER = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function sundayOf(d: Date) { const x = new Date(d); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x; }

async function handleSaveMySchedule(p: any, user: any) {
  let weeks: string[] = []; let days: any[] = [];
  try { weeks = JSON.parse(p.weeks || '[]'); days = JSON.parse(p.days || '[]'); } catch { return { success: false, error: 'Invalid data.' }; }
  if (!Array.isArray(weeks) || !weeks.length || weeks.length > 6) return { success: false, error: 'Pick 1 to 6 weeks.' };
  if (!Array.isArray(days)) return { success: false, error: 'Invalid days.' };

  const detailByDay: Record<string, string> = {};
  for (const r of days) {
    const day = String(r.day || '').trim().toUpperCase().slice(0, 3);
    const detail = String(r.scheduleDetail || '').trim().slice(0, 300);
    if (!VALID_DAYS.has(day)) return { success: false, error: `"${r.day}" is not a valid day.` };
    if (detail) detailByDay[day] = detail;
  }
  if (!Object.keys(detailByDay).length) return { success: false, error: 'Put a shift (or Off) on at least one day.' };

  // Identity: reuse the name/role/branch already on file, else the roster-style first name.
  const mine = await myRows(user);
  const employee = mine.rows.length ? String(mine.rows[0].employee).trim() : myNames(user)[0];
  if (!employee) return { success: false, error: 'Your login has no name on file.' };
  const role = mine.rows.length ? String(mine.rows[0].role || '') : '';
  const homeBranch = mine.rows.length ? String(mine.rows[0].home_branch || '') : String(user.branch || '');

  const today = ymd(new Date());
  const saved: string[] = []; const skipped: string[] = [];
  for (const w of weeks) {
    const weekOf = String(w).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) return { success: false, error: 'Bad week date.' };
    const dt = new Date(weekOf + 'T00:00:00Z');
    if (isNaN(dt.getTime()) || dt.getUTCDay() !== 0) return { success: false, error: `${weekOf} is not a Sunday.` };
    const end = new Date(dt); end.setUTCDate(end.getUTCDate() + 6);
    if (ymd(end) < today) { skipped.push(weekOf); continue; }               // never edit finished weeks
    if (dt.getTime() > Date.now() + 400 * 86400000) return { success: false, error: 'That week is too far ahead.' };
    const rows = DAY_ORDER.filter(d => detailByDay[d]).map(d => ({
      employee, role, home_branch: homeBranch, day: d, schedule_detail: detailByDay[d], week_of: weekOf,
    }));
    await sbDelete('duty_schedule', `week_of=eq.${weekOf}&employee=ilike.${encodeURIComponent(employee)}`);
    await sbPost('duty_schedule', rows);
    saved.push(weekOf);
  }
  if (!saved.length) return { success: false, error: 'Those weeks are already finished, so they can’t be changed.' };
  return { success: true, employee, saved, skipped };
}

// ---------------------------------------------------------------
// ADMIN: replace one week's rows for EVERYONE
// ---------------------------------------------------------------
async function handleReplaceScheduleWeek(p: any, admin: any) {
  const weekOf = String(p.weekOf || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) return { success: false, error: 'weekOf must be a date (YYYY-MM-DD).' };
  let rows: any[] = [];
  try { rows = JSON.parse(p.rows || '[]'); } catch { return { success: false, error: 'Invalid rows data.' }; }
  if (!Array.isArray(rows) || !rows.length) return { success: false, error: 'No rows to save.' };

  const clean: any[] = [];
  for (const r of rows) {
    const employee = String(r.employee || r.Employee || '').trim();
    const day = String(r.day || r.Day || '').trim().toUpperCase().slice(0, 3);
    const detail = String(r.scheduleDetail || r.ScheduleDetail || '').trim();
    if (!employee || !detail) continue;
    if (!VALID_DAYS.has(day)) return { success: false, error: `"${r.day || r.Day}" is not a valid day (use SUN–SAT).` };
    clean.push({
      employee, role: String(r.role || r.Role || '').trim(), home_branch: String(r.homeBranch || r.HomeBranch || '').trim(),
      day, schedule_detail: detail, week_of: weekOf,
    });
  }
  if (!clean.length) return { success: false, error: 'No usable rows — each row needs at least an employee name and shift text.' };

  await sbDelete('duty_schedule', `week_of=eq.${weekOf}`);
  await sbPost('duty_schedule', clean);
  return { success: true, saved: clean.length, weekOf };
}

// ---------------------------------------------------------------
// ADMIN: generate a whole month for ONE person from a simple pattern
// ---------------------------------------------------------------
async function handleGenerateMonthSchedule(p: any, admin: any) {
  const employee = String(p.employee || '').trim();
  const shiftText = String(p.shiftText || '').trim();
  const year = parseInt(p.year, 10);
  const month = parseInt(p.month, 10);
  if (!employee) return { success: false, error: 'Employee name is required.' };
  if (!shiftText) return { success: false, error: 'Shift text is required (e.g. "10AM to 2PM / 3PM to 10PM (1HR break)").' };
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return { success: false, error: 'Invalid year.' };
  if (!Number.isInteger(month) || month < 1 || month > 12) return { success: false, error: 'Invalid month.' };

  const dayOffList = String(p.dayOff || '').toUpperCase().split(',').map((s: string) => s.trim()).filter(Boolean);
  for (const d of dayOffList) if (!VALID_DAYS.has(d)) return { success: false, error: `"${d}" is not a valid day (use SUN–SAT).` };
  const dayOffSet = new Set(dayOffList);

  const role = String(p.role || '').trim();
  const homeBranch = String(p.homeBranch || '').trim();

  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const lastOfMonth = new Date(Date.UTC(year, month, 0));
  const rangeStart = sundayOf(firstOfMonth);
  const rangeEnd = new Date(lastOfMonth);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + (6 - rangeEnd.getUTCDay()));

  const weeks: Record<string, any[]> = {};
  for (let d = new Date(rangeStart); d <= rangeEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    const weekOf = ymd(sundayOf(d));
    const day = DAY_ORDER[d.getUTCDay()];
    const detail = dayOffSet.has(day) ? 'Off' : shiftText;
    (weeks[weekOf] = weeks[weekOf] || []).push({ employee, role, home_branch: homeBranch, day, schedule_detail: detail, week_of: weekOf });
  }

  let totalDays = 0;
  for (const weekOf of Object.keys(weeks)) {
    await sbDelete('duty_schedule', `week_of=eq.${weekOf}&employee=ilike.${encodeURIComponent(employee)}`);
    await sbPost('duty_schedule', weeks[weekOf]);
    totalDays += weeks[weekOf].length;
  }
  return { success: true, weeksTouched: Object.keys(weeks).length, daysGenerated: totalDays };
}

// ---------------------------------------------------------------
// PER-DAY NOTES + REMINDERS (private to the owner and Admins)
// ---------------------------------------------------------------
const bahrainToday = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + 'T00:00:00Z').getTime());
async function noteOwner(p: any, user: any): Promise<string> {
  if (isAdmin(user) && String(p.employee || '').trim()) return String(p.employee).trim();
  const mine = await myRows(user);
  return mine.rows.length ? String(mine.rows[0].employee).trim() : (myNames(user)[0] || '');
}
const mapNote = (r: any) => ({ date: String(r.day).slice(0, 10), note: r.note || '', reminder: r.reminder || '', remindTime: r.remind_time || '', done: !!r.done });

async function handleGetDayNotes(p: any, user: any) {
  const emp = await noteOwner(p, user);
  if (!emp) return { success: true, notes: [] };
  const from = isDate(String(p.from || '')) ? String(p.from) : new Date(Date.now() - 62 * 86400000).toISOString().slice(0, 10);
  const rows = await sbGet('schedule_day_notes', `select=*&employee_key=eq.${encodeURIComponent(emp.toLowerCase())}&day=gte.${from}&order=day.asc&limit=500`);
  return { success: true, employee: emp, notes: (rows || []).map(mapNote) };
}

async function handleSaveDayNote(p: any, user: any) {
  const date = String(p.date || '').slice(0, 10);
  if (!isDate(date)) return { success: false, error: 'Bad date.' };
  const emp = await noteOwner(p, user);
  if (!emp) return { success: false, error: 'No employee name.' };
  const note = String(p.note || '').trim().slice(0, 300);
  const reminder = String(p.reminder || '').trim().slice(0, 120);
  let t = String(p.remindTime || '').trim();
  if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return { success: false, error: 'Bad reminder time.' };
  if (!reminder) t = '';
  const key = emp.toLowerCase();
  if (!note && !reminder) {
    await sbDelete('schedule_day_notes', `employee_key=eq.${encodeURIComponent(key)}&day=eq.${date}`);
    return { success: true, cleared: true, date };
  }
  const res = await fetch(`${SB_URL}/rest/v1/schedule_day_notes?on_conflict=employee_key,day`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ employee_key: key, employee: emp, day: date, note: note || null, reminder: reminder || null, remind_time: t || null, done: false, updated_by: user.full_name || '', updated_at: new Date().toISOString() }]),
  });
  if (!res.ok) throw new Error(`db ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return { success: true, date };
}

async function handleSetReminderDone(p: any, user: any) {
  const date = String(p.date || '').slice(0, 10);
  if (!isDate(date)) return { success: false, error: 'Bad date.' };
  const emp = await noteOwner(p, user);
  if (!emp) return { success: false, error: 'No employee name.' };
  const done = String(p.done) !== 'false' && String(p.done) !== '0';
  const res = await fetch(`${SB_URL}/rest/v1/schedule_day_notes?employee_key=eq.${encodeURIComponent(emp.toLowerCase())}&day=eq.${date}`, {
    method: 'PATCH',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ done, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`db ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return { success: true };
}

// Reminders still open for the logged-in person: today + up to 7 days overdue.
async function handleGetMyReminders(user: any) {
  const emp = await noteOwner({}, user);
  const today = bahrainToday();
  if (!emp) return { success: true, today, reminders: [] };
  const from = new Date(new Date(today + 'T00:00:00Z').getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const rows = await sbGet('schedule_day_notes', `select=*&employee_key=eq.${encodeURIComponent(emp.toLowerCase())}&done=eq.false&reminder=not.is.null&day=gte.${from}&day=lte.${today}&order=day.asc&limit=50`);
  return { success: true, today, reminders: (rows || []).map(mapNote) };
}

// ---------------------------------------------------------------
// ONE DAY: admin may edit anyone; staff only themselves (and not days already gone)
// ---------------------------------------------------------------
async function handleSaveDay(p: any, user: any) {
  const date = String(p.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: 'Bad date.' };
  const dt = new Date(date + 'T00:00:00Z');
  if (isNaN(dt.getTime())) return { success: false, error: 'Bad date.' };
  const detail = String(p.detail || '').trim().slice(0, 300);
  const day = DAY_ORDER[dt.getUTCDay()];
  const weekOf = ymd(sundayOf(dt));

  let employee = ''; let role = ''; let homeBranch = '';
  if (isAdmin(user) && String(p.employee || '').trim()) {
    employee = String(p.employee).trim();
    const ex = await sbGet('duty_schedule', `select=role,home_branch&limit=1&employee=ilike.${encodeURIComponent(employee)}`);
    if (ex && ex[0]) { role = ex[0].role || ''; homeBranch = ex[0].home_branch || ''; }
  } else {
    const mine = await myRows(user);
    employee = mine.rows.length ? String(mine.rows[0].employee).trim() : myNames(user)[0];
    role = mine.rows.length ? String(mine.rows[0].role || '') : '';
    homeBranch = mine.rows.length ? String(mine.rows[0].home_branch || '') : String(user.branch || '');
    if (ymd(dt) < ymd(new Date())) return { success: false, error: 'That day is already finished, so it can’t be changed.' };
  }
  if (!employee) return { success: false, error: 'No employee name.' };

  await sbDelete('duty_schedule', `week_of=eq.${weekOf}&day=eq.${day}&employee=ilike.${encodeURIComponent(employee)}`);
  if (detail) await sbPost('duty_schedule', [{ employee, role, home_branch: homeBranch, day, schedule_detail: detail, week_of: weekOf }]);
  return { success: true, employee, date, cleared: !detail };
}

// ADMIN: delete every row of weeks BEFORE a date (clean-up of old schedules)
async function handleDeleteOldSchedule(p: any) {
  const before = String(p.before || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) return { success: false, error: 'before must be a date (YYYY-MM-DD).' };
  const rows = await sbGet('duty_schedule', `select=id&week_of=lt.${before}`);
  const n = (rows || []).length;
  if (n) await sbDelete('duty_schedule', `week_of=lt.${before}`);
  return { success: true, deleted: n, before };
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
    const user = await sessionUser(p.token);
    if (!user) return json({ success: false, error: 'Unauthorized. Please log in again.' });

    if (action === 'getEmployees') return json(await handleGetEmployees());
    if (action === 'getSchedule') return json(await handleGetSchedule(p));
    if (action === 'getMySchedule') return json(await handleGetMySchedule(user));
    if (action === 'saveMySchedule') return json(await handleSaveMySchedule(p, user));
    if (action === 'saveDay') return json(await handleSaveDay(p, user));
    if (action === 'getDayNotes') return json(await handleGetDayNotes(p, user));
    if (action === 'saveDayNote') return json(await handleSaveDayNote(p, user));
    if (action === 'setReminderDone') return json(await handleSetReminderDone(p, user));
    if (action === 'getMyReminders') return json(await handleGetMyReminders(user));
    if (action === 'replaceScheduleWeek') {
      if (!isAdmin(user)) return json({ success: false, error: 'Admins only.' });
      return json(await handleReplaceScheduleWeek(p, user));
    }
    if (action === 'generateMonthSchedule') {
      if (!isAdmin(user)) return json({ success: false, error: 'Admins only.' });
      return json(await handleGenerateMonthSchedule(p, user));
    }
    if (action === 'deleteOldSchedule') {
      if (!isAdmin(user)) return json({ success: false, error: 'Admins only.' });
      return json(await handleDeleteOldSchedule(p));
    }
    return json({ success: false, error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return json({ success: false, error: 'Server error. Please try again.' }, 500);
  }
});
