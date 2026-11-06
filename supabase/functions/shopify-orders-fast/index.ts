// LALABELLA SHOPIFY NEW-ORDER ALERT v2.3 (branch: checkout > area keywords > map pin; stored only — the phone alert has NO branch, the Tampermonkey decides) (see shopify-orders-fast.ts in the repo for notes)
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('SHOPIFY_WEBHOOK_SECRET') || '';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 30;
const SHOP_DOMAIN = (Deno.env.get('SHOPIFY_STORE_DOMAIN') || 'lalabellabh.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const ABANDON_MIN = 45;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function rest(method: string, path: string, body?: unknown, prefer = 'return=representation') {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 300)}`);
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

async function isValidSession(token: string) {
  const t = String(token || '').trim();
  if (!/^[a-f0-9]{20,}$/i.test(t)) return false;
  const rows = await rest('GET', `users?select=id,status,token_created&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0];
  if (!u || String(u.status || 'Active') === 'Inactive') return false;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  return !!created && Date.now() - created <= SESSION_MAX_AGE_MS;
}

const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

async function validSignature(raw: string, sigB64: string) {
  if (!SECRET || !sigB64) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  let bin = ''; mac.forEach((b) => { bin += String.fromCharCode(b); });
  const mine = btoa(bin);
  if (mine.length !== sigB64.length) return false;
  let diff = 0; for (let i = 0; i < mine.length; i++) diff |= mine.charCodeAt(i) ^ sigB64.charCodeAt(i);
  return diff === 0;
}

const rad = (d: number) => d * Math.PI / 180;
function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// Branch order (same as the Tampermonkey + Branch Config): 1) branch picked at checkout, 2) area keywords from Branch Config
// (city first, then the street lines), 3) only if no keyword matches: nearest branch to the map pin.
// The map pin is often the customer's phone location or a default pin, so it must not beat the area they typed.
function kwHit(text: string, branches: any[]) {
  const t = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ') + ' ';
  if (!t.trim()) return null;
  for (const b of branches) {
    const words = String(b.keywords || '').split(/[,;\n]/).map((s: string) => s.trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ').trim()).filter((s: string) => s.length > 1);
    if (b.name && words.some((w: string) => t.indexOf(' ' + w + ' ') !== -1)) return b;
  }
  return null;
}
async function pickBranch(order: any, attrs: Record<string, string>) {
  const branches: any[] = ((await rest('GET', 'branch_config?select=name,latitude,longitude,keywords&order=id.asc')) || []).filter((b: any) => b && b.name);
  const picked = (attrs['order location'] || '').toLowerCase();
  if (picked) {
    const hit = branches.find((b) => b.name && picked.indexOf(String(b.name).toLowerCase()) !== -1);
    if (hit) return { name: String(hit.name), source: 'checkout' };
  }
  const sa = order.shipping_address || {};
  for (const part of [sa.city, sa.province, [sa.address1, sa.address2].filter(Boolean).join(' ')]) {
    const hit = kwHit(part, branches);
    if (hit) return { name: String(hit.name), source: 'address' };
  }
  const lat = Number(sa.latitude), lng = Number(sa.longitude);
  if (isFinite(lat) && isFinite(lng) && lat && lng) {
    let best: any = null, bd = 1e9;
    branches.forEach((b) => {
      const bl = Number(b.latitude), bg = Number(b.longitude);
      if (!isFinite(bl) || !isFinite(bg) || (!bl && !bg)) return;
      const d = km(lat, lng, bl, bg);
      if (d < bd) { bd = d; best = b; }
    });
    if (best) return { name: String(best.name), source: 'map' };
  }
  return { name: '', source: '' };
}

async function pushAlert(orders: { orderNo: string; source: string; total?: string }[]) {
  const cfg = await rest('GET', 'push_config?select=internal_key&id=eq.1&limit=1');
  const key = cfg && cfg[0] && cfg[0].internal_key;
  if (!key) return;
  await fetch(`${SB_URL}/functions/v1/push-fast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    body: JSON.stringify({ action: 'orderNotify', key, orders }),
  });
}

