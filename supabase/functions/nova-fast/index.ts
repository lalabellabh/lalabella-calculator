// LALABELLA NOVA / JOYBOY — FAST PATH (Supabase Edge Function)
// Ported from the Nova Apps Script. Same OpenAI Responses API loop,
// same system prompt content, same tool set and page-navigation list
// (plus schedule-admin.html and user-admin.html, added since the
// original list was written). Two real changes:
//
// 1. AUTH: the original called a SEPARATE Auth Apps Script over HTTP
//    for every chat turn (fragile extra hop, and the reason a
//    debugAuth diagnostic endpoint existed). This checks the session
//    token directly against `users`, same as every other fast
//    function — no HTTP round trip, so that diagnostic isn't needed
//    here.
// 2. TOOL BACKENDS: Flower/Chocolate/Item now call THIS PROJECT'S
//    flower-fast / chocolate-fast / item-fast Edge Functions instead
//    of the old Apps Script URLs. Flower's action names matched
//    exactly (getFlowerItems, getFlowerDashboard, getRateChangeHistory,
//    getFlowerCatalogWithMinStock) and Item's did too (getItemInventory)
//    — those ported straight across. Chocolate's fast API uses
//    different action names for the same data (getItems instead of
//    getChocolateItems, getDashboardData instead of
//    getChocolateDashboard), so get_chocolate_items now also merges in
//    live per-item stock from the dashboard's itemStockLevels, since
//    the catalog action alone doesn't carry live quantities. Flower
//    and Item's query-filter params aren't supported server-side by
//    those actions either, so both are filtered here after fetching.
//
// v2 (security hardening pass): the 'chat' action used to return the
// raw err.message straight to the client on any failure — for an
// OpenAI-side error that includes OpenAI's own response text (up to
// 1200 chars of it). That never included the actual API key (OpenAI's
// error bodies don't echo the credential back), but it was more
// internal detail than an untrusted caller should see. Now every
// failure path logs the real error server-side (console.error) and
// returns one generic, fixed message to the client — matching every
// other fast function's error-handling pattern.
//
// SETUP REQUIRED: an OPENAI_API_KEY secret on this Edge Function
// (same key already in the old Apps Script's Script Properties) —
// Claude cannot set Edge Function secrets, so this has to be added in
// the Supabase dashboard (Edge Functions → Manage secrets) before
// chat will work. Never referenced anywhere in frontend code — it
// lives only as this env var, read server-side, sent only in the
// Authorization header of the outbound call to OpenAI.

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const OPENAI_MODEL = 'gpt-5-nano';

const FLOWER_FAST_URL = `${SB_URL}/functions/v1/flower-fast`;
const CHOCOLATE_FAST_URL = `${SB_URL}/functions/v1/chocolate-fast`;
const ITEM_FAST_URL = `${SB_URL}/functions/v1/item-fast`;

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

async function isValidToken(token: string) {
  const t = String(token || '').trim();
  if (!t) return false;
  const rows = await sbGet('users', `select=status,token_created&limit=1&token=eq.${encodeURIComponent(t)}`);
  const u = rows && rows[0];
  if (!u) return false;
  if (String(u.status || 'Active') === 'Inactive') return false;
  const created = u.token_created ? new Date(u.token_created).getTime() : 0;
  return !!created && Date.now() - created <= SESSION_MAX_AGE_MS;
}

// Calls one of this project's OWN fast Edge Functions as a tool backend.
// apikey lets Supabase's gateway accept the request; the downstream
// function's own session check (on `token`, forwarded from the user's
// own chat request) is what actually governs access to the data.
async function callFastApi(baseUrl: string, action: string, params: Record<string, any>, userToken: string) {
  const body: Record<string, any> = { action, token: userToken, ...params };
  try {
    const res = await fetch(baseUrl, { method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 800) };
    try { return JSON.parse(text); } catch { return { ok: false, error: 'Non-JSON response', raw: text.slice(0, 500) }; }
  } catch (err: any) {
    return { ok: false, error: String(err) };
  }
}
function textMatches(haystack: any, query: string) {
  return String(haystack || '').toLowerCase().includes(String(query || '').toLowerCase());
}

/**
 * Main NOVA loop:
 * 1. Build a system prompt from live page context + conversation session.
 * 2. Ask the model what the user means.
 * 3. Let the model call controlled tool functions.
 * 4. Execute those tools against this project's own fast APIs.
 * 5. Give tool results back to the model for the final answer.
 */
