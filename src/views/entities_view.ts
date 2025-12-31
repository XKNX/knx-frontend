import {
  mdiDelete,
  mdiInformationSlabCircleOutline,
  mdiInformationOffOutline,
  mdiPlus,
  mdiPencilOutline,
  mdiMathLog,
} from "@mdi/js";
import type { TemplateResult } from "lit";
import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";

import type { HassEntity, UnsubscribeFunc } from "home-assistant-js-websocket";
import memoize from "memoize-one";

import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-tabs-subpage-data-table";
import "@ha/components/ha-fab";
import "@ha/components/ha-icon";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-state-icon";
import "@ha/components/ha-svg-icon";
import { navigate } from "@ha/common/navigate";
import { mainWindow } from "@ha/common/dom/get_main_window";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { DataTableColumnContainer } from "@ha/components/data-table/ha-data-table";
import type { ExtEntityRegistryEntry } from "@ha/data/entity_registry";
import { subscribeEntityRegistry } from "@ha/data/entity_registry";
import { showAlertDialog, showConfirmationDialog } from "@ha/dialogs/generic/show-dialog-box";
import { SubscribeMixin } from "@ha/mixins/subscribe-mixin";
import type { HomeAssistant, Route } from "@ha/types";

import { getEntityEntries, deleteEntity, getEntityConfig } from "../services/websocket.service";
import type { KNX } from "../types/knx";
import { BASE_URL, entitiesTab } from "../knx-router";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("knx-entities-view");

export interface EntityRow extends ExtEntityRegistryEntry {
  entityState?: HassEntity;
  friendly_name: string;
  device_name: string;
  area_name: string;
  disabled: boolean;
}

@customElement("knx-entities-view")
export class KNXEntitiesView extends SubscribeMixin(LitElement) {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  @state() private knx_entities: EntityRow[] = [];

  @state() private filterDevice: string | null = null;

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      subscribeEntityRegistry(this.hass.connection!, (_entries) => {
        // When entity registry changes, refresh our entity list.
        this._fetchEntities();
      }),
    ];
  }

  protected firstUpdated() {
    // Initial fetch - when navigating here and already subscribed (coming from a different HA subpage).
    this._fetchEntities();
  }

  protected willUpdate() {
    const urlParams = new URLSearchParams(mainWindow.location.search);
    this.filterDevice = urlParams.get("device_id");
  }

  private async _fetchEntities() {
    getEntityEntries(this.hass)
      .then((entries) => {
        logger.debug(`Fetched ${entries.length} entity entries.`);
        this.knx_entities = entries.map((entry) => {
          const entityState: HassEntity | undefined = this.hass.states[entry.entity_id]; // undefined for disabled entities
          const device = entry.device_id ? this.hass.devices[entry.device_id] : undefined;
          const areaId = entry.area_id ?? device?.area_id;
          const area = areaId ? this.hass.areas[areaId] : undefined;
          return {
            ...entry,
            entityState,
            friendly_name:
              entityState?.attributes.friendly_name ?? entry.name ?? entry.original_name ?? "",
            device_name: device?.name ?? "",
            area_name: area?.name ?? "",
            disabled: !!entry.disabled_by,
          };
        });
      })
      .catch((err) => {
        logger.error("getEntityEntries", err);
        navigate("/knx/error", { replace: true, data: err });
      });
  }

  private _columns = memoize((_language): DataTableColumnContainer<EntityRow> => {
    const iconWidth = "56px";
    const actionWidth = "224px"; // 48px*4 + 16px*3 padding

    return {
      icon: {
        title: "",
        minWidth: iconWidth,
        maxWidth: iconWidth,
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
        title: "Friendly Name",
        flex: 2,
        // sorting didn't work properly with templates
      },
      entity_id: {
        filterable: true,
        sortable: true,
        title: "Entity ID",
        flex: 1,
      },
      device_name: {
        filterable: true,
        sortable: true,
        title: "Device",
        flex: 1,
      },
      device_id: {
        hidden: true, // for filtering only
        title: "Device ID",
        filterable: true,
        template: (entry) => entry.device_id ?? "",
      },
      area_name: {
        title: "Area",
        sortable: true,
        filterable: true,
        flex: 1,
      },
      actions: {
        showNarrow: true,
        title: "",
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
            .label=${this.knx.localize("monitor_telegrams")}
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
    if (!this.hass || !this.knx_entities) {
      return html` <hass-loading-screen></hass-loading-screen> `;
    }

    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path=${BASE_URL}
        .route=${this.route!}
        .tabs=${[entitiesTab]}
        .localizeFunc=${this.knx.localize}
        .columns=${this._columns(this.hass.language)}
        .data=${this.knx_entities}
        .hasFab=${true}
        .searchLabel=${this.hass.localize("ui.components.data-table.search")}
        .clickable=${false}
        .filter=${this.filterDevice}
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

  static styles = css`
    hass-loading-screen {
      --app-header-background-color: var(--sidebar-background-color);
      --app-header-text-color: var(--sidebar-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-entities-view": KNXEntitiesView;
  }
}
