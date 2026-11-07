// LALABELLA <-> ODOO (trial) — read-only connection test (Supabase Edge Function)  v7
// v8: a POS line whose product barcode/code is one of our Release (REL-) or Display (DISP-) labels is NOT deducted again (status 'released').
// v7: PUSH STOCK (trial) - the FIRST thing that writes to Odoo. After each sync, our stock of chocolates and flowers at the
//     branch (ModaMall) is copied to Odoo On Hand at the warehouse stock location (inventory adjustment, only when different),
//     so receiving / counts / transfers done in our system show in Odoo too. Setting push_stock on/off in odoo_sync_settings.
// v6: AUTO-DEDUCT (trial). action 'sync' (cron every 5 min with the internal key, or an Admin 'Sync now'): every new Odoo POS line
//     (kits exploded) that is a chocolate or a flower of our Item List is taken out of OUR stock at the sync branch (ModaMall):
//     chocolate = release from the oldest batches (chocolate_release_database, type 'Odoo Sale'), flower = fulfillment under
//     the ODOO-POS placeholder. Each Odoo line is done once (odoo_sync_lines.odoo_line_id is unique). Other items are only logged.
//     action 'syncLog' (admin) lists the last synced lines. Still READ-ONLY toward Odoo.
// v5: 'today' explodes kits (BoM) from the sale lines itself (no need to wait for Close Register), shows chocolate in g/kg (+ pcs)
//     and flowers in pcs, and 'compare' = per item used today: used / Odoo stock / our stock (chocolate ModaMall, flowers via Flower Dashboard).
// v4: 'today' is open to every logged-in user (shown on the Chocolate Dashboard); status/sales stay Admin only.
// v3: action 'today' (admin) — POS orders of the day with their lines, what LEFT the stock that day (stock moves to the customer,
//     so kit/arrangement components show up), and Odoo On Hand next to our own ModaMall chocolate stock. Read-only.
// v2: action 'ping' (no login) answers only {keySet, ok, error} — no Odoo data — so the connection can be checked from the server side.
// Admin only, except 'today' (any logged-in user). Uses the Odoo JSON-2 API: POST {ODOO_URL}/json/2/<model>/<method>, header Authorization: bearer <ODOO_KEY>.
// Secrets (never in the repo): ODOO_URL (e.g. https://lalabella-test.odoo.com), ODOO_DB (database name), ODOO_KEY (API key of an Odoo user).
// Actions: status -> who we are in Odoo + how many products; sales -> POS sales of a day (total + by payment method) + top products.
// Until v7 nothing was written to Odoo; v7 only sets On Hand quantities (inventory adjustments).

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ODOO_URL = (Deno.env.get('ODOO_URL') || 'https://lalabella-test.odoo.com').replace(/\/+$/, '');
const ODOO_DB = Deno.env.get('ODOO_DB') || 'lalabella-test';   // trial defaults (not secret); the real Odoo later = set ODOO_URL / ODOO_DB secrets
const ODOO_KEY = Deno.env.get('ODOO_KEY') || '';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function sessionUser(token: string) {
  const t = String(token || '').trim();
  if (!/^[a-f0-9]{20,}$/i.test(t)) return null;
  const r = await fetch(`${SB_URL}/rest/v1/users?select=id,username,role,status,token_created&limit=1&token=eq.${encodeURIComponent(t)}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  const rows = r.ok ? await r.json() : [];
  const u = rows && rows[0];
  if (!u || String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}

async function odoo(model: string, method: string, body: Record<string, unknown> = {}) {
  const h: Record<string, string> = { Authorization: `bearer ${ODOO_KEY}`, 'Content-Type': 'application/json; charset=utf-8', 'User-Agent': 'lalabella-system' };
  if (ODOO_DB) h['X-Odoo-Database'] = ODOO_DB;
  const res = await fetch(`${ODOO_URL}/json/2/${model}/${method}`, { method: 'POST', headers: h, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const msg = (data && (data.message || data.name)) || text.slice(0, 200) || ('HTTP ' + res.status);
    throw new Error(`Odoo ${res.status}: ${msg}`);
  }
  return data;
}

// Bahrain day -> UTC range string for Odoo ("YYYY-MM-DD HH:MM:SS")
function dayRange(day: string) {
  const start = new Date(day + 'T00:00:00+03:00'), end = new Date(start.getTime() + 86400000);
  const f = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
  return [f(start), f(end)];
}


// ---------- AUTO-DEDUCT (Odoo POS -> our stock) ----------
const SBH = () => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' });
async function sbGetJ(q: string) { const r = await fetch(`${SB_URL}/rest/v1/${q}`, { headers: SBH() }); return r.ok ? r.json() : []; }
async function sbPostJ(table: string, rows: any[], prefer = 'return=representation') {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, { method: 'POST', headers: { ...SBH(), Prefer: prefer }, body: JSON.stringify(rows) });
  if (!r.ok) throw new Error(`${table} insert: ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.status === 201 || r.status === 200 ? r.json().catch(() => []) : [];
}
async function sbPatchJ(table: string, filter: string, fields: any) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: { ...SBH(), Prefer: 'return=minimal' }, body: JSON.stringify(fields) });
  if (!r.ok) throw new Error(`${table} update: ${r.status} ${(await r.text()).slice(0, 160)}`);
}
async function sbRpcJ(fn: string, args: any) { const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: SBH(), body: JSON.stringify(args) }); return r.json(); }

