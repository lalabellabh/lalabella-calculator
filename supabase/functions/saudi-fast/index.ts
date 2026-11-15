// LALABELLA — SAUDI TRANSFERS (Supabase Edge Function, verify_jwt OFF). Nov 2026.
// Things lent from Bahrain to KSA (events) and what came back. Records only — no stock is added or taken.
//   saudi_transfers = one line per item SENT (a "transfer" = the lines with the same date + name)
//   saudi_returns   = every RETURN (back in a branch) or KEEP (stays in Saudi, "c/o Saudi") for a line — never overwritten
//   Still in Saudi  = qty sent − returned − kept (when the quantities are numbers)
// Who: staff (users.token) and the limited "Saudi Team" accounts (users.vtoken, role 'Saudi Team') can list, Send and Return.
//      Editing or deleting anything = Admin only.
// Photos: private bucket saudi-photos, signed links (1 h).
// Actions: list | send | returnItems | editLine (Admin) | editReturn (Admin) | deleteLine (Admin) | deleteReturn (Admin)
//          Shipments (checklist, Nov 15 2026): send also makes a Bahrain->Saudi shipment | sendBack (Saudi -> Bahrain) | receiveShipment | deleteShipment (Admin, on the way only)
//          addExtra (anyone: came back / received but NOT on any list, note required) | editExtra (Admin) | deleteExtra (Admin)
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
  const u0 = u;
  const [lines, rets, pics] = await Promise.all([
    sbGetAll('saudi_transfers?select=*&order=batch_date.desc,batch_label.asc,sort_order.asc,id.asc'),
    sbGetAll('saudi_returns?select=*&order=return_date.asc.nullsfirst,id.asc'),
    sbGetAll('saudi_photos?select=*&order=sort_order.asc,id.asc'),
  ]);
  const exs = await sbGetAll('saudi_extras?select=*&order=created_at.desc').catch(() => []);
  const ships = await sbGet('saudi_shipments?select=*&order=created_at.desc&limit=150').catch(() => []);
  const sitems = ships.length ? await sbGetAll(`saudi_shipment_items?select=*&shipment_id=in.(${ships.map((x: any) => x.id).join(',')})&order=sort_order.asc,id.asc`).catch(() => []) : [];
  const signed = await sign([...lines.map((r: any) => r.photo_url), ...rets.map((r: any) => r.photo_url), ...pics.map((r: any) => r.url), ...exs.map((r: any) => r.photo_url), ...ships.map((r: any) => r.photo_url), ...ships.map((r: any) => r.received_photo), ...sitems.map((r: any) => r.photo_url)].filter(Boolean));
  const linePics: Record<string, string[]> = {}, lineInfo: Record<string, any[]> = {}, batchPics: any[] = [];
  pics.forEach((x: any) => { const u = signed[x.url]; if (!u) return;
    if (x.line_id) { (linePics[x.line_id] = linePics[x.line_id] || []).push(u); (lineInfo[x.line_id] = lineInfo[x.line_id] || []).push({ id: x.id, url: u, canDelete: isAdmin(u0) || (x.source === 'added' && x.created_by === who(u0)) }); }
    else batchPics.push({ id: x.id, batch: x.batch_label, batchDate: x.batch_date, url: u, caption: x.caption || '', canDelete: isAdmin(u0) || (x.source === 'added' && x.created_by === who(u0)) }); });
  const byLine: Record<string, any[]> = {};
  rets.forEach((r: any) => { (byLine[r.line_id] = byLine[r.line_id] || []).push({ id: r.id, kind: r.kind, qty: r.qty == null ? null : Number(r.qty), date: r.return_date || '', branch: r.branch || '',
    by: r.received_by || '', notes: r.notes || '', photo: r.photo_url ? (signed[r.photo_url] || '') : '', source: r.source, savedBy: r.created_by || '', at: r.created_at }); });
  const onWayTo: Record<string, boolean> = {}, onWayBack: Record<string, number> = {};
  const shipById: Record<string, any> = {}; ships.forEach((x: any) => { shipById[x.id] = x; });
  sitems.forEach((it: any) => { const sh = shipById[it.shipment_id]; if (!sh || sh.status !== 'on_way' || !it.line_id) return;
    if (sh.direction === 'to_saudi') onWayTo[it.line_id] = true; else onWayBack[it.line_id] = (onWayBack[it.line_id] || 0) + Number(it.qty_sent || 0); });
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
      photo: r.photo_url ? (signed[r.photo_url] || '') : '', photos: linePics[r.id] || [], photoInfo: lineInfo[r.id] || [], source: r.source, order: r.sort_order, by: r.created_by || '', at: r.created_at,
      moves, returned: nBack, kept: nKept, left, status, onWay: !!onWayTo[r.id], backOnWay: onWayBack[r.id] != null ? onWayBack[r.id] : null };
  });
  const extras = exs.map((x: any) => ({ id: x.id, kind: x.kind, item: x.item, qty: x.qty == null ? null : Number(x.qty), unit: x.unit || '', date: x.item_date || '', branch: x.branch || '',
    by: x.received_by || '', note: x.note || '', photo: x.photo_url ? (signed[x.photo_url] || '') : '', status: x.status, lineId: x.line_id, adminNote: x.admin_note || '',
    resolvedBy: x.resolved_by || '', resolvedAt: x.resolved_at, savedBy: x.created_by || '', at: x.created_at }));
  const shipments = ships.map((x: any) => ({ id: x.id, direction: x.direction, date: x.ship_date, label: x.label || '', from: x.from_place || '', to: x.to_place || '', note: x.note || '',
    photo: x.photo_url ? (signed[x.photo_url] || '') : '', status: x.status, sentBy: x.sent_by || '', at: x.created_at,
    recDate: x.received_date || '', recBy: x.received_by || '', recNote: x.received_note || '', recPhoto: x.received_photo ? (signed[x.received_photo] || '') : '', recSavedBy: x.received_saved_by || '', recAt: x.received_at,
    items: sitems.filter((it: any) => it.shipment_id === x.id).map((it: any) => ({ id: it.id, lineId: it.line_id, item: it.item, qty: it.qty_sent == null ? null : Number(it.qty_sent), unit: it.unit || '',
      got: it.got, qtyGot: it.qty_received == null ? null : Number(it.qty_received), note: it.note || '', photo: it.photo_url ? (signed[it.photo_url] || '') : '' })),
    extras: exs.filter((e: any) => e.shipment_id === x.id && !sitems.some((it: any) => it.shipment_id === x.id && it.item === e.item)).map((e: any) => ({ item: e.item, qty: e.qty == null ? null : Number(e.qty), unit: e.unit || '', note: e.note || '' })) }));
  return { success: true, rows, extras, shipments, batchPhotos: batchPics, admin: isAdmin(u), limited: String(u.role) === SAUDI_ROLE, me: who(u) };
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
  // Nov 15 2026: optional picture per item (else the picture of the whole send)
  const linePic: string[] = [];
  for (const l of lines.slice(0, 40)) linePic.push(l && l.photo ? await savePhoto(String(l.photo)) : '');
  const rows = lines.map((l: any, i: number) => {
    const q = num(l.qty), unit = txt(l.unit, 20) || (q != null ? 'pcs' : null), det = txt(l.details, 300);
    return { batch_label: label, batch_date: bd, line_no: start + i + 1, sort_order: start + i + 1, reference: txt(l.reference, 400),
      qty_sent: q, unit, quantity: [q != null ? q + ' ' + (unit || '') : '', det].filter(Boolean).join('\n') || null,
      notes: i === 0 ? notes : null, notes_rows: i === 0 && notes ? lines.length : 1, from_branch: BR(p.from), given_to: txt(p.givenTo, 60) || null,
      photo_url: linePic[i] || photo, source: 'manual', created_by: who(u) };
  });
  const r = await sbPost('saudi_transfers', rows);
  // Nov 15 2026: the same send is a shipment (checklist) — Saudi ticks it when it arrives
  try {
    const sh = (await sbPost('saudi_shipments', [{ direction: 'to_saudi', ship_date: bd, label, from_place: BR(p.from) || 'Bahrain', to_place: 'Saudi', note: notes, photo_url: photo, status: 'on_way', sent_by: who(u), sent_by_id: u.id }]))[0];
    if (sh) await sbPost('saudi_shipment_items', r.map((x: any, i: number) => ({ shipment_id: sh.id, line_id: x.id, photo_url: x.photo_url || null, item: String(x.reference || '').split('\n')[0].slice(0, 300) || 'Item', qty_sent: x.qty_sent, unit: x.unit, note: (x.quantity && x.qty_sent == null) ? String(x.quantity).slice(0, 200) : null, sort_order: i + 1 })));
  } catch (e) { console.error('shipment', e); }
  // Nov 2026: tell the Saudi Team (phone notification). Never blocks or fails the save.
  try {
    const items = lines.slice(0, 3).map((l: any) => txt(l.reference, 60).split('\n')[0]).join(', ') + (lines.length > 3 ? ' +' + (lines.length - 3) + ' more' : '');
    const from = BR(p.from), giv = txt(p.givenTo, 60);
    await saudiPush('📦 On the way to Saudi — checklist ready', lines.length + ' item' + (lines.length > 1 ? 's' : '') + (from ? ' from ' + from : '') + (giv ? ' · given to ' + giv : '') + ': ' + items, label, u.id);
  } catch (e) { console.error('saudi push', e); }
  return { success: true, added: r.length, batch: label };
}