async function novaChat(message: string, session: any, context: any, userToken: string) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured as an Edge Function secret.');

  const system = buildSystemPrompt(context, session);
  let input: any[] = [{ role: 'user', content: message }];
  const tools = buildTools();
  let navigateTo: string | null = null;

  for (let round = 0; round < 4; round++) {
    const response = await openAIResponses(system, input, tools);
    const output = response.output || [];
    const functionCalls = output.filter((x: any) => x.type === 'function_call');

    if (!functionCalls.length) {
      return { ok: true, text: extractOutputText(response) || 'Sorry Boss, I could not produce a response.', navigateTo, session };
    }

    input = input.concat(output);

    for (const call of functionCalls) {
      const args = JSON.parse(call.arguments || '{}');
      const toolResult = await executeTool(call.name, args, session, userToken);
      if (call.name === 'navigate_to_page' && toolResult.page) navigateTo = toolResult.page;
      input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(toolResult) });
    }
  }

  return { ok: true, text: 'Boss, kailangan ko munang tapusin ang data check bago ako makasagot.', navigateTo, session };
}

function extractOutputText(response: any) {
  if (response && response.output_text) return response.output_text;
  const output = (response && response.output) || [];
  const parts: string[] = [];
  output.forEach((item: any) => {
    if (item.type === 'message' && Array.isArray(item.content)) {
      item.content.forEach((block: any) => { if (block.type === 'output_text' && block.text) parts.push(block.text); });
    }
  });
  return parts.join('\n').trim();
}

function buildSystemPrompt(context: any, session: any) {
  return [
    'You are Joyboy, the AI brain of the Lalabella business system — a Bahrain flower/chocolate/gift boutique with three branches: ModaMall, Hamala, and Galali.',
    'Speak naturally in clear, concise ENGLISH ONLY — never mix in Tagalog or Filipino words, even casually. Friendly and professional tone.',
    'Call the user Boss when appropriate.',
    '',
    'SYSTEM KNOWLEDGE — you can explain any of this when asked, not just execute actions:',
    '- The whole system is a set of standalone HTML pages hosted on GitHub Pages, backed by fast Supabase Edge Functions, each talking to a shared Supabase (Postgres) database.',
    '- Three main areas: Chocolate (calculator, receiving, release, admin, barcode, dashboard, stock count/approval, arrangement catalog), Flower (calculator, receiving, transfer, admin, barcode, dashboard, catalog, purchase, stock count), and Item Inventory (general supplies like ribbon/vases/packaging, with its own admin/dashboard).',
    '- "Chocolate Arrangements" (chocolate-arrangements.html) is a reference catalog of named box recipes (e.g. "Deluxe Box A") — each has a barcode, a list of chocolates + quantities, who designed it, and an optional photo. Scanning that barcode on the Chocolate Release page auto-fills the release cart with the recipe\'s items, picking the batch with the soonest expiry that has enough stock for each one. The catalog itself never touches live stock — only the actual Release action does that.',
    '- "Petty Cash & Cash" (petty-cash.html) has two tabs: Petty Cash (log expenses and top-ups per branch, with a settable target/float amount, e.g. 150 BD for ModaMall) and Cash (log the end-of-day cash count broken down by note/coin denomination, then mark it as sent to Qalali branch, which removes it from the on-hand balance). Printing a cash count also prints that branch\'s petty cash history below it, so both can be reconciled together.',
    '- Duty Schedule (schedule.html) shows each staff member\'s weekly shifts and days off on a real calendar; admins can upload a weekly schedule PDF on schedule-admin.html.',
    '- Every backend requires a login token from the shared Auth system; a user only needs to log in once across the whole site.',
    '- The database runs on Supabase — Google Sheets are no longer read or written by any live part of the system.',
    '',
    'IMPORTANT:',
    '- Never invent live inventory, prices, purchases, dashboard values, or item names.',
    '- Use the provided tools for live data — get_flower_* tools for Flower, get_chocolate_* tools for Chocolate, get_item_inventory for Item Inventory.',
    '- Do not create a second database.',
    '- Never change permanent data unless an explicit write tool exists and the user clearly asks to save/change it.',
    '- For stock counting, guide the user one flower at a time and keep the count session in conversation context.',
    '- If an item name is ambiguous, ask for clarification instead of guessing.',
    '- Corrections such as "change that to 28" should update the current temporary count.',
    '- Before permanent inventory save, confirm the final count set with the user.',
    '- The existing FlowerItem master is the source of truth for Item Code, Origin, Unit, Stems per Bunch and Company Rate.',
    '- Company Rate changes require explicit admin approval.',
    '- When the user asks to open, go to, or show a page/tool (e.g. "open the dashboard", "show me inventory"), call navigate_to_page with the matching page from the allowed list — never just describe the page in words when the user is clearly asking you to open it.',
    '- When the user asks a question about how the system works, what a feature does, or why something is built a certain way, answer directly from the SYSTEM KNOWLEDGE above — don\'t deflect to navigation unless they also want to actually open something.',
    '',
    'CURRENT PAGE CONTEXT:',
    JSON.stringify(context || {}),
    '',
    'SESSION:',
    JSON.stringify(session || {}),
  ].join('\n');
}

