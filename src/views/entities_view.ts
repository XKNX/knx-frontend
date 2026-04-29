import {
  mdiDelete,
  mdiInformationOffOutline,
  mdiInformationSlabCircleOutline,
  mdiPencilOutline,
  mdiPlus,
} from "@mdi/js";

import { consume } from "@lit/context";
import type { TemplateResult } from "lit";
import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";

import type { HassEntity } from "home-assistant-js-websocket";
import memoize from "memoize-one";

import "@ha/components/data-table/ha-data-table-labels";
import "@ha/components/ha-alert";
import "@ha/components/ha-button";
import "@ha/components/ha-icon";
import "@ha/components/ha-icon-overflow-menu";
import "@ha/components/ha-state-icon";
import "@ha/components/ha-svg-icon";

import { storage } from "@ha/common/decorators/storage";
import { transform } from "@ha/common/decorators/transform";
import type { HASSDomEvent } from "@ha/common/dom/fire_event";
import { fireEvent } from "@ha/common/dom/fire_event";
import { mainWindow } from "@ha/common/dom/get_main_window";
import { computeDomain } from "@ha/common/entity/compute_domain";
import { navigate } from "@ha/common/navigate";
import type {
  DataTableColumnContainer,
  SortingChangedEvent,
} from "@ha/components/data-table/ha-data-table";
import type { IconOverflowMenuItem } from "@ha/components/ha-icon-overflow-menu";
import { fullEntitiesContext, labelsContext } from "@ha/data/context";
import type { DataTableFiltersValues } from "@ha/data/data_table_filters";
import type { EntityRegistryEntry } from "@ha/data/entity/entity_registry";
import type { LabelRegistryEntry } from "@ha/data/label/label_registry";
import { showAlertDialog, showConfirmationDialog } from "@ha/dialogs/generic/show-dialog-box";
import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-tabs-subpage-data-table";
import type { HomeAssistant, Route } from "@ha/types";

import "../components/data-table/filter/knx-list-filter";
import "../components/data-table/knx-data-table-ga-label";

import type { Config as ListFilterConfig } from "../components/data-table/filter/knx-list-filter";
import {
  createGroupAddressesByEntityMap,
  type EntityGroupAddresses,
} from "../data/groups-by-entity";
import {
  entitiesByGroupContext,
  type EntitiesByGroupContextValue,
} from "../data/knx-entities-by-group-context";
import { knxProjectContext } from "../data/knx-project-context";
import { entitiesTab } from "../knx-router";
import { deleteEntity } from "../services/websocket.service";
import { KNXLogger } from "../tools/knx-logger";
import type { SupportedPlatform } from "../types/entity_data";
import type { KNX } from "../types/knx";
import type { KNXProject } from "../types/websocket";
import { getPlatformStyle } from "../utils/common";

const logger = new KNXLogger("knx-entities-view");

export interface EntityRow extends EntityRegistryEntry {
  entityState?: HassEntity;
  friendly_name: string;
  device_name: string;
  area_name: string;
  disabled: boolean;
  group_addresses: string[];
  group_address_names: (string | undefined)[];
  label_entries: LabelRegistryEntry[];
  domain: string;
}
interface AreaFilterItem {
  id: string;
  name: string;
}

interface DeviceFilterItem {
  id: string;
  name: string;
}

interface DomainFilterItem {
  id: string;
  name: string;
}

interface LabelFilterItem {
  id: string;
  name: string;
}