async function saudiPush(title: string, body: string, batch: string, excludeUserId: number, to = 'saudi', branch = '') {
  const cfg = await sbGet('push_config?select=internal_key&id=eq.1&limit=1');
  const key = cfg && cfg[0] && cfg[0].internal_key; if (!key) return;
  await fetch(`${SB_URL}/functions/v1/push-fast`, { method: 'POST', headers: H, signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ action: 'saudiNotify', key, title, body, batch, excludeUserId, to, branch }) });
}

// ---------- SHIPMENTS (checklist) — Nov 15 2026 ----------
const isSaudi = (u: any) => String(u.role) === SAUDI_ROLE;
// Saudi -> Bahrain: the Saudi Team sends things back. Nothing counts as returned until Bahrain ticks Receive.
async function sendBack(p: any, u: any) {
  const d = String(p.date || ''); if (!isDate(d)) return { success: false, error: 'Pick the date it was sent.' };
  const to = BR(p.to) || 'Galali';
  let items: any[] = []; try { items = JSON.parse(String(p.items || '[]')); } catch { return { success: false, error: 'Bad list.' }; }
  items = (Array.isArray(items) ? items : []).slice(0, 200);
  const withLine = items.filter((x: any) => Number.isInteger(Number(x.lineId)) && Number(x.lineId) > 0);
  const free = items.filter((x: any) => !(Number(x.lineId) > 0) && txt(x.item, 300));
  if (!withLine.length && !free.length) return { success: false, error: 'Tick at least one item.' };
  if (free.some((x: any) => !txt(x.note, 300))) return { success: false, error: 'Add a note for every item that is not on the list.' };
  const ids = [...new Set(withLine.map((x: any) => Number(x.lineId)))];
  const found = ids.length ? await sbGet(`saudi_transfers?select=id,reference,unit,photo_url&id=in.(${ids.join(',')})`) : [];
  if (found.length !== ids.length) return { success: false, error: 'Some items were not found. Refresh and try again.' };
  const byId: Record<string, any> = {}; found.forEach((x: any) => { byId[x.id] = x; });
  let photo = ''; if (p.photo) { photo = await savePhoto(String(p.photo)); if (!photo) return { success: false, error: 'The picture could not be saved (too big or not a picture). Nothing was saved.' }; }
  const sh = (await sbPost('saudi_shipments', [{ direction: 'to_bahrain', ship_date: d, label: txt(p.label, 60) || null, from_place: 'Saudi', to_place: to, note: txt(p.note, 400) || null,
    photo_url: photo || null, status: 'on_way', sent_by: txt(p.sentBy, 60) || who(u), sent_by_id: u.id }]))[0];
  // per-item picture (optional, max 40 per send)
  const pics: string[] = [];
  for (const x of items.slice(0, 40)) pics.push(x && x.photo ? await savePhoto(String(x.photo)) : '');
  const picOf = (x: any) => pics[items.indexOf(x)] || null;
  const rows = withLine.map((x: any, i: number) => { const l = byId[Number(x.lineId)]; return { shipment_id: sh.id, line_id: l.id, item: txt(x.item, 300) || String(l.reference || '').split('\n')[0].slice(0, 300) || 'Item', photo_url: picOf(x) || l.photo_url || null,
    qty_sent: num(x.qty), unit: txt(x.unit, 20) || l.unit || null, note: txt(x.note, 300) || null, sort_order: i + 1 }; })
    .concat(free.map((x: any, i: number) => ({ shipment_id: sh.id, line_id: null, item: txt(x.item, 300), photo_url: picOf(x), qty_sent: num(x.qty), unit: txt(x.unit, 20) || null, note: 'Not on the list: ' + txt(x.note, 280), sort_order: withLine.length + i + 1 })));
  await sbPost('saudi_shipment_items', rows);
  try {
    const names = rows.slice(0, 3).map((x: any) => x.item.slice(0, 40)).join(', ') + (rows.length > 3 ? ' +' + (rows.length - 3) + ' more' : '');
    await saudiPush('🚚 Coming back from Saudi — checklist ready', rows.length + ' item(s) to ' + to + ': ' + names, 'ship-' + sh.id, u.id, 'bahrain', to);
  } catch (e) { console.error('push', e); }
  return { success: true, id: sh.id };
}
async function receiveShipment(p: any, u: any) {
  const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid.' };
  const sh = (await sbGet(`saudi_shipments?select=*&id=eq.${id}&limit=1`))[0]; if (!sh) return { success: false, error: 'Not found. Refresh.' };
  if (sh.status !== 'on_way') return { success: false, error: 'This one was already received.' };
  if (!isAdmin(u) && (sh.direction === 'to_saudi') !== isSaudi(u)) return { success: false, error: sh.direction === 'to_saudi' ? 'Only the Saudi Team can receive this.' : 'Only Bahrain can receive this.' };
  const d = String(p.date || ''); if (!isDate(d)) return { success: false, error: 'Pick the date it arrived.' };
  let ticks: any[] = [], extras: any[] = [];
  try { ticks = JSON.parse(String(p.items || '[]')); extras = JSON.parse(String(p.extras || '[]')); } catch { return { success: false, error: 'Bad list.' }; }
  extras = (Array.isArray(extras) ? extras : []).slice(0, 50).filter((x: any) => txt(x.item, 300));
  if (extras.some((x: any) => !txt(x.note, 300))) return { success: false, error: 'Add a note for every item that is not on the list.' };
  const items = await sbGet(`saudi_shipment_items?select=*&shipment_id=eq.${id}&order=sort_order.asc`);
  const tk: Record<string, any> = {}; (Array.isArray(ticks) ? ticks : []).forEach((x: any) => { tk[Number(x.id)] = x; });
  let photo = ''; if (p.photo) { photo = await savePhoto(String(p.photo)); if (!photo) return { success: false, error: 'The picture could not be saved (too big or not a picture). Nothing was saved.' }; }
  const by = txt(p.receivedBy, 60) || who(u), place = sh.direction === 'to_bahrain' ? (sh.to_place || 'Galali') : 'Saudi';
  let full = true, nGot = 0;
  for (const it of items) {
    const t = tk[it.id] || {}, got = !!t.got, q = got ? (num(t.qty) != null ? num(t.qty) : (it.qty_sent == null ? null : Number(it.qty_sent))) : 0;
    if (!got || (it.qty_sent != null && q != null && q < Number(it.qty_sent))) full = false;
    if (got) nGot++;
    const f: any = { got, qty_received: q, note: txt(t.note, 300) || it.note || null };
    // came back to Bahrain -> now it is a real return on its transfer line
    if (got && sh.direction === 'to_bahrain' && it.line_id && !it.return_id && (q == null || q > 0)) {
      const r = await sbPost('saudi_returns', [{ line_id: it.line_id, kind: 'return', qty: q, return_date: d, branch: place, received_by: by,
        notes: txt('Checklist #' + id + (t.note ? ' · ' + t.note : ''), 300), photo_url: photo || sh.photo_url || null, source: 'shipment', created_by: who(u) }]);
      f.return_id = r[0] && r[0].id;
    }
    // an item that was sent as "not on the list" -> it goes to Not on the list (Admin matches it to a transfer)
    if (got && !it.line_id) extras.push({ item: it.item, qty: q, unit: it.unit, note: String(it.note || '').replace(/^Not on the list:\s*/, '') || 'Sent without a transfer line', fromList: true });
    await sbPatch('saudi_shipment_items', `id=eq.${it.id}`, f);
  }
  if (extras.length) await sbPost('saudi_extras', extras.map((x: any) => ({ kind: sh.direction === 'to_bahrain' ? 'return' : 'receive', item: txt(x.item, 300), qty: num(x.qty), unit: txt(x.unit, 20) || null,
    item_date: d, branch: place, received_by: by, note: txt(x.note, 500), photo_url: photo || null, status: 'open', shipment_id: id, created_by: who(u) })));
  await sbPatch('saudi_shipments', `id=eq.${id}`, { status: full ? 'received' : 'partial', received_date: d, received_by: by, received_note: txt(p.note, 400) || null,
    received_photo: photo || null, received_saved_by: who(u), received_at: new Date().toISOString() });
  try {
    const miss = items.length - nGot, txtB = nGot + ' of ' + items.length + ' received' + (miss ? ' · ' + miss + ' missing' : '') + (extras.length ? ' · ' + extras.length + ' not on the list' : '') + ' · by ' + by;
    if (sh.direction === 'to_bahrain') await saudiPush((full ? '✅' : '⚠️') + ' Received in ' + place, txtB, 'ship-' + id, u.id, 'saudi');
    else await saudiPush((full ? '✅' : '⚠️') + ' Received in Saudi', txtB, 'ship-' + id, u.id, 'bahrain', sh.from_place || '');
  } catch (e) { console.error('push', e); }
  return { success: true, full, got: nGot, of: items.length };
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
    received_by: txt(p.receivedBy, 60) || null, notes: txt(x.notes || p.notes, 300) || null, photo_url: photo, source: 'manual', created_by: who(u) }));
  const r = await sbPost('saudi_returns', rows);
  return { success: true, saved: r.length };
}