function buildTools() {
  return [
    {
      type: 'function', name: 'navigate_to_page',
      description: 'Opens a specific page in the Lalabella system for the user, e.g. when they ask to open the dashboard, inventory, receiving, or another tool. Only use one of the exact page values listed — never invent a page that is not in the list.',
      parameters: { type: 'object', properties: { page: { type: 'string', description: 'The exact page to open.', enum: [
        'index.html', 'chocolate-calc.html', 'chocolate-admin.html', 'chocolate-barcode.html',
        'chocolate-guide.html', 'chocolate-odoo-import.html', 'chocolate-receiving.html',
        'chocolate-release.html', 'chocolate-arrangements.html', 'dashboard.html',
        'stock-count.html', 'stock-approval.html', 'initial-stock.html',
        'flower-tools.html', 'flower-calc.html', 'flower-admin.html',
        'flower-barcode.html', 'flower-catalog.html', 'flower-dashboard.html', 'flower-guide.html',
        'flower-odoo-import.html', 'flower-purchase.html', 'flower-receiving.html',
        'flower-stock-count.html', 'flower-transfer.html', 'item-inventory.html', 'item-admin.html',
        'item-dashboard.html', 'item-odoo-import.html', 'order-form.html', 'card-print.html',
        'notes.html', 'chatbox.html', 'branch-config.html', 'profile.html',
        'schedule.html', 'schedule-admin.html', 'petty-cash.html', 'user-admin.html',
      ] } }, required: ['page'], additionalProperties: false }, strict: true,
    },
    { type: 'function', name: 'get_flower_items', description: 'Get live FlowerItem master data. Use this to resolve flowers, origins, units, stems and company rates.',
      parameters: { type: 'object', properties: { query: { type: ['string', 'null'], description: 'Optional flower search text. Pass null if not searching for a specific flower.' } }, required: ['query'], additionalProperties: false }, strict: true },
    { type: 'function', name: 'get_dashboard', description: 'Get live dashboard information, optionally filtered by branch.',
      parameters: { type: 'object', properties: { branch: { type: ['string', 'null'], description: 'All, ModaMall, Hamala, or Galali. Pass null for all branches.' } }, required: ['branch'], additionalProperties: false }, strict: true },
    { type: 'function', name: 'get_flower_catalog', description: 'Get live flower catalog and minimum stock settings.',
      parameters: { type: 'object', properties: { query: { type: ['string', 'null'], description: 'Optional flower search text. Pass null if not searching for a specific flower.' } }, required: ['query'], additionalProperties: false }, strict: true },
    { type: 'function', name: 'get_rate_history', description: 'Get live rate-change history for management review.', parameters: { type: 'object', properties: {}, required: [], additionalProperties: false }, strict: true },
    { type: 'function', name: 'get_chocolate_items', description: 'Get live Chocolate item/catalog data — stock quantities, product codes, prices.',
      parameters: { type: 'object', properties: { query: { type: ['string', 'null'], description: 'Optional chocolate item search text. Pass null if not searching for a specific item.' } }, required: ['query'], additionalProperties: false }, strict: true },
    { type: 'function', name: 'get_chocolate_dashboard', description: 'Get live Chocolate dashboard information — stock levels, alerts, operational overview.', parameters: { type: 'object', properties: {}, required: [], additionalProperties: false }, strict: true },
    { type: 'function', name: 'get_item_inventory', description: 'Get live Item Inventory data — ribbon, vases, packaging, and fixed assets, with stock quantities per branch.',
      parameters: { type: 'object', properties: { branch: { type: ['string', 'null'], description: 'ModaMall, Hamala, or Galali. Pass null for all branches.' }, query: { type: ['string', 'null'], description: 'Optional item name search text. Pass null if not searching for a specific item.' } }, required: ['branch', 'query'], additionalProperties: false }, strict: true },
    { type: 'function', name: 'start_inventory_session', description: 'Start a temporary conversational physical stock-count session. This does not permanently save anything.',
      parameters: { type: 'object', properties: { branch: { type: ['string', 'null'], description: 'Branch being counted. Pass null if not yet known.' }, date: { type: ['string', 'null'], description: 'Count date in YYYY-MM-DD if known, otherwise null.' } }, required: ['branch', 'date'], additionalProperties: false }, strict: true },
  ];
}

