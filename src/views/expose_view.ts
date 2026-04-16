import {
  mdiContentCopy,
  mdiDelete,
  mdiInformationSlabCircleOutline,
  mdiInformationOffOutline,
  mdiPlus,
  mdiPencilOutline,
} from "@mdi/js";
import type { TemplateResult } from "lit";
import { LitElement, html, nothing } from "lit";
import { consume } from "@lit/context";
import { customElement, property, state } from "lit/decorators";
import { storage } from "@ha/common/decorators/storage";

import type { HassEntity } from "home-assistant-js-websocket";
import memoize from "memoize-one";

import "@ha/layouts/hass-tabs-subpage-data-table";
import "@ha/components/ha-fab";
import "@ha/components/ha-icon";
import "@ha/components/ha-icon-overflow-menu";
import "@ha/components/ha-state-icon";
import "@ha/components/ha-svg-icon";
import { transform } from "@ha/common/decorators/transform";
import { mainWindow } from "@ha/common/dom/get_main_window";
import { fireEvent } from "@ha/common/dom/fire_event";
import { navigate } from "@ha/common/navigate";
import type { HASSDomEvent } from "@ha/common/dom/fire_event";
import { computeDomain } from "@ha/common/entity/compute_domain";
import type { IconOverflowMenuItem } from "@ha/components/ha-icon-overflow-menu";
import type {
  DataTableColumnContainer,
  SortingChangedEvent,
} from "@ha/components/data-table/ha-data-table";
import { fullEntitiesContext } from "@ha/data/context";
import type { DataTableFiltersValues } from "@ha/data/data_table_filters";
import type { EntityRegistryEntry } from "@ha/data/entity/entity_registry";
import { showAlertDialog, showConfirmationDialog } from "@ha/dialogs/generic/show-dialog-box";
import type { HomeAssistant, Route } from "@ha/types";

import "../components/data-table/knx-data-table-ga-label";
import "../components/data-table/filter/knx-list-filter";

import { getExposeGroups, deleteExpose } from "../services/websocket.service";
import type { KNX } from "../types/knx";
import type { Config as ListFilterConfig } from "../components/data-table/filter/knx-list-filter";
import { getPlatformStyle } from "../utils/common";
import type { SupportedPlatform } from "../types/entity_data";
import { exposeTab } from "../knx-router";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("knx-expose-view");

export interface EntityRow {
  entityState?: HassEntity;
  entity_id: string;
  friendly_name: string;
  device_name: string;
  area_name: string;
  disabled: boolean;
  domain: string;
  group_addresses: string[];
  group_address_names: (string | undefined)[];
}

interface UnknownEntity {
  entity_id: string;
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

@customElement("knx-expose-view")
export class KNXExposeView extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  @state() private exposeGroups: Record<string, string[]> = {}; // TODO: entity_id, ga[]

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  @transform({
    transformer: function (this: KNXExposeView, entities: EntityRegistryEntry[]) {
      return Object.keys(this.exposeGroups).map(
        (entityId) =>
          entities.find((e) => e.entity_id === entityId) ??
          ({
            entity_id: entityId,
          } as UnknownEntity),
      );
    },
    watch: ["exposeGroups"],
  })
  private _exposes: (EntityRegistryEntry | UnknownEntity)[] = [];

  @state() private _filters: DataTableFiltersValues = {};

  @state() private _expandedFilter?: string;

  @storage({ key: "knx-expose-view-table-grouping", state: false, subscribe: false })
  private _activeGrouping = "domain"; // default grouping by domain

  @storage({ key: "knx-expose-view-table-sort", state: false, subscribe: false })
  private _activeSorting?: SortingChangedEvent;

  @storage({
    key: "knx-expose-view-columns",
    state: false,
    subscribe: false,
  })
  private _storedColumns?: {
    wide?: { columnOrder?: string[]; hiddenColumns?: string[] };
    narrow?: { columnOrder?: string[]; hiddenColumns?: string[] };
  };

  protected async firstUpdated() {
    if (this.knx.projectInfo && !this.knx.projectData) {
      await this.knx.loadProject();
    }
    await this._fetchExposeGroups();
  }

  private async _fetchExposeGroups() {
    try {
      const exposeGroups = await getExposeGroups(this.hass);
      logger.debug(`Fetched ${Object.keys(exposeGroups).length} expose entities.`);
      this.exposeGroups = exposeGroups;
    } catch (err) {
      logger.error("getExposeGroups", err);
      navigate("/knx/error", { replace: true, data: err });
    }
  }