async function sbDelJ(table: string, filter: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, { method: 'DELETE', headers: { ...SBH(), Prefer: 'return=minimal' } });
  if (!r.ok) throw new Error(`${table} delete: ${r.status}`);
}
// Undo what the sync took for one Odoo order (trial helper): batches get the chocolate back, flower fulfillments are removed.
async function undoOrder(order: string) {
  const rows = await sbGetJ(`odoo_sync_lines?select=*&odoo_order=eq.${encodeURIComponent(order)}&status=in.(done,short)`);
  if (!rows.length) return { error: 'Nothing to undo for ' + order };
  const branch = ((await sbGetJ('odoo_sync_settings?select=value&key=eq.branch'))[0] || {}).value || 'ModaMall';
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  for (const row of rows) {
    for (const d of (row.details || [])) {
      if (d.kind !== 'chocolate') continue;
      for (const t of (d.taken || [])) {
        const b = (await sbGetJ(`chocolate_database?select=id,current_stock,qty_used&branch=eq.${encodeURIComponent(branch)}&chocolate_name=eq.${encodeURIComponent(d.item)}&batch_no=eq.${encodeURIComponent(t.batch)}&limit=1`))[0];
        if (b) await sbPatchJ('chocolate_database', `id=eq.${b.id}`, { current_stock: r3(Number(b.current_stock) + Number(t.qty)), qty_used: r3(Number(b.qty_used || 0) - Number(t.qty)) });
      }
    }
  }
  await sbDelJ('chocolate_release_database', `prepared_by=eq.Odoo%20sync&remarks=eq.${encodeURIComponent('Odoo ' + order)}`);
  await sbDelJ('flower_arrangement_fulfillments', `arrangement_code=eq.ODOO-POS&fulfilled_by=eq.${encodeURIComponent('Odoo sync · ' + order)}`);
  await sbPatchJ('odoo_sync_lines', `odoo_order=eq.${encodeURIComponent(order)}&status=in.(done,short)`, { status: 'undone' });
  return { success: true, order, lines: rows.length };
}

