#!/usr/bin/env node
// LALABELLA — restore a backup file into a (new) Supabase project.
//   1) node tools/restore-backup.mjs lalabella-2026-11-01.json.gz --schema-out schema.sql
//        -> writes the database structure to schema.sql. Paste/run it in the NEW project's SQL editor.
//   2) set the two values in YOUR OWN terminal (never in chat / never in git):
//        SUPABASE_URL=https://<new-project>.supabase.co   SUPABASE_SERVICE_KEY=<service role key>
//      node tools/restore-backup.mjs lalabella-2026-11-01.json.gz --load
//        -> puts every table's rows back (safe to run twice: existing rows are merged by primary key).
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [file, ...flags] = process.argv.slice(2);
if (!file) { console.log('Usage: node tools/restore-backup.mjs <backup.json.gz> [--schema-out schema.sql] [--load]'); process.exit(1); }
const raw = readFileSync(file);
const data = JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString('utf8'));
console.log(`Backup of ${data.exportedAt}: ${data.tableCount} tables, ${data.rowsTotal} rows`);

const so = flags.indexOf('--schema-out');
if (so > -1) { writeFileSync(flags[so + 1] || 'schema.sql', data.schema || '-- no schema in this backup'); console.log('Wrote', flags[so + 1] || 'schema.sql'); }

if (flags.includes('--load')) {
  const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!URL_ || !KEY) { console.log('Set SUPABASE_URL and SUPABASE_SERVICE_KEY first.'); process.exit(1); }
  let pending = Object.keys(data.tables).filter(t => data.tables[t].length);
  for (let pass = 1; pass <= 4 && pending.length; pass++) {            // several passes: foreign keys may need other tables first
    const failed = [];
    for (const t of pending) {
      const rows = data.tables[t]; let ok = true;
      for (let i = 0; i < rows.length && ok; i += 400) {
        const r = await fetch(`${URL_}/rest/v1/${t}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 400)) });
        if (!r.ok) { ok = false; if (pass === 4) console.log(`  ${t}: ${r.status} ${(await r.text()).slice(0, 160)}`); }
      }
      if (ok) console.log(`  ✔ ${t} (${rows.length})`); else failed.push(t);
    }
    pending = failed;
  }
  console.log(pending.length ? 'Still failing: ' + pending.join(', ') : 'All tables restored.');
}
