import {
  mdiDelete,
  mdiInformationSlabCircleOutline,
  mdiInformationOffOutline,
  mdiPlus,
  mdiPencilOutline,
  mdiMathLog,
} from "@mdi/js";
import type { TemplateResult } from "lit";
import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { storage } from "@ha/common/decorators/storage";

import type { HassEntity, UnsubscribeFunc } from "home-assistant-js-websocket";
import memoize from "memoize-one";

import "@ha/components/data-table/ha-data-table-labels";
import "@ha/layouts/hass-tabs-subpage-data-table";
import "@ha/components/ha-fab";
import "@ha/components/ha-icon";
import "@ha/components/ha-icon-overflow-menu";
import "@ha/components/ha-state-icon";

import "../components/data-table/filter/knx-list-filter";
import { navigate } from "@ha/common/navigate";
import { mainWindow } from "@ha/common/dom/get_main_window";
import { fireEvent } from "@ha/common/dom/fire_event";
import { computeDomain } from "@ha/common/entity/compute_domain";
import type {
  DataTableColumnContainer,
  SortingChangedEvent,
} from "@ha/components/data-table/ha-data-table";
import type { DataTableFiltersValues } from "@ha/data/data_table_filters";
import type { ExtEntityRegistryEntry, EntityRegistryEntry } from "@ha/data/entity/entity_registry";
import { subscribeEntityRegistry } from "@ha/data/entity/entity_registry";
import type { LabelRegistryEntry } from "@ha/data/label/label_registry";
import { subscribeLabelRegistry } from "@ha/data/label/label_registry";
import { showAlertDialog, showConfirmationDialog } from "@ha/dialogs/generic/show-dialog-box";
import { SubscribeMixin } from "@ha/mixins/subscribe-mixin";
import type { HomeAssistant, Route } from "@ha/types";

import { getEntityEntries, deleteEntity, getEntityConfig } from "../services/websocket.service";
import type { KNX } from "../types/knx";
import type { Config as ListFilterConfig } from "../components/data-table/filter/knx-list-filter";
import { getPlatformStyle } from "../utils/common";
import type { SupportedPlatform } from "../types/entity_data";
import { entitiesTab } from "../knx-router";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("knx-entities-view");

export interface EntityRow extends ExtEntityRegistryEntry {
  entityState?: HassEntity;
  friendly_name: string;
  device_name: string;
  area_name: string;
  disabled: boolean;
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
export class KNXEntitiesView extends SubscribeMixin(LitElement) {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  @state() private knx_entities: ExtEntityRegistryEntry[] = [];

  @state() private _labels: LabelRegistryEntry[] = [];

  @state() private _filters: DataTableFiltersValues = {};

  @state() private _expandedFilter?: string;

  @storage({ key: "knx-entities-table-grouping", state: false, subscribe: false })
  private _activeGrouping = "domain"; // default grouping by domain

  @storage({ key: "knx-entities-table-sort", state: false, subscribe: false })
  private _activeSorting?: SortingChangedEvent;

