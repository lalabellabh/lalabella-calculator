// LALABELLA DATA CHECK (Supabase Edge Function)  v1
// "Needs attention" list for the dashboard: data that is missing or looks wrong, so it is fixed early.
//   Chocolate (batches with stock): expired, no expiry date, no "entered by", no price, a piece price that looks like a per-kg price,
//                                   Initial Stock entered but the branch not locked yet, receiving at a branch with no Initial Stock.
//   Flower: a branch with receiving but no Flower Stock Count yet; receiving lines (last 30 days) without "received by" or with rate 0.
// v3: Initial Stock rows open the Initial Stock page (its own Edit), receiving rows open Chocolate Receiving.
// v2: every issue has `link` = the page + ?branch= (+ &edit=<entry ID>&field=<input>) so 'Open' lands on the entry to fix.
// Read-only. Any logged-in user. action 'check' (branch optional, 'All' = every branch) -> { success, issues: [{level, module, branch, item, issue, fix, page}] }

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
async function sbGet(q: string) { const r = await fetch(`${SB_URL}/rest/v1/${q}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }); return r.ok ? r.json() : []; }
async function sbAll(q: string) {
  const out: any[] = [];
  for (let from = 0; from < 100000; from += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/${q}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Range: `${from}-${from + 999}` } });
    if (!r.ok) break; const rows = await r.json(); out.push(...rows); if (rows.length < 1000) break;
  }
  return out;
}
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
const dmy = (d: string) => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d || ''); };

async function check(branchSel: string) {
  const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const bf = branchSel && branchSel !== 'All' ? `&branch=eq.${encodeURIComponent(branchSel)}` : '';
  const [choc, items, settings, flowerDb, counts, chocCounts] = await Promise.all([
    sbAll(`chocolate_database?select=id,legacy_id,branch,chocolate_name,batch_no,expiry_date,unit,price_per_kg,price_per_piece,weight_per_piece,current_stock,created_by,delivery_note_no${bf}&current_stock=gt.0&order=branch.asc,chocolate_name.asc`),
    sbGet('chocolate_item_list?select=chocolate_name,standard_price_per_kg'),
    sbGet('chocolate_settings?select=key,value'),
    sbAll(`flower_database?select=id,legacy_id,branch,entry_date,flower_name,rate,received_by,invoice_no,type${bf}&order=id.desc`),
    sbAll(`flower_stock_history?select=branch&item_code=eq.CONSOLIDATED${bf}`),
    sbGet(`chocolate_stock_count_history?select=branch${bf}&limit=1000`),
  ]);
  const issues: any[] = [];
  const add = (level: string, module: string, branch: string, item: string, issue: string, fix: string, page: string, edit = '', field = '') => {
    const q = new URLSearchParams({ branch: String(branch || '') }); if (edit) q.set('edit', edit); if (field) q.set('field', field);
    issues.push({ level, module, branch, item, issue, fix, page, link: page + '?' + q.toString() });
  };
  const std: Record<string, number> = {}; items.forEach((r: any) => { std[String(r.chocolate_name)] = Number(r.standard_price_per_kg) || 0; });
  const st: Record<string, string> = {}; settings.forEach((r: any) => { st[r.key] = r.value; });

  // ---- chocolate batches ----
  for (const b of choc) {
    const init = String(b.delivery_note_no || '') === 'INITIAL STOCK';   // opening balance: fixed on the Initial Stock page
    const it = b.chocolate_name + (init ? ' · Initial Stock' : '') + (b.batch_no ? ` · ${b.batch_no}` : ''), piece = /piece|pc/i.test(String(b.unit || '')), eid = String(b.legacy_id || b.id);
    const PG = init ? 'initial-stock.html' : 'chocolate-receiving.html', F = (f: string) => init ? ({ eExpiryDate: 'iExpiry', eReceivedBy: 'iBy', ePrice: 'iPrice' } as Record<string, string>)[f] : f;
    if (!b.expiry_date) add('warn', 'chocolate', b.branch, it, 'No expiry date', 'Add the expiry date.', PG, eid, F('eExpiryDate'));
    else if (Number(String(b.expiry_date).slice(0, 4)) < 2020 || Number(String(b.expiry_date).slice(0, 4)) > 2100) add('bad', 'chocolate', b.branch, it, `Expiry date looks wrong: ${dmy(b.expiry_date)} (year ${String(b.expiry_date).slice(0, 4)})`, 'Fix the year of the expiry date (e.g. 2027).', PG, eid, F('eExpiryDate'));
    else if (String(b.expiry_date).slice(0, 10) < today) add('bad', 'chocolate', b.branch, it, `Expired ${dmy(b.expiry_date)} — still ${Number(b.current_stock)} ${b.unit || ''} in stock`, 'Release it as waste / expired, or fix the date.', 'chocolate-release.html');
    if (!String(b.created_by || '').trim()) add('warn', 'chocolate', b.branch, it, 'No "Entered by" name', 'Add who entered it.', PG, eid, F('eReceivedBy'));
    const ppk = Number(b.price_per_kg) || 0, ppp = Number(b.price_per_piece) || 0, w = Number(b.weight_per_piece) || 0;
    if (piece ? !ppp && !ppk : !ppk) add('warn', 'chocolate', b.branch, it, piece ? 'No price per piece' : 'No price per kg', 'Add the price so the stock value is right.', PG, eid, F('ePrice'));
    if (piece && ppp && w) {
      const perKg = ppp * 1000 / w, s = std[b.chocolate_name] || 0;
      if (perKg > Math.max(150, s * 3)) add('bad', 'chocolate', b.branch, it, `Price per piece ${ppp.toFixed(3)} BD for a ${w} g piece = ${Math.round(perKg)} BD/kg — looks like the per-kg price was typed as the piece price`, `Per piece should be about ${s ? (s * w / 1000).toFixed(3) : '?'} BD (or change the unit to Kg).`, PG, eid, F('ePrice'));
    }
  }
  // Initial Stock entered but not locked / chocolate receiving without Initial Stock
  const chocBranches = new Set<string>(choc.map((b: any) => b.branch));
  const initBranches = new Set<string>(choc.filter((b: any) => String(b.delivery_note_no || '') === 'INITIAL STOCK').map((b: any) => b.branch));
  chocCounts.forEach((r: any) => initBranches.add(r.branch));
  for (const br of chocBranches) {
    const hasInit = choc.some((b: any) => b.branch === br && String(b.delivery_note_no || '') === 'INITIAL STOCK');
    if (hasInit && String(st['Initial Stock Locked: ' + br] || '') !== 'Yes') add('warn', 'chocolate', br, 'Initial Stock', 'Initial Stock is entered but the branch is not locked yet', 'When complete, press "Lock this branch" on Initial Stock.', 'initial-stock.html');
    if (!initBranches.has(br)) add('bad', 'chocolate', br, 'Initial Stock', 'Chocolate was received but this branch has no Initial Stock / stock count', 'Enter the Initial Stock (or do a stock count) for this branch.', 'initial-stock.html');
  }

  // ---- flower ----
  const counted = new Set<string>(counts.map((r: any) => r.branch));
  const recvBranches: Record<string, number> = {};
  flowerDb.forEach((r: any) => { if (r.type !== 'Supply') recvBranches[r.branch] = (recvBranches[r.branch] || 0) + 1; });
  for (const br of Object.keys(recvBranches)) {
    if (!counted.has(br)) add('bad', 'flower', br, 'Flower Stock Count', `${recvBranches[br]} flower receiving line(s) but no Flower Stock Count yet — the stock only shows what was received`, 'Do a Flower Stock Count for this branch.', 'flower-stock-count.html');
  }
  for (const r of flowerDb) {
    if (r.type === 'Supply' || String(r.entry_date || '').slice(0, 10) < since) continue;
    const it = `${r.flower_name} · inv ${r.invoice_no || '—'} · ${dmy(r.entry_date)}`;
    if (!String(r.received_by || '').trim()) add('warn', 'flower', r.branch, it, 'No "Received by" name', 'Add who received it.', 'flower-receiving.html', String(r.legacy_id || r.id), 'eReceivedBy');
    if (!(Number(r.rate) > 0)) add('warn', 'flower', r.branch, it, 'Rate is 0', 'Add the rate from the invoice.', 'flower-receiving.html', String(r.legacy_id || r.id), 'eSupplierRate');
  }
  const order: Record<string, number> = { bad: 0, warn: 1 };
  issues.sort((a, b) => order[a.level] - order[b.level] || String(a.branch).localeCompare(String(b.branch)) || a.module.localeCompare(b.module));
  return { success: true, checkedAt: new Date().toISOString(), branch: branchSel || 'All', bad: issues.filter(i => i.level === 'bad').length, warn: issues.filter(i => i.level === 'warn').length, issues: issues.slice(0, 300) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    let p: Record<string, any> = {};
    if (req.method === 'GET') p = Object.fromEntries(new URL(req.url).searchParams.entries());
    else { const ct = req.headers.get('content-type') || ''; p = ct.includes('json') ? await req.json() : Object.fromEntries(new URLSearchParams(await req.text())); }
    if (!(await sessionUser(p.token))) return json({ success: false, error: 'Please log in again.' }, 401);
    return json(await check(String(p.branch || 'All').trim().slice(0, 40)));
  } catch (e) {
    console.error(e);
    return json({ success: false, error: 'Server error' }, 200);
  }
});