let thumbCache: { at: number; map: Record<string, string> } = { at: 0, map: {} };
async function thumbFor(lineItems: any[]): Promise<string> {
  if (!SHOP_DOMAIN || !Array.isArray(lineItems) || !lineItems.length) return '';
  try {
    if (Date.now() - thumbCache.at > 10 * 60000) {
      const r = await fetch(`https://${SHOP_DOMAIN}/products.json?limit=250`, { signal: AbortSignal.timeout(3500) });
      const j = await r.json();
      const map: Record<string, string> = {};
      (j.products || []).forEach((pr: any) => { const im = pr.images && pr.images[0] && pr.images[0].src; if (im) map[String(pr.id)] = String(im).replace(/(\.[a-z]+)(\?|$)/i, '_150x150$1$2'); });
      thumbCache = { at: Date.now(), map };
    }
    for (const li of lineItems) { const t = thumbCache.map[String(li && li.product_id)]; if (t) return t; }
  } catch (e) { console.error('thumb', e); }
  return '';
}

async function handleCheckout(o: any) {
  const token = clip(o && (o.token || o.cart_token), 80);
  if (!token) return json({ success: true, ignored: 'no token' });
  const sa = o.shipping_address || o.billing_address || {};
  const cust = o.customer || {};
  const row: Record<string, unknown> = {
    token, updated_at: new Date().toISOString(),
    customer: clip(sa.name || [cust.first_name, cust.last_name].filter(Boolean).join(' '), 80),
    email: clip(o.email || cust.email, 80),
    phone: clip(o.phone || sa.phone || cust.phone, 30),
    total: Number(o.total_price) || null, currency: clip(o.currency, 5),
    items: clip((Array.isArray(o.line_items) ? o.line_items : []).map((li: any) => `${li.quantity || 1}× ${li.title || li.name || ''}`).join(' · '), 300),
    thumb: await thumbFor(o.line_items),
    recover_url: clip(o.abandoned_checkout_url, 500),
  };
  if (o.completed_at) row.status = 'completed';
  await rest('POST', 'shopify_checkouts?on_conflict=token', [row], 'resolution=merge-duplicates,return=minimal');
  return json({ success: true });
}
async function sweepAbandoned() {
  const cutoff = new Date(Date.now() - ABANDON_MIN * 60000).toISOString();
  const rows = await rest('GET', `shopify_checkouts?select=token,email,phone&status=eq.open&alerted=eq.false&updated_at=lt.${encodeURIComponent(cutoff)}&limit=100`);
  let n = 0;
  for (const r of rows || []) {
    if (r.email || r.phone) { await rest('PATCH', `shopify_checkouts?token=eq.${encodeURIComponent(r.token)}`, { status: 'abandoned', alerted: true }, 'return=minimal'); n++; }
  }
  const old = new Date(Date.now() - 30 * 86400000).toISOString();
  rest('DELETE', `shopify_checkouts?updated_at=lt.${encodeURIComponent(old)}`, undefined, 'return=minimal').catch(() => {});
  return { success: true, abandoned: n };
}

