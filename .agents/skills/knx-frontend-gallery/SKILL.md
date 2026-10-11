---
name: knx-frontend-gallery
description: Use when adding or changing KNX frontend components, dialogs, views, or their gallery examples, especially public interfaces, supported states, fixtures, or interaction behavior.
---

# KNX frontend gallery

For every component, dialog or view implementation, inspect affected examples.
Create an example for a new production custom element; update affected examples
when public interfaces, supported states or interaction behavior change.
Read product sources and actual callers; demonstrate realistic KNX tasks.

Follow the maintained [Gallery README](../../../gallery/README.md) for authoring,
fixture outcomes, Compare synchronization, checks and Pages setup. Start from the
smallest matching example:

- [DPT option selector](../../../gallery/src/examples/knx-dpt-option-selector.ts):
  controlled inputs, supplied options and observed events.
- [DPT select dialog](../../../gallery/src/examples/knx-dpt-select-dialog.ts):
  dialog host, local callback adapter and failed/empty states.
- [Project view](../../../gallery/src/examples/knx-project-view.ts):
  view host with explicit missing/empty project and endpoint failures.

Use descriptive catalog import names. After editing an example, verify that every
property, callback, slot and supported failure state still matches its product source.
Use `defineExample`, register coverage in the catalog and preserve IDs/scenario URLs.
Product code must never import Gallery code. Reuse existing fixtures/hosts and
accepted outcomes; synchronize state without replaying services or callbacks.

Use Node from `.nvmrc`. Default `pnpm test`, `pnpm lint` and `pnpm lint:types`
include Gallery; coverage remains product-only. Focus checks with `pnpm gallery:unit`,
`pnpm gallery:lint` and `pnpm gallery:types`. `pnpm gallery:integration` prepares
inputs and verifies the standalone bundle separately from unit tests;
`pnpm gallery:build` checks optimized output and thumbnails. Inspect actual rendering,
usage and Compare when applicable, and report incomplete or failing checks.
