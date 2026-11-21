// LALABELLA — Café monthly inventory (Nov 21 2026, Bench).
// Flower style (Bench, Nov 21): cafe_items = the list (name, group, unit, picture) · cafe_receiving = items received ·
// cafe_stock_count = physical count on a day. Stock now = last count + received after that day (starts at zero).
// Actions: items · receive · receivings · deleteReceiving (Admin) · countSheet (date) · saveCount · countDates ·
//          addItem / editItem / deleteItem / setPhoto (Admin). (list / saveCounts = the old month sheet, kept for reference.)
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
const BUCKET = 'cafe-photos';
const PUB = `${SB_URL}/storage/v1/object/public/${BUCKET}/`;
async function savePhoto(b64: string): Promise<string> {
  if (!b64) return '';
  const i = b64.indexOf(','), meta = i !== -1 ? b64.slice(0, i) : '', clean = i !== -1 ? b64.slice(i + 1) : b64;
  const m = meta.match(/data:([^;]+);/), ct = m ? m[1] : 'image/jpeg';
  if (!/^image\/(jpeg|png|webp)$/.test(ct)) return '';
  let bytes: Uint8Array; try { bytes = Uint8Array.from(atob(clean), c => c.charCodeAt(0)); } catch { return ''; }
  if (!bytes.length || bytes.length > 2_800_000) return '';
  const path = `cafe-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ct.split('/')[1]}`;
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

const monthOf = (v: unknown) => { const m = String(v || '').match(/^(\d{4})-(\d{2})/); return m ? `${m[1]}-${m[2]}-01` : ''; };
function prevMonth(m: string) { const d = new Date(m + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); }

async function list(p: any, u: any) {
  const month = monthOf(p.month) || monthOf(new Date(Date.now() + 3 * 3600000).toISOString());
  const prev = prevMonth(month);
  const [items, cur, old, months] = await Promise.all([
    sbGetAll('cafe_items?select=*&active=eq.true&order=sort_order.asc,id.asc'),
    sbGetAll(`cafe_counts?select=*&month=eq.${month}`),
    sbGetAll(`cafe_counts?select=item_id,qty,expiry&month=eq.${prev}`),
    sbGetAll('cafe_counts?select=month&order=month.desc'),
  ]);
  const signed = await sign(items.map((i: any) => i.photo_url || ''));
  const c: Record<string, any> = {}; cur.forEach((r: any) => { c[r.item_id] = r; });
  const o: Record<string, any> = {}; old.forEach((r: any) => { o[r.item_id] = r; });
  return { success: true, admin: isAdmin(u), me: who(u), month, prev,
    months: [...new Set(months.map((m: any) => String(m.month).slice(0, 7)))],
    items: items.map((i: any) => ({ id: i.id, name: i.name, category: i.category || '', unit: i.unit || 'pcs', sort: i.sort_order, code: i.item_code || '',
      photo: i.photo_url ? (signed[i.photo_url] || '') : '',
      qty: c[i.id] ? (c[i.id].qty == null ? null : Number(c[i.id].qty)) : null, expiry: c[i.id] ? c[i.id].expiry || '' : '', note: c[i.id] ? c[i.id].note || '' : '',
      by: c[i.id] ? c[i.id].counted_by || '' : '', at: c[i.id] ? c[i.id].updated_at : null,
      prevQty: o[i.id] && o[i.id].qty != null ? Number(o[i.id].qty) : null, prevExpiry: o[i.id] ? o[i.id].expiry || '' : '' })) };
}
async function saveCounts(p: any, u: any) {
  const month = monthOf(p.month); if (!month) return { success: false, error: 'Pick the month.' };
  let rows: any[] = []; try { rows = JSON.parse(p.rows || '[]'); } catch { rows = []; }
  const ids = new Set((await sbGetAll('cafe_items?select=id')).map((i: any) => i.id));
  const out = rows.filter((r: any) => ids.has(Number(r.id))).map((r: any) => {
    const e = String(r.expiry || ''); return { month, item_id: Number(r.id), qty: num(r.qty), expiry: isDate(e) ? e : null, note: txt(r.note, 200) || null, counted_by: who(u), updated_at: new Date().toISOString() };
  });
  if (!out.length) return { success: false, error: 'Nothing to save.' };
  const r = await fetch(`${SB_URL}/rest/v1/cafe_counts?on_conflict=month,item_id`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(out) });
  if (!r.ok) throw new Error(`db ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return { success: true, saved: out.length };
}
// ---------- flower style ----------
const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
async function stockNow() {   // { item_id: { qty, countDate, countQty, received } }
  const [counts, recs] = await Promise.all([
    sbGetAll('cafe_stock_count?select=item_id,count_date,qty&order=count_date.desc'),
    sbGetAll('cafe_receiving?select=item_id,receive_date,qty,expiry'),
  ]);
  const out: Record<string, any> = {};
  counts.forEach((c: any) => { if (!out[c.item_id]) out[c.item_id] = { countDate: c.count_date, countQty: Number(c.qty), received: 0, qty: Number(c.qty) }; });
  recs.forEach((r: any) => {
    const o = out[r.item_id] || (out[r.item_id] = { countDate: '', countQty: 0, received: 0, qty: 0 });
    if (!o.countDate || String(r.receive_date) > String(o.countDate)) { o.received += Number(r.qty); o.qty += Number(r.qty); }
    if (r.expiry && (!o.nextExpiry || r.expiry < o.nextExpiry) && r.expiry >= today()) o.nextExpiry = r.expiry;
  });
  Object.keys(out).forEach((k) => { out[k].qty = Math.round(out[k].qty * 1000) / 1000; });
  return out;
}
async function items(u: any) {
  const [rows, st] = await Promise.all([sbGetAll('cafe_items?select=*&active=eq.true&order=sort_order.asc,id.asc'), stockNow()]);
  const signed = await sign(rows.map((i: any) => i.photo_url || ''));
  return { success: true, admin: isAdmin(u), me: who(u), today: today(),
    items: rows.map((i: any) => { const s = st[i.id] || {}; return { id: i.id, name: i.name, category: i.category || '', unit: i.unit || 'pcs', code: i.item_code || '',
      photo: i.photo_url ? (signed[i.photo_url] || '') : '', stock: s.qty || 0, countDate: s.countDate || '', received: s.received || 0, nextExpiry: s.nextExpiry || '' }; }) };
}
async function receive(p: any, u: any) {
  const d = String(p.date || ''); if (!isDate(d)) return { success: false, error: 'Pick the date.' };
  let lines: any[] = []; try { lines = JSON.parse(p.lines || '[]'); } catch { lines = []; }
  const ids = new Set((await sbGetAll('cafe_items?select=id&active=eq.true')).map((i: any) => i.id));
  const rows = lines.filter((l: any) => ids.has(Number(l.id)) && num(l.qty) && num(l.qty)! > 0).map((l: any) => {
    const e = String(l.expiry || ''); return { receive_date: d, item_id: Number(l.id), qty: num(l.qty), expiry: isDate(e) ? e : null,
      supplier: txt(p.supplier, 80) || null, invoice_no: txt(p.invoice, 40) || null, note: txt(l.note, 200) || null, received_by: txt(p.receivedBy, 60) || who(u) }; });
  if (!rows.length) return { success: false, error: 'Add at least one item with a quantity.' };
  await sbPost('cafe_receiving', rows);
  return { success: true, saved: rows.length };
}
async function receivings(p: any) {
  const from = isDate(String(p.from || '')) ? p.from : '', to = isDate(String(p.to || '')) ? p.to : '';
  let q = 'cafe_receiving?select=*,cafe_items(name,unit)&order=receive_date.desc,id.desc&limit=' + (from || to ? 2000 : 200);
  if (from) q += `&receive_date=gte.${from}`; if (to) q += `&receive_date=lte.${to}`;
  const rows = await sbGet(q);
  return { success: true, rows: rows.map((r: any) => ({ id: r.id, date: r.receive_date, itemId: r.item_id, name: r.cafe_items ? r.cafe_items.name : '?', unit: r.cafe_items ? r.cafe_items.unit : '',
    qty: Number(r.qty), expiry: r.expiry || '', supplier: r.supplier || '', invoice: r.invoice_no || '', note: r.note || '', by: r.received_by || '', at: r.created_at })) };
}
async function countSheet(p: any) {
  const d = isDate(String(p.date || '')) ? String(p.date) : today();
  const [rows, st] = await Promise.all([sbGetAll(`cafe_stock_count?select=*&count_date=eq.${d}`), stockNow()]);
  const c: Record<string, any> = {}; rows.forEach((r: any) => { c[r.item_id] = r; });
  const its = await sbGetAll('cafe_items?select=id&active=eq.true');
  const out: Record<string, any> = {};
  its.forEach((i: any) => { const s = st[i.id] || {}; out[i.id] = { counted: c[i.id] ? Number(c[i.id].qty) : null, expiry: c[i.id] ? c[i.id].expiry || '' : '', note: c[i.id] ? c[i.id].note || '' : '', by: c[i.id] ? c[i.id].counted_by || '' : '', system: s.qty || 0, lastCount: s.countDate || '' }; });
  return { success: true, date: d, rows: out };
}
async function saveCount(p: any, u: any) {
  const d = String(p.date || ''); if (!isDate(d)) return { success: false, error: 'Pick the date.' };
  let rows: any[] = []; try { rows = JSON.parse(p.rows || '[]'); } catch { rows = []; }
  const ids = new Set((await sbGetAll('cafe_items?select=id')).map((i: any) => i.id));
  const by = txt(p.countedBy, 60) || who(u);
  const out = rows.filter((r: any) => ids.has(Number(r.id)) && num(r.qty) != null).map((r: any) => { const e = String(r.expiry || ''); return { count_date: d, item_id: Number(r.id), qty: num(r.qty), expiry: isDate(e) ? e : null, note: txt(r.note, 200) || null, counted_by: by, updated_at: new Date().toISOString() }; });
  const clear = rows.filter((r: any) => ids.has(Number(r.id)) && (r.qty === '' || r.qty === null)).map((r: any) => Number(r.id));
  if (!out.length && !clear.length) return { success: false, error: 'Nothing to save.' };
  if (out.length) { const r = await fetch(`${SB_URL}/rest/v1/cafe_stock_count?on_conflict=count_date,item_id`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(out) }); if (!r.ok) throw new Error(`db ${r.status}: ${(await r.text()).slice(0, 300)}`); }
  if (clear.length) await sbDelete('cafe_stock_count', `count_date=eq.${d}&item_id=in.(${clear.join(',')})`);
  return { success: true, saved: out.length, cleared: clear.length };
}
async function countDates() {
  const r = await sbGetAll('cafe_stock_count?select=count_date,counted_by&order=count_date.desc');
  const m: Record<string, any> = {}; r.forEach((x: any) => { const k = String(x.count_date); m[k] = m[k] || { date: k, items: 0, by: x.counted_by || '' }; m[k].items++; });
  return { success: true, dates: Object.values(m) };
}

// Dashboard (Bench, Nov 21): what moves fast / slow — usage between two counts = earlier count + received in between − later count.
async function dashboard(p: any) {
  const days = Math.min(365, Math.max(14, Number(p.days) || 90));
  const since = new Date(Date.now() + 3 * 3600000 - days * 86400000).toISOString().slice(0, 10);
  const [its, counts, recs, st] = await Promise.all([
    sbGetAll('cafe_items?select=id,name,category,unit,item_code,photo_url&active=eq.true&order=sort_order.asc,id.asc'),
    sbGetAll('cafe_stock_count?select=item_id,count_date,qty,expiry&order=count_date.asc'),
    sbGetAll('cafe_receiving?select=item_id,receive_date,qty,expiry,supplier&order=receive_date.asc'),
    stockNow(),
  ]);
  const byItem: Record<string, any> = {};
  its.forEach((i: any) => { byItem[i.id] = { id: i.id, name: i.name, category: i.category || '', unit: i.unit, code: i.item_code || '', used: 0, usedDays: 0, received: 0, stock: (st[i.id] || {}).qty || 0, countDate: (st[i.id] || {}).countDate || '', expiries: [] as string[] }; });
  const cBy: Record<string, any[]> = {}; counts.forEach((c: any) => { (cBy[c.item_id] = cBy[c.item_id] || []).push(c); if (c.expiry && byItem[c.item_id]) byItem[c.item_id].expiries.push(c.expiry); });
  const rBy: Record<string, any[]> = {}; recs.forEach((r: any) => { (rBy[r.item_id] = rBy[r.item_id] || []).push(r); if (byItem[r.item_id]) { if (r.receive_date >= since) byItem[r.item_id].received += Number(r.qty); if (r.expiry) byItem[r.item_id].expiries.push(r.expiry); } });
  Object.keys(cBy).forEach((id) => {
    const L = cBy[id], it = byItem[id]; if (!it) return;
    for (let k = 1; k < L.length; k++) {
      const a = L[k - 1], b = L[k]; if (b.count_date < since) continue;
      const inb = (rBy[id] || []).filter((r: any) => r.receive_date > a.count_date && r.receive_date <= b.count_date).reduce((s: number, r: any) => s + Number(r.qty), 0);
      const used = Number(a.qty) + inb - Number(b.qty);
      it.used += Math.max(0, used);
      it.usedDays += Math.max(1, Math.round((new Date(b.count_date).getTime() - new Date(a.count_date).getTime()) / 86400000));
    }
  });
  const t = today();
  const rows = Object.values(byItem).map((it: any) => {
    const perDay = it.usedDays ? it.used / it.usedDays : null;
    const future = it.expiries.filter((e: string) => e >= t).sort();
    return { ...it, expiries: undefined, used: Math.round(it.used * 1000) / 1000, received: Math.round(it.received * 1000) / 1000, perMonth: perDay == null ? null : Math.round(perDay * 30 * 100) / 100,
      daysLeft: perDay && perDay > 0 ? Math.floor(it.stock / perDay) : null, nextExpiry: future[0] || '', expired: it.expiries.some((e: string) => e < t) && !future.length };
  });
  const months: Record<string, number> = {}; recs.forEach((r: any) => { const m = String(r.receive_date).slice(0, 7); months[m] = (months[m] || 0) + 1; });
  return { success: true, days, since, today: t, rows, counts: [...new Set(counts.map((c: any) => String(c.count_date)))].length, receiveLines: recs.length, receivingByMonth: months };
}

const UNITS = ['pcs', 'kg', 'g', 'liters', 'ml', 'boxes', 'packs', 'bottles', 'sets'];
async function addItem(p: any, u: any) {
  const name = txt(p.name, 120); if (!name) return { success: false, error: 'Type the item name.' };
  const unit = UNITS.indexOf(String(p.unit)) !== -1 ? String(p.unit) : 'pcs';
  const last = (await sbGet('cafe_items?select=sort_order&order=sort_order.desc&limit=1'))[0];
  let photo = ''; if (p.photo) { photo = await savePhoto(String(p.photo)); if (!photo) return { success: false, error: 'The picture could not be saved (too big or not a picture).' }; }
  const r = await sbPost('cafe_items', [{ name, category: txt(p.category, 60) || null, unit, photo_url: photo || null, sort_order: (last ? Number(last.sort_order) : 0) + 1, item_code: txt(p.code, 40) || null, created_by: who(u) }]);
  const id = r[0] && r[0].id;
  if (id && !txt(p.code, 40)) await sbPatch('cafe_items', `id=eq.${id}`, { item_code: 'CAF-' + String(id).padStart(4, '0') });   // every item gets a barcode
  return { success: true, id };
}
async function editItem(p: any, u: any) {
  const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid item.' };
  const f: any = { updated_by: who(u), updated_at: new Date().toISOString() };
  if (p.name !== undefined) { const n = txt(p.name, 120); if (!n) return { success: false, error: 'Type the item name.' }; f.name = n; }
  if (p.category !== undefined) f.category = txt(p.category, 60) || null;
  if (p.code !== undefined) f.item_code = txt(p.code, 40) || null;
  if (p.unit !== undefined && UNITS.indexOf(String(p.unit)) !== -1) f.unit = String(p.unit);
  if (p.sort !== undefined && num(p.sort) != null) f.sort_order = Math.round(num(p.sort)!);
  await sbPatch('cafe_items', `id=eq.${id}`, f);
  return { success: true };
}
async function setPhoto(p: any, u: any) {
  const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid item.' };
  if (!p.photo) { await sbPatch('cafe_items', `id=eq.${id}`, { photo_url: null, updated_by: who(u), updated_at: new Date().toISOString() }); return { success: true }; }
  const url = await savePhoto(String(p.photo)); if (!url) return { success: false, error: 'The picture could not be saved (too big or not a picture).' };
  await sbPatch('cafe_items', `id=eq.${id}`, { photo_url: url, updated_by: who(u), updated_at: new Date().toISOString() });
  return { success: true };
}
async function deleteItem(p: any, u: any) {
  const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid item.' };
  await sbPatch('cafe_items', `id=eq.${id}`, { active: false, updated_by: who(u), updated_at: new Date().toISOString() });   // hidden, counts kept
  return { success: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = new URL(req.url); const p: any = Object.fromEntries(url.searchParams);
    if (req.method === 'POST') { const ct = req.headers.get('content-type') || ''; const t = await req.text();
      Object.assign(p, ct.includes('json') ? JSON.parse(t || '{}') : Object.fromEntries(new URLSearchParams(t))); }
    const u = await me(p.token); if (!u) return json({ success: false, error: 'Please log in again.' }, 401);
    if (String(u.role) === SAUDI_ROLE) return json({ success: false, error: 'Not for this account.' }, 403);
    const a = String(p.action || '');
    if (a === 'list') return json(await list(p, u));
    if (a === 'saveCounts') return json(await saveCounts(p, u));
    if (a === 'items') return json(await items(u));
    if (a === 'receive') return json(await receive(p, u));
    if (a === 'receivings') return json(await receivings(p));
    if (a === 'countSheet') return json(await countSheet(p));
    if (a === 'saveCount') return json(await saveCount(p, u));
    if (a === 'countDates') return json(await countDates());
    if (a === 'dashboard') return json(await dashboard(p));
    if (!isAdmin(u)) return json({ success: false, error: 'Only an admin can change the item list.' });
    if (a === 'addItem') return json(await addItem(p, u));
    if (a === 'editItem') return json(await editItem(p, u));
    if (a === 'setPhoto') return json(await setPhoto(p, u));
    if (a === 'deleteItem') return json(await deleteItem(p, u));
    if (a === 'deleteReceiving') { const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return json({ success: false, error: 'Invalid.' }); await sbDelete('cafe_receiving', `id=eq.${id}`); return json({ success: true }); }
    return json({ success: false, error: 'Unknown action.' });
  } catch (e) { console.error(e); return json({ success: false, error: 'Something went wrong. Please try again.' }, 500); }
});
