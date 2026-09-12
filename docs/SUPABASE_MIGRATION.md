# Lalabella — Supabase Migration

## Target architecture

`GitHub Pages / Web App → Supabase Auth + Data API / Edge Functions → PostgreSQL + RLS`

Google Sheets and Google Apps Script are **not part of the target runtime**.

## Safety rules

- `supabase-config.js` contains only the Supabase publishable key.
- Never commit a Supabase secret/service-role key, database password, OpenAI key, or other privileged credential.
- Browser data access must be protected by PostgreSQL Row Level Security (RLS).
- Privileged operations and AI/OpenAI calls belong in Supabase Edge Functions or another trusted backend.
- The old `lalabella-db` project remains untouched during this migration.
- The legacy Apps Script backends remain available only as the old production system until each module has a tested Supabase replacement. They must not be reintroduced as a dependency of the migrated runtime.

## Authentication

The new project uses Supabase Auth. `public.profiles.id` maps to `auth.users.id` and stores application-level role and branch information.

Supported application roles currently represented by the migration foundation:

- `Admin`
- `Manager`
- `Staff`

The old custom password hashes and session tokens are deliberately **not** copied into the new authentication system.

## Migration order

1. Create and verify Supabase Auth/profile model.
2. Migrate non-sensitive catalog/configuration/business data.
3. Implement module APIs against the new project.
4. Add least-privilege RLS policies per table and operation.
5. Move privileged actions to Edge Functions.
6. Replace each HTML module's Apps Script URL with the Supabase implementation.
7. Browser-test login, catalog reads/writes, inventory, chocolate, flower, orders, duty schedule, printing, and Nova.
8. Only after all required modules pass testing should the migrated branch become the production candidate.

## Current state

- New project: `Lalabella System`
- Project ref: `cscsgvqmanllgnxskmel`
- Schema cloned from the legacy Supabase database.
- Legacy Supabase database is not modified.
- Supabase Auth profile foundation is installed.
- Business data migration is intentionally staged; old authentication secrets/tokens are excluded.
- Browser modules are not yet switched to Supabase until their replacement API is implemented and tested.
