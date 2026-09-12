# Lalabella System — Modules

This directory contains functional module areas of the Lalabella System.

## Planned module boundaries

- `flower/` — flower catalog, calculator, receiving, stock, transfers, purchasing, administration
- `chocolate/` — chocolate catalog, calculator, receiving, release, barcode, administration and Odoo tools
- `inventory/` — general item inventory, stock, approvals and item administration
- `orders/` — order forms and order-related workflows
- `dashboard/` — dashboards and management views
- `printing/` — card, barcode and print-related workflows
- `admin/` — branch configuration, profile, schedules and administrative utilities
- `assistant/` — Nova assistant and chat functionality

Migration rule: preserve existing behavior and URLs first; refactor implementation only after dependencies are mapped.
