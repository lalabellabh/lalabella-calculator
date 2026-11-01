// LALABELLA ORDER FORM — FAST PATH (Supabase Edge Function)
// Ported from the Order Form Apps Script (already reading from Supabase
// tables orders, order_settings, and the atomic get_next_order_number
// RPC). Photos moved from Google Drive to Supabase Storage (bucket
// "order-photos") — the Edge Function has no Google credentials.
//
// Auth: same session token, checked directly against `users`.

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PHOTO_BUCKET = 'order-photos';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function sbGet(table: string, query: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!res.ok) throw new Error(`db ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
async function sbPost(table: string, rows: unknown[]) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}
async function sbRpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function isValidSession(token: string) {
  const t = String(token || '').trim();
  if (!t) return false;
  const rows = await sbGet('users', `select=id,status,token_created&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0];
  if (!u) return false;
  if (String(u.status || 'Active') === 'Inactive') return false;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  return !!created && Date.now() - created <= SESSION_MAX_AGE_MS;
}
function numOrNull(v: any) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

async function uploadOrderPhoto(p: any) {
  const photoData = p.photo || '';
  if (!photoData || photoData.indexOf('base64,') === -1) return { error: 'No photo data received' };
  try {
    const commaIdx = photoData.indexOf('base64,');
    const base64 = photoData.slice(commaIdx + 'base64,'.length);
    const mimeMatch = photoData.match(/^data:(image\/[a-zA-Z]+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const ext = mimeType.split('/')[1] || 'jpg';
    const label = String(p.label || 'order-photo').replace(/[^a-zA-Z0-9-_]/g, '');
    const path = `${label}-${Date.now()}.${ext}`;
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const res = await fetch(`${SB_URL}/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': mimeType, 'x-upsert': 'true' },
      body: bytes,
    });
    if (!res.ok) { console.error('photo upload failed', res.status, (await res.text()).slice(0, 300)); return { error: 'Could not upload photo.' }; }
    return { success: true, photoUrl: `${SB_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}` };
  } catch (err: any) {
    return { error: String(err) };
  }
}

async function saveOrder(p: any) {
  let arrangementsOut: any[] = [];
  try { arrangementsOut = JSON.parse(p.arrangements || '[]'); } catch { arrangementsOut = []; }
  arrangementsOut = arrangementsOut.map((arr: any) => ({ name: arr.name || '', photoUrl: arr.photoUrl || '' }));

  const nextNum = await sbRpc('get_next_order_number', {});
  const orNumber = String(nextNum).padStart(5, '0');

  let itemsOut: any[] = [];
  try { itemsOut = JSON.parse(p.items || '[]'); } catch { itemsOut = []; }

  await sbPost('orders', [{
    or_number: orNumber, arrangements: arrangementsOut, sender_name: p.sender || '', sender_phone: p.senderPhone || '',
    receiver_name: p.receiver || '', receiver_phone: p.receiverPhone || '', delivery_method: p.method || '',
    delivery_date: p.date || null, delivery_time: p.time || '', address: p.address || '', items: itemsOut,
    subtotal: numOrNull(p.subtotal), additional: numOrNull(p.additional), total_amount: numOrNull(p.total),
    received_by: p.receivedBy || '', status: p.status || '', notes: p.notes || '',
  }]);
  return { success: true, orNumber, arrangements: arrangementsOut };
}

async function readParams(req: Request): Promise<Record<string, any>> {
  if (req.method === 'GET') { const u = new URL(req.url); return Object.fromEntries(u.searchParams.entries()); }
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await req.json();
  const t = await req.text();
  return Object.fromEntries(new URLSearchParams(t));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const p = await readParams(req);
    const action = p.action || '';
    if (!(await isValidSession(p.token))) return json({ success: false, error: 'Unauthorized. Please log in again.' });

    if (action === 'getNextOrderNumber') {
      const rows = await sbGet('order_settings', `select=value&key=eq.${encodeURIComponent('Next Order Number')}`);
      const next = rows.length ? (Number(rows[0].value) || 1) : 1;
      return json({ next });
    }
    if (action === 'saveOrder') return json(await saveOrder(p));
    if (action === 'uploadOrderPhoto') return json(await uploadOrderPhoto(p));

    return json({ error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return json({ error: 'Server error. Please try again.' }, 500);
  }
});
