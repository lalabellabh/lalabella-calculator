// LALABELLA — VISITOR ACCOUNTS for the Messenger app (Supabase Edge Function, verify_jwt OFF)
// Visitors sign up INSIDE the Lalabella Messenger app, wait for an admin to approve them
// (User Management -> status Pending -> Active), and can then use the Messenger ONLY.
//
// A visitor never gets a normal staff session token: users.token stays NULL (a DB trigger forces it),
// the Messenger session lives in users.vtoken / vtoken_created, and only the `chat` and `profile-fast`
// functions accept it. Every other function (orders, attendance, admin pages...) rejects it.
//
// Actions (POST JSON or GET query):
//   signup {username, password, fullName}  -> creates role=Visitor, status=Pending
//   login  {username, password}            -> {success, token, user} for approved visitors;
//                                             {success:false, notVisitor:true} when the name is not a visitor
//                                             (the app then tries the normal staff login)
//   logout {token}

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PEPPER = Deno.env.get('LALABELLA_PEPPER') ?? '';
const MIN_PASSWORD_LENGTH = 6;
const MAX_FAILED = 5;
const LOCK_MINUTES = 30;
const MAX_PENDING = 40;

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
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 300)}`);
  return data;
}
async function hashPassword(password: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password + PEPPER));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const newToken = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
async function findUser(username: string) {
  const rows = await rest('POST', 'rpc/auth_get_user_by_username', { p_username: String(username) });
  return (rows && rows[0]) || null;
}
function photoUrl(link: string) {
  const s = String(link || '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

async function signup(p: any) {
  const username = String(p.username || '').trim();
  const password = String(p.password || '');
  const fullName = String(p.fullName || '').replace(/\s+/g, ' ').trim();
  if (!username || !password || !fullName) return { success: false, error: 'Please fill in all fields.' };
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) return { success: false, error: 'Username must be 3–30 characters: letters, numbers, dot, dash or underscore.' };
  if (fullName.length < 2 || fullName.length > 40) return { success: false, error: 'Please enter your name (2–40 characters).' };
  if (password.length < MIN_PASSWORD_LENGTH) return { success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (await findUser(username)) return { success: false, error: 'That username is already taken.' };
  const pending = await rest('GET', 'users?select=id&role=eq.Visitor&status=eq.Pending&limit=' + (MAX_PENDING + 1));
  if ((pending || []).length >= MAX_PENDING) return { success: false, error: 'Sign-ups are busy right now. Please try again later.' };
  try {
    await rest('POST', 'users', { username, password_hash: await hashPassword(password), full_name: fullName, role: 'Visitor', status: 'Pending' });
  } catch (e: any) {
    if (String(e.message).includes('409')) return { success: false, error: 'That username is already taken.' };
    throw e;
  }
  return { success: true, message: 'Sign-up sent! Please wait for the admin to approve your account, then log in.' };
}

async function login(p: any) {
  const username = String(p.username || '').trim();
  const password = String(p.password || '');
  if (!username || !password) return { success: false, error: 'Username and password are required.' };
  const u = await findUser(username);
  if (!u || String(u.role) !== 'Visitor') return { success: false, notVisitor: true, error: 'Incorrect username or password.' };
  if (u.locked_until && Date.now() < new Date(u.locked_until).getTime()) {
    return { success: false, error: `Too many failed attempts. Try again in ${Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 60000)} minute(s).` };
  }
  if (u.password_hash !== await hashPassword(password)) {
    const attempts = (Number(u.failed_attempts) || 0) + 1;
    const patch: any = { failed_attempts: attempts };
    const locking = attempts >= MAX_FAILED;
    if (locking) patch.locked_until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
    await rest('PATCH', `users?id=eq.${u.id}`, patch);
    return { success: false, error: locking ? `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.` : 'Incorrect username or password.' };
  }
  const st = String(u.status || 'Pending');
  if (st === 'Pending') return { success: false, pending: true, error: 'Your account is waiting for admin approval. Please try again later.' };
  if (st !== 'Active') return { success: false, error: 'This account is disabled. Please contact the admin.' };
  const token = newToken();
  await rest('PATCH', `users?id=eq.${u.id}`, { vtoken: token, vtoken_created: new Date().toISOString(), failed_attempts: 0, locked_until: null });
  return {
    success: true, token, visitor: true,
    user: { username: u.username, fullName: u.full_name, role: 'Visitor', branch: u.branch || '', position: '', photo: photoUrl(u.photo_link), canManageUsers: false },
  };
}

async function logout(p: any) {
  const t = String(p.token || '').trim();
  if (/^[a-f0-9]{20,}$/i.test(t)) await rest('PATCH', `users?vtoken=eq.${t}`, { vtoken: null });
  return { success: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    let p: Record<string, any> = {};
    if (req.method === 'GET') p = Object.fromEntries(new URL(req.url).searchParams.entries());
    else { try { p = await req.json(); } catch { return json({ success: false, error: 'Bad request.' }, 400); } }
    const action = String(p.action || '');
    if (action === 'signup') return json(await signup(p));
    if (action === 'login') return json(await login(p));
    if (action === 'logout') return json(await logout(p));
    return json({ success: false, error: 'Unknown action.' }, 400);
  } catch (err) {
    console.error('[visitor-fast]', err);
    return json({ success: false, error: 'Server error. Please try again.' }, 500);
  }
});
