// LALABELLA HQ MAP (Nov 2026) — the real neighbourhood (OpenStreetMap buildings + roads) around a branch, for the 3D "Lalabella HQ" page.
// Asks the free Overpass servers from the SERVER (fast, long timeout, tries several), keeps the answer in hq_map_cache for 30 days,
// so every Admin gets it instantly afterwards. Admin session only. Only branch GPS points from branch_config are allowed.
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
async function sb(method: string, path: string, body?: unknown, prefer = 'return=representation') {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: { ...H, Prefer: prefer }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); if (!r.ok) throw new Error(`db ${r.status}: ${t.slice(0, 200)}`); return t ? JSON.parse(t) : null;
}
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const BAD_HW = /footway|path|steps|cycleway|pedestrian|corridor|proposed|construction|bridleway|elevator|platform/;

async function overpass(lat: number, lng: number) {
  const q = `[out:json][timeout:30];(way["building"](around:230,${lat},${lng});way["highway"](around:280,${lat},${lng}););out geom tags;`;
  let last = '';
  for (const m of MIRRORS) {
    try {
      const r = await fetch(m, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'LalabellaHQ/1.0 (mysystemlla.com)' }, signal: AbortSignal.timeout(34000) });
      if (!r.ok) { last = m + ' ' + r.status; continue; }
      const j = await r.json();
      if (!j || !Array.isArray(j.elements)) { last = m + ' bad'; continue; }
      const d: { b: unknown[]; r: unknown[] } = { b: [], r: [] };
      for (const e of j.elements) {
        if (e.type !== 'way' || !Array.isArray(e.geometry) || e.geometry.length < 2) continue;
        const t = e.tags || {}, pts = e.geometry.map((g: any) => [+Number(g.lat).toFixed(6), +Number(g.lon).toFixed(6)]);
        if (t.building && pts.length >= 4) d.b.push([pts, Number(t['building:levels']) || 0, parseFloat(t.height) || 0]);
        else if (t.highway && !BAD_HW.test(t.highway)) d.r.push([pts, t.highway]);
      }
      return d;
    } catch (e) { last = m + ' ' + String((e as Error).message || e).slice(0, 80); }
  }
  throw new Error('map servers failed: ' + last);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const p = req.method === 'GET' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json().catch(() => ({}));
    const t = String(p.token || '').trim();
    if (!/^[a-f0-9]{20,}$/i.test(t)) return json({ success: false, error: 'Please log in again.' }, 401);
    const u = (await sb('GET', `users?select=id,role,status&token=eq.${t}&limit=1`))[0];
    if (!u || String(u.role) !== 'Admin' || String(u.status || 'Active') !== 'Active') return json({ success: false, error: 'Admins only.' }, 403);
    const lat = Number(p.lat), lng = Number(p.lng);
    if (!isFinite(lat) || !isFinite(lng)) return json({ success: false, error: 'Bad place.' });
    const br = await sb('GET', 'branch_config?select=name,latitude,longitude');
    const ok = (br || []).some((b: any) => Math.abs(Number(b.latitude) - lat) < 0.0002 && Math.abs(Number(b.longitude) - lng) < 0.0002);
    if (!ok) return json({ success: false, error: 'Only branch places are allowed.' });
    const key = lat.toFixed(4) + ',' + lng.toFixed(4);
    const c = (await sb('GET', `hq_map_cache?select=data,at&key=eq.${encodeURIComponent(key)}&limit=1`))[0];
    if (c && Date.now() - new Date(c.at).getTime() < 30 * 86400000 && !p.refresh) return json({ success: true, data: c.data, cached: true });
    const d = await overpass(lat, lng);
    await sb('POST', 'hq_map_cache?on_conflict=key', { key, data: d, at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
    return json({ success: true, data: d, cached: false });
  } catch (e) {
    console.error('[hqmap-fast]', e);
    return json({ success: false, error: 'Map not available right now.' }, 200);
  }
});
