// LALABELLA <-> ODOO (trial) — read-only connection test (Supabase Edge Function)  v2
// v2: action 'ping' (no login) answers only {keySet, ok, error} — no Odoo data — so the connection can be checked from the server side.
// ADMIN ONLY. Uses the Odoo JSON-2 API: POST {ODOO_URL}/json/2/<model>/<method>, header Authorization: bearer <ODOO_KEY>.
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
    if (String(u.role || '').toLowerCase() !== 'admin') return json({ success: false, error: 'Admin only.' }, 403);
    if (!ODOO_URL || !ODOO_KEY) return json({ success: false, setup: true, error: 'Odoo is not connected yet (the API key is missing).', url: ODOO_URL, db: ODOO_DB });

    if (p.action === 'status') {
      const ctx = await odoo('res.users', 'context_get', {});
      const products = await odoo('product.template', 'search_count', { domain: [['sale_ok', '=', true]] });
      const pos = await odoo('product.template', 'search_count', { domain: [['available_in_pos', '=', true]] }).catch(() => null);
      return json({ success: true, url: ODOO_URL, db: ODOO_DB, lang: ctx && ctx.lang, tz: ctx && ctx.tz, products, posProducts: pos });
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
