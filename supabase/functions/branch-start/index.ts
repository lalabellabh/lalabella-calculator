// LALABELLA BRANCH START CHECK (Supabase Edge Function)  v1
// Used by the branch confirmation before a save (shared/config.js): does this branch already have its starting stock?
//   flower    = at least one Flower Stock Count (flower_stock_history, item_code CONSOLIDATED)
//   chocolate = at least one Initial Stock line (chocolate_database, delivery note INITIAL STOCK) or a chocolate stock count
//   item      = at least one Item Inventory stock count (item_count_history)
// Read-only. Any logged-in user. Answers { success, branch, flower, chocolate, item } (true = has a start).

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const H = () => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` });
async function sbGet(q: string) { const r = await fetch(`${SB_URL}/rest/v1/${q}`, { headers: H() }); return r.ok ? r.json() : []; }

async function sessionUser(token: string) {
  const t = String(token || '').trim();
  if (!/^[a-f0-9]{20,}$/i.test(t)) return null;
  const rows = await sbGet(`users?select=id,status,token_created&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0];
  if (!u || String(u.status || 'Active') === 'Inactive') return null;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return null;
  return u;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    let p: Record<string, any> = {};
    if (req.method === 'GET') p = Object.fromEntries(new URL(req.url).searchParams.entries());
    else { const ct = req.headers.get('content-type') || ''; p = ct.includes('json') ? await req.json() : Object.fromEntries(new URLSearchParams(await req.text())); }
    if (!(await sessionUser(p.token))) return json({ success: false, error: 'Please log in again.' }, 401);
    const branch = String(p.branch || '').trim().slice(0, 40);
    if (!branch || branch === 'All') return json({ success: false, error: 'No branch' });
    const b = encodeURIComponent(branch);
    const [f, c1, c2, i] = await Promise.all([
      sbGet(`flower_stock_history?select=id&branch=eq.${b}&item_code=eq.CONSOLIDATED&limit=1`),
      sbGet(`chocolate_database?select=id&branch=eq.${b}&delivery_note_no=eq.INITIAL%20STOCK&limit=1`),
      sbGet(`chocolate_stock_count_history?select=id&branch=eq.${b}&limit=1`),
      sbGet(`item_count_history?select=id&branch=eq.${b}&limit=1`),
    ]);
    return json({ success: true, branch, flower: f.length > 0, chocolate: c1.length > 0 || c2.length > 0, item: i.length > 0 });
  } catch (e) {
    console.error(e);
    return json({ success: false, error: 'Server error' }, 200);
  }
});
