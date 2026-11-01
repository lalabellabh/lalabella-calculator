// LALABELLA — BLEEMS ORDERS (Supabase Edge Function)  v1 = READ-ONLY PROBE
// Bleems Vendor API v2: every call is a POST to https://api-developers.bleems.com/api/v2/{endpoint}
// with header XApiKey. Data calls also need "Authorization: Bearer <jwt>", which comes from /auth/token
// using the merchant secret_key (token lasts ~1 hour).
//
// Secrets (Supabase -> Edge Functions -> Secrets):  BLEEMS_API_KEY  and  BLEEMS_SECRET_KEY
//
// v1 only READS. It never calls updateOrderStatus / updateItemStock. action=probe saves the raw answers of
// getOrders (today + yesterday) and getOrderDetails (first orders) into table bleems_raw, so the real field
// names can be seen before the orders are mapped into the system. It returns only counts, nothing sensitive.

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEY = Deno.env.get('BLEEMS_API_KEY') || '';
const SECRET = Deno.env.get('BLEEMS_SECRET_KEY') || '';
const BASE = 'https://api-developers.bleems.com/api/v2/';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function rest(method: string, path: string, body?: unknown) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function bleems(endpoint: string, body: unknown, bearer?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', XApiKey: API_KEY };
  if (bearer) headers.Authorization = 'Bearer ' + bearer;
  const res = await fetch(BASE + endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { status: '0', msg: 'Not JSON (' + res.status + '): ' + text.slice(0, 200) }; }
}

async function getToken(): Promise<string> {
  const r = await bleems('auth/token', { secret_key: SECRET });
  const t = r && r.data && r.data.access_token;
  if (!t) throw new Error('Bleems token failed: ' + String((r && (r.msg || r.error_code)) || 'no token'));
  return String(t);
}

const pad = (n: number) => String(n).padStart(2, '0');
function dayParts(offsetDays: number) {
  // Bahrain is UTC+3
  const d = new Date(Date.now() + 3 * 3600000 - offsetDays * 86400000);
  return { year: String(d.getUTCFullYear()), month: pad(d.getUTCMonth() + 1), day: pad(d.getUTCDate()) };
}

async function probe() {
  if (!API_KEY || !SECRET) return { success: false, error: 'BLEEMS_API_KEY / BLEEMS_SECRET_KEY secret is not set yet.' };
  const token = await getToken();
  const saved: string[] = [];
  const save = async (kind: string, ref: string, payload: unknown) => {
    await rest('POST', 'bleems_raw', [{ kind, ref, payload }]);
    saved.push(kind);
  };
  const orderIds: string[] = [];
  for (const off of [0, 1]) {
    const dp = dayParts(off);
    const r = await bleems('getOrders', { ...dp, page: 1, page_size: 50, lang: 'en' }, token);
    await save('getOrders', `${dp.year}-${dp.month}-${dp.day}`, r);
    const list = r && r.data;
    const arr = Array.isArray(list) ? list : (list && Array.isArray(list.orders) ? list.orders : []);
    arr.forEach((o: any) => { const id = o && (o.order_id || o.id || o.order_number); if (id && orderIds.length < 3) orderIds.push(String(id)); });
  }
  for (const id of orderIds) {
    const d = await bleems('getOrderDetails', { order_id: id, lang: 'en' }, token);
    await save('getOrderDetails', id, d);
  }
  const st = await bleems('getOrderStatusCodes', { lang: 'en' }, token);
  await save('getOrderStatusCodes', '', st);
  return { success: true, saved: saved.length, ordersSeen: orderIds.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    let p: Record<string, any> = {};
    if (req.method === 'GET') p = Object.fromEntries(new URL(req.url).searchParams.entries());
    else { try { p = await req.json(); } catch { p = {}; } }
    if (p.action === 'probe') return json(await probe());
    return json({ success: false, error: 'Unknown action' });
  } catch (err: any) {
    console.error('[bleems-fast]', err);
    return json({ success: false, error: String((err && err.message) || 'Server error').slice(0, 200) }, 500);
  }
});