  private _computeRows = memoize((entries: (EntityRegistryEntry | UnknownEntity)[]): EntityRow[] =>
    entries.map((entry) => {
      const entityState: HassEntity | undefined = this.hass.states[entry.entity_id]; // undefined for disabled entities
      const device = entry.device_id ? this.hass.devices[entry.device_id] : undefined;
      const areaId = entry.area_id ?? device?.area_id;
      const area = areaId ? this.hass.areas[areaId] : undefined;
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
        domain: domainName,
        group_addresses: this.exposeGroups[entry.entity_id] ?? [],
        // matched by index with group_addresses
        group_address_names:
          (this.exposeGroups[entry.entity_id] ?? []).map(
            (ga) => this.knx.projectData?.group_addresses[ga]?.name,
          ) ?? [],
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
        } else if (key === "domain" && Array.isArray(filter) && filter.length) {
          result = result.filter((entity) =>
            (filter as string[]).includes(computeDomain(entity.entity_id)),
          );
        }
      });

      return result;
    },
  );

  private _getAreaFilterData = memoize(
    (entities: (EntityRegistryEntry | UnknownEntity)[]): AreaFilterItem[] => {
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
    },
  );

  private _getDeviceFilterData = memoize(
    (entities: (EntityRegistryEntry | UnknownEntity)[]): DeviceFilterItem[] => {
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
    (entities: (EntityRegistryEntry | UnknownEntity)[]): DomainFilterItem[] => {
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
      },
      entity_id: {
        showNarrow: true,
        defaultHidden: narrow,
        filterable: true,
        sortable: true,
        title: this.hass.localize("ui.panel.config.generic.headers.entity_id"),
        flex: 1,
      },
      device_name: {
        defaultHidden: true,
        filterable: true,
        sortable: true,
        title: this.hass.localize("ui.panel.config.entities.picker.headers.device"),
        flex: 1,
      },
      area_name: {
        defaultHidden: true,
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
              path: mdiContentCopy,
              label: this.hass.localize("ui.common.copy"),
              action: () => {
                const url = new URL(mainWindow.location.href);
                url.pathname = `/knx/expose/create`;
                url.searchParams.set("copy", entry.entity_id);
                navigate(url.pathname + url.search);
              },
            },
            {
              path: mdiPencilOutline,
              label: this.hass.localize("ui.common.edit"),
              action: () => this._exposeEdit(entry),
            },
            {
              path: mdiDelete,
              label: this.hass.localize("ui.common.delete"),
              action: () => this._exposeDelete(entry),
            },
          ];

          return html`<ha-icon-overflow-menu
            .hass=${this.hass}
            .items=${items}
            .narrow=${this.narrow}
          ></ha-icon-overflow-menu>`;
        },
      },
    };
  });

  private _exposeEdit(entry: EntityRow) {
    navigate("/knx/expose/edit/" + entry.entity_id);
  }

  private _entityMoreInfo(entry: EntityRow) {
    fireEvent(mainWindow.document.querySelector("home-assistant")!, "hass-more-info", {
      entityId: entry.entity_id,
    });
  }

  private _exposeDelete(entry: EntityRow) {
    showConfirmationDialog(this, {
      text: `${this.hass.localize("ui.common.delete")} ${entry.entity_id}?`,
    }).then((confirmed) => {
      if (confirmed) {
        deleteExpose(this.hass, entry.entity_id)
          .then(() => {
            logger.debug("expose deleted", entry.entity_id);
            this._fetchExposeGroups();
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
    const computedRows = this._computeRows(this._exposes);
    const filteredEntities = this._filterEntities(computedRows, this._filters);

    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .backPath=${"/knx"}
        .narrow=${this.narrow}
        .route=${this.route!}
        .tabs=${[exposeTab]}
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
          .data=${this._getDomainFilterData(this._exposes)}
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
          .data=${this._getAreaFilterData(this._exposes)}
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
          .data=${this._getDeviceFilterData(this._exposes)}
          .config=${this._getBasicFilterConfig<DeviceFilterItem>()}
          .selectedOptions=${this._filters.device as string[] | undefined}
          .expanded=${this._expandedFilter === "device"}
          .narrow=${this.narrow}
          .filterTitle=${this.hass.localize("ui.panel.config.entities.picker.headers.device")}
          @selection-changed=${this._onFilterSelectionChanged}
          @expanded-changed=${this._onFilterExpandedChanged}
        ></knx-list-filter>
        <ha-fab
          slot="fab"
          .label=${this.hass.localize("ui.common.add")}
          extended
          @click=${this._exposeCreate}
        >
          <ha-svg-icon slot="icon" .path=${mdiPlus}></ha-svg-icon>
        </ha-fab>
      </hass-tabs-subpage-data-table>
    `;
  }

  private _exposeCreate() {
    navigate("/knx/expose/create");
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
    "knx-expose-view": KNXExposeView;
  }
}
