# Lalabella — Recovery guide (if the system is down or lost)

Nothing here contains passwords or keys. Keep it simple, go top to bottom.

## What is saved, and where
| What | Where | How fresh |
|---|---|---|
| Website pages (all `.html`, `shared/`) | this GitHub repo (GitHub Pages: mysystemlla.com) | every push |
| Server function code (Edge Functions) | `supabase/functions/<name>/index.ts` in this repo (secrets are replaced by `REDACTED_SET_IN_SUPABASE`) | when last exported |
| All data + database structure | Supabase Storage, private bucket `db-backups`, file `lalabella-YYYY-MM-DD.json.gz`, every night 2:00 AM Bahrain, newest 14 kept | daily |
| Change history (what was added/edited/deleted) | table `audit.log` in Supabase (not part of the nightly file; it is the "who changed what" trail) | live |
| Bug history | Activity History → Errors | live |

**Rule:** after any big work, open **Activity History → Backups → Download** and keep one file on your computer/phone (and one in Drive). If Supabase itself disappears, the copy inside Supabase disappears too — your own copy is the real safety.

## A) Something was deleted or changed by mistake
Activity History → search the item → **Put it back** / **Undo this change**.

## B) The system is down but you need information now
Open `https://mysystemlla.com/emergency.html` (or open the file from the repo), choose your downloaded backup file. You can search stock, rates, items, staff, orders and export to CSV/print. Read-only.

## C) The whole Supabase project is lost → rebuild
1. Create a new Supabase project (same region if possible).
2. On a computer with Node.js: `node tools/restore-backup.mjs lalabella-YYYY-MM-DD.json.gz --schema-out schema.sql`
3. Open the new project → SQL editor → paste `schema.sql` → Run (creates tables, indexes, security rules, triggers, scheduled jobs, buckets). If a statement errors, run the rest and fix that one by hand.
4. In YOUR terminal (not in chat): set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` of the new project, then `node tools/restore-backup.mjs lalabella-YYYY-MM-DD.json.gz --load`.
5. Deploy every function from `supabase/functions/*` (Supabase dashboard → Edge Functions, verify_jwt **off**, same names). Fill each `REDACTED_SET_IN_SUPABASE` with the real value (or ask Claude to help; secrets are never pasted in chat or git).
6. Put the new project URL into `shared/config.js` (all `*.supabase.co` addresses + the publishable key) and push to GitHub.
7. Photos in Storage buckets are not in the nightly file — they must be re-uploaded if lost.
8. Everyone logs in again (sessions are not backed up on purpose).

## D) The website (GitHub Pages) is down
The data is safe in Supabase. Use `emergency.html` from a local copy of the repo, or re-enable Pages in the repo settings (branch `main`, root).
