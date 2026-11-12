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
  const total = r3(names.reduce((s, n) => s + sum[n] * (rate[n] || 0), 0) + (Number(p.extras) || 0));
  const head = (await sbPost('calc_sales', [{ kind: 'flower', branch, ref: txt(p.ref, 60) || null, source: txt(p.source, 30) || null, disp_code: /^DISP-\d{1,8}$/i.test(String(p.disp || '')) ? String(p.disp).toUpperCase() : null, customer: txt(p.customer, 80) || null, items: names.map((n) => ({ name: n, qty: sum[n], rate: rate[n] || 0 })), short, total, created_by: who(u), req_key: p._reqKey || null }]))[0];
  const saleNo = await nextSaleNo(head.id);
  const now = new Date().toISOString();
  await sbPost('flower_arrangement_fulfillments', names.map((n) => ({ arrangement_id: null, arrangement_code: saleNo, branch, flower_name: n, qty: sum[n], fulfilled_by: 'Calc · ' + who(u), fulfilled_date: now })));
  await sbPatch('calc_sales', `id=eq.${head.id}`, { sale_no: saleNo, deducted: names.map((n) => ({ name: n, qty: sum[n] })) });
  return { success: true, saleNo, branch, lines: names.length, short };
}

// ---------------- CHOCOLATE ----------------
const isKg = (u: any) => /^(kg|kgs|kilo|kilogram)/i.test(String(u || '').trim());
const isG = (u: any) => /^(g|gr|gram|grams)$/i.test(String(u || '').trim());
async function saveChocolateSale(p: any, u: any) {
  const branch = txt(p.branch, 30);
  if (BRANCHES.indexOf(branch) === -1) return { success: false, error: 'Pick the branch first.' };
  let items: any[] = []; try { items = JSON.parse(p.items || '[]'); } catch { items = []; }
  items = items.map((c: any) => ({ name: txt(c && c.name, 120), code: txt(c && c.code, 40), mode: String(c && c.mode || ''), amount: Number(c && c.amount) || 0, kg: Number(c && c.kg) || 0, gpp: Number(c && c.gpp) || 0, total: Number(c && c.total) || 0 }))
    .filter((c: any) => c.name && (c.amount > 0 || c.kg > 0));
  if (!items.length) return { success: false, error: 'The list is empty.' };
  const head = (await sbPost('calc_sales', [{ kind: 'chocolate', branch, ref: txt(p.ref, 60) || null, source: txt(p.source, 30) || null, disp_code: /^DISP-\d{1,8}$/i.test(String(p.disp || '')) ? String(p.disp).toUpperCase() : null, customer: txt(p.customer, 80) || null, items, total: r3(items.reduce((s: number, c: any) => s + c.total, 0) + (Number(p.extras) || 0)), created_by: who(u), req_key: p._reqKey || null }]))[0];
  const saleNo = await nextSaleNo(head.id);
  let releaseNo = '';
  const deducted: any[] = [], short: any[] = [];
  const day = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  for (const c of items) {
    // how much: grams (if known) and pieces (if known)
    const grams = c.kg > 0 ? c.kg * 1000 : (c.mode === 'grams' ? c.amount : c.mode === 'kg' ? c.amount * 1000 : (c.gpp ? c.amount * c.gpp : null));
    const pcs = c.mode === 'pieces' ? c.amount : (c.gpp && grams ? grams / c.gpp : null);
    let leftG: number | null = grams, leftP: number | null = pcs;
    const q0 = `chocolate_database?select=*&branch=eq.${encodeURIComponent(branch)}&approval_status=eq.Approved&current_stock=gt.0&order=expiry_date.asc.nullslast,id.asc`;
    let batches: any[] = c.code ? await sbGet(q0 + `&product_code=eq.${encodeURIComponent(c.code)}`) : [];
    if (!batches.length) batches = await sbGet(q0 + `&chocolate_name=eq.${encodeURIComponent(c.name)}`);
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
      if (kgU || gU) { const g = kgU ? q * 1000 : q; leftG = (leftG ?? 0) - g; if (leftP != null && grams && pcs) leftP = leftG * pcs / grams; }
      else { leftP = (leftP ?? 0) - q; if (leftG != null && pcs) leftG = leftP * (grams! / pcs); }
    }
    if (!batches.length) short.push({ name: c.name, need: c.mode === 'pieces' ? c.amount + ' pcs' : r3(grams || 0) + ' g', have: 'not in this branch stock' });
    else if (leftG != null && leftG > 0.5) short.push({ name: c.name, need: r3(grams || 0) + ' g', have: r3((grams || 0) - leftG) + ' g' });
    else if (leftG == null && leftP != null && leftP > 0.01) short.push({ name: c.name, need: r3(pcs || 0) + ' pcs', have: r3((pcs || 0) - leftP) + ' pcs' });
  }
  await sbPatch('calc_sales', `id=eq.${head.id}`, { sale_no: saleNo, release_no: releaseNo || null, deducted, short });
  return { success: true, saleNo, releaseNo, branch, lines: deducted.length, short };
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
  return { success: true, mode: await mode(), sales: rows.map((r: any) => ({ id: r.id, saleNo: r.sale_no, kind: r.kind, branch: r.branch, ref: r.ref || '', source: r.source || '', customer: r.customer || '', items: r.items, deducted: r.deducted, short: r.short, total: Number(r.total) || 0, releaseNo: r.release_no || '', by: r.created_by || '', at: r.created_at, status: r.status, cancelledBy: r.cancelled_by || '', cancelledAt: r.cancelled_at })) };
}
async function cancelSale(p: any, u: any) {
  const id = Number(p.id); if (!Number.isInteger(id) || id < 1) return { success: false, error: 'Invalid sale.' };
  const rows = await sbGet(`calc_sales?select=*&id=eq.${id}`); const s = rows[0];
  if (!s) return { success: false, error: 'Sale not found.' };
  if (s.status !== 'Active') return { success: false, error: 'Already cancelled.' };
  if (s.kind === 'flower') {
    await sbDelete('flower_arrangement_fulfillments', `arrangement_code=eq.${encodeURIComponent(s.sale_no)}`);
  } else {
    for (const d of (s.deducted || [])) {
      const b = (await sbGet(`chocolate_database?select=id,current_stock,qty_used&id=eq.${Number(d.id)}`))[0];
      if (b) await sbPatch('chocolate_database', `id=eq.${b.id}`, { current_stock: r3(Number(b.current_stock) + Number(d.qty)), qty_used: r3(Math.max(0, Number(b.qty_used || 0) - Number(d.qty))) });
    }
    if (s.release_no) await sbDelete('chocolate_release_database', `release_no=eq.${encodeURIComponent(s.release_no)}&transaction_type=eq.${encodeURIComponent('Sale (Calc)')}`);
  }
  await sbPatch('calc_sales', `id=eq.${id}`, { status: 'Cancelled', cancelled_by: who(u), cancelled_at: new Date().toISOString() });
  return { success: true };
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
    if (a === 'listSales') return json(await listSales(p));
    // Guard: was this display (DISP-…) already sold in a calc or released? (so it is not taken out of stock twice)
    if (a === 'dispUsed') {
      const code = String(p.code || '').toUpperCase();
      if (!/^DISP-\d{1,8}$/.test(code)) return json({ success: false, error: 'Invalid code.' });
      const [cs, rel] = await Promise.all([
        sbGet(`calc_sales?select=sale_no,branch,created_at,created_by&disp_code=eq.${code}&status=eq.Active&order=id.desc&limit=5`),
        sbGet(`chocolate_release_database?select=release_no,branch,release_date,prepared_by&remarks=ilike.*${code}*&order=id.desc&limit=50`),
      ]);
      const seen: Record<string, boolean> = {}; const releases: any[] = [];
      (rel || []).forEach((r: any) => { if (seen[r.release_no]) return; seen[r.release_no] = true; releases.push({ no: r.release_no, branch: r.branch, date: r.release_date, by: r.prepared_by }); });
      return json({ success: true, sales: (cs || []).map((r: any) => ({ no: r.sale_no, branch: r.branch, at: r.created_at, by: r.created_by })), releases });
    }
    // Extras picker: Item Inventory names only (no price — prices there are not reliable yet)
    if (a === 'itemNames') {
      const rows = await sbGet('item_inventory?select=item_code,item_name,size,photo_link&order=item_name.asc&limit=2000');
      const seen: Record<string, boolean> = {}; const items: any[] = [];
      (rows || []).forEach((r: any) => { const n = String(r.item_name || '').trim(); if (!n || seen[n.toLowerCase()]) return; seen[n.toLowerCase()] = true;
        items.push({ code: r.item_code || '', name: n, size: r.size || '', photo: /^https:\/\/mysystemlla\.com\/[^\s"'<>]{1,200}$/.test(String(r.photo_link || '')) ? r.photo_link : '' }); });
      return json({ success: true, items });
    }
    if (a === 'cancelSale') { if (!admin) return json({ success: false, error: 'Admin only.' }); return json(await cancelSale(p, u)); }
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
