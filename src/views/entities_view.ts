import { mdiDelete, mdiInformationSlabCircleOutline, mdiPlus, mdiPencilOutline } from "@mdi/js";
import { LitElement, TemplateResult, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";

import memoize from "memoize-one";
import { HassEntity } from "home-assistant-js-websocket";

import { fireEvent } from "@ha/common/dom/fire_event";
import { navigate } from "@ha/common/navigate";
import { AreaRegistryEntry } from "@ha/data/area_registry";
import { ExtEntityRegistryEntry } from "@ha/data/entity_registry";
import { mainWindow } from "@ha/common/dom/get_main_window";
import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-tabs-subpage";
import type { PageNavigation } from "@ha/layouts/hass-tabs-subpage";
import "@ha/components/ha-card";
import "@ha/components/ha-fab";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-icon-overflow-menu";
import "@ha/components/ha-state-icon";
import "@ha/components/ha-svg-icon";
import "@ha/components/data-table/ha-data-table";
import type { DataTableColumnContainer } from "@ha/components/data-table/ha-data-table";
import { showAlertDialog, showConfirmationDialog } from "@ha/dialogs/generic/show-dialog-box";

import "../components/knx-project-tree-view";

import { HomeAssistant, Route } from "@ha/types";
import { KNX } from "../types/knx";
import { getEntityEntries, deleteEntity } from "../services/websocket.service";
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

  protected firstUpdated() {
    this._fetchEntities();
  }

  private async _fetchEntities() {
    const entries = await getEntityEntries(this.hass);
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
  }

  private _columns = memoize((_narrow, _language): DataTableColumnContainer<EntityRow> => {
    const iconWidth = "56px";
    const actionWidth = "176px"; // 48px*3 + 16px*2 padding
    const textColumnWith = `calc((100% - ${iconWidth} - ${actionWidth}) / 4)`;

    return {
      icon: {
        title: "",
        width: iconWidth,
        type: "icon",
        template: (entry) => html`
          <ha-state-icon
            title=${ifDefined(entry.entityState?.state)}
            slot="item-icon"
            .state=${entry.entityState}
          ></ha-state-icon>
        `,
      },
      friendly_name: {
        filterable: true,
        sortable: true,
        title: "Friendly Name",
        width: textColumnWith,
        template: (entry) => entry.entityState?.attributes.friendly_name ?? "",
      },
      name: {
        filterable: true,
        sortable: true,
        title: "Name",
        width: textColumnWith,
        // template: (entry) => this.hass.states[entry.entity_id].attributes.friendly_name,
        template: (entry) => entry.name ?? entry.original_name ?? "",
      },
      entity_id: {
        filterable: true,
        sortable: true,
        title: "Entity ID",
        width: textColumnWith,
        // template: (entry) => entry.entity_id,
      },
      area: {
        title: "Area",
        sortable: true,
        filterable: true,
        width: textColumnWith,
        template: (entry) => entry.area?.name ?? "",
      },
      actions: {
        title: "",
        width: actionWidth,
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

  protected render(): TemplateResult | void {
    if (!this.hass || !this.knx_entities) {
      return html` <hass-loading-screen></hass-loading-screen> `;
    }

    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        .narrow=${this.narrow!}
        .route=${this.route!}
        .tabs=${this.tabs}
        .localizeFunc=${this.knx.localize}
      >
        <div class="sections">
          <ha-data-table
            class="entity-table"
            .hass=${this.hass}
            .columns=${this._columns(this.narrow, this.hass.language)}
            .data=${this.knx_entities}
            .hasFab=${true}
            .searchLabel=${this.hass.localize("ui.components.data-table.search")}
            .clickable=${false}
          ></ha-data-table>
        </div>
        <ha-fab
          slot="fab"
          .label=${this.hass.localize("ui.common.add")}
          extended
          @click=${this._entityCreate}
        >
          <ha-svg-icon slot="icon" .path=${mdiPlus}></ha-svg-icon>
        </ha-fab>
      </hass-tabs-subpage>
    `;
  }

  private _entityCreate() {
    navigate("/knx/entities/create");
  }

  static get styles() {
    return css`
      hass-loading-screen {
        --app-header-background-color: var(--sidebar-background-color);
        --app-header-text-color: var(--sidebar-text-color);
      }
      .sections {
        display: flex;
        flex-direction: row;
        height: 100%;
      }

      .entity-table {
        flex: 1;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-entities-view": KNXEntitiesView;
  }
}
