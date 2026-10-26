import { catalog } from "./catalog";
import type { GalleryEntry } from "./types";

// Shared HA controls stay available after view navigation loads other catalog entries.
const sharedBindings: Record<string, readonly string[]> = {
  "hass-tabs-subpage-data-table": [
    "filter",
    "showFilters",
    "selected",
    "_sortColumn",
    "_sortDirection",
    "_groupColumn",
    "_selectMode",
    "columnOrder",
    "hiddenColumns",
  ],
  "ha-data-table": [
    "filter",
    "_filter",
    "sortColumn",
    "sortDirection",
    "groupColumn",
    "_collapsedGroups",
    "_checkedRows",
    "_lastSelectedRowId",
    "columnOrder",
    "hiddenColumns",
  ],
  "dialog-data-table-settings": ["_columnOrder", "_hiddenColumns"],
  "ha-dropdown": ["open"],
  "ha-dialog": ["open"],
  "ha-adaptive-dialog": ["open"],
  "ha-adaptive-popover": ["open"],
  "ha-bottom-sheet": ["open"],
  "ha-expansion-panel": ["expanded"],
  "ha-generic-picker": [
    "value",
    "selectedSection",
    "_opened",
    "_pickerWrapperOpen",
    "_selectedValue",
    "_newValue",
  ],
  "ha-picker-combo-box": [
    "value",
    "selectedSection",
    "_search",
    "_items",
    "_selectedSection",
    "_valuePinned",
    "_selectedItemIndex",
  ],
  "ha-date-range-picker": ["startDate", "endDate", "_opened", "_pickerWrapperOpen"],
  "ha-input": ["value"],
  "ha-input-search": ["value"],
  "ha-textfield": ["value"],
  "ha-textarea": ["value"],
  "ha-select": ["value", "_opened"],
  "ha-checkbox": ["checked", "indeterminate"],
  "ha-switch": ["checked"],
  "ha-radio-group": ["value"],
  "ha-radio-option": ["checked"],
  "ha-slider": ["value"],
  "ha-selector": ["value"],
  "ha-selector-number": ["value"],
  "ha-selector-select": ["value"],
  "ha-selector-boolean": ["value"],
  "ha-selector-text": ["value"],
  "ha-yaml-editor": ["value", "_yaml", "isValid"],
  "ha-code-editor": ["value", "_isFullscreen"],
  input: ["value", "checked", "indeterminate"],
  textarea: ["value"],
  select: ["value", "selectedIndex"],
  details: ["open"],
};
const hostLocalProperties = [
  "hass",
  "knx",
  "narrow",
  "isWide",
  "isMobileDevice",
  "filterPaneNarrow",
];

export function composeBindings(entries: readonly GalleryEntry[]): {
  syncBindings: Record<string, readonly string[]>;
  dialogOpeners: Record<string, Record<string, string>>;
} {
  const syncBindings = { ...sharedBindings };
  const dialogOpeners: Record<string, Record<string, string>> = {};
  const owners = new Set<string>();
  for (const { meta, interaction } of entries) {
    if (owners.has(meta.tag) || meta.tag in sharedBindings) {
      throw new Error(`Conflicting interaction owners for ${meta.tag}`);
    }
    owners.add(meta.tag);
    const local = new Set([
      ...hostLocalProperties,
      ...(interaction?.localProperties ?? []),
      ...meta.controls.filter(({ target }) => target === "example").map(({ key }) => key),
      ...meta.api.filter(({ kind }) => kind === "callback").map(({ name }) => name),
    ]);
    syncBindings[meta.tag] = [
      ...new Set([
        ...(interaction?.state ?? []),
        ...meta.controls.filter(({ target }) => target === "property").map(({ key }) => key),
      ]),
    ].filter((key) => !local.has(key.split(".")[0]));
    if (interaction?.dialogOpeners) dialogOpeners[meta.tag] = { ...interaction.dialogOpeners };
  }
  return { syncBindings, dialogOpeners };
}

export const { syncBindings, dialogOpeners } = composeBindings(catalog);
