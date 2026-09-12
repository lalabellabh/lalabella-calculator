# Module Segregation

The `lalabella-system` branch now uses a domain-based module layout while preserving legacy URLs.

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

The original root-level HTML entry points were replaced with tiny redirect stubs. This keeps existing bookmarks, old menu links, and external references working while the real source files live under `modules/`.

Exact pre-segregation source blobs are also retained under `legacy/` as a rollback/reference layer. Git stores identical blobs only once, so this does not duplicate the file contents in object storage.

## Important boundary

This phase intentionally preserves the original page source code. Internal relative paths inside the monolithic pages have not yet been normalized into the new module-relative layout. That is the next refactor step and should be done page-by-page after dependency mapping, so authentication, printing, API calls, stickers, and navigation are not accidentally broken.

`main` remains untouched; all segregation work is isolated to `lalabella-system`.
