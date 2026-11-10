import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REPO = 'lalabellabh/lalabella-calculator';
const TITLE = 'Auto change log (GitHub)';

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // Security audit 2026-11-10: only the cron (internal key) may run this.
    let body: any = {}; try { body = await req.json(); } catch { body = {}; }
    const { data: kr } = await sb.from('push_config').select('internal_key').eq('id', 1).limit(1);
    const ik = kr && kr[0] && kr[0].internal_key;
    if (!ik || String(body.key || '') !== String(ik)) return json({ ok: false, error: 'Unauthorized.' }, 401);
    const gh = { headers: { 'accept': 'application/vnd.github+json', 'user-agent': 'lalabella-brain' } };
    const r = await fetch('https://api.github.com/repos/' + REPO + '/commits?per_page=15', gh);
    if (!r.ok) return json({ ok: false, step: 'list', status: r.status, text: (await r.text()).slice(0, 200) }, 200);
    const list = await r.json();
    const { data: rows } = await sb.from('brain_notes').select('id,body').eq('title', TITLE).limit(1);
    const note = rows && rows[0];
    const body0: string = note ? note.body : '';
    const fresh = list.filter((c: any) => !body0.includes(c.sha.slice(0, 7)));
    if (!fresh.length) return json({ ok: true, added: 0 });
    const lines: string[] = [];
    for (const c of fresh.reverse()) {
      let files = '';
      try {
        const d = await (await fetch('https://api.github.com/repos/' + REPO + '/commits/' + c.sha, gh)).json();
        files = (d.files || []).map((f: any) => f.filename).slice(0, 12).join(', ');
      } catch (_) { /* ignore */ }
      const when = new Date(c.commit.author.date).toLocaleString('en-GB', { timeZone: 'Asia/Bahrain' });
      const msg = String(c.commit.message).split('\n')[0].slice(0, 100);
      lines.push('- ' + when + ' [' + c.sha.slice(0, 7) + '] ' + msg + (files ? ' :: ' + files : ''));
    }
    const nb = (lines.reverse().join('\n') + (body0 ? '\n' + body0 : '')).slice(0, 30000);
    if (note) await sb.from('brain_notes').update({ body: nb, updated_at: new Date().toISOString(), updated_by: 'auto' }).eq('id', note.id);
    else await sb.from('brain_notes').insert({ title: TITLE, body: nb, tags: ['auto', 'changelog'], updated_by: 'auto' });
    return json({ ok: true, added: lines.length });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});
