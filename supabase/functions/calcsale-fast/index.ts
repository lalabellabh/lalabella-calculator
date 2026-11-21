// LALABELLA — CALC SALE (Supabase Edge Function, verify_jwt OFF). Nov 2026.
// While Odoo is not live: the Flower Calc and Chocolate Calc are the tool for every day's sales.
// "✓ Benta na" in a calc takes the listed flowers / chocolates out of THAT branch's stock.
//   flower    -> rows in flower_arrangement_fulfillments (arrangement_code = sale no., already subtracted everywhere)
//   chocolate -> FIFO by expiry over the branch's batches + one Release (type 'Sale (Calc)'), like Odoo auto-deduct
// Not enough stock in the system = still saved (it was really sold) and listed as "short" so the next count explains it.
// order_settings 'deduct_source' = 'calc' | 'odoo'. When Odoo goes live, set it to 'odoo' and the calcs stop deducting.
// Actions: getMode | saveFlowerSale | saveChocolateSale | listSales | cancelSale (Admin) | setMode (Admin)

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
async function me(token: string) {
  const t = String(token || '').trim(); if (!t) return null;
  const rows = await sbGet(`users?select=username,full_name,role,status,token_created,branch&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0]; if (!u || String(u.status || 'Active') === 'Inactive') return null;
  const c = u.token_created ? new Date(u.token_created).getTime() : 0;
  return c && Date.now() - c <= SESSION_MAX_AGE_MS ? u : null;
}
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const txt = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const who = (u: any) => txt(u && (u.full_name || u.username), 60);
async function mode() { try { const r = await sbGet('order_settings?select=value&key=eq.deduct_source&limit=1'); return String((r[0] && r[0].value) || 'calc'); } catch { return 'calc'; } }
// Nov 15 2026: the extras lines themselves (name + price), so reprints and edits show them
function parseExtras(v: any): any[] | null {
  if (v == null || v === '') return null;
  let a: any[] = []; try { a = typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; }
  if (!Array.isArray(a)) return null;
  return a.slice(0, 40).map((x: any) => ({ desc: txt(x && (x.desc ?? x.description), 120), price: r3(Math.min(100000, Math.max(0, Number(x && (x.price ?? x.amount)) || 0))) })).filter((x: any) => x.desc && (x.price > 0 || /free/i.test(x.desc)));   // 'Free Delivery' may be 0
}
const extrasSum = (a: any[]) => r3(a.reduce((s: number, x: any) => s + (Number(x.price) || 0), 0));
function itemsTotal(kind: string, items: any[]) { return r3((items || []).reduce((a: number, it: any) => a + (kind === 'flower' ? (Number(it.qty) || 0) * (Number(it.rate) || 0) : (Number(it.total) || 0)), 0)); }
// Nov 15 2026: before / after record of every stock change made by the calcs (Sold, Edit, Cancel) — the basis that the deduction was right.
async function logMoves(rows: any[]) { try { const ok = rows.filter((x) => x && x.item && Math.abs(Number(x.change) || 0) > 0.0005); if (ok.length) await sbPost('stock_moves', ok); } catch (_) { /* never block a sale */ } }
const unitLabel = (u: any) => isKg(u) ? 'kg' : isG(u) ? 'g' : (String(u || '').trim() || 'pcs');
async function chocBranchStock(branch: string, name: string) {   // current stock of one chocolate in one branch, per unit
  const rows = await sbGet(`chocolate_database?select=current_stock,unit&branch=eq.${encodeURIComponent(branch)}&approval_status=eq.Approved&chocolate_name=eq.${encodeURIComponent(name)}`);
  const by: Record<string, number> = {}; (rows || []).forEach((b: any) => { const k = unitLabel(b.unit); by[k] = r3((by[k] || 0) + (Number(b.current_stock) || 0)); }); return by;
}
async function nextSaleNo(saleId: number) { return 'CS-' + String(saleId).padStart(6, '0'); }

// ---------------- FLOWER ----------------
function stemsOf(qty: any, unit: any, spb: any) { const u = String(unit || '').trim().toLowerCase(); const s = Number(spb) || 1; return u === 'bunch' && s > 0 ? Number(qty) * s : Number(qty) || 0; }
async function flowerAvailable(branch: string, names: string[]) {
  const enc = encodeURIComponent(branch);
  const [hist, db, tr, ful] = await Promise.all([
    sbGetAll(`flower_stock_history?select=flower_name,count_date,physical_count&item_code=eq.CONSOLIDATED&branch=eq.${enc}`),
    sbGetAll(`flower_database?select=flower_name,entry_date,qty,unit,stems_per_bunch,type&approval_status=eq.Approved&branch=eq.${enc}`),
    sbGetAll('flower_transfer_history?select=flower_name,transfer_date,qty,from_branch,to_branch'),
    sbGetAll(`flower_arrangement_fulfillments?select=flower_name,fulfilled_date,qty&branch=eq.${enc}`),
  ]);
  const now = new Date(), out: Record<string, number> = {};
  for (const name of names) {
    const n = name.trim().toLowerCase(); const same = (x: any) => String(x || '').trim().toLowerCase() === n;
    let last: Date | null = null, opening = 0;
    hist.forEach((r: any) => { if (!same(r.flower_name)) return; const d = new Date(r.count_date); if (isNaN(d.getTime()) || d > now) return; if (!last || d > last) { last = d; opening = Number(r.physical_count) || 0; } });
    const from = last || new Date(0); const inWin = (v: any) => { const d = new Date(v); return !isNaN(d.getTime()) && d > from && d <= now; };
    let s = opening;
    db.forEach((r: any) => { if (r.type === 'Supply' || !same(r.flower_name) || !inWin(r.entry_date)) return; s += stemsOf(r.qty, r.unit, r.stems_per_bunch); });
    tr.forEach((r: any) => { if (!same(r.flower_name) || !inWin(r.transfer_date)) return; const q = Number(r.qty) || 0; if (String(r.to_branch || '').trim() === branch) s += q; if (String(r.from_branch || '').trim() === branch) s -= q; });
    ful.forEach((r: any) => { if (!same(r.flower_name) || !inWin(r.fulfilled_date)) return; s -= Number(r.qty) || 0; });
    out[name] = r3(s);
  }
  return out;
}
async function saveFlowerSale(p: any, u: any) {
  const branch = txt(p.branch, 30);
  if (BRANCHES.indexOf(branch) === -1) return { success: false, error: 'Pick the branch first.' };
  let items: any[] = []; try { items = JSON.parse(p.items || '[]'); } catch { items = []; }
  // same flower twice in the list = one line
  const sum: Record<string, number> = {}; const rate: Record<string, number> = {};
  items.forEach((it: any) => { const n = txt(it && it.name, 80), q = Number(it && it.qty) || 0; if (!n || q <= 0) return; sum[n] = r3((sum[n] || 0) + q); rate[n] = Number(it.rate) || 0; });
  const names = Object.keys(sum);
  if (!names.length) return { success: false, error: 'Add at least one flower with a Qty.' };
  const avail = await flowerAvailable(branch, names);
  const short = names.filter((n) => avail[n] < sum[n]).map((n) => ({ name: n, need: sum[n], have: avail[n] }));
  const exList = parseExtras(p.extrasList);
  const total = r3(names.reduce((s, n) => s + sum[n] * (rate[n] || 0), 0) + (exList ? extrasSum(exList) : (Number(p.extras) || 0)));
  const head = (await sbPost('calc_sales', [{ kind: 'flower', branch, extras: exList, ref: txt(p.ref, 60) || null, source: txt(p.source, 30) || null, disp_code: /^DISP-\d{1,8}$/i.test(String(p.disp || '')) ? String(p.disp).toUpperCase() : null, customer: txt(p.customer, 80) || null, items: names.map((n) => ({ name: n, qty: sum[n], rate: rate[n] || 0 })), short, total, created_by: who(u), req_key: p._reqKey || null }]))[0];
  const saleNo = await nextSaleNo(head.id);
  const now = new Date().toISOString();
  await sbPost('flower_arrangement_fulfillments', names.map((n) => ({ arrangement_id: null, arrangement_code: saleNo, branch, flower_name: n, qty: sum[n], fulfilled_by: 'Calc · ' + who(u), fulfilled_date: now })));
  await sbPatch('calc_sales', `id=eq.${head.id}`, { sale_no: saleNo, deducted: names.map((n) => ({ name: n, qty: sum[n] })) });
  await logMoves(names.map((n) => ({ kind: 'flower', branch, item: n, unit: 'stems', before: avail[n], change: -sum[n], after: r3(avail[n] - sum[n]), ref: saleNo, action: 'Sold', by: who(u) })));
  return { success: true, saleNo, branch, lines: names.length, short };
}

// ---------------- CHOCOLATE ----------------
const isKg = (u: any) => /^(kg|kgs|kilo|kilogram)/i.test(String(u || '').trim());
const isG = (u: any) => /^(g|gr|gram|grams)$/i.test(String(u || '').trim());
// Takes the listed chocolates out of one branch (FIFO by expiry), with one Release; shared by Sold and by moving a sale to another branch.
async function takeChoc(branch: string, items: any[], saleNo: string, p: any, u: any) {
  let releaseNo = '';
  const deducted: any[] = [], short: any[] = [], moves: any[] = [];
  const day = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  for (const c of items) {
    // how much: grams (if known) and pieces (if known)
    const grams = c.kg > 0 ? c.kg * 1000 : (c.mode === 'grams' ? c.amount : c.mode === 'kg' ? c.amount * 1000 : (c.gpp ? c.amount * c.gpp : null));
    const pcs = c.mode === 'pieces' ? c.amount : (c.gpp && grams ? grams / c.gpp : null);
    let leftG: number | null = grams, leftP: number | null = pcs;
    const q0 = `chocolate_database?select=*&branch=eq.${encodeURIComponent(branch)}&approval_status=eq.Approved&current_stock=gt.0&order=expiry_date.asc.nullslast,id.asc`;
    let batches: any[] = c.code ? await sbGet(q0 + `&product_code=eq.${encodeURIComponent(c.code)}`) : [];
    if (!batches.length) batches = await sbGet(q0 + `&chocolate_name=eq.${encodeURIComponent(c.name)}`);
    const mvName = batches.length ? String(batches[0].chocolate_name) : c.name;
    const mvBefore = batches.length ? await chocBranchStock(branch, mvName) : {}; const mvTaken: Record<string, number> = {};
    for (const b of batches) {
      const kgU = isKg(b.unit), gU = isG(b.unit);
      const want = kgU ? (leftG == null ? null : leftG / 1000) : gU ? leftG : leftP;
      if (want == null || want <= 0.0000001) break;
      const q = r3(Math.min(want, Number(b.current_stock)));
      if (q <= 0) continue;
      if (!releaseNo) { const n = await sbRpc('get_next_chocolate_counter', { counter_key: 'Next Release No', start_at: 1 }); releaseNo = 'REL-' + String(n).padStart(6, '0'); }
      const price = Number(kgU ? b.price_per_kg : (b.price_per_piece ?? b.price_per_kg)) || 0;
      await sbPost('chocolate_release_database', [{ release_no: releaseNo, transaction_type: 'Sale (Calc)', branch, customer_department: txt(p.customer, 80) || 'Calc sale', chocolate_name: b.chocolate_name, product_code: b.product_code || '', batch_no: b.batch_no, qty_release: q, unit: b.unit, price, total: r3(q * price), remarks: saleNo + (p.source ? ' · ' + txt(p.source, 30) : '') + (p.ref ? ' · ' + txt(p.ref, 60) : ''), prepared_by: who(u), release_date: day, database_id: String(b.id), to_branch: '' }]);
      await sbPatch('chocolate_database', `id=eq.${b.id}`, { current_stock: r3(Number(b.current_stock) - q), qty_used: r3(Number(b.qty_used || 0) + q) });
      deducted.push({ name: b.chocolate_name, id: b.id, batch: b.batch_no, qty: q, unit: b.unit });
      mvTaken[unitLabel(b.unit)] = r3((mvTaken[unitLabel(b.unit)] || 0) + q);
      if (kgU || gU) { const g = kgU ? q * 1000 : q; leftG = (leftG ?? 0) - g; if (leftP != null && grams && pcs) leftP = leftG * pcs / grams; }
      else { leftP = (leftP ?? 0) - q; if (leftG != null && pcs) leftG = leftP * (grams! / pcs); }
    }
    moves.push(...Object.keys(mvTaken).map((k) => ({ kind: 'chocolate', branch, item: mvName, unit: k, before: mvBefore[k] || 0, change: -mvTaken[k], after: r3((mvBefore[k] || 0) - mvTaken[k]), action: 'Sold', by: who(u) })));
    if (!batches.length) short.push({ name: c.name, need: c.mode === 'pieces' ? c.amount + ' pcs' : r3(grams || 0) + ' g', have: 'not in this branch stock' });
    else if (leftG != null && leftG > 0.5) short.push({ name: c.name, need: r3(grams || 0) + ' g', have: r3((grams || 0) - leftG) + ' g' });
    else if (leftG == null && leftP != null && leftP > 0.01) short.push({ name: c.name, need: r3(pcs || 0) + ' pcs', have: r3((pcs || 0) - leftP) + ' pcs' });
  }
  return { releaseNo, deducted, short, moves };
}
async function saveChocolateSale(p: any, u: any) {
  const branch = txt(p.branch, 30);
  if (BRANCHES.indexOf(branch) === -1) return { success: false, error: 'Pick the branch first.' };
  let items: any[] = []; try { items = JSON.parse(p.items || '[]'); } catch { items = []; }
  items = items.map((c: any) => ({ name: txt(c && c.name, 120), code: txt(c && c.code, 40), mode: String(c && c.mode || ''), amount: Number(c && c.amount) || 0, kg: Number(c && c.kg) || 0, gpp: Number(c && c.gpp) || 0, total: Number(c && c.total) || 0 }))
    .filter((c: any) => c.name && (c.amount > 0 || c.kg > 0));
  if (!items.length) return { success: false, error: 'The list is empty.' };
  const exList = parseExtras(p.extrasList);
  const head = (await sbPost('calc_sales', [{ kind: 'chocolate', branch, extras: exList, ref: txt(p.ref, 60) || null, source: txt(p.source, 30) || null, disp_code: /^DISP-\d{1,8}$/i.test(String(p.disp || '')) ? String(p.disp).toUpperCase() : null, customer: txt(p.customer, 80) || null, items, total: r3(items.reduce((s: number, c: any) => s + c.total, 0) + (exList ? extrasSum(exList) : (Number(p.extras) || 0))), created_by: who(u), req_key: p._reqKey || null }]))[0];
  const saleNo = await nextSaleNo(head.id);
  const { releaseNo, deducted, short, moves } = await takeChoc(branch, items, saleNo, p, u);
  await sbPatch('calc_sales', `id=eq.${head.id}`, { sale_no: saleNo, release_no: releaseNo || null, deducted, short });
  await logMoves(moves.map((m) => ({ ...m, ref: saleNo })));
  return { success: true, saleNo, releaseNo, branch, lines: deducted.length, short };
}

// ---------------- MIXED (flower + chocolate in one order, Nov 17 2026) ----------------
// One ✓ Sold = two linked sales (a flower sale and a chocolate sale) with the same group_no — so every report, the
// dashboard and Odoo stay per kind. Extras go with the flower sale (or the chocolate sale when there are no flowers).
async function saveMixedSale(p: any, u: any) {
  let fl: any[] = [], ch: any[] = [];
  try { fl = JSON.parse(p.flowers || '[]'); } catch { fl = []; }
  try { ch = JSON.parse(p.chocs || '[]'); } catch { ch = []; }
  fl = (Array.isArray(fl) ? fl : []).filter((x: any) => x && txt(x.name, 80) && Number(x.qty) > 0);
  ch = (Array.isArray(ch) ? ch : []).filter((x: any) => x && txt(x.name, 120) && (Number(x.amount) > 0 || Number(x.kg) > 0));
  if (!fl.length && !ch.length) return { success: false, error: 'The list is empty.' };
  const key = p._reqKey || '';
  const out: any = { success: true, branch: txt(p.branch, 30), short: [], saleNos: [] };
  if (fl.length) {
    const r = await saveFlowerSale({ ...p, items: JSON.stringify(fl), _reqKey: key ? key + 'f' : null }, u);
    if (!r.success) return r;
    out.flowerSaleNo = r.saleNo; out.saleNos.push(r.saleNo); out.short.push(...(r.short || []).map((x: any) => ({ ...x, need: x.need + ' stems' })));
  }
  if (ch.length) {
    const r = await saveChocolateSale({ ...p, items: JSON.stringify(ch), extrasList: fl.length ? '[]' : p.extrasList, extras: fl.length ? '0' : p.extras, _reqKey: key ? key + 'c' : null }, u);
    if (!r.success) { out.chocError = r.error || 'Chocolate not saved.'; }
    else { out.chocSaleNo = r.saleNo; out.releaseNo = r.releaseNo; out.saleNos.push(r.saleNo); out.short.push(...(r.short || [])); }
  }
  out.groupNo = 'MX-' + out.saleNos[0];
  if (out.saleNos.length) await sbPatch('calc_sales', `sale_no=in.(${out.saleNos.map((n: string) => encodeURIComponent(n)).join(',')})`, { group_no: out.groupNo });
  out.saleNo = out.saleNos.join(' + ');
  return out;
}

// ---------------- LIST / CANCEL ----------------
async function listSales(p: any) {
  const dRx = /^\d{4}-\d{2}-\d{2}$/, from = String(p.from || ''), to = String(p.to || '');
  let q = 'calc_sales?select=*&order=id.desc&limit=' + Math.min(dRx.test(from) || dRx.test(to) ? 1000 : 300, Number(p.limit) || 100);
  // back-track by date (Bahrain day, UTC+3)
  if (dRx.test(from)) q += '&created_at=gte.' + encodeURIComponent(from + 'T00:00:00+03:00');
  if (dRx.test(to)) { const n = new Date(to + 'T00:00:00Z'); n.setUTCDate(n.getUTCDate() + 1); q += '&created_at=lt.' + encodeURIComponent(n.toISOString().slice(0, 10) + 'T00:00:00+03:00'); }
  if (p.kind === 'flower' || p.kind === 'chocolate') q += '&kind=eq.' + p.kind;
  if (BRANCHES.indexOf(String(p.branch)) !== -1) q += '&branch=eq.' + p.branch;
  const rows = await sbGet(q);
  return { success: true, mode: await mode(), sales: rows.map((r: any) => ({ id: r.id, saleNo: r.sale_no, kind: r.kind, branch: r.branch, ref: r.ref || '', source: r.source || '', customer: r.customer || '', items: r.items, deducted: r.deducted, short: r.short, total: Number(r.total) || 0, releaseNo: r.release_no || '', by: r.created_by || '', at: r.created_at, status: r.status, cancelledBy: r.cancelled_by || '', cancelledAt: r.cancelled_at, editedBy: r.edited_by || '', editedAt: r.edited_at || null,
    groupNo: r.group_no || '', extras: Array.isArray(r.extras) ? r.extras : [], extrasTotal: r3(Math.max(0, (Number(r.total) || 0) - itemsTotal(r.kind, r.items))) })) };
}
async function cancelSale(p: any, u: any) {
  const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid sale.' };
  const rows = await sbGet(`calc_sales?select=*&id=eq.${id}`); const s = rows[0];
  if (!s) return { success: false, error: 'Sale not found.' };
  if (s.status !== 'Active') return { success: false, error: 'Already cancelled.' };
  const moves: any[] = [];
  if (s.kind === 'flower') {
    const qty: Record<string, number> = {}; (s.deducted || s.items || []).forEach((d: any) => { qty[String(d.name)] = r3((qty[String(d.name)] || 0) + (Number(d.qty) || 0)); });
    const av = await flowerAvailable(s.branch, Object.keys(qty));
    await sbDelete('flower_arrangement_fulfillments', `arrangement_code=eq.${encodeURIComponent(s.sale_no)}`);
    Object.keys(qty).forEach((n) => moves.push({ kind: 'flower', branch: s.branch, item: n, unit: 'stems', before: av[n], change: qty[n], after: r3(av[n] + qty[n]) }));
  } else {
    const back: Record<string, number> = {};
    (s.deducted || []).forEach((d: any) => { const k = String(d.name) + '|' + unitLabel(d.unit); back[k] = r3((back[k] || 0) + (Number(d.qty) || 0)); });
    for (const k of Object.keys(back)) { const [nm, un] = k.split('|'); const bf = (await chocBranchStock(s.branch, nm))[un] || 0; moves.push({ kind: 'chocolate', branch: s.branch, item: nm, unit: un, before: bf, change: back[k], after: r3(bf + back[k]) }); }
    for (const d of (s.deducted || [])) {
      const b = (await sbGet(`chocolate_database?select=id,current_stock,qty_used&id=eq.${Number(d.id)}`))[0];
      if (b) await sbPatch('chocolate_database', `id=eq.${b.id}`, { current_stock: r3(Number(b.current_stock) + Number(d.qty)), qty_used: r3(Math.max(0, Number(b.qty_used || 0) - Number(d.qty))) });
    }
    if (s.release_no) await sbDelete('chocolate_release_database', `release_no=eq.${encodeURIComponent(s.release_no)}&transaction_type=eq.${encodeURIComponent('Sale (Calc)')}`);
  }
  await sbPatch('calc_sales', `id=eq.${id}`, { status: 'Cancelled', cancelled_by: who(u), cancelled_at: new Date().toISOString() });
  await logMoves(moves.map((m) => ({ ...m, ref: s.sale_no, action: 'Cancelled (put back)', by: who(u) })));
  return { success: true };
}

// Nov 2026: Admin can fix a sale (wrong source / name / branch / qty) without cancelling it.
// Flower: the stock taken out is re-done for the new list (old lines put back, new lines taken out, same sale no. and date).
// Chocolate: the details (source, sold to, customer) and the branch (Nov 21: stock is put back and taken from the new branch) —
// for wrong chocolates, Cancel and sell again.
const SRC_OK = ['Walk-in', 'Pick-up', 'Website order', 'WhatsApp', 'Corporate', 'Others'];
async function editSale(p: any, u: any) {
  const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid sale.' };
  const s = (await sbGet(`calc_sales?select=*&id=eq.${id}`))[0];
  if (!s) return { success: false, error: 'Sale not found.' };
  if (s.status !== 'Active') return { success: false, error: 'This sale is cancelled — it cannot be edited.' };
  const src = txt(p.source, 30); if (src && SRC_OK.indexOf(src) === -1) return { success: false, error: 'Pick a source from the list.' };
  const fields: any = { source: src || s.source || null, ref: txt(p.ref, 60) || null, customer: txt(p.customer, 80) || null };
  const before = { source: s.source, ref: s.ref, customer: s.customer, branch: s.branch, items: s.items, total: s.total, extras: s.extras || null };
  const exNew = parseExtras(p.extrasList);   // null = extras not sent (keep as they were)
  const oldExtras = r3(Math.max(0, (Number(s.total) || 0) - itemsTotal(s.kind, s.items)));
  const exTotal = exNew ? extrasSum(exNew) : oldExtras;
  if (exNew) { fields.extras = exNew; fields.total = r3(itemsTotal(s.kind, s.items) + exTotal); }
  // Nov 21 2026 (Bench): a chocolate sale saved under the wrong branch can be moved: what was taken is put back, then taken from the new branch
  const newBr = txt(p.branch, 30);
  if (s.kind === 'chocolate' && newBr && newBr !== s.branch) {
    if (BRANCHES.indexOf(newBr) === -1) return { success: false, error: 'Pick the branch.' };
    const mvBack: any[] = [], back: Record<string, number> = {};
    (s.deducted || []).forEach((d: any) => { const k = String(d.name) + '|' + unitLabel(d.unit); back[k] = r3((back[k] || 0) + (Number(d.qty) || 0)); });
    for (const k of Object.keys(back)) { const [nm, un] = k.split('|'); const bf = (await chocBranchStock(s.branch, nm))[un] || 0; mvBack.push({ kind: 'chocolate', branch: s.branch, item: nm, unit: un, before: bf, change: back[k], after: r3(bf + back[k]), ref: s.sale_no, action: 'Moved to ' + newBr + ' (put back)', by: who(u) }); }
    for (const d of (s.deducted || [])) {
      const b = (await sbGet(`chocolate_database?select=id,current_stock,qty_used&id=eq.${Number(d.id)}`))[0];
      if (b) await sbPatch('chocolate_database', `id=eq.${b.id}`, { current_stock: r3(Number(b.current_stock) + Number(d.qty)), qty_used: r3(Math.max(0, Number(b.qty_used || 0) - Number(d.qty))) });
    }
    if (s.release_no) await sbDelete('chocolate_release_database', `release_no=eq.${encodeURIComponent(s.release_no)}&transaction_type=eq.${encodeURIComponent('Sale (Calc)')}`);
    const t = await takeChoc(newBr, s.items || [], s.sale_no, { customer: s.customer, source: fields.source, ref: fields.ref }, u);
    await logMoves(mvBack.concat(t.moves.map((m: any) => ({ ...m, ref: s.sale_no, action: 'Sold (moved from ' + s.branch + ')' }))));
    fields.branch = newBr; fields.release_no = t.releaseNo || null; fields.deducted = t.deducted; fields.short = t.short;
  }
  if (s.kind === 'flower' && p.items != null) {
    let items: any[] = []; try { items = JSON.parse(p.items || '[]'); } catch { items = []; }
    const branch = txt(p.branch, 30) || s.branch; if (BRANCHES.indexOf(branch) === -1) return { success: false, error: 'Pick the branch.' };
    const oldRate: Record<string, number> = {}; (s.items || []).forEach((it: any) => { oldRate[String(it.name)] = Number(it.rate) || 0; });
    const sum: Record<string, number> = {};
    items.forEach((it: any) => { const n = txt(it && it.name, 80), q = r3(Number(it && it.qty) || 0); if (!n || q <= 0) return; sum[n] = r3((sum[n] || 0) + q); });
    const names = Object.keys(sum);
    if (!names.length) return { success: false, error: 'At least one flower must stay. To remove everything, use Cancel.' };
    const unknown = names.filter((n) => oldRate[n] === undefined);
    // a flower added during the edit: take its rate from the flower list (Legacy price first)
    for (const n of unknown) { const r = await sbGet(`flower_item?select=rate,origin&flower_name=eq.${encodeURIComponent(n)}&status=eq.Active`); if (!r.length) return { success: false, error: `"${n}" is not in the flower list.` }; const lg = r.find((x: any) => String(x.origin) === 'Legacy/Unknown') || r[0]; oldRate[n] = Number(lg.rate) || 0; }
    const extras = exTotal;
    // before/after record: per flower, what changes in each branch
    const oldQ: Record<string, number> = {}; (s.items || []).forEach((it: any) => { oldQ[String(it.name)] = r3((oldQ[String(it.name)] || 0) + (Number(it.qty) || 0)); });
    const mv: any[] = [];
    const brs = branch === s.branch ? [branch] : [s.branch, branch];
    for (const br of brs) {
      const all = Array.from(new Set([...(br === s.branch ? Object.keys(oldQ) : []), ...(br === branch ? names : [])]));
      const av = await flowerAvailable(br, all);
      all.forEach((n) => { const ch = r3((br === s.branch ? (oldQ[n] || 0) : 0) - (br === branch ? (sum[n] || 0) : 0)); mv.push({ kind: 'flower', branch: br, item: n, unit: 'stems', before: av[n], change: ch, after: r3(av[n] + ch), ref: s.sale_no, action: 'Edited', by: who(u) }); });
    }
    // put back the old lines, take out the new ones (same sale no. + original sale time)
    await sbDelete('flower_arrangement_fulfillments', `arrangement_code=eq.${encodeURIComponent(s.sale_no)}`);
    await sbPost('flower_arrangement_fulfillments', names.map((n) => ({ arrangement_id: null, arrangement_code: s.sale_no, branch, flower_name: n, qty: sum[n], fulfilled_by: 'Calc · ' + (s.created_by || who(u)) + ' (edited by ' + who(u) + ')', fulfilled_date: s.created_at })));
    fields.branch = branch; fields.items = names.map((n) => ({ name: n, qty: sum[n], rate: oldRate[n] || 0 }));
    fields.deducted = names.map((n) => ({ name: n, qty: sum[n] }));
    fields.total = r3(names.reduce((a, n) => a + sum[n] * (oldRate[n] || 0), 0) + extras);
    await logMoves(mv);
  }
  const log = Array.isArray(s.edit_log) ? s.edit_log.slice(-19) : [];
  log.push({ at: new Date().toISOString(), by: who(u), before });
  fields.edited_by = who(u); fields.edited_at = new Date().toISOString(); fields.edit_log = log;
  await sbPatch('calc_sales', `id=eq.${id}`, fields);
  return { success: true, saleNo: s.sale_no, total: fields.total ?? s.total, short: fields.short };
}

async function readParams(req: Request): Promise<Record<string, any>> {
  if (req.method === 'GET') return Object.fromEntries(new URL(req.url).searchParams.entries());
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await req.json();
  return Object.fromEntries(new URLSearchParams(await req.text()));
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const p = await readParams(req);
    const u = await me(p.token);
    if (!u) return json({ success: false, error: 'Please log in again.' });
    const admin = String(u.role || '').toLowerCase() === 'admin';
    const a = String(p.action || '');
    if (a === 'getMode') return json({ success: true, mode: await mode(), userBranch: u.branch || '' });
    if (a === 'saveFlowerSale' || a === 'saveChocolateSale') {
      if ((await mode()) !== 'calc') return json({ success: false, error: 'Odoo is now the one that takes sales out of stock. The calc is for quotes only.' });
      // no double save: the page sends one key per sale; the same key again (double tap, retry after a lost reply) = the first sale
      const key = /^[A-Za-z0-9_-]{8,64}$/.test(String(p.reqKey || '')) ? String(p.reqKey) : '';
      const same = async () => { if (!key) return null; const r = await sbGet(`calc_sales?select=sale_no,branch,release_no,short&req_key=eq.${key}&limit=1`); return r && r[0]; };
      const was = await same();
      if (was) return json({ success: true, duplicate: true, saleNo: was.sale_no, releaseNo: was.release_no || '', branch: was.branch, short: was.short || [] });
      p._reqKey = key;   // per request (not a shared variable)
      try { return json(a === 'saveFlowerSale' ? await saveFlowerSale(p, u) : await saveChocolateSale(p, u)); }
      catch (e) { const w = await same(); if (w) return json({ success: true, duplicate: true, saleNo: w.sale_no, releaseNo: w.release_no || '', branch: w.branch, short: w.short || [] }); throw e; }
    }
    if (a === 'saveMixedSale') {
      if ((await mode()) !== 'calc') return json({ success: false, error: 'Odoo is now the one that takes sales out of stock. The calc is for quotes only.' });
      const key = /^[A-Za-z0-9_-]{8,60}$/.test(String(p.reqKey || '')) ? String(p.reqKey) : '';
      if (key) {   // same key again (double tap / lost reply) = the first sale
        const was = await sbGet(`calc_sales?select=sale_no,branch,release_no,short,group_no&req_key=in.(${key}f,${key}c)`);
        if (was && was.length) return json({ success: true, duplicate: true, saleNo: was.map((w: any) => w.sale_no).join(' + '), groupNo: was[0].group_no || '', releaseNo: (was.find((w: any) => w.release_no) || {}).release_no || '', branch: was[0].branch, short: [] });
      }
      p._reqKey = key;
      return json(await saveMixedSale(p, u));
    }
    if (a === 'listSales') return json(await listSales(p));
    // receiving approved (called by flower-fast / chocolate-fast with the approver's token): the stock now already has it -> before = now - qty
    if (a === 'logReceived') {
      let lines: any[] = []; try { lines = JSON.parse(p.lines || '[]'); } catch { lines = []; }
      const kind = p.kind === 'chocolate' ? 'chocolate' : 'flower', mv: any[] = [];
      const by: Record<string, any> = {};
      lines.slice(0, 200).forEach((l: any) => { const br = txt(l.branch, 30), it = txt(l.item, 120), un = kind === 'flower' ? 'stems' : unitLabel(l.unit), q = r3(Number(l.qty) || 0); if (!br || !it || q <= 0 || BRANCHES.indexOf(br) === -1) return; const k = br + '|' + it + '|' + un; by[k] = by[k] ? { ...by[k], q: r3(by[k].q + q) } : { br, it, un, q }; });
      for (const k of Object.keys(by)) {
        const x = by[k]; let now = 0;
        if (kind === 'flower') now = (await flowerAvailable(x.br, [x.it]))[x.it] || 0; else now = (await chocBranchStock(x.br, x.it))[x.un] || 0;
        // Nov 17 2026: also used for chocolate transfers (dir out = taken out of this branch)
        const out = p.dir === 'out';
        mv.push({ kind, branch: x.br, item: x.it, unit: x.un, before: r3(out ? now + x.q : now - x.q), change: out ? -x.q : x.q, after: r3(now), ref: txt(p.ref, 60) || null, action: txt(p.act, 40) || 'Received', by: who(u) });
      }
      await logMoves(mv); return json({ success: true, logged: mv.length });
    }
    // one-time: a sale made before this log existed -> before = stock now + qty (Admin)
    if (a === 'backfillSaleMoves') {
      if (!admin) return json({ success: false, error: 'Admin only.' });
      const s = (await sbGet(`calc_sales?select=*&sale_no=eq.${encodeURIComponent(txt(p.saleNo, 20))}&status=eq.Active&limit=1`))[0];
      if (!s || s.kind !== 'flower') return json({ success: false, error: 'Flower sale not found.' });
      const qty: Record<string, number> = {}; (s.deducted || []).forEach((d: any) => { qty[String(d.name)] = r3((qty[String(d.name)] || 0) + (Number(d.qty) || 0)); });
      const av = await flowerAvailable(s.branch, Object.keys(qty));
      const mv = Object.keys(qty).map((n) => ({ at: s.created_at, kind: 'flower', branch: s.branch, item: n, unit: 'stems', before: r3(av[n] + qty[n]), change: -qty[n], after: av[n], ref: s.sale_no, action: 'Sold (recorded later)', by: s.created_by || who(u) }));
      await logMoves(mv); return json({ success: true, logged: mv.length });
    }
    // Nov 15 2026: stock shown under the calc search results — flower: stems per name; chocolate: batches (+ kg / pcs) per chocolate
    if (a === 'stockList') {
      const br = txt(p.branch, 30); if (BRANCHES.indexOf(br) === -1) return json({ success: false, error: 'Pick the branch first.' });
      if (p.kind === 'chocolate') {
        const rows = await sbGetAll(`chocolate_database?select=chocolate_name,product_code,batch_no,expiry_date,current_stock,unit,weight_per_piece&branch=eq.${encodeURIComponent(br)}&approval_status=eq.Approved&current_stock=gt.0&order=expiry_date.asc.nullslast`);
        const by: Record<string, any> = {};
        (rows || []).forEach((r: any) => { const k = String(r.chocolate_name || '').trim().toLowerCase(); if (!k) return; const g = by[k] || (by[k] = { name: r.chocolate_name, code: r.product_code || '', batches: [], total: {} });
          const un = unitLabel(r.unit), q = r3(Number(r.current_stock) || 0); g.batches.push({ batch: r.batch_no || '', stock: q, unit: un, expiry: r.expiry_date || '', gpp: Number(r.weight_per_piece) || 0 }); g.total[un] = r3((g.total[un] || 0) + q); });
        return json({ success: true, branch: br, kind: 'chocolate', stock: Object.values(by) });
      }
      const items = await sbGet('flower_item?select=flower_name&status=eq.Active&limit=1000');
      const names = Array.from(new Set((items || []).map((r: any) => String(r.flower_name || '').trim()).filter(Boolean)));
      return json({ success: true, branch: br, kind: 'flower', stock: await flowerAvailable(br, names) });
    }
    if (a === 'stockMoves') {
      const dRx = /^\d{4}-\d{2}-\d{2}$/; let q = 'stock_moves?select=*&order=id.desc&limit=' + Math.min(500, Math.max(1, Number(p.limit) || 100));
      if (p.kind === 'flower' || p.kind === 'chocolate') q += '&kind=eq.' + p.kind;
      if (BRANCHES.indexOf(String(p.branch)) !== -1) q += '&branch=eq.' + p.branch;
      if (dRx.test(String(p.from || ''))) q += '&at=gte.' + encodeURIComponent(p.from + 'T00:00:00+03:00');
      if (/^[A-Za-z0-9 \-]{2,40}$/.test(String(p.item || ''))) q += '&item=ilike.*' + encodeURIComponent(String(p.item)) + '*';
      return json({ success: true, moves: (await sbGet(q)).map((m: any) => ({ at: m.at, kind: m.kind, branch: m.branch, item: m.item, unit: m.unit, before: Number(m.before), change: Number(m.change), after: Number(m.after), ref: m.ref || '', action: m.action || '', by: m.by || '' })) });
    }
    // Guard: was this display (DISP-…) already sold in a calc or released? (so it is not taken out of stock twice)
    if (a === 'dispUsed') {
      const code = String(p.code || '').toUpperCase();
      if (!/^DISP-\d{1,8}$/.test(code)) return json({ success: false, error: 'Invalid code.' });
      const [cs, rel, dp] = await Promise.all([
        sbGet(`calc_sales?select=sale_no,branch,created_at,created_by&disp_code=eq.${code}&status=eq.Active&order=id.desc&limit=5`),
        sbGet(`chocolate_release_database?select=release_no,branch,release_date,prepared_by&remarks=ilike.*${code}*&order=id.desc&limit=50`),
        sbGet(`chocolate_display?select=display_name,created_at,created_by&display_code=eq.${code}&limit=1`),
      ]);
      const seen: Record<string, boolean> = {}; const releases: any[] = [];
      (rel || []).forEach((r: any) => { if (seen[r.release_no]) return; seen[r.release_no] = true; releases.push({ no: r.release_no, branch: r.branch, date: r.release_date, by: r.prepared_by }); });
      return json({ success: true, made: dp && dp[0] ? { name: dp[0].display_name, at: dp[0].created_at, by: dp[0].created_by } : null, sales: (cs || []).map((r: any) => ({ no: r.sale_no, branch: r.branch, at: r.created_at, by: r.created_by })), releases });
    }
    // Extras picker: Item Inventory names + sale price (Nov 15 2026: prices aligned to the Odoo sale price; staff may still change it — logged)
    if (a === 'itemNames') {
      const rows = await sbGet('item_inventory?select=item_code,item_name,size,photo_link,price_bhd&order=item_name.asc&limit=2000');
      const seen: Record<string, boolean> = {}; const items: any[] = [];
      (rows || []).forEach((r: any) => { const n = String(r.item_name || '').trim(); if (!n || seen[n.toLowerCase()]) return; seen[n.toLowerCase()] = true;
        items.push({ code: r.item_code || '', name: n, size: r.size || '', price: Number(r.price_bhd) || 0, photo: /^https:\/\/mysystemlla\.com\/[^\s"'<>]{1,200}$/.test(String(r.photo_link || '')) ? r.photo_link : '' }); });
      return json({ success: true, items });
    }
    // Extras: staff typed a different price than the Item Inventory sale price -> keep a log (no stock change)
    if (a === 'logExtraPrice') {
      const lp = Number(p.listPrice), up = Number(p.usedPrice);
      if (!isFinite(lp) || !isFinite(up) || up < 0 || up > 100000) return json({ success: false, error: 'Bad price.' });
      await sbPost('extra_price_log', [{ kind: p.kind === 'chocolate' ? 'chocolate' : 'flower', branch: txt(p.branch, 30) || null, item_code: txt(p.itemCode, 30) || null,
        item_name: txt(p.itemName, 120), list_price: lp, used_price: up, created_by: who(u) }]);
      return json({ success: true });
    }
    // Nov 17 2026 (Bench): 🗑️ delete a sale (Admin). Still active -> put back in stock first. A mixed order is deleted together.
    if (a === 'deleteSale') {
      if (!admin) return json({ success: false, error: 'Admin only.' });
      const s0 = (await sbGet(`calc_sales?select=id,group_no&id=eq.${Number(p.id)}&limit=1`))[0];
      if (!s0) return json({ success: false, error: 'Sale not found. Refresh.' });
      const all = s0.group_no ? await sbGet(`calc_sales?select=*&group_no=eq.${encodeURIComponent(s0.group_no)}`) : await sbGet(`calc_sales?select=*&id=eq.${s0.id}`);
      const done: string[] = [];
      for (const s of all) {
        if (s.status === 'Active') { const r: any = await cancelSale({ ...p, id: s.id }, u); if (!r || !r.success) return json({ success: false, error: 'Could not put ' + s.sale_no + ' back in stock: ' + ((r && r.error) || 'error') }); }
        const fresh = (await sbGet(`calc_sales?select=*&id=eq.${s.id}`))[0] || s;
        await sbPost('calc_sales_deleted', [{ sale_id: s.id, sale_no: s.sale_no, row_data: fresh, deleted_by: who(u) }]);
        await sbDelete('calc_sales', `id=eq.${s.id}`);
        done.push(s.sale_no);
      }
      return json({ success: true, deleted: done });
    }
    if (a === 'cancelSale') {
      if (!admin) return json({ success: false, error: 'Admin only.' });
      const r: any = await cancelSale(p, u);
      // Nov 17 2026: a mixed order (flower + chocolate) is cancelled together
      if (r && r.success) {
        const s0 = (await sbGet(`calc_sales?select=group_no&id=eq.${Number(p.id)}&limit=1`))[0];
        if (s0 && s0.group_no) { const sib = await sbGet(`calc_sales?select=id,sale_no&group_no=eq.${encodeURIComponent(s0.group_no)}&status=eq.Active&id=neq.${Number(p.id)}`);
          r.alsoCancelled = []; for (const x of sib) { const rr: any = await cancelSale({ ...p, id: x.id }, u); if (rr && rr.success) r.alsoCancelled.push(x.sale_no); } }
      }
      return json(r);
    }
    if (a === 'flowerNames') {
      const rows = await sbGet('flower_item?select=flower_name&status=eq.Active&order=flower_name.asc&limit=2000');
      const seen: Record<string, boolean> = {}; const names: string[] = [];
      (rows || []).forEach((r: any) => { const n = String(r.flower_name || '').trim(); if (n && !seen[n.toLowerCase()]) { seen[n.toLowerCase()] = true; names.push(n); } });
      return json({ success: true, names });
    }
    if (a === 'editSale') { if (!admin) return json({ success: false, error: 'Admin only.' }); return json(await editSale(p, u)); }
    if (a === 'setMode') {
      if (!admin) return json({ success: false, error: 'Admin only.' });
      const v = p.mode === 'odoo' ? 'odoo' : 'calc';
      await fetch(`${SB_URL}/rest/v1/order_settings?on_conflict=key`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ key: 'deduct_source', value: v }]) });
      return json({ success: true, mode: v });
    }
    return json({ success: false, error: 'Unknown action' });
  } catch (e) {
    console.error('[calcsale-fast]', e);
    return json({ success: false, error: 'Server error. Please try again.' }, 500);
  }
});
