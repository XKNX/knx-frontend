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

Use `defineExample`, register coverage in the catalog and preserve IDs/scenario URLs.
Product code must never import Gallery code. Reuse existing fixtures/hosts and
accepted outcomes; synchronize state without replaying services or callbacks.

Use Node from `.nvmrc`. Default `pnpm test`, `pnpm lint` and `pnpm lint:types`
include Gallery; coverage remains product-only. For focused checks, run
`pnpm gallery:unit`, `pnpm gallery:lint` and `pnpm gallery:types` using the same
shared configuration. Keep exact-head publication checks unconditional.
Focus `pnpm gallery:test --workers=2 --grep ...` on affected examples and interactions. Inspect actual rendering and usage, including Compare
when applicable. `pnpm gallery:build` verifies standalone output and thumbnails.
Report checks not completed or still failing; retain the full suite for publication.
