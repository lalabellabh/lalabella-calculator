# Database & Data Migration

## Current Data Path

Several existing modules still use Google Apps Script as the application API with Google Sheets behind it.

Supabase/PostgreSQL exists as the planned long-term database platform.

## Migration Rule

Do not replace an Apps Script URL with a Supabase query blindly.

For each feature:

1. Identify the current UI action.
2. Identify the Apps Script action/endpoint it calls.
3. Identify the source and destination data.
4. Map the data to the Supabase schema.
5. Reproduce validation and business rules.
6. Add authentication and authorization.
7. Test normal, empty, invalid, and failure cases.
8. Only then switch the feature to Supabase.

## Security Baseline

Supabase tables must use appropriate Row Level Security policies and least-privilege access. Service-role credentials must remain server-side and must never be exposed in browser code.

Database functions must also be reviewed for safe search paths, execution privileges, and authorization boundaries before production use.

## Data Integrity

The migration should establish appropriate relationships and constraints where the business model requires them. Existing data must be validated before adding constraints that could break production workflows.

## Performance

Database performance should be measured using actual application queries. Avoid premature optimization. The current system's observed latency risk is not limited to PostgreSQL; network calls, Apps Script execution, authentication checks, and browser rendering can dominate page load time.

## Migration Status

- [ ] Inventory all existing data sources
- [ ] Map every Apps Script action
- [ ] Confirm Supabase table ownership/domain mapping
- [ ] Define RLS policies
- [ ] Define roles and permissions
- [ ] Add required relationships/constraints
- [ ] Create server-side API boundary where needed
- [ ] Migrate one module at a time
- [ ] Regression-test each migrated module
- [ ] Retire old Apps Script paths only after verification
