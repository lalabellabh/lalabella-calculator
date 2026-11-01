// LALABELLA ATTENDANCE — Supabase Edge Function (attendance-fast)  v5
// Time In / Break / Time Out with GPS (inside a shop radius) + phone fingerprint (WebAuthn) or a plain button when the phone has none.
// Staff:   me, chal {kind:'reg'|'auth'}, regCred, punch {kind, lat, lng, accuracy, chalId, assertion}, history {from,to}
// Android app: wsum {key}  -> today's alarm times (widget key, read-only)
// Viewers: adminRange {from,to}, adminSettings        (viewers = the owner + anyone with User Management access; being an Admin alone is NOT enough)
// Owner:   radiusSet {radius,grace}, eventAdd {day,userId?,branch?,reason}, eventDelete {id}, credReset {userId}
// The server clock is the only clock that counts. Every attempt (also the blocked ones) is logged.
// v5: every punch stores the radius that was active (attendance_logs.radius_m, set by a DB trigger); radius/grace changes are logged in attendance_settings_log and returned as `history` by adminSettings.

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RP_ID = 'mysystemlla.com';
const ORIGINS = ['https://mysystemlla.com', 'https://www.mysystemlla.com'];
const ALIAS: Record<string, string> = { aguinaldo: 'Aldo', mohammed: 'Mohamed', mahmoud: 'Mahmood', nabadda: 'Zaharah' };
const DAY_ORDER = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MAX_ACCURACY_M = 150;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (error: string, extra: Record<string, unknown> = {}) => json({ success: false, error, ...extra });

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
const enc = encodeURIComponent;
const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

