// LALABELLA BUG HISTORY intake (errlog-fast) — Supabase Edge Function, verify_jwt OFF
// Pages send {page, kind, message, detail, token?} when something breaks (JS error, failed server call).
// Same error (page+kind+message) within 10 minutes only adds to `hits`. Hard cap: 300 new rows per hour.
// The viewer is in Activity History -> Errors (audit-fast, admin only). Writes only; never returns data.

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const enc = encodeURIComponent;
const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

async function rest(method: string, path: string, body?: unknown, prefer = 'return=representation') {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 200)}`);
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false }, 405);
  try {
    let p: any = {};
    try { p = await req.json(); } catch { return json({ ok: false }, 400); }
    const page = clip(p.page, 80), kind = clip(p.kind, 12) || 'js', message = clip(p.message, 300);
    if (!message) return json({ ok: false });
    const detail = clip(p.detail, 900);
    // who (optional): only if the token is a real, known one
    let username = '';
    const t = String(p.token || '').trim();
    if (/^[a-f0-9]{20,}$/i.test(t)) {
      const u = await rest('GET', `users?select=username&limit=1&token=eq.${enc(t)}`);
      if (u && u[0]) username = clip(u[0].username, 60);
    }
    const since10 = new Date(Date.now() - 10 * 60000).toISOString();
    const same = await rest('GET', `error_log?select=id,hits&page=eq.${enc(page)}&kind=eq.${enc(kind)}&message=eq.${enc(message)}&at=gt.${enc(since10)}&limit=1`);
    if (same && same[0]) {
      await rest('PATCH', `error_log?id=eq.${same[0].id}`, { hits: (same[0].hits || 1) + 1 }, 'return=minimal');
      return json({ ok: true, dedup: true });
    }
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const recent = await rest('GET', `error_log?select=id&at=gt.${enc(hourAgo)}&limit=301`);
    if ((recent || []).length >= 300) return json({ ok: true, dropped: true });
    await rest('POST', 'error_log', { page, username, kind, message, detail, ua: clip(req.headers.get('user-agent'), 140) }, 'return=minimal');
    return json({ ok: true });
  } catch (e) {
    console.error('[errlog-fast]', e);
    return json({ ok: false });
  }
});
