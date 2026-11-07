// LALABELLA <-> ODOO (trial) — read-only connection test (Supabase Edge Function)  v5
// v5: 'today' explodes kits (BoM) from the sale lines itself (no need to wait for Close Register), shows chocolate in g/kg (+ pcs)
//     and flowers in pcs, and 'compare' = per item used today: used / Odoo stock / our stock (chocolate ModaMall, flowers via Flower Dashboard).
// v4: 'today' is open to every logged-in user (shown on the Chocolate Dashboard); status/sales stay Admin only.
// v3: action 'today' (admin) — POS orders of the day with their lines, what LEFT the stock that day (stock moves to the customer,
//     so kit/arrangement components show up), and Odoo On Hand next to our own ModaMall chocolate stock. Read-only.
// v2: action 'ping' (no login) answers only {keySet, ok, error} — no Odoo data — so the connection can be checked from the server side.
// Admin only, except 'today' (any logged-in user). Uses the Odoo JSON-2 API: POST {ODOO_URL}/json/2/<model>/<method>, header Authorization: bearer <ODOO_KEY>.
// Secrets (never in the repo): ODOO_URL (e.g. https://lalabella-test.odoo.com), ODOO_DB (database name), ODOO_KEY (API key of an Odoo user).
// Actions: status -> who we are in Odoo + how many products; sales -> POS sales of a day (total + by payment method) + top products.
// Nothing is written to Odoo.

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
    const u = await sessionUser(p.token);
    if (!u) return json({ success: false, error: 'Please log in again.' }, 401);
    if (p.action !== 'today' && String(u.role || '').toLowerCase() !== 'admin') return json({ success: false, error: 'Admin only.' }, 403);
    if (!ODOO_URL || !ODOO_KEY) return json({ success: false, setup: true, error: 'Odoo is not connected yet (the API key is missing).', url: ODOO_URL, db: ODOO_DB });

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
