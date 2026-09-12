# Architecture

## Current State

Lalabella System is currently a hybrid browser application.

```text
HTML / JavaScript
      |
      +---- Google Apps Script ---- Google Sheets
      |
      +---- Supabase / PostgreSQL (migration path)
```

The existing pages are independent HTML applications with some shared JavaScript and CSS. `shared/` contains reusable code already extracted from earlier development.

## Target State

The long-term architecture is:

```text
Browser
   |
   v
Shared frontend API layer
   |
   +--> authenticated server/API boundary
   |
   v
Supabase / PostgreSQL
```

Google Apps Script should be retired module-by-module only after equivalent behavior is implemented and tested.

## Refactoring Principles

- Keep business logic behavior stable.
- Extract shared functionality before duplicating it.
- Separate presentation, application logic, and data access where practical.
- Prefer lazy loading for non-critical features.
- Keep printing workflows isolated from normal page rendering.
- Avoid loading large libraries on pages that do not use them.
- Do not perform destructive migrations while frontend work is in progress.

## Module Boundaries

The system should eventually be organized around these domains:

- Flowers
- Chocolate
- Items / Inventory
- Orders
- Purchasing / Receiving
- Staff / Scheduling
- Dashboards
- Printing
- Authentication
- Administration
- Assistant / Utilities

## Performance Notes

Large monolithic HTML files and repeated network/authentication calls are known risk areas. Refactoring should prioritize the pages with the largest payloads and the most expensive startup behavior.

## Change Control

Every architectural change should be made on a development branch and documented before it is considered for production.
