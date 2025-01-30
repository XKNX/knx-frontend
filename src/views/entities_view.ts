import { mdiDelete, mdiInformationSlabCircleOutline, mdiPlus, mdiPencilOutline } from "@mdi/js";
import type { TemplateResult } from "lit";
import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";

import type { HassEntity } from "home-assistant-js-websocket";
import memoize from "memoize-one";

import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-tabs-subpage-data-table";
import "@ha/components/ha-fab";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-state-icon";
import "@ha/components/ha-svg-icon";
import { navigate } from "@ha/common/navigate";
import { mainWindow } from "@ha/common/dom/get_main_window";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { DataTableColumnContainer } from "@ha/components/data-table/ha-data-table";
import type { AreaRegistryEntry } from "@ha/data/area_registry";
import type { ExtEntityRegistryEntry } from "@ha/data/entity_registry";
import { showAlertDialog, showConfirmationDialog } from "@ha/dialogs/generic/show-dialog-box";
import type { PageNavigation } from "@ha/layouts/hass-tabs-subpage";
import type { HomeAssistant, Route } from "@ha/types";

import { getEntityEntries, deleteEntity } from "../services/websocket.service";
import type { KNX } from "../types/knx";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("knx-entities-view");

export interface EntityRow extends ExtEntityRegistryEntry {
  entityState?: HassEntity;
  area?: AreaRegistryEntry;
}

@customElement("knx-entities-view")
export class KNXEntitiesView extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  @property({ type: Array, reflect: false }) public tabs!: PageNavigation[];

  @state() private knx_entities: EntityRow[] = [];

  @state() private filterDevice: string | null = null;

  protected firstUpdated() {
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
          const entityState = this.hass.states[entry.entity_id];
          const device = entry.device_id ? this.hass.devices[entry.device_id] : undefined;
          const areaId = entry.area_id ?? device?.area_id;
          const area = areaId ? this.hass.areas[areaId] : undefined;
          return {
            ...entry,
            entityState,
            area,
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
    const actionWidth = "176px"; // 48px*3 + 16px*2 padding

    return {
      icon: {
        title: "",
        minWidth: iconWidth,
        maxWidth: iconWidth,
        type: "icon",
        template: (entry) => html`
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
        template: (entry) => entry.entityState?.attributes.friendly_name ?? "",
      },
      entity_id: {
        filterable: true,
        sortable: true,
        title: "Entity ID",
        flex: 1,
        // template: (entry) => entry.entity_id,
      },
      device: {
        filterable: true,
        sortable: true,
        title: "Device",
        flex: 1,
        template: (entry) =>
          entry.device_id ? (this.hass.devices[entry.device_id].name ?? "") : "",
      },
      device_id: {
        hidden: true, // for filtering only
        title: "Device ID",
        filterable: true,
        template: (entry) => entry.device_id ?? "",
      },
      area: {
        title: "Area",
        sortable: true,
        filterable: true,
        flex: 1,
        template: (entry) => entry.area?.name ?? "",
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
    const entry = ev.target.entityEntry as EntityRow;
    navigate("/knx/entities/edit/" + entry.entity_id);
  };

  private _entityMoreInfo = (ev: Event) => {
    ev.stopPropagation();
    const entry = ev.target.entityEntry as EntityRow;
    fireEvent(mainWindow.document.querySelector("home-assistant")!, "hass-more-info", {
      entityId: entry.entity_id,
    });
  };

  private _entityDelete = (ev: Event) => {
    ev.stopPropagation();
    const entry = ev.target.entityEntry as EntityRow;
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
        .route=${this.route!}
        .tabs=${this.tabs}
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
