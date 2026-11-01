// LALABELLA STAY-LOGGED-IN — keeps a still-valid session alive (Supabase Edge Function, verify_jwt OFF)
// Called quietly by auth-guard.js while someone is using the app. If the token is valid (not logged out,
// account active, not expired), the session window is pushed forward ~1 year so the person stays logged in
// until they press Logout (or log in on another device). Every backend checks `now - token_created > 24h`,
// so a token_created in the future simply means "still valid" there — no other function needs a change.
// Logout (auth-fast) clears the token, so a logged-out session can never be kept alive.

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const EXTEND_DAYS = 365;
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
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    let token = '';
    if (req.method === 'GET') token = new URL(req.url).searchParams.get('token') || '';
    else { const b = await req.json().catch(() => ({})); token = String((b && b.token) || ''); }
    token = token.trim();
    if (!/^[a-f0-9]{20,}$/i.test(token)) return json({ ok: false });
    const rows = await rest('GET', `users?select=id,status,token_created&limit=1&token=eq.${encodeURIComponent(token)}`);
    const u = rows && rows[0];
    if (!u || String(u.status || 'Active') === 'Inactive') return json({ ok: false });
    const created = u.token_created ? new Date(u.token_created).getTime() : 0;
    if (!created || Date.now() - created > SESSION_MAX_AGE_MS) return json({ ok: false });
    const target = Date.now() + EXTEND_DAYS * 86400000;
    if (created > target - 86400000) return json({ ok: true, kept: true }); // already extended within the last day
    await rest('PATCH', `users?id=eq.${u.id}&token=eq.${encodeURIComponent(token)}`, { token_created: new Date(target).toISOString() });
    return json({ ok: true, kept: true });
  } catch (err) {
    console.error('[sessionkeep-fast]', err);
    return json({ ok: false }, 500);
  }
});