// Nov 15 2026: "Extra – not on list" — something came back to Bahrain (or was received in Saudi) that is not on any transfer. Note is required.
async function addExtra(p: any, u: any) {
  const kind = p.kind === 'receive' ? 'receive' : 'return';
  const item = txt(p.item, 300); if (!item) return { success: false, error: 'Write what the item is.' };
  const note = txt(p.note, 500); if (!note) return { success: false, error: 'Add a note (why it is not on the list / where it came from).' };
  const d = String(p.date || ''); if (!isDate(d)) return { success: false, error: 'Pick the date.' };
  const branch = kind === 'receive' ? 'Saudi' : BR(p.branch); if (!branch) return { success: false, error: 'Choose where it was received.' };
  let photo = ''; if (p.photo) { photo = await savePhoto(String(p.photo)); if (!photo) return { success: false, error: 'The picture could not be saved (too big or not a picture). Nothing was saved.' }; }
  const r = await sbPost('saudi_extras', [{ kind, item, qty: num(p.qty), unit: txt(p.unit, 20) || null, item_date: d, branch, received_by: txt(p.receivedBy, 60) || null,
    note, photo_url: photo || null, status: 'open', created_by: who(u) }]);
  try {
    await saudiPush(kind === 'receive' ? '📦 Received in Saudi — not on the list' : '📥 Came back — not on the list',
      (num(p.qty) != null ? num(p.qty) + ' ' + (txt(p.unit, 20) || '') + ' ' : '') + item.split('\n')[0].slice(0, 60) + ' · ' + branch + ' · ' + note.slice(0, 80), 'Extra', u.id);
  } catch (e) { console.error('saudi push', e); }
  return { success: true, id: r[0] && r[0].id };
}
async function editExtra(p: any, u: any) {
  const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid.' };
  const x = (await sbGet(`saudi_extras?select=*&id=eq.${id}&limit=1`))[0]; if (!x) return { success: false, error: 'Not found.' };
  const f: any = { updated_by: who(u), updated_at: new Date().toISOString() };
  if (p.item !== undefined) { f.item = txt(p.item, 300); if (!f.item) return { success: false, error: 'Item cannot be empty.' }; }
  if (p.note !== undefined) { f.note = txt(p.note, 500); if (!f.note) return { success: false, error: 'The note cannot be empty.' }; }
  if (p.qty !== undefined) f.qty = num(p.qty);
  if (p.unit !== undefined) f.unit = txt(p.unit, 20) || null;
  if (p.date !== undefined) f.item_date = isDate(String(p.date)) ? String(p.date) : null;
  if (p.branch !== undefined) f.branch = BR(p.branch);
  if (p.receivedBy !== undefined) f.received_by = txt(p.receivedBy, 60) || null;
  if (p.adminNote !== undefined) f.admin_note = txt(p.adminNote, 400) || null;
  const st = ['open', 'matched', 'saudi', 'done'].includes(String(p.status)) ? String(p.status) : x.status;
  f.status = st;
  if (st !== x.status) { f.resolved_by = st === 'open' ? null : who(u); f.resolved_at = st === 'open' ? null : new Date().toISOString(); }
  const lineId = Number(p.lineId) > 0 ? Number(p.lineId) : null;
  if (st === 'matched') {
    if (!lineId) return { success: false, error: 'Pick the transfer line it belongs to.' };
    const ln = (await sbGet(`saudi_transfers?select=id&id=eq.${lineId}&limit=1`))[0]; if (!ln) return { success: false, error: 'Line not found.' };
    f.line_id = lineId;
    // a returned extra that now has its line -> it counts as a return on that line (once)
    if (x.kind === 'return' && !x.return_id) {
      const q = f.qty !== undefined ? f.qty : x.qty;
      const r = await sbPost('saudi_returns', [{ line_id: lineId, kind: 'return', qty: q, return_date: f.item_date !== undefined ? f.item_date : x.item_date, branch: f.branch !== undefined ? f.branch : x.branch,
        received_by: f.received_by !== undefined ? f.received_by : x.received_by, notes: txt('Not on the list: ' + (f.note || x.note), 300), photo_url: x.photo_url, source: 'extra', created_by: who(u) }]);
      f.return_id = r[0] && r[0].id;
    }
  } else if (p.lineId !== undefined) f.line_id = lineId;
  await sbPatch('saudi_extras', `id=eq.${id}`, f);
  return { success: true, linkedReturn: !!f.return_id };
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
  // Nov 15 2026: one more picture on this line (keeps the others) — file, camera or Ctrl+V
  if (p.addPhoto) {
    const ln = (await sbGet(`saudi_transfers?select=id,batch_label,batch_date&id=eq.${id}&limit=1`))[0]; if (!ln) return { success: false, error: 'Line not found.' };
    const n = (await sbGet(`saudi_photos?select=id&line_id=eq.${id}`)).length; if (n >= 20) return { success: false, error: 'This line already has 20 pictures.' };
    const url = await savePhoto(String(p.addPhoto)); if (!url) return { success: false, error: 'The picture could not be saved.' };
    await sbPost('saudi_photos', [{ line_id: id, batch_label: ln.batch_label, batch_date: ln.batch_date, url, sort_order: 100 + n, caption: null, source: 'added', created_by: who(u) }]);
  }
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
    if (a === 'send') { if (isSaudi(u)) return json({ success: false, error: 'Saudi Team: use "Send to Bahrain".' }); return json(await send(p, u)); }
    if (a === 'returnItems') return json(await returnItems(p, u));
    if (a === 'addExtra') return json(await addExtra(p, u));
    if (a === 'sendBack') return json(await sendBack(p, u));
    if (a === 'receiveShipment') return json(await receiveShipment(p, u));
    if (a === 'deleteShipment') {
      if (!isAdmin(u)) return json({ success: false, error: 'Only an admin can delete.' });
      const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return json({ success: false, error: 'Invalid.' });
      const sh = (await sbGet(`saudi_shipments?select=id,status&id=eq.${id}&limit=1`))[0]; if (!sh) return json({ success: false, error: 'Not found.' });
      if (sh.status !== 'on_way') return json({ success: false, error: 'Already received — delete its returns on the lines instead.' });
      await sbDelete('saudi_shipments', `id=eq.${id}`);   // only the checklist; the transfer lines stay
      return json({ success: true });
    }
    if (a === 'editExtra' || a === 'deleteExtra') {
      if (!isAdmin(u)) return json({ success: false, error: 'Only an admin can change or delete. Tell the admin what to fix.' });
      if (a === 'editExtra') return json(await editExtra(p, u));
      const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return json({ success: false, error: 'Invalid.' });
      await sbDelete('saudi_extras', `id=eq.${id}`);   // a return it already made stays on its line (delete that one separately)
      return json({ success: true });
    }
    // Nov 15 2026: anyone who can open Saudi Transfers can add a picture to a transfer (chat screenshot, delivery list, photo)
    if (a === 'addBatchPhoto') {
      const bl = txt(p.batch, 60), bd = String(p.batchDate || '').slice(0, 10);
      const b = await sbGet(`saudi_transfers?select=id,batch_date&batch_label=eq.${encodeURIComponent(bl)}${/^\d{4}-\d{2}-\d{2}$/.test(bd) ? '&batch_date=eq.' + bd : ''}&limit=1`);
      if (!b.length) return json({ success: false, error: 'Transfer not found.' });
      const n = (await sbGet(`saudi_photos?select=id&batch_label=eq.${encodeURIComponent(bl)}&line_id=is.null`)).length;
      if (n >= 30) return json({ success: false, error: 'This transfer already has 30 pictures.' });
      const url = await savePhoto(String(p.photo || '')); if (!url) return json({ success: false, error: 'Picture not saved (JPEG/PNG only).' });
      await sbPost('saudi_photos', [{ line_id: null, batch_label: bl, batch_date: b[0].batch_date, url, sort_order: 100 + n, caption: txt(p.caption, 60) || null, source: 'added', created_by: who(u) }]);
      return json({ success: true });
    }
    // delete a transfer picture: Admin, or the person who added it
    if (a === 'deleteBatchPhoto') {
      const id = parseInt(String(p.id || ''), 10); if (!id) return json({ success: false, error: 'Missing id.' });
      const ph = (await sbGet(`saudi_photos?select=id,url,source,created_by,line_id&id=eq.${id}&limit=1`))[0];
      if (!ph) return json({ success: false, error: 'Picture not found.' });
      if (!isAdmin(u) && !(ph.source === 'added' && ph.created_by === who(u))) return json({ success: false, error: 'Only an admin or the person who added it can delete this picture.' });
      await sbDelete('saudi_photos', `id=eq.${id}`);
      const path = String(ph.url || '').indexOf(PUB) === 0 ? String(ph.url).slice(PUB.length) : (/^https?:/.test(String(ph.url || '')) ? '' : String(ph.url || ''));
      try { if (path) await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }); } catch (_) { /* row is gone either way */ }
      return json({ success: true });
    }
    if (a === 'importPhoto') {   // Admin: pictures that were inside TRANSFERS_TO_SAUDI.xlsx
      if (!isAdmin(u)) return json({ success: false, error: 'Admin only.' });
      const bl = txt(p.batch, 60), so = parseInt(String(p.item || ''), 10), ord = parseInt(String(p.order || '0'), 10) || 0;
      const b = await sbGet(`saudi_transfers?select=id,batch_date&batch_label=eq.${encodeURIComponent(bl)}&source=eq.excel&order=sort_order.asc`);
      if (!b.length) return json({ success: false, error: 'Transfer not found.' });
      const line = Number.isFinite(so) ? (await sbGet(`saudi_transfers?select=id&batch_label=eq.${encodeURIComponent(bl)}&source=eq.excel&sort_order=eq.${so}&limit=1`))[0] : null;
      if (Number.isFinite(so) && !line) return json({ success: false, error: 'Line not found.' });
      const key = txt(p.key, 40);
      if (key) { const dup = await sbGet(`saudi_photos?select=id&caption=eq.${encodeURIComponent(key)}&batch_label=eq.${encodeURIComponent(bl)}&limit=1`); if (dup.length) return json({ success: true, skipped: true }); }
      const url = await savePhoto(String(p.photo || '')); if (!url) return json({ success: false, error: 'Picture not saved.' });
      await sbPost('saudi_photos', [{ line_id: line ? line.id : null, batch_label: bl, batch_date: b[0].batch_date, url, sort_order: ord, caption: key || null, source: 'excel', created_by: who(u) }]);
      return json({ success: true });
    }
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
