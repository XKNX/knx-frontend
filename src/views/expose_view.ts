import { mdiDelete, mdiPlus, mdiPencilOutline, mdiMathLog } from "@mdi/js";
import type { TemplateResult } from "lit";
import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";

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
import type { DataTableColumnContainer } from "@ha/components/data-table/ha-data-table";
import { showAlertDialog, showConfirmationDialog } from "@ha/dialogs/generic/show-dialog-box";
import type { PageNavigation } from "@ha/layouts/hass-tabs-subpage";
import { SubscribeMixin } from "@ha/mixins/subscribe-mixin";
import type { HomeAssistant, Route } from "@ha/types";

import { getExposeEntries, deleteExpose } from "../services/websocket.service";
import type { ExposeData } from "../types/expose_data";
import type { KNX } from "../types/knx";
import { BASE_URL, exposeTab } from "../knx-router";
import { KNXLogger } from "../tools/knx-logger";
import { getPlatformStyle } from "../utils/common";

const logger = new KNXLogger("knx-expose-view");

interface ExposeRow {
  address: string;
  data: ExposeData;
}

@customElement("knx-expose-view")
export class KNXExposeView extends SubscribeMixin(LitElement) {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  @property({ type: Array, reflect: false }) public tabs!: PageNavigation[];

  @state() private knx_exposeds: ExposeRow[] = [];

  @state() private filterDevice: string | null = null;

  protected firstUpdated() {
    // Initial fetch - when navigating here and already subscribed (coming from a different HA subpage).
    this._fetchExpose();
  }

  protected willUpdate() {
    const urlParams = new URLSearchParams(mainWindow.location.search);
    this.filterDevice = urlParams.get("device_id");
  }

  private async _fetchExpose() {
    getExposeEntries(this.hass)
      .then((entries) => {
        this.knx_exposeds = Object.entries(entries).map(([address, data]) => ({ address, data }));
        logger.debug(`Fetched ${this.knx_exposeds.length} exposed entries.`);
      })
      .catch((err) => {
        logger.error("getExposeEntries", err);
        navigate("/knx/error", { replace: true, data: err });
      });
  }

  private _columns = memoize((_language): DataTableColumnContainer<ExposeRow> => {
    const iconWidth = "56px";
    const actionWidth = "224px"; // 48px*4 + 16px*3 padding

    return {
      icon: {
        title: "",
        minWidth: iconWidth,
        maxWidth: iconWidth,
        type: "icon",
        template: (entry) =>
          html`<ha-svg-icon
            slot="icon"
            .path=${getPlatformStyle(entry.data.type).iconPath}
          ></ha-svg-icon>`,
      },
      address: {
        filterable: true,
        sortable: true,
        title: "Exposed Address",
        flex: 1,
        template: (entry) => entry.address || "",
      },
      type: {
        filterable: true,
        sortable: true,
        title: "Type",
        flex: 1,
        template: (entry) => entry.data.type,
      },
      actions: {
        showNarrow: true,
        title: "",
        minWidth: actionWidth,
        maxWidth: actionWidth,
        type: "icon-button",
        template: (entry) => html`
          <ha-icon-button
            .label=${this.hass.localize("ui.common.edit")}
            .path=${mdiPencilOutline}
            .exposeEntry=${entry}
            @click=${this._exposeEdit}
          ></ha-icon-button>
          <ha-icon-button
            .label=${this.knx.localize("monitor_telegrams")}
            .path=${mdiMathLog}
            .exposeEntry=${entry}
            @click=${this._showExposeTelegrams}
          ></ha-icon-button>
          <ha-icon-button
            .label=${this.hass.localize("ui.common.delete")}
            .path=${mdiDelete}
            .exposeEntry=${entry}
            @click=${this._exposeDelete}
          ></ha-icon-button>
        `,
      },
    };
  });

  private _exposeEdit = (ev: Event) => {
    ev.stopPropagation();
    const row = (ev.target as any).exposeEntry as ExposeRow;
    navigate("/knx/expose/edit/" + row.address);
  };

  private _showExposeTelegrams = async (ev: Event) => {
    ev.stopPropagation();
    const row = (ev.target as any)?.exposeEntry as ExposeRow;

    if (!row) {
      logger.error("No expose row found in event target");
      navigate("/knx/group_monitor");
      return;
    }

    navigate(`/knx/group_monitor?destination=${encodeURIComponent(row.address)}`);
  };

  private _exposeDelete = (ev: Event) => {
    ev.stopPropagation();
    const row = (ev.target as any).exposeEntry as ExposeRow;
    showConfirmationDialog(this, {
      text: `${this.hass.localize("ui.common.delete")} ${row.address}?`,
    }).then((confirmed) => {
      if (confirmed) {
        deleteExpose(this.hass, row.address)
          .then(() => {
            logger.debug("expose deleted", row.address);
            this._fetchExpose();
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
    if (!this.hass || !this.knx_exposeds) {
      return html` <hass-loading-screen></hass-loading-screen> `;
    }

    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path=${BASE_URL}
        .route=${this.route!}
        .tabs=${[exposeTab]}
        .localizeFunc=${this.knx.localize}
        .columns=${this._columns(this.hass.language)}
        .data=${this.knx_exposeds}
        .hasFab=${true}
        .searchLabel=${this.hass.localize("ui.components.data-table.search")}
        .clickable=${false}
        .filter=${this.filterDevice}
      >
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

  static styles = css`
    hass-loading-screen {
      --app-header-background-color: var(--sidebar-background-color);
      --app-header-text-color: var(--sidebar-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-expose-view": KNXExposeView;
  }
}
