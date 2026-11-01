// LALABELLA CHOCOLATE — BEST BEFORE for saved displays/lists (tiny helper).
// Keeps chocolate-fast untouched. Reads/writes chocolate_display.best_before (text 'YYYY-MM').
// Actions: getBestBefore -> { 'DISP-00001': '2027-07', ... } ; setBestBefore (code, value).
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

async function isValidToken(token: string) {
  const t = String(token || '').trim();
  if (!t) return false;
  const res = await fetch(`${SB_URL}/rest/v1/users?select=status,token_created&limit=1&token=eq.${encodeURIComponent(t)}`, { headers: H });
  if (!res.ok) return false;
  const rows = await res.json();
  const u = rows && rows[0];
  if (!u) return false;
  if (String(u.status || 'Active') === 'Inactive') return false;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  return !!created && Date.now() - created <= SESSION_MAX_AGE_MS;
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
    if (!(await isValidToken(p.token))) return json({ error: 'Unauthorized. Please log in again.' }, 401);
    const action = p.action || '';
    if (action === 'getBestBefore') {
      const res = await fetch(`${SB_URL}/rest/v1/chocolate_display?select=display_code,best_before&best_before=neq.`, { headers: H });
      if (!res.ok) throw new Error('db ' + res.status);
      const out: Record<string, string> = {};
      for (const r of await res.json()) if (r.best_before) out[r.display_code] = r.best_before;
      return json(out);
    }
    if (action === 'setBestBefore') {
      const code = String(p.code || '').trim().toUpperCase();
      const value = String(p.value || '').trim();
      if (!/^DISP-\d+$/.test(code)) return json({ error: 'Bad code.' }, 400);
      if (value && !/^\d{4}-\d{2}$/.test(value)) return json({ error: 'Bad date.' }, 400);
      const res = await fetch(`${SB_URL}/rest/v1/chocolate_display?display_code=eq.${encodeURIComponent(code)}`, {
        method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ best_before: value }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error('db ' + res.status + ' ' + text.slice(0, 200));
      return json({ success: true, updated: (text ? JSON.parse(text) : []).length });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: 'Server error. Please try again.' }, 500);
  }
});
