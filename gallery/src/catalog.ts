import { entry as view0 } from "./examples/knx-group-monitor";
import { entry as view1 } from "./examples/knx-dashboard";
import { entry as view2 } from "./examples/knx-dpt-reference";
import { entry as view3 } from "./examples/knx-create-entity";
import { entry as view4 } from "./examples/knx-entities-view";
import { entry as view5 } from "./examples/knx-error";
import { entry as view6 } from "./examples/knx-create-expose";
import { entry as view7 } from "./examples/knx-expose-view";
import { entry as view8 } from "./examples/knx-info";
import { entry as view9 } from "./examples/knx-project-view";
import { entry as view10 } from "./examples/knx-frontend";
import type { GalleryEntry } from "./types";
import { entry as separator } from "./examples/knx-separator";
import { entry as entry0 } from "./examples/flex-content-expansion-panel";
import { entry as entry1 } from "./examples/knx-sticky-expansion-panel";
import { entry as entry2 } from "./examples/knx-tabs-subpage-data";
import { entry as entry3 } from "./examples/knx-tabs-subpage-data-filter-pane";
import { entry as entry4 } from "./examples/knx-tabs-subpage-data-toolbar";
import { entry as entry6 } from "./examples/knx-table-cell";
import { entry as entry7 } from "./examples/knx-table-cell-filterable";
import { entry as entry8 } from "./examples/knx-data-table-ga-label";
import { entry as entry9 } from "./examples/knx-data-table-related-label";
import { entry as entry10 } from "./examples/knx-list-filter";
import { entry as entry11 } from "./examples/knx-time-delta-filter";
import { entry as entry12 } from "./examples/knx-time-range-filter";
import { entry as entry13 } from "./examples/knx-sort-menu";
import { entry as entry14 } from "./examples/knx-sort-menu-item";
import { entry as entry15 } from "./examples/knx-form";
import { entry as entry16 } from "./examples/knx-selector-row";
import { entry as entry17 } from "./examples/knx-sync-state-selector-row";
import { entry as entry18 } from "./examples/knx-single-address-selector";
import { entry as entry19 } from "./examples/knx-group-address-selector";
import { entry as entry20 } from "./examples/knx-dpt-option-selector";
import { entry as entry21 } from "./examples/knx-dpt-dialog-selector";
import { entry as entry22 } from "./examples/knx-payload-selector";
import { entry as entry23 } from "./examples/knx-select-options-list";
import { entry as entry24 } from "./examples/knx-device-picker";
import { entry as entry25 } from "./examples/knx-configure-entity";
import { entry as entry26 } from "./examples/knx-expose-template-preview";
import { entry as entry27 } from "./examples/knx-project-device-tree";
import { entry as entry28 } from "./examples/knx-project-tree-view";
import { entry as entry29 } from "./examples/knx-project-devices-view";

import { entry as dialog0 } from "./examples/knx-device-create-dialog";

import { entry as dialog1 } from "./examples/knx-dpt-select-dialog";

import { entry as dialog2 } from "./examples/knx-ga-select-dialog";

import { entry as dialog3 } from "./examples/knx-project-upload-dialog";

import { entry as dialog4 } from "./examples/knx-send-dialog";

import { entry as dialog5 } from "./examples/knx-time-server-dialog";

import { entry as dialog6 } from "./examples/knx-group-monitor-telegram-info-dialog";

// Navigation groups are independent of the example kind used by the preview tests.
export const catalogGroups = [
  {
    id: "views",
    entries: [view0, view1, view2, view3, view4, view5, view6, view7, view8, view9, view10],
  },
  { id: "layouts", entries: [separator, entry0, entry1, entry2, entry3, entry4] },
  { id: "widgets", entries: [entry26, entry27, entry28, entry29] },
  {
    id: "inputs",
    entries: [
      entry15,
      entry16,
      entry17,
      entry18,
      entry19,
      entry20,
      entry21,
      entry22,
      entry23,
      entry24,
      entry25,
    ],
  },
  {
    id: "data",
    entries: [entry6, entry7, entry8, entry9, entry10, entry11, entry12, entry13, entry14],
  },
  { id: "dialogs", entries: [dialog0, dialog1, dialog2, dialog3, dialog4, dialog5, dialog6] },
] as const;

export type CatalogCategory = (typeof catalogGroups)[number]["id"];
export const catalog: readonly GalleryEntry[] = catalogGroups.flatMap(({ entries }) => [
  ...entries,
]);

// Curated composition links: a slot example is not an internal dependency.
// Reverse links are derived from these same entries in the inspector.
export const componentRelationships = [
  {
    from: "knx-tabs-subpage-data",
    to: "knx-tabs-subpage-data-toolbar",
    kind: "internal",
    role: "toolbar",
  },
  {
    from: "knx-tabs-subpage-data",
    to: "knx-tabs-subpage-data-filter-pane",
    kind: "internal",
    role: "filterPane",
  },
  { from: "knx-tabs-subpage-data", to: "knx-list-filter", kind: "slot", role: "filterSlot" },
  {
    from: "knx-list-filter",
    to: "flex-content-expansion-panel",
    kind: "internal",
    role: "expansion",
  },
  { from: "knx-list-filter", to: "knx-sort-menu", kind: "internal", role: "sorting" },
  { from: "knx-list-filter", to: "knx-sort-menu-item", kind: "internal", role: "sortCriterion" },
  { from: "knx-list-filter", to: "knx-separator", kind: "internal", role: "separator" },
  { from: "knx-sort-menu", to: "knx-sort-menu-item", kind: "slot", role: "sortItemSlot" },
  {
    from: "knx-time-delta-filter",
    to: "flex-content-expansion-panel",
    kind: "internal",
    role: "expansion",
  },
  {
    from: "knx-time-range-filter",
    to: "flex-content-expansion-panel",
    kind: "internal",
    role: "expansion",
  },
] as const;
