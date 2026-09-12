# Module Segregation

The `lalabella-system` branch uses a domain-based module layout while preserving the existing production URLs.

## Module groups

- `modules/flower/` — flower workflows
- `modules/chocolate/` — chocolate workflows
- `modules/inventory/` — general inventory workflows
- `modules/orders/` — order workflows
- `modules/dashboard/` — global dashboard
- `modules/printing/` — card printing
- `modules/admin/` — administrative pages
- `modules/assistant/` — Nova / chat pages

## Compatibility strategy

The original root-level HTML entry points are kept as tiny redirect stubs. This keeps existing bookmarks, old menu links, and external references working while the real source files live under `modules/`.

The relocated pages load a small module compatibility guard which:

1. loads the existing root authentication guard;
2. establishes the root as the base URL for copied pages;
3. normalizes internal HTML links to root URLs;
4. protects keyboard-driven navigation used by interactive tools; and
5. fixes the common inline logout redirect to use the root URL.

Exact pre-segregation source files are also retained under `legacy/` as a rollback/reference layer.

## Important boundary

The source code inside the functional modules is intentionally still the existing working page code. We are not rewriting business calculations, API contracts, printing logic, or authentication behavior as part of this URL/layout repair. Further refactoring should happen only after the new deployment is tested page-by-page.

`main` remains untouched; all segregation and repair work is isolated to `lalabella-system` until the new URL is fully validated.