async function runSync() {
  const st: Record<string, string> = {}; (await sbGetJ('odoo_sync_settings?select=key,value')).forEach((r: any) => { st[r.key] = r.value; });
  if ((st.auto_deduct || 'off') !== 'on') return { success: true, skipped: 'auto-deduct is off' };
  const branch = st.branch || 'ModaMall', start = st.start_at || '2100-01-01 00:00:00';
  const id0 = (v: any) => Array.isArray(v) ? v[0] : v, nm1 = (v: any) => Array.isArray(v) ? String(v[1] || '') : '';
  const orders = await odoo('pos.order', 'search_read', { domain: [['date_order', '>=', start], ['state', 'in', ['paid', 'done', 'invoiced']]], fields: ['name', 'date_order'], order: 'date_order asc', limit: 200 });
  if (!orders.length) return { success: true, done: 0 };
  const oById: Record<number, any> = {}; orders.forEach((o: any) => { oById[o.id] = o; });
  const lines = await odoo('pos.order.line', 'search_read', { domain: [['order_id', 'in', orders.map((o: any) => o.id)]], fields: ['order_id', 'product_id', 'qty'], limit: 5000 });
  const seen = new Set<number>((await sbGetJ(`odoo_sync_lines?select=odoo_line_id&odoo_line_id=in.(${lines.map((l: any) => l.id).join(',') || 0})`)).map((r: any) => Number(r.odoo_line_id)));
  const todo = lines.filter((l: any) => !seen.has(l.id));
  if (!todo.length) return { success: true, done: 0 };
  // product info + kits
  const pids = new Set<number>(todo.map((l: any) => id0(l.product_id)));
  const first = await odoo('product.product', 'read', { ids: [...pids], fields: ['product_tmpl_id'] });
  const tmplOf: Record<number, number> = {}; first.forEach((x: any) => { tmplOf[x.id] = id0(x.product_tmpl_id); });
  let boms: any[] = [], bomLines: any[] = [];
  try {
    boms = await odoo('mrp.bom', 'search_read', { domain: [['type', '=', 'phantom'], ['product_tmpl_id', 'in', [...new Set(Object.values(tmplOf))]]], fields: ['product_tmpl_id', 'product_id', 'product_qty'], limit: 500 });
    if (boms.length) bomLines = await odoo('mrp.bom.line', 'search_read', { domain: [['bom_id', 'in', boms.map((b: any) => b.id)]], fields: ['bom_id', 'product_id', 'product_qty', 'product_uom_id'], limit: 5000 });
  } catch (_) { /* no Manufacturing app */ }
  bomLines.forEach((l: any) => pids.add(id0(l.product_id)));
  const prods = await odoo('product.product', 'read', { ids: [...pids], fields: ['name', 'default_code', 'barcode', 'uom_id'] });
  const P: Record<number, any> = {}; prods.forEach((x: any) => { P[x.id] = x; });
  const bomOf: Record<string, any> = {}; boms.forEach((b: any) => { const k = b.product_id ? 'p' + id0(b.product_id) : 't' + id0(b.product_tmpl_id); if (!bomOf[k]) bomOf[k] = b; });
  const linesOf: Record<number, any[]> = {}; bomLines.forEach((l: any) => { (linesOf[id0(l.bom_id)] = linesOf[id0(l.bom_id)] || []).push(l); });
  // our item lists
  const [items, fitems] = await Promise.all([sbGetJ('chocolate_item_list?select=chocolate_name,product_code,grams'), sbGetJ('flower_item?select=flower_name,item_code')]);
  const low = (x: any) => String(x || '').trim().toLowerCase();
  const choc: Record<string, any> = {}; items.forEach((r: any) => { const v = { name: r.chocolate_name, g: Number(r.grams) || 0 }; if (r.product_code) choc['c:' + low(r.product_code)] = v; choc['n:' + low(r.chocolate_name)] = v; });
  const flw: Record<string, string> = {}; fitems.forEach((r: any) => { if (r.item_code) flw['c:' + low(r.item_code)] = r.flower_name; flw['n:' + low(r.flower_name)] = r.flower_name; });
  const HOL = /\s*-?\s*holland\b.*$/i;
  function infoOf(pid: number) {
    const x = P[pid] || {}; const name = String(x.name || '?');
    const bare = low(name.replace(/^\[[^\]]*\]\s*/, ''));
    const keys = [x.default_code, x.barcode].filter(Boolean).map((k: any) => 'c:' + low(k)).concat(['n:' + bare, 'n:' + bare.replace(HOL, ''), 'n:' + bare.replace(/\s*\([^)]*\)\s*$/, '')]);
    for (const k of keys) { if (choc[k]) return { kind: 'chocolate', ours: choc[k].name, g: choc[k].g, uom: nm1(x.uom_id), name }; if (flw[k]) return { kind: 'flower', ours: flw[k], g: 0, uom: nm1(x.uom_id), name }; }
    return { kind: 'other', ours: name, g: 0, uom: nm1(x.uom_id), name };
  }
  const isKg = (u: string) => /^kg|kilo/i.test(u), isG = (u: string) => /^(g|gram|grams|gm)$/i.test(String(u).trim()), isDz = (u: string) => /dozen/i.test(u);
  // amount in our terms: chocolate -> {grams, pcs}; flower -> stems
  function amount(inf: any, q: number, uom: string) {
    if (inf.kind === 'chocolate') {
      if (isKg(uom)) return { grams: q * 1000, pcs: inf.g ? q * 1000 / inf.g : null };
      if (isG(uom)) return { grams: q, pcs: inf.g ? q / inf.g : null };
      return { grams: inf.g ? q * inf.g : null, pcs: q };
    }
    return { stems: isDz(uom) ? q * 12 : q };
  }
  // deduct helpers
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  let releaseNo = '';
  async function takeChocolate(name: string, a: any, orderName: string, day: string) {
    const batches = await sbGetJ(`chocolate_database?select=*&branch=eq.${encodeURIComponent(branch)}&chocolate_name=eq.${encodeURIComponent(name)}&current_stock=gt.0&order=expiry_date.asc.nullslast,id.asc`);
    const back = (a.grams ?? a.pcs) < 0;   // refund: put it back on the newest batch
    if (back) {
      const all = await sbGetJ(`chocolate_database?select=*&branch=eq.${encodeURIComponent(branch)}&chocolate_name=eq.${encodeURIComponent(name)}&order=id.desc&limit=1`);
      if (!all.length) return { short: 'no batch to return to' };
      const b = all[0], kgUnit = /kg/i.test(b.unit || ''), q = kgUnit ? (a.grams ?? 0) / 1000 : (a.pcs ?? 0);
      await sbPatchJ('chocolate_database', `id=eq.${b.id}`, { current_stock: r3(Number(b.current_stock) - q), qty_used: r3(Number(b.qty_used || 0) + q) });
      return { taken: [{ batch: b.batch_no, qty: r3(q), unit: b.unit }] };
    }
    const taken: any[] = []; let leftG = a.grams, leftP = a.pcs;
    for (const b of batches) {
      const kgUnit = /kg/i.test(b.unit || '');
      let want = kgUnit ? (leftG == null ? null : leftG / 1000) : leftP;
      if (want == null || want <= 0.0000001) break;
      const q = r3(Math.min(want, Number(b.current_stock)));
      if (q <= 0) continue;
      if (!releaseNo) { const c = await sbRpcJ('get_next_chocolate_counter', { counter_key: 'Next Release No', start_at: 1 }); releaseNo = 'REL-' + String(c).padStart(6, '0'); }
      const price = Number(kgUnit ? b.price_per_kg : (b.price_per_piece ?? b.price_per_kg)) || 0;
      await sbPostJ('chocolate_release_database', [{ release_no: releaseNo, transaction_type: 'Odoo Sale', branch, customer_department: 'Odoo POS', chocolate_name: name, product_code: b.product_code || '', batch_no: b.batch_no, qty_release: q, unit: b.unit, price, total: r3(q * price), remarks: 'Odoo ' + orderName, prepared_by: 'Odoo sync', release_date: day, database_id: String(b.id), to_branch: '' }], 'return=minimal');
      await sbPatchJ('chocolate_database', `id=eq.${b.id}`, { current_stock: r3(Number(b.current_stock) - q), qty_used: r3(Number(b.qty_used || 0) + q) });
      taken.push({ batch: b.batch_no, qty: q, unit: b.unit });
      if (kgUnit) { leftG = (leftG ?? 0) - q * 1000; if (leftP != null && a.grams) leftP = leftG / (a.grams / a.pcs); }
      else { leftP = (leftP ?? 0) - q; if (leftG != null && a.pcs) leftG = leftP * (a.grams / a.pcs); }
    }
    const short = (leftG != null && leftG > 0.5) ? r3(leftG) + ' g not in our stock' : (leftP != null && leftP > 0.01 && leftG == null) ? r3(leftP) + ' pcs not in our stock' : '';
    return { taken, short };
  }
  const arr = (await sbGetJ('flower_arrangements?select=id&arrangement_code=eq.ODOO-POS&limit=1'))[0];
  let done = 0, other = 0, errors = 0, lastOrder = '';
  for (const l of todo) {
    const o = oById[id0(l.order_id)]; const pid = id0(l.product_id); const inf = infoOf(pid); const q = Number(l.qty || 0);
    const orderName = o ? o.name : '?', when = o ? new Date(o.date_order.replace(' ', 'T') + 'Z') : new Date();
    if (orderName !== lastOrder) { releaseNo = ''; lastOrder = orderName; }   // one release no. per Odoo order
    const day = new Date(when.getTime() + 3 * 3600000).toISOString().slice(0, 10);
    // claim the line first (unique) so two runs never deduct it twice
    try { await sbPostJ('odoo_sync_lines', [{ odoo_line_id: l.id, odoo_order: orderName, order_date: when.toISOString(), product: inf.name, qty: q, status: 'processing' }], 'return=minimal'); }
    catch (_) { continue; }
    // made from OUR Release / Display (label REL-... or DISP-...): the chocolate already left our stock, so never deduct it again
    const px = P[pid] || {}, madeCode = [px.barcode, px.default_code].map((c: any) => String(c || '').trim()).find((c: string) => /^(REL|DISP)-/i.test(c));
    if (madeCode) { await sbPatchJ('odoo_sync_lines', `odoo_line_id=eq.${l.id}`, { status: 'released', details: [{ kind: 'other', item: inf.name, qty: r3(q) }], note: 'Already released in our system (' + madeCode + ')' }); other++; continue; }
    const bom = bomOf['p' + pid] || bomOf['t' + tmplOf[pid]];
    const parts = bom ? (linesOf[bom.id] || []).map((bl: any) => ({ inf: infoOf(id0(bl.product_id)), q: q / (Number(bom.product_qty) || 1) * Number(bl.product_qty || 0), uom: nm1(bl.product_uom_id) })) : [{ inf, q, uom: inf.uom }];
    const det: any[] = []; let note = '';
    try {
      for (const pt of parts) {
        if (pt.inf.kind === 'chocolate') {
          const a = amount(pt.inf, pt.q, pt.uom || pt.inf.uom); const res = await takeChocolate(pt.inf.ours, a, orderName, day);
          det.push({ kind: 'chocolate', item: pt.inf.ours, grams: a.grams == null ? null : r3(a.grams), pcs: a.pcs == null ? null : r3(a.pcs), taken: res.taken });
          if (res.short) note += (note ? '; ' : '') + pt.inf.ours + ': ' + res.short;
        } else if (pt.inf.kind === 'flower') {
          const a = amount(pt.inf, pt.q, pt.uom || pt.inf.uom);
          if (!arr) throw new Error('ODOO-POS placeholder missing');
          await sbPostJ('flower_arrangement_fulfillments', [{ arrangement_id: arr.id, arrangement_code: 'ODOO-POS', branch, flower_name: pt.inf.ours, qty: r3(a.stems), fulfilled_by: 'Odoo sync · ' + orderName, fulfilled_date: when.toISOString() }], 'return=minimal');
          det.push({ kind: 'flower', item: pt.inf.ours, stems: r3(a.stems) });
        } else det.push({ kind: 'other', item: pt.inf.name, qty: r3(pt.q) });
      }
      const onlyOther = det.every(d => d.kind === 'other');
      await sbPatchJ('odoo_sync_lines', `odoo_line_id=eq.${l.id}`, { status: onlyOther ? 'not ours' : (note ? 'short' : 'done'), details: det, note: note || null });
      if (onlyOther) other++; else done++;
    } catch (e) {
      errors++;
      await sbPatchJ('odoo_sync_lines', `odoo_line_id=eq.${l.id}`, { status: 'error', details: det, note: String((e as Error).message || e).slice(0, 300) }).catch(() => {});
    }
  }
  return { success: true, done, other, errors };
}


