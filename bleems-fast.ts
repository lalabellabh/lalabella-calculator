// LALABELLA — BLEEMS ORDERS (Supabase Edge Function)  v2 = READ-ONLY SYNC + ALERT
// Bleems Vendor API v2: every call is a POST to https://api-developers.bleems.com/api/v2/{endpoint}
// with header XApiKey. Data calls also need "Authorization: Bearer <jwt>", which comes from /auth/token
// using the merchant secret_key (token lasts ~1 hour).
//
// Secrets (Supabase -> Edge Functions -> Secrets):  BLEEMS_API_KEY  and  BLEEMS_SECRET_KEY
//
// v2: action=sync saves orders into bleems_orders (+ push alert for new open orders). Still READS only: it never calls updateOrderStatus / updateItemStock. action=probe saves the raw answers of
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

async function probe(days: number) {
  if (!API_KEY || !SECRET) return { success: false, error: 'BLEEMS_API_KEY / BLEEMS_SECRET_KEY secret is not set yet.' };
  const token = await getToken();
  const saved: string[] = [];
  const save = async (kind: string, ref: string, payload: unknown) => {
    await rest('POST', 'bleems_raw', [{ kind, ref, payload }]);
    saved.push(kind);
  };
  const orderIds: string[] = [];
  for (let off = 0; off < days; off++) {
    const dp = dayParts(off);
    const r = await bleems('getOrders', { ...dp, page: 1, page_size: 50, lang: 'en' }, token);
    const list = r && r.data;
    if (off < 2 || (Array.isArray(list) && list.length)) await save('getOrders', `${dp.year}-${dp.month}-${dp.day}`, r);
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


// ---------------------------------------------------------------------------------------------
// SYNC: pulls the orders of the last N days (by ORDER date, Bahrain time) and saves new ones in bleems_orders.
// A brand-new order (not in backfill mode) sends the same push alert as Shopify orders. Status changes on Bleems
// are copied over. Called every 3 minutes by pg_cron (action=sync). Read-only toward Bleems.
// ---------------------------------------------------------------------------------------------
const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

function parsePlaced(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(s || '').trim());
  if (!m) return null;
  let h = parseInt(m[4], 10) % 12; if (/pm/i.test(m[6])) h += 12;
  return `${m[3]}-${m[2]}-${m[1]}T${pad(h)}:${m[5]}:00+03:00`;
}

async function pickBranch(addr: string) {
  const branches: any[] = (await rest('GET', 'branch_config?select=name,keywords&order=id.asc')) || [];
  const a = addr.toLowerCase();
  if (a) {
    for (const b of branches) {
      const words = String(b.keywords || '').split(/[,;\n]/).map((x: string) => x.trim().toLowerCase()).filter((x: string) => x.length > 1);
      if (words.some((w: string) => a.indexOf(w) !== -1)) return { name: String(b.name), source: 'address' };
    }
  }
  return { name: '', source: '' };
}

async function pushAlert(orders: { orderNo: string; branch: string; address: string }[]) {
  const cfg = await rest('GET', 'push_config?select=internal_key&id=eq.1&limit=1');
  const key = cfg && cfg[0] && cfg[0].internal_key;
  if (!key) return;
  await fetch(`${SB_URL}/functions/v1/push-fast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    body: JSON.stringify({ action: 'orderNotify', key, orders }),
  });
}

async function sync(days: number, backfill: boolean) {
  if (!API_KEY || !SECRET) return { success: false, error: 'BLEEMS_API_KEY / BLEEMS_SECRET_KEY secret is not set yet.' };
  const token = await getToken();
  let seen = 0, added = 0, changed = 0;
  const toAlert: { orderNo: string; branch: string; address: string }[] = [];
  for (let off = 0; off < days; off++) {
    const dp = dayParts(off);
    for (let page = 1; page <= 5; page++) {
      const r = await bleems('getOrders', { ...dp, page, page_size: 50, lang: 'en' }, token);
      if (!r || String(r.status) !== '1') throw new Error('getOrders failed: ' + String((r && (r.msg || r.error_code)) || '?'));
      const list: any[] = Array.isArray(r.data) ? r.data : [];
      for (const o of list) {
        const oid = clip(o.order_id, 40); if (!oid) continue;
        seen++;
        const items: any[] = Array.isArray(o.items) ? o.items : [];
        const it0 = items[0] || {};
        const addr = clip([it0.house_number && 'House ' + it0.house_number, it0.building_number && 'Bldg ' + it0.building_number, it0.street, it0.avenue, it0.block && 'Block ' + it0.block, it0.area, it0.hospital_name, it0.extra_details].filter(Boolean).join(', '), 250);
        const status = clip(o.order_status, 30);
        const existing = await rest('GET', `bleems_orders?select=id,status&order_id=eq.${encodeURIComponent(oid)}&limit=1`);
        if (existing && existing.length) {
          if (existing[0].status !== status) { await rest('PATCH', `bleems_orders?id=eq.${existing[0].id}`, { status }); changed++; }
          continue;
        }
        const br = await pickBranch(addr);
        const row = {
          order_id: oid, order_no: 'BL ' + oid, placed_at: parsePlaced(o.order_date),
          customer: clip(o.name, 80), phone: clip(o.mobile || o.phone, 30),
          recipient: clip(it0.recipient_name, 80), recipient_phone: clip(it0.recipient_number, 30),
          address: addr, total: Number(o.total_price) || null, currency: 'BHD',
          items: clip(items.map((i: any) => `${i.quantity || 1}× ${i.item_name || ''}`).join(' · '), 300),
          delivery_date: clip(it0.delivery_date, 20), delivery_time: clip(it0.delivery_time, 30),
          delivery_type: clip(it0.location_type, 30), card_message: clip(it0.card_message, 400),
          payment_method: clip(o.payment_method, 30), status, branch: br.name, branch_source: br.source,
          alerted: backfill || /completed|cancel/i.test(status), raw: o,
        };
        await rest('POST', 'bleems_orders', [row]);
        added++;
        if (!row.alerted) toAlert.push({ orderNo: row.order_no, branch: row.branch, address: row.address });
      }
      if (!(r.pagination && r.pagination.has_next)) break;
    }
  }
  if (toAlert.length) {
    try { await Promise.race([pushAlert(toAlert), new Promise((r) => setTimeout(r, 4000))]); } catch (e) { console.error('push failed', e); }
    await rest('PATCH', `bleems_orders?alerted=eq.false&order_no=in.(${toAlert.map((x) => '"' + x.orderNo + '"').join(',')})`, { alerted: true });
  }
  return { success: true, seen, added, changed, alerts: toAlert.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    let p: Record<string, any> = {};
    if (req.method === 'GET') p = Object.fromEntries(new URL(req.url).searchParams.entries());
    else { try { p = await req.json(); } catch { p = {}; } }
    if (p.action === 'probe') return json(await probe(Math.max(1, Math.min(45, parseInt(p.days, 10) || 2))));
    if (p.action === 'sync') return json(await sync(Math.max(1, Math.min(45, parseInt(p.days, 10) || 2)), String(p.backfill) === '1'));
    return json({ success: false, error: 'Unknown action' });
  } catch (err: any) {
    console.error('[bleems-fast]', err);
    return json({ success: false, error: String((err && err.message) || 'Server error').slice(0, 200) }, 500);
  }
});
