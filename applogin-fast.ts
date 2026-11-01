// LALABELLA APP LOGIN — keeps ONE shared session for the phone apps (Supabase Edge Function, verify_jwt OFF)
// Problem it fixes: the Messenger app quietly logs in again every 24h with the saved password. auth-fast's login
// always makes a NEW token, and an account has only one token — so every Messenger re-login kicked the website /
// main app out ("Session ended"), and the next website login kicked Messenger out. They fought each other.
// Fix: the Messenger logs in HERE. Password + lockout + rate limits are still checked by the real auth-fast.
// If the account already had a still-valid session, that same token is put back and returned, so the apps share
// it. Logging in on a NEW device through the website (auth-fast) still replaces it, as before.
// The session is also pushed ~13 days ahead (same trick as sessionkeep-fast), so it lasts until Logout.

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const EXTEND_DAYS = 13;
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
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    let username = '', password = '';
    if (req.method === 'GET') { const u = new URL(req.url).searchParams; username = u.get('username') || ''; password = u.get('password') || ''; }
    else { const b = await req.json().catch(() => ({})); username = String((b && b.username) || ''); password = String((b && b.password) || ''); }
    username = username.trim();
    if (!username || !password) return json({ success: false, error: 'Username and password are required.' });

    // 1) what session does this account have right now?
    let old: { id: number; token: string; created: number } | null = null;
    try {
      const rows = await rest('POST', 'rpc/auth_get_user_by_username', { p_username: username });
      const u = rows && rows[0];
      const created = u && u.token_created ? new Date(u.token_created).getTime() : 0;
      if (u && u.token && created && Date.now() - created <= SESSION_MAX_AGE_MS) old = { id: u.id, token: String(u.token), created };
    } catch (_e) { old = null; }

    // 2) let the real login check the password (lockout, rate limit, disabled accounts all stay in auth-fast)
    const ip = (req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || '').trim();
    const res = await fetch(`${SB_URL}/functions/v1/auth-fast?action=login&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, ...(ip ? { 'x-forwarded-for': ip } : {}) },
    });
    const out = await res.json().catch(() => ({ success: false, error: 'Server error. Please try again.' }));
    if (!out || !out.success || !out.token) return json(out);

    // 3) same session as before if it was still alive; otherwise keep the brand-new one
    const target = new Date(Date.now() + EXTEND_DAYS * 86400000).toISOString();
    if (old && old.token !== out.token) {
      await rest('PATCH', `users?id=eq.${old.id}`, { token: old.token, token_created: target });
      out.token = old.token;
      out.shared = true;
    } else {
      await rest('PATCH', `users?token=eq.${encodeURIComponent(String(out.token))}`, { token_created: target });
    }
    return json(out);
  } catch (err) {
    console.error('[applogin-fast]', err);
    return json({ success: false, error: 'Server error. Please try again.' }, 500);
  }
});