@customElement("knx-entities-view")
export class KNXEntitiesView extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  @state()
  @consume({ context: entitiesByGroupContext, subscribe: true })
  private _entitiesByGroupCtx: EntitiesByGroupContextValue | null = null;

  @state()
  @consume({ context: knxProjectContext, subscribe: true })
  private _projectData: KNXProject | null = null;

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  @transform({
    transformer: function (this: KNXEntitiesView, entities: EntityRegistryEntry[]) {
      const byGroup = this._entitiesByGroupCtx?.groups;
      if (!byGroup || !entities.length) {
        return [];
      }
      const groupAddressesByEntity = this._getGroupAddressesByEntity(byGroup);
      return entities.filter((entry) => groupAddressesByEntity[entry.entity_id]);
    },
    watch: ["_entitiesByGroupCtx"],
  })
  private _knx_entities: EntityRegistryEntry[] = [];

  @state()
  @consume({ context: labelsContext, subscribe: true })
  private _labels: LabelRegistryEntry[] = [];

  @state() private _filters: DataTableFiltersValues = {};

  @state() private _expandedFilter?: string;

  @storage({ key: "knx-entities-view-table-grouping", state: false, subscribe: false })
  private _activeGrouping = "domain"; // default grouping by domain

  @storage({ key: "knx-entities-view-table-sort", state: false, subscribe: false })
  private _activeSorting?: SortingChangedEvent;

  @storage({
    key: "knx-entities-view-columns",
    state: false,
    subscribe: false,
  })
  private _storedColumns?: {
    wide?: { columnOrder?: string[]; hiddenColumns?: string[] };
    narrow?: { columnOrder?: string[]; hiddenColumns?: string[] };
  };

  private _deviceFilterApplied = false;

  private _applyDeviceFilterFromUrl(): boolean {
    const urlParams = new URLSearchParams(mainWindow.location.search);
    const deviceId = urlParams.get("device_id");
    if (!deviceId) {
      return true;
    }
    if (this._knx_entities.some((ent) => ent.device_id === deviceId)) {
      this._filters = { ...this._filters, device: [deviceId] };
      return true;
    }
    return false;
  }

  protected updated(changedProps): void {
    if (changedProps.has("_knx_entities") && !this._deviceFilterApplied) {
      // Delay marking as applied until a matching device is found (or no URL filter exists).
      if (this._applyDeviceFilterFromUrl()) {
        this._deviceFilterApplied = true;
      }
    }
  }

  private _getGroupAddressesByEntity = memoize(
    (
      entitiesByGroup: EntitiesByGroupContextValue["groups"] | undefined,
    ): Record<string, EntityGroupAddresses> =>
      createGroupAddressesByEntityMap(entitiesByGroup, { ui: true, yaml: false }),
  );

  private _computeRows = memoize(
    (
      entries: EntityRegistryEntry[],
      labels: LabelRegistryEntry[],
      groupAddressesByEntity: Record<string, EntityGroupAddresses>,
      projectData: KNXProject | null,
    ): EntityRow[] =>
      entries.map((entry) => {
        const entityState: HassEntity | undefined = this.hass.states[entry.entity_id]; // undefined for disabled entities
        const device = entry.device_id ? this.hass.devices[entry.device_id] : undefined;
        const areaId = entry.area_id ?? device?.area_id;
        const area = areaId ? this.hass.areas[areaId] : undefined;
        const labelEntries = entry.labels
          .map((labelId) => labels.find((label) => label.label_id === labelId))
          .filter((label): label is LabelRegistryEntry => Boolean(label));
        const groupAddresses = Array.from(groupAddressesByEntity[entry.entity_id]?.groups ?? []);
        const domain = computeDomain(entry.entity_id);
        const domainName = this.hass.localize(`component.${domain}.title`) || domain;
        return {
          ...entry,
          entityState,
          friendly_name:
            entityState?.attributes.friendly_name ?? entry.name ?? entry.original_name ?? "",
          device_name: device?.name_by_user ?? device?.name ?? "",
          area_name: area?.name ?? "",
          disabled: !!entry.disabled_by,
          group_addresses: groupAddresses,
          // matched by index with group_addresses
          group_address_names: groupAddresses.map((ga) => projectData?.group_addresses[ga]?.name),
          label_entries: labelEntries,
          domain: domainName,
        };
      }),
  );

  private _filterEntities = memoize(
    (entities: EntityRow[], filters: DataTableFiltersValues): EntityRow[] => {
      let result = entities;

      // Apply filter panel filters
      Object.entries(filters).forEach(([key, filter]) => {
        if (key === "area" && Array.isArray(filter) && filter.length) {
          result = result.filter((entity) => {
            const areaId =
              entity.area_id || (entity.device_id && this.hass.devices[entity.device_id]?.area_id);
            return areaId && (filter as string[]).includes(areaId);
          });
        } else if (key === "device" && Array.isArray(filter) && filter.length) {
          result = result.filter(
            (entity) => entity.device_id && (filter as string[]).includes(entity.device_id),
          );
        } else if (key === "label" && Array.isArray(filter) && filter.length) {
          result = result.filter((entity) =>
            entity.labels.some((lbl) => (filter as string[]).includes(lbl)),
          );
        } else if (key === "domain" && Array.isArray(filter) && filter.length) {
          result = result.filter((entity) =>
            (filter as string[]).includes(computeDomain(entity.entity_id)),
          );
        }
      });

      return result;
    },
  );

  private _getAreaFilterData = memoize((entities: EntityRegistryEntry[]): AreaFilterItem[] => {
    const areas = new Map<string, string>();
    entities.forEach((entity) => {
      const areaId =
        entity.area_id || (entity.device_id && this.hass.devices[entity.device_id]?.area_id);
      if (areaId) {
        const area = this.hass.areas[areaId];
        if (area) {
          areas.set(areaId, area.name);
        }
      }
    });
    return Array.from(areas, ([id, name]) => ({ id, name }));
  });

  private _getDeviceFilterData = memoize((entities: EntityRegistryEntry[]): DeviceFilterItem[] => {
    const devices = new Map<string, string>();
    entities.forEach((entity) => {
      if (entity.device_id) {
        const device = this.hass.devices[entity.device_id];
        if (device) {
          devices.set(entity.device_id, device.name_by_user ?? device.name ?? entity.device_id);
        }
      }
    });
    return Array.from(devices, ([id, name]) => ({ id, name }));
  });

  private _getDomainFilterData = memoize((entities: EntityRegistryEntry[]): DomainFilterItem[] => {
    const domains = new Map<string, string>();
    entities.forEach((entity) => {
      const domain = computeDomain(entity.entity_id);
      if (!domains.has(domain)) {
        const domainName = this.hass.localize(`component.${domain}.title`) || domain;
        domains.set(domain, domainName);
      }
    });
    return Array.from(domains, ([id, name]) => ({ id, name }));
  });

  private _getLabelFilterData = memoize(
    (entities: EntityRegistryEntry[], labels: LabelRegistryEntry[]): LabelFilterItem[] => {
      const labelIds = new Set<string>();
      entities.forEach((entity) => {
        entity.labels.forEach((labelId) => labelIds.add(labelId));
      });
      return Array.from(labelIds, (id) => {
        const label = labels.find((l) => l.label_id === id);
        return { id, name: label?.name ?? id };
      });
    },
  );

  private _getBasicFilterConfig = <
    T extends { id: string; name: string },
  >(): ListFilterConfig<T> => ({
    idField: {
      filterable: false,
      sortable: false,
      mapper: (item) => item.id,
    },
    primaryField: {
      filterable: true,
      sortable: true,
      mapper: (item) => item.name,
    },
    secondaryField: {
      filterable: false,
      sortable: false,
      mapper: () => undefined,
    },
    badgeField: {
      filterable: false,
      sortable: false,
      mapper: () => undefined,
    },
  });

  private _getDomainFilterConfig = <
    T extends { id: string; name: string },
  >(): ListFilterConfig<T> => {
    const base = this._getBasicFilterConfig<T>();
    return {
      ...base,
      primaryField: {
        ...base.primaryField,
        iconPathMapper: (item) => getPlatformStyle(item.id as SupportedPlatform).iconPath,
      },
    };
  };

  private _getAreaFilterConfig = <
    T extends { id: string; name: string },
  >(): ListFilterConfig<T> => {
    const base = this._getBasicFilterConfig<T>();
    return {
      ...base,
      primaryField: {
        ...base.primaryField,
        iconMapper: (item) => this.hass.areas[item.id]?.icon ?? "mdi:texture-box",
      },
    };
  };

  private _getLabelFilterConfig = <
    T extends { id: string; name: string },
  >(): ListFilterConfig<T> => {
    const base = this._getBasicFilterConfig<T>();
    return {
      ...base,
      primaryField: {
        ...base.primaryField,
        iconMapper: (item) => {
          const label = this._labels.find((l) => l.label_id === item.id);
          return label?.icon ?? "mdi:label";
        },
      },
    };
  };

  private _columns = memoize((_language, narrow): DataTableColumnContainer<EntityRow> => {
    const iconWidth = "56px";

    return {
      icon: {
        title: "",
        label: this.hass.localize("ui.panel.config.entities.picker.headers.state_icon"),
        minWidth: iconWidth,
        maxWidth: iconWidth,
        filterable: false,
        sortable: false,
        groupable: false,
        type: "icon",
        template: (entry) =>
          entry.disabled
            ? html`<ha-svg-icon
                slot="icon"
                label="Disabled entity"
                .path=${mdiInformationOffOutline}
                style="color: var(--disabled-text-color);"
              ></ha-svg-icon>`
            : html`
                <ha-state-icon
                  slot="item-icon"
                  .hass=${this.hass}
                  .stateObj=${entry.entityState}
                ></ha-state-icon>
              `,
      },
      friendly_name: {
        showNarrow: true,
        filterable: true,
        sortable: true,
        direction: "asc",
        title: this.hass.localize("ui.common.name"),
        flex: 1,
        extraTemplate: (entry) =>
          entry.label_entries.length
            ? html` <ha-data-table-labels .labels=${entry.label_entries}></ha-data-table-labels> `
            : nothing,
      },
      entity_id: {
        showNarrow: true,
        defaultHidden: narrow,
        filterable: true,
        sortable: true,
        title: this.hass.localize("ui.panel.config.generic.headers.entity_id"),
        flex: 1,
      },
      group_addresses: {
        showNarrow: true,
        title: this.hass.localize("component.knx.config_panel.common.group_addresses"),
        filterable: true,
        sortable: false,
        flex: 1,
        template: (entry) =>
          entry.group_addresses.length
            ? html`<knx-data-table-ga-label
                .groupAddresses=${entry.group_addresses.map((ga, index) => ({
                  address: ga,
                  name: entry.group_address_names[index],
                }))}
              ></knx-data-table-ga-label>`
            : nothing,
      },
      group_address_names: {
        hidden: true,
        title: "Group Address Names",
        filterable: true,
        sortable: false,
      },
      device_name: {
        filterable: true,
        sortable: true,
        title: this.hass.localize("ui.panel.config.entities.picker.headers.device"),
        flex: 1,
      },
      device_id: {
        hidden: true, // for filtering only
        title: "Device ID",
        filterable: true,
      },
      area_name: {
        title: this.hass.localize("ui.panel.config.generic.headers.area"),
        sortable: true,
        filterable: true,
        groupable: true,
        flex: 1,
      },
      domain: {
        title: this.hass.localize("ui.panel.config.generic.headers.domain"),
        sortable: true,
        hidden: true,
        filterable: true,
        groupable: true,
      },
      actions: {
        showNarrow: true,
        title: "",
        label: this.hass.localize("ui.panel.config.generic.headers.actions"),
        type: "overflow-menu",
        template: (entry) => {
          const items: IconOverflowMenuItem[] = [
            {
              path: mdiInformationSlabCircleOutline,
              label: this.hass.localize("ui.dialogs.more_info_control.details"),
              action: () => this._entityMoreInfo(entry),
            },
            {
              path: mdiPencilOutline,
              label: this.hass.localize("ui.common.edit"),
              action: () => this._entityEdit(entry),
            },
            {
              path: mdiDelete,
              label: this.hass.localize("ui.common.delete"),
              action: () => this._entityDelete(entry),
            },
          ];

          return html`<ha-icon-overflow-menu
            .hass=${this.hass}
            .narrow=${narrow}
            .items=${items}
          ></ha-icon-overflow-menu>`;
        },
      },
      labels: {
        title: "",
        hidden: true,
        filterable: true,
        template: (entry) => entry.label_entries.map((lbl) => lbl.name).join(" "),
      },
    };
  });

  private _entityEdit(entry: EntityRow) {
    navigate("/knx/entities/edit/" + entry.entity_id);
  }

  private _entityMoreInfo(entry: EntityRow) {
    fireEvent(mainWindow.document.querySelector("home-assistant")!, "hass-more-info", {
      entityId: entry.entity_id,
    });
  }

  private _entityDelete(entry: EntityRow) {
    showConfirmationDialog(this, {
      text: `${this.hass.localize("ui.common.delete")} ${entry.entity_id}?`,
    }).then((confirmed) => {
      if (confirmed) {
        deleteEntity(this.hass, entry.entity_id)
          .then(() => {
            logger.debug("entity deleted", entry.entity_id);
            this._entitiesByGroupCtx?.reload();
          })
          .catch((err: any) => {
            showAlertDialog(this, {
              title: "Deletion failed",
              text: err,
            });
          });
      }
    });
  }

  private _getActiveFilterCount(filters: DataTableFiltersValues): number {
    return Object.values(filters).filter((filter) =>
      Array.isArray(filter)
        ? filter.length
        : filter && Object.values(filter).some((val) => (Array.isArray(val) ? val.length : val)),
    ).length;
  }

  protected render(): TemplateResult {
    if (!this._entitiesByGroupCtx || this._entitiesByGroupCtx.loading) {
      return html`<hass-loading-screen></hass-loading-screen>`;
    }
    if (this._entitiesByGroupCtx.error) {
      return html`<ha-alert alert-type="error">${this._entitiesByGroupCtx.error}</ha-alert>`;
    }
    const groupAddressesByEntity = this._getGroupAddressesByEntity(this._entitiesByGroupCtx.groups);
    const computedRows = this._computeRows(
      this._knx_entities,
      this._labels,
      groupAddressesByEntity,
      this._projectData,
    );
    const filteredEntities = this._filterEntities(computedRows, this._filters);

    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route!}
        .tabs=${[entitiesTab]}
        .localizeFunc=${this.knx.localize}
        .columns=${this._columns(this.hass.language, this.narrow)}
        .data=${filteredEntities}
        .hasFab=${true}
        .searchLabel=${this.hass.localize("ui.panel.config.entities.picker.search", {
          number: filteredEntities.length,
        })}
        .clickable=${false}
        has-filters
        .filters=${this._getActiveFilterCount(this._filters)}
        @clear-filter=${this._clearFilter}
        .initialGroupColumn=${this._activeGrouping}
        @grouping-changed=${this._handleGroupingChanged}
        .initialSorting=${this._activeSorting}
        @sorting-changed=${this._handleSortingChanged}
        .columnOrder=${this.narrow
          ? this._storedColumns?.narrow?.columnOrder
          : this._storedColumns?.wide?.columnOrder}
        .hiddenColumns=${this.narrow
          ? this._storedColumns?.narrow?.hiddenColumns
          : this._storedColumns?.wide?.hiddenColumns}
        @columns-changed=${this._handleColumnsChanged}
      >
        <knx-list-filter
          slot="filter-pane"
          data-filter="domain"
          .hass=${this.hass}
          .knx=${this.knx}
          .data=${this._getDomainFilterData(this._knx_entities)}
          .config=${this._getDomainFilterConfig<DomainFilterItem>()}
          .selectedOptions=${this._filters.domain as string[] | undefined}
          .expanded=${this._expandedFilter === "domain"}
          .narrow=${this.narrow}
          .filterTitle=${this.hass.localize("ui.panel.config.generic.headers.domain")}
          @selection-changed=${this._onFilterSelectionChanged}
          @expanded-changed=${this._onFilterExpandedChanged}
        ></knx-list-filter>
        <knx-list-filter
          slot="filter-pane"
          data-filter="area"
          .hass=${this.hass}
          .knx=${this.knx}
          .data=${this._getAreaFilterData(this._knx_entities)}
          .config=${this._getAreaFilterConfig<AreaFilterItem>()}
          .selectedOptions=${this._filters.area as string[] | undefined}
          .expanded=${this._expandedFilter === "area"}
          .narrow=${this.narrow}
          .filterTitle=${this.hass.localize("ui.panel.config.generic.headers.area")}
          @selection-changed=${this._onFilterSelectionChanged}
          @expanded-changed=${this._onFilterExpandedChanged}
        ></knx-list-filter>
        <knx-list-filter
          slot="filter-pane"
          data-filter="device"
          .hass=${this.hass}
          .knx=${this.knx}
          .data=${this._getDeviceFilterData(this._knx_entities)}
          .config=${this._getBasicFilterConfig<DeviceFilterItem>()}
          .selectedOptions=${this._filters.device as string[] | undefined}
          .expanded=${this._expandedFilter === "device"}
          .narrow=${this.narrow}
          .filterTitle=${this.hass.localize("ui.panel.config.entities.picker.headers.device")}
          @selection-changed=${this._onFilterSelectionChanged}
          @expanded-changed=${this._onFilterExpandedChanged}
        ></knx-list-filter>
        <knx-list-filter
          slot="filter-pane"
          data-filter="label"
          .hass=${this.hass}
          .knx=${this.knx}
          .data=${this._getLabelFilterData(this._knx_entities, this._labels)}
          .config=${this._getLabelFilterConfig<LabelFilterItem>()}
          .selectedOptions=${this._filters.label as string[] | undefined}
          .expanded=${this._expandedFilter === "label"}
          .narrow=${this.narrow}
          .filterTitle=${this.hass.localize("ui.panel.config.labels.caption")}
          @selection-changed=${this._onFilterSelectionChanged}
          @expanded-changed=${this._onFilterExpandedChanged}
        ></knx-list-filter>
        <ha-button slot="fab" size="large" @click=${this._entityCreate}>
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this.hass.localize("ui.common.add")}
        </ha-button>
      </hass-tabs-subpage-data-table>
    `;
  }

  private _entityCreate() {
    navigate("/knx/entities/create");
  }

  private _handleGroupingChanged(ev: CustomEvent) {
    this._activeGrouping = ev.detail.value;
  }

  private _handleSortingChanged(ev: CustomEvent) {
    this._activeSorting = ev.detail;
  }

  private _handleColumnsChanged(
    ev: HASSDomEvent<{ columnOrder?: string[]; hiddenColumns?: string[] }>,
  ) {
    const { columnOrder, hiddenColumns } = ev.detail;
    const prev = this._storedColumns ?? {};
    this._storedColumns = {
      ...prev,
      [this.narrow ? "narrow" : "wide"]: { columnOrder, hiddenColumns },
    };
  }

  private _onFilterSelectionChanged = (ev: CustomEvent<{ value: string[] }>): void => {
    const target = ev.currentTarget as HTMLElement;
    const key =
      target.getAttribute("data-filter") || (ev.target as HTMLElement).getAttribute("data-filter");
    if (!key) return;
    this._filters = { ...this._filters, [key]: ev.detail.value };
  };

  private _onFilterExpandedChanged = (ev: CustomEvent<{ expanded: boolean }>): void => {
    const target = ev.currentTarget as HTMLElement;
    const key =
      target.getAttribute("data-filter") || (ev.target as HTMLElement).getAttribute("data-filter");
    if (!key) return;
    if (ev.detail.expanded) {
      this._expandedFilter = key;
    } else if (this._expandedFilter === key) {
      this._expandedFilter = undefined;
    }
  };

  private _clearFilter = () => {
    this._filters = {};
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-entities-view": KNXEntitiesView;
  }
}