// ---------- time (Bahrain = UTC+3, no daylight saving) ----------
const bhNow = () => new Date(Date.now() + 3 * 3600000);
const bhYmd = (d = bhNow()) => d.toISOString().slice(0, 10);
const bhMin = (d = bhNow()) => d.getUTCHours() * 60 + d.getUTCMinutes();
const atBhMin = (iso: string) => bhMin(new Date(new Date(iso).getTime() + 3 * 3600000));
const addDays = (ymd: string, n: number) => new Date(new Date(ymd + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
const dowOf = (ymd: string) => new Date(ymd + 'T00:00:00Z').getUTCDay();
const isYmd = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// ---------- session ----------
async function sessionUser(token: string) {
  const t = String(token || '').trim();
  if (!t || !/^[a-f0-9]{20,}$/i.test(t)) return null;
  const rows = await rest('GET', `users?select=id,username,full_name,role,position,branch,status,token_created,can_manage_users&token=eq.${enc(t)}&limit=1`);
  const u = rows && rows[0];
  if (!u || String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}
async function getSettings() {
  const r = await rest('GET', 'attendance_settings?select=*&id=eq.1&limit=1');
  const s = (r && r[0]) || {};
  return { radius: Number(s.radius_m) || 50, owner: Number(s.owner_id) || 2, viewers: Array.isArray(s.viewers) ? s.viewers.map(Number) : [2], grace: Number(s.grace_min) || 0 };
}
// Who may open the attendance records: the owner, or anyone ticked "can manage users". Admin role alone does not count.
const canView = (u: any, st: { owner: number }) => u.id === st.owner || u.can_manage_users === true;

// ---------- schedule ----------
function myNames(user: any): string[] {
  const first = String(user.full_name || '').trim().split(/\s+/)[0] || '';
  const alias = ALIAS[first.toLowerCase()];
  return [...new Set([alias, first].filter(Boolean) as string[])];
}
async function dutyWeek(sunday: string) {
  return (await rest('GET', `duty_schedule?select=employee,home_branch,day,schedule_detail&week_of=eq.${sunday}&limit=2000`)) || [];
}
function detailFor(user: any, rows: any[], dow: number): string | null {
  const myBranch = String(user.branch || '').trim().toLowerCase().replace(/\s+/g, '');
  for (const name of myNames(user)) {
    let mine = rows.filter((r) => String(r.employee || '').trim().toLowerCase() === name.toLowerCase());
    if (!mine.length) continue;
    const distinct = [...new Set(mine.map((x) => String(x.employee).trim()))];
    if (distinct.length > 1 || mine.some((x) => String(x.home_branch || '').trim().toLowerCase().replace(/\s+/g, '') !== myBranch)) {
      const bf = mine.filter((x) => String(x.home_branch || '').trim().toLowerCase().replace(/\s+/g, '') === myBranch);
      if (bf.length) mine = bf;
    }
    const row = mine.find((x) => DAY_ORDER.indexOf(String(x.day || '').toUpperCase().slice(0, 3)) === dow);
    if (row) return clip(row.schedule_detail, 200);
  }
  return null;
}
// "9AM to 9PM (1 HR break)", "10AM to 2PM / 3PM to 10PM (1 HR break)", "7.15AM to 8.15PM (2 HR break)"
function parseShift(detail: string | null) {
  if (!detail) return null;
  const head = detail.split(';')[0];
  if (/^\s*off\b/i.test(head)) return { off: true } as any;
  const re = /(\d{1,2})(?:[.:](\d{2}))?\s*(AM|PM)/gi;
  const t: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(head))) {
    let h = parseInt(m[1], 10) % 12;
    if (m[3].toUpperCase() === 'PM') h += 12;
    t.push(h * 60 + (m[2] ? parseInt(m[2], 10) : 0));
  }
  if (t.length < 2) return null;
  let start = t[0], end = t[t.length - 1];
  if (start === end && end >= 12 * 60) start = end - 12 * 60;   // "10PM to 10PM" is a typo for 10AM to 10PM
  if (start === end) return null;
  if (end < start) end += 1440;
  let brk = 60;
  if (t.length >= 4) brk = Math.max(0, t[2] - t[1]);
  else { const hm = /(\d+(?:\.\d+)?)\s*HR/i.exec(head); if (hm) brk = Math.round(parseFloat(hm[1]) * 60); }
  const split = t.length >= 4;
  return { off: false, start, end, brk, brkStart: split ? t[1] : null, brkEnd: split ? t[2] : null };
}
const hhmm = (min: number) => { const m = ((min % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

// ---------- geofence ----------
function meters(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 6371000, r = Math.PI / 180;
  const dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
async function branches() {
  const r = await rest('GET', 'branch_config?select=name,latitude,longitude&latitude=not.is.null');
  return (r || []).map((b: any) => ({ name: String(b.name || '').trim(), lat: Number(b.latitude), lng: Number(b.longitude) }))
    .filter((b: any) => b.name && Number.isFinite(b.lat) && Number.isFinite(b.lng));
}
function nearest(bs: any[], lat: number, lng: number) {
  let best: any = null;
  for (const b of bs) { const d = meters(lat, lng, b.lat, b.lng); if (!best || d < best.d) best = { name: b.name, d }; }
  return best;
}

// ---------- WebAuthn (fingerprint) ----------
const b64uToBytes = (s: string) => {
  const t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const bytesToB64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', b));
function derToRaw(der: Uint8Array) {
  if (der[0] !== 0x30) throw new Error('bad sig');
  let i = 2; if (der[1] & 0x80) i = 2 + (der[1] & 0x7f);
  const rd = (): Uint8Array => { if (der[i++] !== 0x02) throw new Error('bad sig'); const len = der[i++]; let v = der.slice(i, i + len); i += len; while (v.length > 32 && v[0] === 0) v = v.slice(1); const o = new Uint8Array(32); o.set(v, 32 - v.length); return o; };
  const r = rd(), s = rd(); const out = new Uint8Array(64); out.set(r, 0); out.set(s, 32); return out;
}
async function newChallenge(userId: number, kind: string) {
  const raw = new Uint8Array(32); crypto.getRandomValues(raw);
  const id = bytesToB64u(raw);
  await rest('POST', 'attendance_challenges', { id, user_id: userId, kind, expires_at: new Date(Date.now() + 3 * 60000).toISOString() }, 'return=minimal');
  rest('DELETE', `attendance_challenges?expires_at=lt.${enc(new Date(Date.now() - 600000).toISOString())}`, undefined, 'return=minimal').catch(() => {});
  return id;
}
async function takeChallenge(chalId: string, userId: number, kind: string) {
  const rows = await rest('GET', `attendance_challenges?select=*&id=eq.${enc(chalId)}&limit=1`);
  const c = rows && rows[0];
  if (c) await rest('DELETE', `attendance_challenges?id=eq.${enc(chalId)}`, undefined, 'return=minimal');
  if (!c || c.user_id !== userId || c.kind !== kind || new Date(c.expires_at).getTime() < Date.now()) throw new Error('The fingerprint check expired. Please try again.');
}
function checkClientData(cdBytes: Uint8Array, type: string, chalId: string) {
  const cd = JSON.parse(new TextDecoder().decode(cdBytes));
  if (cd.type !== type || cd.challenge !== chalId || !ORIGINS.includes(cd.origin)) throw new Error('Fingerprint check failed.');
}
async function verifyAssertion(userId: number, a: any, chalId: string) {
  await takeChallenge(chalId, userId, 'auth');
  if (!a || typeof a !== 'object') throw new Error('Fingerprint is required.');
  const rows = await rest('GET', `attendance_credentials?select=*&cred_id=eq.${enc(String(a.id || ''))}&user_id=eq.${userId}&limit=1`);
  const cred = rows && rows[0];
  if (!cred) throw new Error('This fingerprint is not registered for you.');
  const cdBytes = b64uToBytes(a.clientDataJSON), ad = b64uToBytes(a.authenticatorData), sig = b64uToBytes(a.signature);
  checkClientData(cdBytes, 'webauthn.get', chalId);
  const rp = await sha256(new TextEncoder().encode(RP_ID));
  for (let i = 0; i < 32; i++) if (ad[i] !== rp[i]) throw new Error('Fingerprint check failed (site).');
  if (!(ad[32] & 1) || !(ad[32] & 4)) throw new Error('Fingerprint was not confirmed on the phone.');
  const signed = new Uint8Array(ad.length + 32); signed.set(ad, 0); signed.set(await sha256(cdBytes), ad.length);
  const spki = b64uToBytes(cred.public_key);
  let ok = false;
  if (cred.alg === -7) {
    const k = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, derToRaw(sig), signed);
  } else if (cred.alg === -257) {
    const k = await crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', k, sig, signed);
  }
  if (!ok) throw new Error('Fingerprint did not match.');
}

// ---------- day report ----------
type Log = { kind: string; at: string; in_range?: boolean; distance_m?: number; radius_m?: number; branch_near?: string; via?: string; note?: string; shift?: string; late_min?: number; lat?: number; lng?: number };
function dayReport(user: any, day: string, logsAll: Log[], detail: string | null, grace: number) {
  const today = bhYmd(), nowMin = bhMin();
  const logs = logsAll.filter((l) => l.kind !== 'blocked').sort((a, b) => a.at.localeCompare(b.at));
  const blocked = logsAll.filter((l) => l.kind === 'blocked');
  const usedDetail = (logs.find((l) => l.shift) || {} as any).shift || detail;
  const sh = parseShift(usedDetail);
  let worked = 0, brk = 0, openIn: number | null = null, openBrk: number | null = null;
  let firstIn: string | null = null, lastOut: string | null = null;
  for (const l of logs) {
    const m = atBhMin(l.at);
    if (l.kind === 'in') { if (!firstIn) firstIn = l.at; openIn = m; }
    else if (l.kind === 'break_out') { if (openIn !== null) { worked += Math.max(0, m - openIn); openIn = null; } openBrk = m; }
    else if (l.kind === 'break_in') { if (openBrk !== null) { brk += Math.max(0, m - openBrk); openBrk = null; } openIn = m; }
    else if (l.kind === 'out') { if (openIn !== null) { worked += Math.max(0, m - openIn); openIn = null; } lastOut = l.at; }
  }
  if (day === today) { if (openIn !== null) worked += Math.max(0, nowMin - openIn); if (openBrk !== null) brk += Math.max(0, nowMin - openBrk); }
  let status = 'upcoming', lateMin = 0, earlyMin = 0, breakOver = 0;
  if (sh && !sh.off && firstIn) { lateMin = Math.max(0, atBhMin(firstIn) - (sh.start + grace)); if (lastOut) earlyMin = Math.max(0, sh.end - atBhMin(lastOut)); breakOver = Math.max(0, brk - sh.brk); }
  if (firstIn) status = lateMin > 0 ? 'late' : 'present';
  else if (!usedDetail) status = 'no-schedule';
  else if (sh && sh.off) status = 'off';
  else if (!sh) status = 'unknown';
  else if (day < today) status = 'absent';
  else if (day === today) status = nowMin >= sh.end ? 'absent' : (nowMin >= sh.start + grace ? 'not-in' : 'upcoming');
  const last = logs.length ? logs[logs.length - 1].kind : '';
  return {
    day, userId: user.id, name: user.full_name || user.username, branch: user.branch || '',
    shift: usedDetail || '', shiftStart: sh && !sh.off ? hhmm(sh.start) : '', shiftEnd: sh && !sh.off ? hhmm(sh.end) : '',
    status, lateMin, earlyMin, breakOver, workedMin: worked, breakMin: brk, state: last,
    firstIn, lastOut, blocked: blocked.length,
    logs: logsAll.sort((a, b) => a.at.localeCompare(b.at)).map((l) => ({ kind: l.kind, at: l.at, inRange: !!l.in_range, dist: l.distance_m ?? null, radius: l.radius_m ?? null, near: l.branch_near || '', via: l.via || '', note: l.note || '', lat: l.lat ?? null, lng: l.lng ?? null })),
  };
}
function nextKinds(state: string): string[] {
  if (!state) return ['in'];
  if (state === 'in' || state === 'break_in') return ['break_out', 'out'];
  if (state === 'break_out') return ['break_in'];
  return [];   // already timed out for today
}

// ---------- actions ----------
async function todayLogs(userId: number, day: string): Promise<any[]> {
  return (await rest('GET', `attendance_logs?select=*&user_id=eq.${userId}&day=eq.${day}&order=at.asc&limit=100`)) || [];
}
async function eventFor(user: any, day: string) {
  const ev = (await rest('GET', `attendance_events?select=*&day=eq.${day}`)) || [];
  const ub = String(user.branch || '').toLowerCase().replace(/\s+/g, '');
  return ev.find((e: any) => e.user_id === user.id || (e.user_id == null && (!e.branch || String(e.branch).toLowerCase().replace(/\s+/g, '') === ub))) || null;
}

async function actMe(me: any) {
  const [st, bs, creds] = await Promise.all([getSettings(), branches(), rest('GET', `attendance_credentials?select=id,label,created_at&user_id=eq.${me.id}`)]);
  const day = bhYmd(), dow = dowOf(day);
  const rows = await dutyWeek(addDays(day, -dow));
  const detail = detailFor(me, rows, dow);
  const logs = await todayLogs(me.id, day);
  const rep = dayReport(me, day, logs, detail, st.grace);
  const ev = await eventFor(me, day);
  const sh = parseShift((logs.find((l: any) => l.shift) || {} as any).shift || detail);
  return {
    success: true, now: new Date().toISOString(), day, radius: st.radius, grace: st.grace,
    user: { id: me.id, name: me.full_name || me.username, branch: me.branch || '' },
    shift: sh && !sh.off ? { detail, start: sh.start, end: sh.end, brk: sh.brk, startText: hhmm(sh.start), endText: hhmm(sh.end) } : { detail: detail || '', off: !!(sh && sh.off) },
    report: rep, next: nextKinds(rep.state), hasPasskey: (creds || []).length > 0,
    branches: bs, event: ev ? { reason: ev.reason } : null,
    isViewer: canView(me, st), isOwner: st.owner === me.id,
  };
}

async function actPunch(me: any, p: any) {
  const kind = String(p.kind || '');
  if (!['in', 'out', 'break_out', 'break_in'].includes(kind)) return fail('Unknown action.');
  const st = await getSettings();
  const day = bhYmd(), dow = dowOf(day);
  const logs = await todayLogs(me.id, day);
  const state = ((logs.filter((l: any) => l.kind !== 'blocked').pop()) || {}).kind || '';
  const allowed = nextKinds(state);
  if (!allowed.includes(kind)) return fail(allowed.length ? 'That is not the next step. Please refresh.' : 'You already timed out today.');

  const lat = Number(p.lat), lng = Number(p.lng), acc = Number(p.accuracy);
  const hasPos = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  const rows = await dutyWeek(addDays(day, -dow));
  const detail = detailFor(me, rows, dow);
  const base: any = { user_id: me.id, full_name: me.full_name || me.username, day, lat: hasPos ? lat : null, lng: hasPos ? lng : null, accuracy: Number.isFinite(acc) ? acc : null, shift: detail, radius_m: st.radius };
  const block = async (why: string, extra: any = {}) => {
    await rest('POST', 'attendance_logs', { ...base, kind: 'blocked', in_range: false, via: 'button', note: `${kind}: ${why}`.slice(0, 200), ...extra }, 'return=minimal').catch(() => {});
    return fail(why, { blocked: true });
  };

  // 1) who is it — fingerprint if this person has one registered
  const creds = await rest('GET', `attendance_credentials?select=id&user_id=eq.${me.id}`);
  let via = 'button';
  if (creds && creds.length) {
    try { await verifyAssertion(me.id, p.assertion, String(p.chalId || '')); via = 'fingerprint'; }
    catch (e: any) { return block(e.message || 'Fingerprint failed.'); }
  }
  // 2) where are they
  if (!hasPos) return block('Location is required. Turn on GPS / allow location, then try again.');
  if (Number.isFinite(acc) && acc > MAX_ACCURACY_M) return block(`GPS signal is weak (±${Math.round(acc)} m). Move near a window or outside and try again.`);
  const bs = await branches();
  const near = nearest(bs, lat, lng);
  if (!near) return fail('Shop locations are not set yet.');
  const dist = Math.round(near.d);
  const inRange = dist <= st.radius;
  let note: string | null = null;
  if (!inRange) {
    const ev = await eventFor(me, day);
    if (!ev) return block(`You are ${dist} m from ${near.name}. Time ${kind === 'in' ? 'in' : kind === 'out' ? 'out' : 'break'} only works within ${st.radius} m of a shop.`, { branch_near: near.name, distance_m: dist, via });
    note = `Event: ${ev.reason}`.slice(0, 200);
  }
  const sh = parseShift(detail);
  let late: number | null = null;
  if (kind === 'in' && sh && !sh.off) late = Math.max(0, bhMin() - (sh.start + st.grace));
  const row = await rest('POST', 'attendance_logs', { ...base, kind, in_range: inRange, branch_near: near.name, distance_m: dist, via, note, late_min: late });
  return json({ success: true, id: row && row[0] && row[0].id, kind, at: row && row[0] && row[0].at, via, distance: dist, branch: near.name, late: late || 0 });
}

async function actReg(me: any, p: any) {
  await takeChallenge(String(p.chalId || ''), me.id, 'reg');
  const have = await rest('GET', `attendance_credentials?select=id&user_id=eq.${me.id}`);
  if (have && have.length) return fail('A fingerprint is already registered. Ask the owner to reset it first.');
  const id = clip(p.id, 400), pk = clip(p.publicKey, 2000), alg = Number(p.alg);
  if (!id || !pk || ![-7, -257].includes(alg)) return fail('This phone did not give a usable fingerprint key.');
  checkClientData(b64uToBytes(p.clientDataJSON), 'webauthn.create', String(p.chalId));
  await rest('POST', 'attendance_credentials', { user_id: me.id, cred_id: id, public_key: pk, alg, label: clip(p.label, 80) }, 'return=minimal');
  return json({ success: true });
}

async function actHistory(me: any, p: any) {
  const to = isYmd(p.to) ? p.to : bhYmd();
  const from = isYmd(p.from) ? p.from : addDays(to, -13);
  return json({ success: true, rows: await buildRange([me], from, to, true) });
}

async function buildRange(users: any[], from: string, to: string, onlyWithData: boolean) {
  if (addDays(from, 62) < to) from = addDays(to, -62);
  if (!users.length) return [];
  const st = await getSettings();
  const logs: any[] = (await rest('GET', `attendance_logs?select=*&day=gte.${from}&day=lte.${to}&user_id=in.(${users.map((u) => u.id).join(',')})&order=at.asc&limit=5000`)) || [];
  const weeks: Record<string, any[]> = {};
  const out: any[] = [];
  for (let d = to; d >= from; d = addDays(d, -1)) {
    const dow = dowOf(d), sun = addDays(d, -dow);
    if (!weeks[sun]) weeks[sun] = await dutyWeek(sun);
    for (const u of users) {
      const dl = logs.filter((l) => l.user_id === u.id && String(l.day).slice(0, 10) === d);
      const r = dayReport(u, d, dl, detailFor(u, weeks[sun], dow), st.grace);
      if (onlyWithData && !dl.length && (r.status === 'no-schedule' || r.status === 'unknown')) continue;
      out.push(r);
    }
  }
  return out;
}

async function activeUsers() {
  return (await rest('GET', "users?select=id,username,full_name,branch,status,position&status=neq.Inactive&order=full_name.asc")) || [];
}


// ---------- alarms for the Android app (widget key, read-only) ----------
// Break time is the employee's own choice, so there is NO fixed break alarm. The alarm rings:
//   - 1 min before Time In (shift start), 1 min before Time Out (shift end),
//   - and once they have started a break: 1 min before the break is over (break start + the break length in the schedule).
async function sha256hex(t: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function actWsum(p: any) {
  const k = String(p.key || '');
  if (!/^[a-f0-9]{40}$/.test(k)) return json({ success: false, error: 'Invalid key.' }, 401);
  const wk = (await rest('GET', `widget_keys?select=id,user_id,revoked&key_hash=eq.${await sha256hex(k)}&limit=1`) || [])[0];
  const us = wk && !wk.revoked ? (await rest('GET', `users?select=id,username,full_name,branch,status&id=eq.${wk.user_id}&limit=1`) || [])[0] : null;
  if (!us || String(us.status || 'Active') === 'Inactive') return json({ success: false, error: 'Key revoked.', revoked: true }, 401);
  const day = bhYmd(), dow = dowOf(day);
  const detail = detailFor(us, await dutyWeek(addDays(day, -dow)), dow);
  const real = (await todayLogs(us.id, day)).filter((l: any) => l.kind !== 'blocked');
  const state = real.length ? real[real.length - 1].kind : '';
  const sh: any = parseShift((real.find((l: any) => l.shift) || {} as any).shift || detail);
  const midnight = new Date(day + 'T00:00:00Z').getTime() - 3 * 3600000;   // Bahrain midnight as UTC ms
  const now = Date.now();
  const events: any[] = [];
  const add = (min: number, kind: string, title: string, text: string) => {
    const t = midnight + min * 60000 - 60000;   // one minute before
    if (t > now + 5000) events.push({ atMs: t, kind, title, text });
  };
  if (sh && !sh.off && state !== 'out') {
    if (!state) add(sh.start, 'in', '⏰ Time In', 'Your shift starts in 1 minute. Open Attendance and time in.');
    if (state === 'break_out') {
      const bo = real.filter((l: any) => l.kind === 'break_out').pop();
      add(atBhMin(bo.at) + sh.brk, 'return', '💼 Back from break', 'Your break ends in 1 minute. Tap End Break when you are back.');
    }
    add(sh.end, 'out', '🔴 Time Out', 'Your shift ends in 1 minute. Open Attendance and time out.');
  }
  // tomorrow's first time-in
  const tom = addDays(day, 1), dowT = dowOf(tom);
  const sh2: any = parseShift(detailFor(us, await dutyWeek(addDays(tom, -dowT)), dowT));
  if (sh2 && !sh2.off) add(1440 + sh2.start, 'in', '⏰ Time In', 'Your shift starts in 1 minute. Open Attendance and time in.');
  events.sort((a, b) => a.atMs - b.atMs);
  return json({ success: true, events: events.slice(0, 8), serverTime: new Date().toISOString() });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('Use POST.');
  let p: any = {};
  try { p = await req.json(); } catch { return fail('Bad request.'); }
  try {
    if (p.action === 'wsum') return await actWsum(p);
    const me = await sessionUser(p.token);
    if (!me) return json({ success: false, error: 'Please log in again.', reauth: true }, 401);
    const act = String(p.action || '');
    if (act === 'me') return json(await actMe(me));
    if (act === 'chal') {
      const kind = p.kind === 'reg' ? 'reg' : 'auth';
      const chalId = await newChallenge(me.id, kind);
      const cr = kind === 'auth' ? await rest('GET', `attendance_credentials?select=cred_id&user_id=eq.${me.id}`) : [];
      return json({ success: true, chalId, rpId: RP_ID, credIds: (cr || []).map((c: any) => c.cred_id), user: { id: String(me.id), name: me.username || String(me.id), display: me.full_name || me.username } });
    }
    if (act === 'regCred') return await actReg(me, p);
    if (act === 'punch') return await actPunch(me, p);
    if (act === 'history') return await actHistory(me, p);

    // ---- records & owner settings: owner + people with User Management access only ----
    const st = await getSettings();
    const isOwner = st.owner === me.id;
    if (!canView(me, st)) return fail('You are not allowed to see attendance records.');
    if (act === 'adminRange') {
      const to = isYmd(p.to) ? p.to : bhYmd();
      const from = isYmd(p.from) ? p.from : to;
      let users = await activeUsers();
      if (Number(p.userId) > 0) users = users.filter((u: any) => u.id === Number(p.userId));
      return json({ success: true, isOwner, users: users.map((u: any) => ({ id: u.id, name: u.full_name || u.username, branch: u.branch || '' })), rows: await buildRange(users, from, to, true) });
    }
    if (act === 'adminSettings') {
      const creds = await rest('GET', 'attendance_credentials?select=user_id');
      const users = await activeUsers();
      const ev = (await rest('GET', `attendance_events?select=*&day=gte.${addDays(bhYmd(), -7)}&order=day.desc&limit=100`)) || [];
      const hist = (await rest('GET', 'attendance_settings_log?select=at,by_name,old_radius,new_radius,old_grace,new_grace&order=at.desc&limit=20').catch(() => [])) || [];
      return json({ success: true, isOwner, radius: st.radius, grace: st.grace, owner: st.owner, history: hist,
        users: users.map((u: any) => ({ id: u.id, name: u.full_name || u.username, branch: u.branch || '', hasPasskey: (creds || []).some((c: any) => c.user_id === u.id) })), events: ev, branches: await branches() });
    }
    if (!isOwner) return fail('Only the owner can change this.');
    if (act === 'radiusSet') {
      const r = Math.round(Number(p.radius)), g = Math.round(Number(p.grace ?? st.grace));
      if (!(r >= 20 && r <= 500) || !(g >= 0 && g <= 60)) return fail('Radius must be 20–500 m and grace 0–60 minutes.');
      await rest('PATCH', 'attendance_settings?id=eq.1', { radius_m: r, grace_min: g, updated_at: new Date().toISOString() }, 'return=minimal');
      return json({ success: true, radius: r, grace: g });
    }
    if (act === 'eventAdd') {
      if (!isYmd(p.day)) return fail('Pick a date.');
      const reason = clip(p.reason, 160);
      if (reason.length < 3) return fail('Write the reason for the event.');
      const uid = Number(p.userId) > 0 ? Number(p.userId) : null;
      await rest('POST', 'attendance_events', { day: p.day, user_id: uid, branch: uid ? null : (clip(p.branch, 40) || null), reason, created_by: me.id }, 'return=minimal');
      return json({ success: true });
    }
    if (act === 'eventDelete') {
      const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return fail('Invalid.');
      await rest('DELETE', `attendance_events?id=eq.${id}`, undefined, 'return=minimal');
      return json({ success: true });
    }
    if (act === 'credReset') {
      const uid = Number(p.userId); if (!Number.isInteger(uid) || uid < 1) return fail('Invalid.');
      await rest('DELETE', `attendance_credentials?user_id=eq.${uid}`, undefined, 'return=minimal');
      return json({ success: true });
    }
    return fail('Unknown action.');
  } catch (err: any) {
    console.error('[attendance-fast]', err);
    return json({ success: false, error: String(err && err.message || '').startsWith('db ') ? 'Server error. Please try again.' : (err.message || 'Server error. Please try again.') });
  }
});