// ---------- PUSH STOCK (our stock -> Odoo On Hand) ----------
async function sbGetAllJ(q: string) {   // pages past the 1000-row limit
  const out: any[] = [];
  for (let from = 0; from < 200000; from += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/${q}`, { headers: { ...SBH(), Range: `${from}-${from + 999}` } });
    if (!r.ok) break; const rows = await r.json(); out.push(...rows); if (rows.length < 1000) break;
  }
  return out;
}
// Same rule as the Flower Dashboard: last CONSOLIDATED count + purchases (bunch -> stems) + transfers in - out - used, after that count.
async function ourFlowerStock(branch: string) {
  const [db, hist, tr, ful] = await Promise.all([
    sbGetAllJ(`flower_database?select=flower_name,qty,unit,stems_per_bunch,entry_date,type&branch=eq.${encodeURIComponent(branch)}&order=id.asc`),
    sbGetAllJ(`flower_stock_history?select=flower_name,count_date,physical_count&branch=eq.${encodeURIComponent(branch)}&item_code=eq.CONSOLIDATED&order=id.asc`),
    sbGetAllJ(`flower_transfer_history?select=flower_name,qty,from_branch,to_branch,transfer_date&order=id.asc`),
    sbGetAllJ(`flower_arrangement_fulfillments?select=flower_name,qty,fulfilled_date&branch=eq.${encodeURIComponent(branch)}&order=id.asc`),
  ]);
  const now = new Date(), last: Record<string, { d: Date; q: number }> = {};
  hist.forEach((r: any) => { const n = String(r.flower_name || '').trim(), d = r.count_date ? new Date(r.count_date) : null; if (!n || !d || isNaN(d.getTime()) || d > now) return; if (!last[n] || d > last[n].d) last[n] = { d, q: Number(r.physical_count) || 0 }; });
  const after = (n: string, d: Date | null) => !!d && !isNaN(d.getTime()) && d <= now && d > (last[n] ? last[n].d : new Date(0));
  const st: Record<string, number> = {}; Object.keys(last).forEach(n => { st[n] = last[n].q; });
  db.forEach((r: any) => { if (r.type === 'Supply') return; const n = String(r.flower_name || '').trim(); if (!n || !after(n, r.entry_date ? new Date(r.entry_date) : null)) return; const u = String(r.unit || '').trim().toLowerCase(), sp = Number(r.stems_per_bunch) || 1; st[n] = (st[n] || 0) + (u === 'bunch' && sp > 0 ? Number(r.qty) * sp : Number(r.qty) || 0); });
  tr.forEach((r: any) => { const n = String(r.flower_name || '').trim(), d = r.transfer_date ? new Date(r.transfer_date) : null, q = Number(r.qty) || 0; if (!n || !q || !after(n, d)) return; if (String(r.to_branch || '').trim() === branch) st[n] = (st[n] || 0) + q; if (String(r.from_branch || '').trim() === branch) st[n] = (st[n] || 0) - q; });
  ful.forEach((r: any) => { const n = String(r.flower_name || '').trim(); if (!n || !after(n, r.fulfilled_date ? new Date(r.fulfilled_date) : null)) return; st[n] = (st[n] || 0) - (Number(r.qty) || 0); });
  return st;
}
async function runPush() {
  const st: Record<string, string> = {}; (await sbGetJ('odoo_sync_settings?select=key,value')).forEach((r: any) => { st[r.key] = r.value; });
  if ((st.push_stock || 'off') !== 'on') return { success: true, skipped: 'push stock is off' };
  const branch = st.branch || 'ModaMall';
  const id0 = (v: any) => Array.isArray(v) ? v[0] : v, nm1 = (v: any) => Array.isArray(v) ? String(v[1] || '') : '';
  let loc = Number(st.odoo_location_id) || 0;
  if (!loc) { const wh = await odoo('stock.warehouse', 'search_read', { domain: [], fields: ['lot_stock_id'], order: 'id asc', limit: 1 }); loc = wh.length ? id0(wh[0].lot_stock_id) : 0; }
  if (!loc) return { success: false, error: 'No Odoo stock location found' };
  const prods = await odoo('product.product', 'search_read', { domain: [['is_storable', '=', true]], fields: ['name', 'default_code', 'barcode', 'uom_id'], order: 'id asc', limit: 10000 });
  const [items, fitems, chocRows, flowerSt] = await Promise.all([
    sbGetJ('chocolate_item_list?select=chocolate_name,product_code,grams'), sbGetJ('flower_item?select=flower_name,item_code'),
    sbGetAllJ(`chocolate_database?select=chocolate_name,current_stock,unit&branch=eq.${encodeURIComponent(branch)}`), ourFlowerStock(branch),
  ]);
  const low = (x: any) => String(x || '').trim().toLowerCase(), HOL = /\s*-?\s*holland\b.*$/i;
  const choc: Record<string, any> = {}; items.forEach((r: any) => { const v = { name: r.chocolate_name, g: Number(r.grams) || 0 }; if (r.product_code) choc['c:' + low(r.product_code)] = v; choc['n:' + low(r.chocolate_name)] = v; });
  const flw: Record<string, string> = {}; fitems.forEach((r: any) => { if (r.item_code) flw['c:' + low(r.item_code)] = r.flower_name; flw['n:' + low(r.flower_name)] = r.flower_name; });
  const ourG: Record<string, number> = {}, ourP: Record<string, number> = {};
  chocRows.forEach((r: any) => { const n = r.chocolate_name, q = Number(r.current_stock) || 0, c = choc['n:' + low(n)], g = c ? c.g : 0;
    if (/kg/i.test(r.unit || '')) { ourG[n] = (ourG[n] || 0) + q * 1000; if (g) ourP[n] = (ourP[n] || 0) + q * 1000 / g; }
    else { ourP[n] = (ourP[n] || 0) + q; if (g) ourG[n] = (ourG[n] || 0) + q * g; } });
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const target: Record<number, { name: string; qty: number }> = {}, firstFlower: Record<string, number> = {};
  prods.forEach((x: any) => {
    const bare = low(String(x.name || '').replace(/^\[[^\]]*\]\s*/, ''));
    const keys = [x.default_code, x.barcode].filter(Boolean).map((k: any) => 'c:' + low(k)).concat(['n:' + bare, 'n:' + bare.replace(HOL, ''), 'n:' + bare.replace(/\s*\([^)]*\)\s*$/, '')]);
    const uom = nm1(x.uom_id);
    for (const k of keys) {
      if (choc[k]) { const n = choc[k].name, kg = /^kg|kilo/i.test(uom), gr = /^(g|gram|grams|gm)$/i.test(uom.trim());
        const q = kg ? (ourG[n] ?? (ourP[n] || 0) * (choc[k].g || 0)) / 1000 : gr ? (ourG[n] || 0) : (ourP[n] ?? 0);
        target[x.id] = { name: n, qty: r3(q) }; return; }
      if (flw[k]) { const n = flw[k];   // one Odoo product per flower gets the stock; extra ones (other origins) get 0
        if (firstFlower[n] === undefined) { firstFlower[n] = x.id; target[x.id] = { name: n, qty: r3((flowerSt[n] || 0) / (/dozen/i.test(uom) ? 12 : 1)) }; }
        else target[x.id] = { name: n + ' (extra)', qty: 0 };
        return; }
    }
  });
  const ids = Object.keys(target).map(Number);
  if (!ids.length) return { success: true, changed: 0 };
  const quants = await odoo('stock.quant', 'search_read', { domain: [['location_id', '=', loc], ['product_id', 'in', ids]], fields: ['product_id', 'quantity'], limit: 10000 });
  const qOf: Record<number, any[]> = {}; quants.forEach((q: any) => { (qOf[id0(q.product_id)] = qOf[id0(q.product_id)] || []).push(q); });
  const changed: any[] = [];
  for (const pid of ids) {
    const t = target[pid], qs = qOf[pid] || [], cur = r3(qs.reduce((a: number, q: any) => a + Number(q.quantity || 0), 0));
    if (Math.abs(cur - t.qty) < 0.006) continue;   // Odoo trial keeps 2 decimals (2.735 is stored as 2.74), so a rounding gap is not a change. MAIN ODOO: set Decimal Accuracy to 3 first, then put this back to 0.0005 (Brain note 32, section 11)
    try {
      let qid = qs.length ? qs[0].id : 0;
      if (qid) await odoo('stock.quant', 'write', { ids: [qid], vals: { inventory_quantity: r3(t.qty - (cur - Number(qs[0].quantity || 0))) } });   // other quants at the location stay, so the total = our qty
      else { const c = await odoo('stock.quant', 'create', { vals_list: [{ product_id: pid, location_id: loc, inventory_quantity: t.qty }] }); qid = Array.isArray(c) ? c[0] : c; }
      await odoo('stock.quant', 'action_apply_inventory', { ids: [qid] });
      changed.push({ item: t.name, odoo_before: cur, now: t.qty });
    } catch (e) { changed.push({ item: t.name, error: String((e as Error).message || e).slice(0, 160) }); }
  }
  const at = new Date().toISOString();
  await fetch(`${SB_URL}/rest/v1/odoo_sync_settings?on_conflict=key`, { method: 'POST', headers: { ...SBH(), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ key: 'last_push', value: JSON.stringify({ at, changed: changed.slice(0, 60), count: changed.length }), updated_at: at }]) });
  return { success: true, changed: changed.length, list: changed.slice(0, 60) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    let p: Record<string, any> = {};
    if (req.method === 'GET') p = Object.fromEntries(new URL(req.url).searchParams.entries());
    else { const ct = req.headers.get('content-type') || ''; p = ct.includes('json') ? await req.json() : Object.fromEntries(new URLSearchParams(await req.text())); }
    if (p.action === 'ping') {
      if (!ODOO_KEY) return json({ keySet: false, ok: false });
      try { await odoo('res.users', 'context_get', {}); return json({ keySet: true, ok: true }); }
      catch (e) { return json({ keySet: true, ok: false, error: String((e as Error).message || e).slice(0, 160) }); }
    }
    if (p.action === 'sync' && p.key) {   // cron (pg_cron sends the internal key from push_config)
      const k = (await sbGetJ('push_config?select=internal_key&id=eq.1'))[0];
      if (!k || !k.internal_key || p.key !== k.internal_key) return json({ success: false, error: 'bad key' }, 403);
      if (!ODOO_KEY) return json({ success: false, error: 'no Odoo key' });
      const sync = await runSync();
      let push: any = null; try { push = await runPush(); } catch (e) { push = { error: String((e as Error).message || e).slice(0, 200) }; }
      return json({ ...sync, push });
    }
    const u = await sessionUser(p.token);
    if (!u) return json({ success: false, error: 'Please log in again.' }, 401);
    if (p.action !== 'today' && String(u.role || '').toLowerCase() !== 'admin') return json({ success: false, error: 'Admin only.' }, 403);
    if (!ODOO_URL || !ODOO_KEY) return json({ success: false, setup: true, error: 'Odoo is not connected yet (the API key is missing).', url: ODOO_URL, db: ODOO_DB });

    if (p.action === 'sync') { const sync = await runSync(); let push: any = null; try { push = await runPush(); } catch (e) { push = { error: String((e as Error).message || e).slice(0, 200) }; } return json({ ...sync, push }); }   // Admin 'Sync now'
    if (p.action === 'syncLog') {
      const rows = await sbGetJ('odoo_sync_lines?select=odoo_order,order_date,product,qty,status,details,note,created_at&order=id.desc&limit=100');
      const st: Record<string, string> = {}; (await sbGetJ('odoo_sync_settings?select=key,value')).forEach((r: any) => { st[r.key] = r.value; });
      return json({ success: true, settings: st, rows });
    }
    if (p.action === 'syncUndo') return json(await undoOrder(String(p.order || '')));
    if (p.action === 'syncSet') {   // turn auto-deduct on/off
      const v = String(p.value) === 'on' ? 'on' : 'off', key = p.key2 === 'push_stock' ? 'push_stock' : 'auto_deduct';
      await fetch(`${SB_URL}/rest/v1/odoo_sync_settings?on_conflict=key`, { method: 'POST', headers: { ...SBH(), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ key, value: v, updated_at: new Date().toISOString() }]) });
      return json({ success: true, [key]: v });
    }
    if (p.action === 'status') {
      const ctx = await odoo('res.users', 'context_get', {});
      const products = await odoo('product.template', 'search_count', { domain: [['sale_ok', '=', true]] });
      const pos = await odoo('product.template', 'search_count', { domain: [['available_in_pos', '=', true]] }).catch(() => null);
      return json({ success: true, url: ODOO_URL, db: ODOO_DB, lang: ctx && ctx.lang, tz: ctx && ctx.tz, products, posProducts: pos });
    }
    if (p.action === 'today') {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(String(p.day || '')) ? String(p.day) : new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
      const [a, b] = dayRange(day);
      const id0 = (v: any) => Array.isArray(v) ? v[0] : v;
      const nm1 = (v: any) => Array.isArray(v) ? String(v[1] || '') : '';
      const r3 = (x: number) => Math.round(x * 1000) / 1000;
      const orders = await odoo('pos.order', 'search_read', { domain: [['date_order', '>=', a], ['date_order', '<', b], ['state', 'in', ['paid', 'done', 'invoiced']]], fields: ['name', 'date_order', 'amount_total'], order: 'date_order desc', limit: 300 });
      const ids = (orders || []).map((o: any) => o.id);
      let lines: any[] = [], pays: any[] = [];
      if (ids.length) {
        lines = await odoo('pos.order.line', 'search_read', { domain: [['order_id', 'in', ids]], fields: ['order_id', 'product_id', 'qty', 'price_subtotal_incl'], limit: 5000 });
        pays = await odoo('pos.payment', 'search_read', { domain: [['pos_order_id', 'in', ids]], fields: ['pos_order_id', 'amount', 'payment_method_id'], limit: 2000 });
      }
      // kits (Manufacturing app, BoM type Kit): what is inside each sold product
      const prodIds = new Set<number>(lines.map((l: any) => id0(l.product_id)));
      let boms: any[] = [], bomLines: any[] = [];
      const firstProds = prodIds.size ? await odoo('product.product', 'read', { ids: [...prodIds], fields: ['product_tmpl_id'] }) : [];
      const tmplOf: Record<number, number> = {}; firstProds.forEach((x: any) => { tmplOf[x.id] = id0(x.product_tmpl_id); });
      try {
        const tmpls = [...new Set(Object.values(tmplOf))];
        if (tmpls.length) boms = await odoo('mrp.bom', 'search_read', { domain: [['type', '=', 'phantom'], ['product_tmpl_id', 'in', tmpls]], fields: ['product_tmpl_id', 'product_id', 'product_qty'], limit: 500 });
        if (boms.length) bomLines = await odoo('mrp.bom.line', 'search_read', { domain: [['bom_id', 'in', boms.map((x: any) => x.id)]], fields: ['bom_id', 'product_id', 'product_qty', 'product_uom_id'], limit: 5000 });
      } catch (e) { console.error('bom', e); }
      bomLines.forEach((l: any) => prodIds.add(id0(l.product_id)));
      // Odoo On Hand (internal locations)
      const quants = await odoo('stock.quant', 'search_read', { domain: [['location_id.usage', '=', 'internal']], fields: ['product_id', 'quantity'], limit: 5000 });
      const onhandId: Record<number, number> = {};
      quants.forEach((q: any) => { const i = id0(q.product_id); onhandId[i] = (onhandId[i] || 0) + Number(q.quantity || 0); });
      const prods = prodIds.size ? await odoo('product.product', 'read', { ids: [...prodIds], fields: ['name', 'default_code', 'barcode', 'uom_id', 'product_tmpl_id'] }) : [];
      const P: Record<number, any> = {}; prods.forEach((x: any) => { P[x.id] = x; });
      // did stock already move in Odoo today? (often only when the POS session is closed)
      let movesFound = 0;
      try { movesFound = await odoo('stock.move', 'search_count', { domain: [['state', '=', 'done'], ['date', '>=', a], ['date', '<', b], ['location_dest_id.usage', '=', 'customer']] }); } catch (_) { /* ignore */ }
      // our side
      const sb = async (q: string) => { const r = await fetch(`${SB_URL}/rest/v1/${q}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }); return r.ok ? r.json() : []; };
      const [ours, items, fitems] = await Promise.all([
        sb('chocolate_database?select=chocolate_name,current_stock,unit&branch=eq.ModaMall&current_stock=neq.0'),
        sb('chocolate_item_list?select=chocolate_name,product_code,grams'),
        sb('flower_item?select=flower_name,item_code'),
      ]);
      const low = (s: any) => String(s || '').trim().toLowerCase();
      const choc: Record<string, { name: string; g: number }> = {};   // key: code or name -> chocolate
      (items || []).forEach((r: any) => { const v = { name: r.chocolate_name, g: Number(r.grams) || 0 }; if (r.product_code) choc['c:' + low(r.product_code)] = v; choc['n:' + low(r.chocolate_name)] = v; });
      const flw: Record<string, string> = {};
      (fitems || []).forEach((r: any) => { if (r.item_code) flw['c:' + low(r.item_code)] = r.flower_name; flw['n:' + low(r.flower_name)] = r.flower_name; });
      const info: Record<number, any> = {};
      const infoOf = (pid: number) => {
        if (info[pid]) return info[pid];
        const x = P[pid] || {}; const name = String(x.name || '?'); const uom = nm1(x.uom_id);
        const keys = [x.default_code, x.barcode].filter(Boolean).map((k: any) => 'c:' + low(k));
        const bare = low(name.replace(/^\[[^\]]*\]\s*/, '')), noParen = bare.replace(/\s*\([^)]*\)\s*$/, '');
        keys.push('n:' + bare, 'n:' + noParen);
        let kind = 'other', ours = name, g = 0;
        for (const k of keys) { if (choc[k]) { kind = 'chocolate'; ours = choc[k].name; g = choc[k].g; break; } if (flw[k]) { kind = 'flower'; ours = flw[k]; break; } }
        return (info[pid] = { name, uom, kind, ours, g });
      };
      // amount -> base unit: chocolate = grams, flower = stems, other = its own unit
      const isKg = (u: string) => /^kg|kilo/i.test(u), isG = (u: string) => /^(g|gram|grams|gm)$/i.test(u.trim()), isDozen = (u: string) => /dozen/i.test(u);
      const toBase = (inf: any, qty: number, uom: string) => {
        if (inf.kind === 'chocolate') return isKg(uom) ? qty * 1000 : (isG(uom) ? qty : qty * (inf.g || 0));
        return isDozen(uom) ? qty * 12 : qty;
      };
      const show = (inf: any, base: number) => {
        if (inf.kind === 'chocolate') { const kg = base / 1000; return { amount: base >= 1000 ? r3(kg) + ' kg' : Math.round(base) + ' g', pcs: inf.g ? Math.round(base / inf.g) : null }; }
        if (inf.kind === 'flower') return { amount: r3(base) + (base === 1 ? ' pc' : ' pcs'), pcs: null };
        return { amount: r3(base) + ' ' + (/^units?$/i.test(inf.uom || '') ? (base === 1 ? 'pc' : 'pcs') : (inf.uom || '')), pcs: null };
      };
      const bomOf: Record<number, any> = {};   // by template (or exact variant)
      boms.forEach((x: any) => { const k = x.product_id ? 'p' + id0(x.product_id) : 't' + id0(x.product_tmpl_id); if (!bomOf[k]) bomOf[k] = x; });
      const linesOfBom: Record<number, any[]> = {}; bomLines.forEach((l: any) => { (linesOfBom[id0(l.bom_id)] = linesOfBom[id0(l.bom_id)] || []).push(l); });
      const used: Record<number, number> = {};   // product id -> base amount used
      const byOrder: Record<number, any> = {};
      (orders || []).forEach((o: any) => { byOrder[o.id] = { name: o.name, at: o.date_order, total: o.amount_total, items: [] as any[], pay: [] as string[] }; });
      lines.forEach((l: any) => {
        const o = byOrder[id0(l.order_id)]; const pid = id0(l.product_id); const inf = infoOf(pid); const q = Number(l.qty || 0);
        const bom = bomOf['p' + pid] || bomOf['t' + tmplOf[pid]];
        const inside: any[] = [];
        if (bom) {
          (linesOfBom[bom.id] || []).forEach((bl: any) => {
            const cp = id0(bl.product_id), ci = infoOf(cp); const cq = q / (Number(bom.product_qty) || 1) * Number(bl.product_qty || 0);
            const base = toBase(ci, cq, nm1(bl.product_uom_id) || ci.uom); used[cp] = (used[cp] || 0) + base;
            inside.push({ name: ci.ours, kind: ci.kind, ...show(ci, base) });
          });
        } else { const base = toBase(inf, q, inf.uom); used[pid] = (used[pid] || 0) + base; }
        if (o) o.items.push({ name: inf.kind === 'other' ? inf.name : inf.ours, kind: bom ? 'kit' : inf.kind, ...(bom ? { amount: q + ' ×', pcs: null } : show(inf, toBase(inf, q, inf.uom))), qty: q, inside });
      });
      pays.forEach((x: any) => { const o = byOrder[id0(x.pos_order_id)]; if (o) o.pay.push((nm1(x.payment_method_id) || '?') + ' ' + Number(x.amount || 0).toFixed(3)); });
      // group Odoo products that are the same item of ours (e.g. one flower imported once per origin)
      const grp: Record<string, { inf: any; base: number; odoo: number }> = {};
      Object.entries(used).forEach(([pid, base]) => { const inf = infoOf(Number(pid)); const k = inf.kind === 'other' ? 'p' + pid : inf.kind + ':' + inf.ours;
        const gq = grp[k] || (grp[k] = { inf, base: 0, odoo: 0 }); gq.base += base; gq.odoo += toBase(inf, onhandId[Number(pid)] || 0, inf.uom); });
      const usedList = Object.values(grp).map(({ inf, base }) => ({ name: inf.kind === 'other' ? inf.name : inf.ours, kind: inf.kind, ...show(inf, base) }))
        .sort((x, y) => x.kind.localeCompare(y.kind) || x.name.localeCompare(y.name));
      // our stock for the items used today (chocolate kg/pcs -> grams; flowers -> stems from the Flower Dashboard)
      const ourG: Record<string, number> = {};
      (ours || []).forEach((r: any) => { const c = choc['n:' + low(r.chocolate_name)]; const q = Number(r.current_stock || 0); const gr = /kg/i.test(r.unit || '') ? q * 1000 : q * ((c && c.g) || 0); ourG[r.chocolate_name] = (ourG[r.chocolate_name] || 0) + gr; });
      const ourF: Record<string, number> = {};
      if (Object.keys(used).some(pid => infoOf(Number(pid)).kind === 'flower')) {
        try {
          const r = await fetch(`${SB_URL}/functions/v1/flower-fast`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ action: 'getFlowerDashboard', branch: 'ModaMall', token: String(p.token || '') }), signal: AbortSignal.timeout(20000) });
          const d = r.ok ? await r.json() : null;
          ((d && d.itemStockLevels) || []).forEach((x: any) => { ourF[x.name] = Number(x.stock) || 0; });
        } catch (e) { console.error('flower stock', e); }
      }
      const compare = Object.values(grp).filter(({ inf }) => inf.kind !== 'other').map(({ inf, base, odoo: odooBase }) => {
        const ourBase = inf.kind === 'chocolate' ? (ourG[inf.ours] ?? null) : (ourF[inf.ours] ?? null);
        return { name: inf.ours, kind: inf.kind, used: show(inf, base).amount, odoo: show(inf, odooBase).amount, ours: ourBase == null ? '—' : show(inf, ourBase).amount,
          diff: ourBase == null ? null : show(inf, Math.abs(odooBase - ourBase)).amount, less: ourBase != null && odooBase < ourBase - 0.0005, same: ourBase != null && Math.abs(odooBase - ourBase) < 0.0005 };
      }).sort((x: any, y: any) => x.kind.localeCompare(y.kind) || x.name.localeCompare(y.name));
      return json({ success: true, day, orders: Object.values(byOrder), used: usedList, compare, movesFound });
    }
    if (p.action === 'sales') {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(String(p.day || '')) ? String(p.day) : new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
      const [a, b] = dayRange(day);
      const orders = await odoo('pos.order', 'search_read', { domain: [['date_order', '>=', a], ['date_order', '<', b], ['state', 'in', ['paid', 'done', 'invoiced']]], fields: ['name', 'date_order', 'amount_total'], limit: 500 });
      const ids = (orders || []).map((o: any) => o.id);
      let pays: any[] = [], lines: any[] = [];
      if (ids.length) {
        pays = await odoo('pos.payment', 'search_read', { domain: [['pos_order_id', 'in', ids]], fields: ['amount', 'payment_method_id'], limit: 2000 });
        lines = await odoo('pos.order.line', 'search_read', { domain: [['order_id', 'in', ids]], fields: ['product_id', 'qty', 'price_subtotal_incl'], limit: 5000 });
      }
      const byMethod: Record<string, number> = {};
      pays.forEach((x: any) => { const m = Array.isArray(x.payment_method_id) ? x.payment_method_id[1] : 'Other'; byMethod[m] = Math.round(((byMethod[m] || 0) + Number(x.amount || 0)) * 1000) / 1000; });
      const prod: Record<string, { qty: number; amount: number }> = {};
      lines.forEach((l: any) => { const n = Array.isArray(l.product_id) ? l.product_id[1] : '?'; const c = prod[n] || (prod[n] = { qty: 0, amount: 0 }); c.qty += Number(l.qty || 0); c.amount += Number(l.price_subtotal_incl || 0); });
      const top = Object.entries(prod).map(([name, v]) => ({ name, qty: Math.round(v.qty * 1000) / 1000, amount: Math.round(v.amount * 1000) / 1000 })).sort((x, y) => y.amount - x.amount).slice(0, 30);
      const total = Math.round((orders || []).reduce((s: number, o: any) => s + Number(o.amount_total || 0), 0) * 1000) / 1000;
      return json({ success: true, day, orders: (orders || []).length, total, byMethod, top, list: (orders || []).slice(0, 50).map((o: any) => ({ name: o.name, at: o.date_order, total: o.amount_total })) });
    }
    return json({ success: false, error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ success: false, error: String((e as Error).message || e).slice(0, 300) }, 200);
  }
});