async function handleWebhook(req: Request, raw: string) {
  if (!(await validSignature(raw, req.headers.get('x-shopify-hmac-sha256') || ''))) {
    console.log('shopify webhook refused: bad/missing signature or secret not set');
    return json({ success: false, error: 'Unauthorized' }, 401);
  }
  const topic = req.headers.get('x-shopify-topic') || '';
  let o: any;
  try { o = JSON.parse(raw); } catch { return json({ success: false, error: 'Bad JSON' }, 400); }
  if (topic.indexOf('checkouts/') === 0) return await handleCheckout(o);
  if (topic && topic !== 'orders/create') return json({ success: true, ignored: topic });
  const sid = Number(o && o.id);
  if (!Number.isFinite(sid) || sid < 1) return json({ success: false, error: 'No order id' }, 400);

  const attrs: Record<string, string> = {};
  (Array.isArray(o.note_attributes) ? o.note_attributes : []).forEach((a: any) => { if (a && a.name) attrs[String(a.name).toLowerCase().trim()] = clip(a.value, 120); });
  const sa = o.shipping_address || {};
  const cust = o.customer || {};
  const customer = clip(sa.name || [cust.first_name, cust.last_name].filter(Boolean).join(' '), 80);
  const address = clip([sa.address1, sa.address2, sa.city].filter(Boolean).join(', '), 200);
  const items = clip((Array.isArray(o.line_items) ? o.line_items : []).map((li: any) => `${li.quantity || 1}× ${li.title || li.name || ''}`).join(' · '), 300);
  const br = await pickBranch(o, attrs);
  const row = {
    shopify_id: sid,
    order_no: clip(o.name || ('#' + (o.order_number || sid)), 20),
    placed_at: o.created_at || new Date().toISOString(),
    customer,
    phone: clip(sa.phone || o.phone || cust.phone || '', 30),
    address,
    total: Number(o.total_price) || null,
    currency: clip(o.currency, 5),
    items,
    delivery_type: attrs['order fulfillment type'] || '',
    due_date: attrs['order due date'] || '',
    due_time: attrs['order due time'] || '',
    branch: br.name,
    branch_source: br.source,
    thumb: await thumbFor(o.line_items),
  };
  const existing = await rest('GET', `shopify_orders?select=id&shopify_id=eq.${sid}&limit=1`);
  if (existing && existing.length) return json({ success: true, duplicate: true });
  await rest('POST', 'shopify_orders', [row], 'return=minimal');
  if (o.checkout_token) rest('PATCH', `shopify_checkouts?token=eq.${encodeURIComponent(String(o.checkout_token))}`, { status: 'completed', order_id: sid }, 'return=minimal').catch(() => {});
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
  rest('DELETE', `shopify_orders?received_at=lt.${encodeURIComponent(cutoff)}`, undefined, 'return=minimal').catch(() => {});

  if (req.headers.get('x-lb-test') !== '1') {
    try {
      await Promise.race([
        pushAlert([{ orderNo: row.order_no, source: 'shopify', total: row.total ? Number(row.total).toFixed(3) : '' }]),   /* no branch: the monkey decides */
        new Promise((r) => setTimeout(r, 4000)),
      ]);
    } catch (e) { console.error('push failed', e); }
  }
  return json({ success: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (req.headers.get('x-shopify-hmac-sha256')) return await handleWebhook(req, await req.text());

    let p: Record<string, any> = {};
    if (req.method === 'GET') p = Object.fromEntries(new URL(req.url).searchParams.entries());
    else { try { p = await req.json(); } catch { p = {}; } }
    if (p.action === 'sweepAbandoned') return json(await sweepAbandoned());
    if (!(await isValidSession(p.token))) return json({ success: false, error: 'Unauthorized. Please log in again.' });
    if (p.action === 'getRecentOrders') {
      const rows = (await rest('GET', 'shopify_orders?select=shopify_id,order_no,placed_at,received_at,customer,address,total,currency,items,delivery_type,due_date,due_time,branch,thumb&order=id.desc&limit=20')) || [];
      rows.forEach((r: any) => { r.source = 'shopify'; });
      let bl: any[] = [];
      try {
        bl = (await rest('GET', 'bleems_orders?select=order_id,order_no,placed_at,received_at,customer,address,total,currency,items,delivery_type,delivery_date,delivery_time,branch,thumb,status&order=id.desc&limit=30')) || [];
      } catch (_e) { bl = []; }
      bl = bl.filter((b: any) => !/completed|cancel/i.test(String(b.status || ''))).slice(0, 10).map((b: any) => ({
        shopify_id: 'bl_' + b.order_id, order_no: b.order_no, placed_at: b.placed_at, received_at: b.received_at, customer: b.customer, address: b.address,
        total: b.total, currency: b.currency, items: b.items, delivery_type: b.delivery_type, due_date: b.delivery_date, due_time: b.delivery_time,
        branch: b.branch, thumb: b.thumb, source: 'bleems',
      }));
      let ab: any[] = [];
      try { ab = (await rest('GET', 'shopify_checkouts?select=token,customer,email,phone,total,currency,items,thumb,recover_url,updated_at&status=eq.abandoned&order=updated_at.desc&limit=20')) || []; } catch (_e) { ab = []; }
      return json({ success: true, orders: rows.concat(bl), abandoned: ab });
    }
    return json({ success: false, error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return json({ success: false, error: 'Server error. Please try again.' }, 500);
  }
});
