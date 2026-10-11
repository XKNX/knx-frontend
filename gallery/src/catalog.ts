import { entry as groupMonitorEntry } from "./examples/knx-group-monitor";
import { entry as dashboardEntry } from "./examples/knx-dashboard";
import { entry as dptReferenceEntry } from "./examples/knx-dpt-reference";
import { entry as createEntityEntry } from "./examples/knx-create-entity";
import { entry as entitiesViewEntry } from "./examples/knx-entities-view";
import { entry as errorEntry } from "./examples/knx-error";
import { entry as createExposeEntry } from "./examples/knx-create-expose";
import { entry as exposeViewEntry } from "./examples/knx-expose-view";
import { entry as infoEntry } from "./examples/knx-info";
import { entry as projectViewEntry } from "./examples/knx-project-view";
import { entry as frontendEntry } from "./examples/knx-frontend";
import type { GalleryEntry } from "./types";
import { entry as separatorEntry } from "./examples/knx-separator";
import { entry as flexContentExpansionPanelEntry } from "./examples/flex-content-expansion-panel";
import { entry as stickyExpansionPanelEntry } from "./examples/knx-sticky-expansion-panel";
import { entry as tabsSubpageDataEntry } from "./examples/knx-tabs-subpage-data";
import { entry as tabsSubpageDataFilterPaneEntry } from "./examples/knx-tabs-subpage-data-filter-pane";
import { entry as tabsSubpageDataToolbarEntry } from "./examples/knx-tabs-subpage-data-toolbar";
import { entry as tableCellEntry } from "./examples/knx-table-cell";
import { entry as tableCellFilterableEntry } from "./examples/knx-table-cell-filterable";
import { entry as dataTableGaLabelEntry } from "./examples/knx-data-table-ga-label";
import { entry as dataTableRelatedLabelEntry } from "./examples/knx-data-table-related-label";
import { entry as listFilterEntry } from "./examples/knx-list-filter";
import { entry as timeDeltaFilterEntry } from "./examples/knx-time-delta-filter";
import { entry as timeRangeFilterEntry } from "./examples/knx-time-range-filter";
import { entry as sortMenuEntry } from "./examples/knx-sort-menu";
import { entry as sortMenuItemEntry } from "./examples/knx-sort-menu-item";
import { entry as formEntry } from "./examples/knx-form";
import { entry as selectorRowEntry } from "./examples/knx-selector-row";
import { entry as syncStateSelectorRowEntry } from "./examples/knx-sync-state-selector-row";
import { entry as singleAddressSelectorEntry } from "./examples/knx-single-address-selector";
import { entry as groupAddressSelectorEntry } from "./examples/knx-group-address-selector";
import { entry as dptOptionSelectorEntry } from "./examples/knx-dpt-option-selector";
import { entry as dptDialogSelectorEntry } from "./examples/knx-dpt-dialog-selector";
import { entry as payloadSelectorEntry } from "./examples/knx-payload-selector";
import { entry as selectOptionsListEntry } from "./examples/knx-select-options-list";
import { entry as devicePickerEntry } from "./examples/knx-device-picker";
import { entry as configureEntityEntry } from "./examples/knx-configure-entity";
import { entry as exposeTemplatePreviewEntry } from "./examples/knx-expose-template-preview";
import { entry as projectDeviceTreeEntry } from "./examples/knx-project-device-tree";
import { entry as projectTreeViewEntry } from "./examples/knx-project-tree-view";
import { entry as projectDevicesViewEntry } from "./examples/knx-project-devices-view";

import { entry as deviceCreateDialogEntry } from "./examples/knx-device-create-dialog";

import { entry as dptSelectDialogEntry } from "./examples/knx-dpt-select-dialog";

import { entry as gaSelectDialogEntry } from "./examples/knx-ga-select-dialog";

import { entry as projectUploadDialogEntry } from "./examples/knx-project-upload-dialog";

import { entry as sendDialogEntry } from "./examples/knx-send-dialog";

import { entry as timeServerDialogEntry } from "./examples/knx-time-server-dialog";

import { entry as groupMonitorTelegramInfoDialogEntry } from "./examples/knx-group-monitor-telegram-info-dialog";

// Navigation groups are independent of the example kind used by the preview tests.
export const catalogGroups = [
  {
    id: "views",
    entries: [
      groupMonitorEntry,
      dashboardEntry,
      dptReferenceEntry,
      createEntityEntry,
      entitiesViewEntry,
      errorEntry,
      createExposeEntry,
      exposeViewEntry,
      infoEntry,
      projectViewEntry,
      frontendEntry,
    ],
  },
  {
    id: "layouts",
    entries: [
      separatorEntry,
      flexContentExpansionPanelEntry,
      stickyExpansionPanelEntry,
      tabsSubpageDataEntry,
      tabsSubpageDataFilterPaneEntry,
      tabsSubpageDataToolbarEntry,
    ],
  },
  {
    id: "widgets",
    entries: [
      exposeTemplatePreviewEntry,
      projectDeviceTreeEntry,
      projectTreeViewEntry,
      projectDevicesViewEntry,
    ],
  },
  {
    id: "inputs",
    entries: [
      formEntry,
      selectorRowEntry,
      syncStateSelectorRowEntry,
      singleAddressSelectorEntry,
      groupAddressSelectorEntry,
      dptOptionSelectorEntry,
      dptDialogSelectorEntry,
      payloadSelectorEntry,
      selectOptionsListEntry,
      devicePickerEntry,
      configureEntityEntry,
    ],
  },
  {
    id: "data",
    entries: [
      tableCellEntry,
      tableCellFilterableEntry,
      dataTableGaLabelEntry,
      dataTableRelatedLabelEntry,
      listFilterEntry,
      timeDeltaFilterEntry,
      timeRangeFilterEntry,
      sortMenuEntry,
      sortMenuItemEntry,
    ],
  },
  {
    id: "dialogs",
    entries: [
      deviceCreateDialogEntry,
      dptSelectDialogEntry,
      gaSelectDialogEntry,
      projectUploadDialogEntry,
      sendDialogEntry,
      timeServerDialogEntry,
      groupMonitorTelegramInfoDialogEntry,
    ],
  },
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
  { from: "knx-list-filter", to: "knx-separator", kind: "internal", role: "separatorEntry" },
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
