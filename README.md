# Lalabella System

A business operations system for Lalabella, covering flower, chocolate, inventory, purchasing, receiving, transfers, dashboards, orders, printing, staff tools, and related utilities.

> **Development branch:** `lalabella-system`
>
> The production `main` branch is intentionally preserved while this branch is being reorganized and modernized.

## Project Status

This branch is the controlled development workspace for the next generation of Lalabella System.

The existing application is currently a hybrid web system. Some modules use Google Apps Script and Google Sheets, while Supabase/PostgreSQL is being prepared as the future database platform.

**Important:** Do not treat this branch as production until a migration and regression review has been completed.

## Current Architecture

```text
Browser
   |
   +--> HTML / JavaScript modules
   |
   +--> Google Apps Script API
   |        |
   |        +--> Google Sheets
   |
   +--> Supabase (migration / future architecture)
```

## Main Modules

### Flowers
- Flower calculator
- Flower catalog
- Flower administration
- Flower receiving
- Flower purchasing
- Flower stock count
- Flower transfers
- Flower barcode
- Flower dashboard
- Flower tools
- Initial stock
- Flower Odoo import

### Chocolate
- Chocolate calculator
- Chocolate administration
- Chocolate receiving
- Chocolate release
- Chocolate barcode
- Chocolate guide
- Chocolate Odoo import

### General Operations
- Main dashboard
- Order form
- Item inventory
- Item administration
- Item dashboard
- Item Odoo import
- Branch configuration
- Staff schedule
- Profile
- Notes
- Chatbox
- Nova assistant / command center
- Card printing

## Repository Organization

The current repository is being migrated from a flat collection of HTML applications toward a maintainable structure.

Planned foundation:

```text
/
├── README.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── AUTH.md
│   ├── DEPLOYMENT.md
│   └── CHANGELOG.md
├── assets/
│   ├── css/
│   ├── js/
│   └── images/
├── shared/
├── stickers/
└── application pages
```

Existing working pages will be moved or refactored gradually. Files must not be moved or deleted solely for appearance; dependencies and navigation must be checked first.

## Development Rules

1. **Protect production.** Never make experimental changes directly on `main`.
2. **Work on `lalabella-system`.** Changes should be small, reviewable, and reversible.
3. **Inspect before refactoring.** Understand dependencies, API calls, shared scripts, storage, printing, and navigation before moving code.
4. **Preserve behavior.** A folder cleanup must not silently change business calculations or workflows.
5. **No destructive database changes during frontend reorganization.** Supabase migration and security work will be staged separately.
6. **Keep secrets out of source control.** API keys, service-role keys, passwords, and private credentials must never be committed.
7. **Document important architectural decisions.** Update the relevant file under `docs/` when behavior or architecture changes.

## Performance Direction

Known sources of potential slowness include large monolithic HTML files, repeated network/authentication calls, Google Apps Script latency, and heavy browser animations/effects.

The modernization plan is to:

- reduce duplicated frontend code;
- extract reusable CSS and JavaScript;
- reduce unnecessary page-load work;
- centralize API communication;
- avoid repeated authentication checks;
- lazy-load non-critical features;
- preserve printing and business workflows;
- migrate data access to a properly secured Supabase API layer in stages.

## Database Direction

Supabase/PostgreSQL is the planned long-term data platform. The migration must map each existing application action to the appropriate database table or server-side function rather than simply replacing URLs.

Security requirements include proper Row Level Security policies, least-privilege grants, protected server-side credentials, and controlled database functions.

See `docs/DATABASE.md` for the migration notes.

## Licensing / Ownership Readiness

This repository is being documented so the system can later be packaged, licensed, transferred, or commercialized under terms selected by the owner.

**No specific open-source license is applied by this README.** Licensing terms should be added only after the owner chooses the intended legal model.

Until explicit licensing terms are added, do not assume that source code is freely reusable, resellable, or sublicensable.

## Versioning

Changes should be recorded in `docs/CHANGELOG.md` as the system evolves.

Recommended release format:

```text
MAJOR.MINOR.PATCH
```

Example: `1.0.0`

## Copyright

Copyright © Lalabella. All rights reserved unless a separate written license states otherwise.

## Maintainer Notes

This project is actively being reorganized. The documentation is intentionally part of the system so future developers, maintainers, or licensees can understand the architecture without depending on private chat history.
