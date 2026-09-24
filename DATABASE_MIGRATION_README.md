# Lalabella Database Migration — Planning README

**Status:** Planning phase — not yet started
**Last updated:** September 2026
**Target database:** Supabase (PostgreSQL) — pending confirmation on company MS SQL Server as an alternative

---

## 1. Why we're doing this

Google Sheets was never built to be a database engine — it has no indexes and no query
optimizer. Every read (`getDataRange().getValues()`) pulls the **entire sheet** into memory,
even when only a few rows are actually needed. As the Chocolate Database, Flower Database,
and other sheets grow, every page load, dashboard, and search gets linearly slower.

A real SQL database solves this with indexing — it finds the exact rows needed without
scanning everything else. This migration is the fix for that root cause.

**Important honesty check:** the database swap alone will not fix everything. Several of the
current slowness causes are architectural (no caching, multiple sequential network round
trips per page, dashboards recomputing everything from scratch on every load) and need to be
addressed *alongside* the migration, not instead of it. This plan includes both.

---

## 2. Scope — what moves, what doesn't

| Stays as-is | Migrates to SQL |
|---|---|
| GitHub Pages frontend (HTML/JS) | All 10 Google Sheets "databases" |
| Google Apps Script as the backend layer (keeps existing URL pattern) | Auth's Users table |
| Auth token system, `auth-guard.js`, session logic | Chocolate/Flower/Item inventory data |
| Existing UI, calculators, printing | Duty Schedule, Orders, Supply Log, Notes data |

Apps Script stays as the "backend" the frontend talks to — it just switches from reading/
writing Google Sheets to calling Supabase's REST API instead. **The frontend pages, their
URLs, and how they call the backend do not change.** This keeps the blast radius contained to
the Apps Script layer only.

---

## 3. Phased approach — module by module, not all at once

Doing all 10 backends in one migration is too much risk at once. Recommended order, easiest/
lowest-risk first:

| Phase | Module | Why this order |
|---|---|---|
| 0 | Supabase account + schema setup, no live traffic yet | Foundation, zero risk to production |
| 1 | **Duty Schedule** (read-only, simple data) | Smallest, read-only, safest first migration to prove the pattern works |
| 2 | **Notes** | Simple CRUD, low business risk if something goes wrong |
| 3 | **Supply Log** | Similar complexity, more confidence built |
| 4 | **Chocolate** | Largest, most complex (locks, counters, auto-catalogue) — only after the pattern is proven on simpler modules |
| 5 | **Flower** | Similarly complex |
| 6 | **Item Inventory** | Similar |
| 7 | **Auth (Users)** | Done LAST and most carefully — this is the one module where a mistake locks everyone out of everything |
| 8 | NOVA/Joyboy, Order Assignment, Order Form | Depend on the above being done first |

Each phase = fully working and tested before starting the next. Google Sheets stays as a
live fallback for un-migrated modules throughout — nothing breaks mid-way.

---

## 4. Schema design principles

For each Sheet being migrated:

1. **Name tables in `snake_case`**, matching the Sheet's purpose (e.g., `chocolate_database`,
   `chocolate_item_list`, `chocolate_settings`).
2. **Every table gets a real primary key** (`id`, auto-incrementing or UUID) — Sheets rows
   never had this properly; SQL requires it and it's what makes indexing possible.
3. **Foreign keys where relationships exist** (e.g., a release row referencing which
   `chocolate_database.id` it drew from) — this is something Sheets could never enforce and
   is a real data-integrity upgrade, not just a speed one.
4. **Indexes on every column used in a `WHERE`** — e.g., `chocolate_database.branch`,
   `chocolate_database.chocolate_name`, since those are filtered on constantly.
5. **Timestamps** (`created_at`, `updated_at`) on every table, auto-managed by Postgres, not
   manually set by application code like the current `new Date()` calls.

---

## 5. Migration mechanics (per module)

1. Design and create the Postgres table(s) in Supabase.
2. Write a one-time export script (Apps Script function) that reads the existing Sheet and
   POSTs each row to Supabase's REST API — this becomes the migration script, run once.
3. Update the relevant backend `.gs` file's functions to read/write Supabase instead of the
   Sheet, **keeping the exact same `action=` parameter names and response shapes** the
   frontend already expects — the frontend should not need to change at all.
4. Test thoroughly against the new backend before cutting over.
5. Keep the old Sheet as a frozen, read-only backup — not deleted.

---

## 6. Addressing the "not just a database swap" problem

Alongside each module's migration, apply these — they matter as much as the SQL move itself:

- **Cache read-heavy, slow-changing data** (e.g., item catalogs, categories) instead of
  querying fresh every single time.
- **Batch related calls** — a page that currently fires 5 separate `fetch()` calls on load
  should be able to fire 1 that returns everything needed.
- **Dashboards should query pre-aggregated numbers where possible**, not recompute from every
  raw row on every single load.

---

## 7. Risk management

- **No big-bang cutover.** Each module ships independently; a problem in one doesn't take
  down the others.
- **Rollback plan per module:** since the old Sheet-based `.gs` code isn't deleted, just
  replaced in the deployed version, reverting = redeploying the previous Apps Script version
  (same "New version" mechanism already used throughout this project).
- **Auth migrates last, and gets the most testing**, since it's the single point of failure
  for the entire system if something goes wrong.

---

## 8. Open questions (need answers before Phase 0 starts)

- [ ] Confirmed: company MS SQL Server usable for this, or proceeding with Supabase?
- [ ] If Supabase: Free tier for now, or starting directly on Pro (avoids the 7-day
      inactivity pause risk from day one)?
- [ ] Who has access to the Supabase project (just you, or others on the team)?

---

## 9. Status log

*(Update this section as work actually begins — keeps a running record of what's done.)*

| Date | Module | Status | Notes |
|---|---|---|---|
| — | — | Not started | Plan drafted, awaiting company SQL Server confirmation |
