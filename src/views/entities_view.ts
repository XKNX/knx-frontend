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
import "@ha/components/ha-icon-button";
import "@ha/components/ha-state-icon";
import "@ha/components/ha-svg-icon";
import { navigate } from "@ha/common/navigate";
import { mainWindow } from "@ha/common/dom/get_main_window";
import { fireEvent } from "@ha/common/dom/fire_event";
import { computeDomain } from "@ha/common/entity/compute_domain";
import type {
  DataTableColumnContainer,
  SortingChangedEvent,
} from "@ha/components/data-table/ha-data-table";
import type { ExtEntityRegistryEntry, EntityRegistryEntry } from "@ha/data/entity/entity_registry";
import { subscribeEntityRegistry } from "@ha/data/entity/entity_registry";
import type { LabelRegistryEntry } from "@ha/data/label/label_registry";
import { subscribeLabelRegistry } from "@ha/data/label/label_registry";
import { showAlertDialog, showConfirmationDialog } from "@ha/dialogs/generic/show-dialog-box";
import { SubscribeMixin } from "@ha/mixins/subscribe-mixin";
import type { HomeAssistant, Route } from "@ha/types";

import { getEntityEntries, deleteEntity, getEntityConfig } from "../services/websocket.service";
import type { KNX } from "../types/knx";
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

@customElement("knx-entities-view")
export class KNXEntitiesView extends SubscribeMixin(LitElement) {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  @state() private knx_entities: ExtEntityRegistryEntry[] = [];

  @state() private filterDevice: string | null = null;

  @state() private _labels: LabelRegistryEntry[] = [];

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

  protected firstUpdated() {
    // Initial fetch - when navigating here and already subscribed (coming from a different HA subpage).
    this._fetchEntities();
    // initialize last update timestamp to avoid unnecessary refetching
    this._hasNewKnxEntityUpdateTimestamp(this.knx_entities);
  }

  protected willUpdate() {
    const urlParams = new URLSearchParams(mainWindow.location.search);
    this.filterDevice = urlParams.get("device_id");
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
    getEntityEntries(this.hass)
      .then((entries) => {
        logger.debug(`Fetched ${entries.length} entity entries.`);
        this.knx_entities = entries;
      })
      .catch((err) => {
        logger.error("getEntityEntries", err);
        navigate("/knx/error", { replace: true, data: err });
      });
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

  private _columns = memoize((_language): DataTableColumnContainer<EntityRow> => {
    const iconWidth = "56px";
    const actionWidth = "224px"; // 48px*4 + 16px*3 padding

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
        title: this.hass.localize("ui.panel.config.entities.picker.headers.entity"),
        flex: 2,
        extraTemplate: (entry) =>
          entry.label_entries.length
            ? html` <ha-data-table-labels .labels=${entry.label_entries}></ha-data-table-labels> `
            : nothing,
      },
      entity_id: {
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
        minWidth: actionWidth,
        maxWidth: actionWidth,
        type: "icon-button",
        template: (entry) => html`
          <ha-icon-button
            .label=${"More info"}
            .path=${mdiInformationSlabCircleOutline}
            .entityEntry=${entry}
            @click=${this._entityMoreInfo}
          ></ha-icon-button>
          <ha-icon-button
            .label=${this.hass.localize("ui.common.edit")}
            .path=${mdiPencilOutline}
            .entityEntry=${entry}
            @click=${this._entityEdit}
          ></ha-icon-button>
          <ha-icon-button
            .label=${this.knx.localize("entities_view_monitor_telegrams")}
            .path=${mdiMathLog}
            .entityEntry=${entry}
            @click=${this._showEntityTelegrams}
          ></ha-icon-button>
          <ha-icon-button
            .label=${this.hass.localize("ui.common.delete")}
            .path=${mdiDelete}
            .entityEntry=${entry}
            @click=${this._entityDelete}
          ></ha-icon-button>
        `,
      },
      labels: {
        title: "",
        hidden: true,
        filterable: true,
        template: (entry) => entry.label_entries.map((lbl) => lbl.name).join(" "),
      },
    };
  });

  private _entityEdit = (ev: Event) => {
    ev.stopPropagation();
    const entry = (ev.target as any).entityEntry as EntityRow;
    navigate("/knx/entities/edit/" + entry.entity_id);
  };

  private _entityMoreInfo = (ev: Event) => {
    ev.stopPropagation();
    const entry = (ev.target as any).entityEntry as EntityRow;
    fireEvent(mainWindow.document.querySelector("home-assistant")!, "hass-more-info", {
      entityId: entry.entity_id,
    });
  };

  private _showEntityTelegrams = async (ev: Event) => {
    ev.stopPropagation();
    const entry = (ev.target as any)?.entityEntry as EntityRow;

    if (!entry) {
      logger.error("No entity entry found in event target");
      navigate("/knx/group_monitor");
      return;
    }

    try {
      const entityConfig = await getEntityConfig(this.hass, entry.entity_id);
      const knxData = entityConfig.data.knx;

      // Extract all group addresses from KNX entity configuration
      const groupAddresses = Object.values(knxData)
        .flatMap((config) => {
          if (typeof config !== "object" || config === null) return [];
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
  };

  private _entityDelete = (ev: Event) => {
    ev.stopPropagation();
    const entry = (ev.target as any).entityEntry as EntityRow;
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
  };

  protected render(): TemplateResult {
    const filteredEntities = this._computeRows(this.knx_entities, this._labels);

    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route!}
        .tabs=${[entitiesTab]}
        .localizeFunc=${this.knx.localize}
        .columns=${this._columns(this.hass.language)}
        .data=${filteredEntities}
        .hasFab=${true}
        .searchLabel=${this.hass.localize("ui.panel.config.entities.picker.search", {
          number: this.knx_entities.length,
        })}
        .clickable=${false}
        .filter=${this.filterDevice ?? ""}
        .initialGroupColumn=${this._activeGrouping}
        .initialSorting=${this._activeSorting}
        @grouping-changed=${this._handleGroupingChanged}
        @sorting-changed=${this._handleSortingChanged}
      >
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
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-entities-view": KNXEntitiesView;
  }
}