  private _lastKnxRegistryUpdate?: number;

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      subscribeLabelRegistry(this.hass.connection!, (labels) => {
        this._labels = labels;
      }),
      subscribeEntityRegistry(this.hass.connection!, (entries) => {
        // Refresh entities only if KNX entries changed since last fetch
        if (
          this._lastKnxRegistryUpdate !== undefined && // wait for firstUpdated fetch
          this._hasNewKnxEntityUpdateTimestamp(entries)
        ) {
          this._fetchEntities();
        }
      }),
    ];
  }

  protected async firstUpdated() {
    // Initial fetch - when navigating here and already subscribed (coming from a different HA subpage).
    await this._fetchEntities();
    // initialize last update timestamp to avoid unnecessary refetching
    this._hasNewKnxEntityUpdateTimestamp(this.knx_entities);
    // Apply URL-based device filter on initial load
    const urlParams = new URLSearchParams(mainWindow.location.search);
    const deviceId = urlParams.get("device_id");
    if (deviceId && this.knx_entities.some((ent) => ent.device_id === deviceId)) {
      this._filters = { ...this._filters, device: [deviceId] };
    }
  }

  private _hasNewKnxEntityUpdateTimestamp(entries: EntityRegistryEntry[]): boolean {
    const lastUpdate = entries.reduce((acc, entry) => {
      if (entry.platform !== "knx") return acc;
      return Math.max(acc, entry.modified_at);
    }, 0);
    if (this._lastKnxRegistryUpdate === undefined || lastUpdate > this._lastKnxRegistryUpdate) {
      this._lastKnxRegistryUpdate = lastUpdate;
      return true;
    }
    return false;
  }

  private async _fetchEntities() {
    try {
      const entries = await getEntityEntries(this.hass);
      logger.debug(`Fetched ${entries.length} entity entries.`);
      this.knx_entities = entries;
    } catch (err) {
      logger.error("getEntityEntries", err);
      navigate("/knx/error", { replace: true, data: err });
    }
  }

  private _computeRows = memoize(
    (entries: ExtEntityRegistryEntry[], labels: LabelRegistryEntry[]): EntityRow[] =>
      entries.map((entry) => {
        const entityState: HassEntity | undefined = this.hass.states[entry.entity_id]; // undefined for disabled entities
        const device = entry.device_id ? this.hass.devices[entry.device_id] : undefined;
        const areaId = entry.area_id ?? device?.area_id;
        const area = areaId ? this.hass.areas[areaId] : undefined;
        const labelEntries = entry.labels.map(
          (labelId) => labels.find((label) => label?.label_id === labelId)!,
        );
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

  private _getAreaFilterData = memoize((entities: ExtEntityRegistryEntry[]): AreaFilterItem[] => {
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

  private _getDeviceFilterData = memoize(
    (entities: ExtEntityRegistryEntry[]): DeviceFilterItem[] => {
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
    },
  );

  private _getDomainFilterData = memoize(
    (entities: ExtEntityRegistryEntry[]): DomainFilterItem[] => {
      const domains = new Map<string, string>();
      entities.forEach((entity) => {
        const domain = computeDomain(entity.entity_id);
        if (!domains.has(domain)) {
          const domainName = this.hass.localize(`component.${domain}.title`) || domain;
          domains.set(domain, domainName);
        }
      });
      return Array.from(domains, ([id, name]) => ({ id, name }));
    },
  );

  private _getLabelFilterData = memoize(
    (entities: ExtEntityRegistryEntry[], labels: LabelRegistryEntry[]): LabelFilterItem[] => {
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
        flex: 2,
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
        title: this.hass.localize("ui.panel.config.entities.picker.headers.entity_id"),
        flex: 1,
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
        template: (entry) => entry.device_id ?? "",
      },
      area_name: {
        title: this.hass.localize("ui.panel.config.entities.picker.headers.area"),
        sortable: true,
        filterable: true,
        groupable: true,
        flex: 1,
      },
      domain: {
        title: this.hass.localize("ui.panel.config.entities.picker.headers.domain"),
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
          const items = [
            {
              path: mdiInformationSlabCircleOutline,
              label: "More info",
              action: () => this._entityMoreInfo(entry),
            },
            {
              path: mdiPencilOutline,
              label: this.hass.localize("ui.common.edit"),
              action: () => this._entityEdit(entry),
            },
            {
              path: mdiMathLog,
              label: this.knx.localize("entities_view_monitor_telegrams"),
              action: () => this._showEntityTelegrams(entry),
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

  private async _showEntityTelegrams(entry: EntityRow) {
    try {
      const entityConfig = await getEntityConfig(this.hass, entry.entity_id);
      const knxData = entityConfig.data.knx;

      // Extract all group addresses from KNX entity configuration
      const groupAddresses = Object.values(knxData)
        .flatMap((config) => {
          if (typeof config !== "object" || config === null) return [] as string[];
          const { write, state: stateAddress, passive } = config as any;
          return [write, stateAddress, ...(Array.isArray(passive) ? passive : [])];
        })
        .filter((address): address is string => Boolean(address));

      // Navigate to group monitor with entity-specific filter
      const uniqueAddresses = [...new Set(groupAddresses)];
      if (uniqueAddresses.length > 0) {
        const destinationFilter = uniqueAddresses.join(",");
        navigate(`/knx/group_monitor?destination=${encodeURIComponent(destinationFilter)}`);
      } else {
        logger.warn("No group addresses found for entity", entry.entity_id);
        navigate("/knx/group_monitor");
      }
    } catch (err) {
      logger.error("Failed to load entity configuration for monitor", entry.entity_id, err);
      // Fallback to unfiltered monitor on error
      navigate("/knx/group_monitor");
    }
  }

  private _entityDelete(entry: EntityRow) {
    showConfirmationDialog(this, {
      text: `${this.hass.localize("ui.common.delete")} ${entry.entity_id}?`,
    }).then((confirmed) => {
      if (confirmed) {
        deleteEntity(this.hass, entry.entity_id)
          .then(() => {
            logger.debug("entity deleted", entry.entity_id);
            this._fetchEntities();
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
    const computedRows = this._computeRows(this.knx_entities, this._labels);
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
        .initialGroupColumn=${this._activeGrouping}
        .initialSorting=${this._activeSorting}
        @grouping-changed=${this._handleGroupingChanged}
        @sorting-changed=${this._handleSortingChanged}
        @clear-filter=${this._clearFilter}
      >
        <knx-list-filter
          slot="filter-pane"
          data-filter="domain"
          .hass=${this.hass}
          .knx=${this.knx}
          .data=${this._getDomainFilterData(this.knx_entities)}
          .config=${this._getDomainFilterConfig<DomainFilterItem>()}
          .selectedOptions=${this._filters.domain as string[] | undefined}
          .expanded=${this._expandedFilter === "domain"}
          .narrow=${this.narrow}
          .filterTitle=${this.hass.localize("ui.panel.config.entities.picker.headers.domain")}
          @selection-changed=${this._onFilterSelectionChanged}
          @expanded-changed=${this._onFilterExpandedChanged}
        ></knx-list-filter>
        <knx-list-filter
          slot="filter-pane"
          data-filter="area"
          .hass=${this.hass}
          .knx=${this.knx}
          .data=${this._getAreaFilterData(this.knx_entities)}
          .config=${this._getAreaFilterConfig<AreaFilterItem>()}
          .selectedOptions=${this._filters.area as string[] | undefined}
          .expanded=${this._expandedFilter === "area"}
          .narrow=${this.narrow}
          .filterTitle=${this.hass.localize("ui.panel.config.entities.picker.headers.area")}
          @selection-changed=${this._onFilterSelectionChanged}
          @expanded-changed=${this._onFilterExpandedChanged}
        ></knx-list-filter>
        <knx-list-filter
          slot="filter-pane"
          data-filter="device"
          .hass=${this.hass}
          .knx=${this.knx}
          .data=${this._getDeviceFilterData(this.knx_entities)}
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
          .data=${this._getLabelFilterData(this.knx_entities, this._labels)}
          .config=${this._getLabelFilterConfig<LabelFilterItem>()}
          .selectedOptions=${this._filters.label as string[] | undefined}
          .expanded=${this._expandedFilter === "label"}
          .narrow=${this.narrow}
          .filterTitle=${this.hass.localize("ui.panel.config.labels.caption")}
          @selection-changed=${this._onFilterSelectionChanged}
          @expanded-changed=${this._onFilterExpandedChanged}
        ></knx-list-filter>
        <ha-fab
          slot="fab"
          .label=${this.hass.localize("ui.common.add")}
          extended
          @click=${this._entityCreate}
        >
          <ha-svg-icon slot="icon" .path=${mdiPlus}></ha-svg-icon>
        </ha-fab>
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