async function executeTool(name: string, args: any, session: any, userToken: string) {
  switch (name) {
    case 'navigate_to_page':
      return { navigating: true, page: args.page };
    case 'get_flower_items': {
      const rows = await callFastApi(FLOWER_FAST_URL, 'getFlowerItems', {}, userToken);
      if (!Array.isArray(rows)) return rows;
      return args.query ? rows.filter((r: any) => textMatches(r['Flowers'], args.query)) : rows;
    }
    case 'get_dashboard':
      return await callFastApi(FLOWER_FAST_URL, 'getFlowerDashboard', { branch: args.branch || 'All' }, userToken);
    case 'get_flower_catalog': {
      const rows = await callFastApi(FLOWER_FAST_URL, 'getFlowerCatalogWithMinStock', {}, userToken);
      if (!Array.isArray(rows)) return rows;
      return args.query ? rows.filter((r: any) => textMatches(r.name, args.query)) : rows;
    }
    case 'get_rate_history':
      return await callFastApi(FLOWER_FAST_URL, 'getRateChangeHistory', {}, userToken);
    case 'get_chocolate_items': {
      const [items, dash] = await Promise.all([
        callFastApi(CHOCOLATE_FAST_URL, 'getItems', {}, userToken),
        callFastApi(CHOCOLATE_FAST_URL, 'getDashboardData', { branch: 'All' }, userToken),
      ]);
      if (!Array.isArray(items)) return items;
      const stockByName: Record<string, any> = {};
      ((dash && dash.itemStockLevels) || []).forEach((s: any) => { stockByName[String(s.name || '').trim().toLowerCase()] = s; });
      let merged = items.map((it: any) => {
        const key = String(it['Chocolate Name'] || '').trim().toLowerCase();
        const stockInfo = stockByName[key];
        return { ...it, LiveStock: stockInfo ? stockInfo.stock : null, StockUnit: stockInfo ? stockInfo.unit : null };
      });
      if (args.query) merged = merged.filter((it: any) => textMatches(it['Chocolate Name'], args.query));
      return merged;
    }
    case 'get_chocolate_dashboard':
      return await callFastApi(CHOCOLATE_FAST_URL, 'getDashboardData', { branch: 'All' }, userToken);
    case 'get_item_inventory': {
      const rows = await callFastApi(ITEM_FAST_URL, 'getItemInventory', { branch: args.branch || 'All' }, userToken);
      if (!Array.isArray(rows)) return rows;
      return args.query ? rows.filter((r: any) => textMatches(r['Item Name'], args.query)) : rows;
    }
    case 'start_inventory_session':
      return { started: true, temporary: true, branch: args.branch || '', date: args.date || '', counts: {} };
    default:
      return { error: 'Unknown tool: ' + name };
  }
}

async function openAIResponses(system: string, input: any[], tools: any[]) {
  const payload = { model: OPENAI_MODEL, store: false, instructions: system, input, tools };
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 1200)}`);
  return JSON.parse(text);
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

    if (action === 'chat') {
      try {
        if (!(await isValidToken(p.token))) return json({ ok: false, error: 'Unauthorized. Please log in again.' });
        const message = String(p.message || '').trim();
        if (!message) return json({ ok: false, error: 'message is required' });
        let session = {}, context = {};
        try { session = typeof p.session === 'string' ? JSON.parse(p.session || '{}') : (p.session || {}); } catch { session = {}; }
        try { context = typeof p.context === 'string' ? JSON.parse(p.context || '{}') : (p.context || {}); } catch { context = {}; }
        const result = await novaChat(message, session, context, p.token);
        return json(result);
      } catch (err: any) {
        console.error('[nova chat]', err);
        return json({ ok: false, error: 'Sorry Boss, something went wrong on my end. Please try again.' });
      }
    }

    return json({ ok: true, service: 'NOVA API', version: '2.1-fast', message: 'NOVA backend is online (Supabase Edge Function).' });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'Server error. Please try again.' }, 500);
  }
});
