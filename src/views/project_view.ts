import { mdiFilterVariant } from "@mdi/js";
import { LitElement, TemplateResult, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";

import memoize from "memoize-one";

import { HASSDomEvent } from "@ha/common/dom/fire_event";
import "@ha/layouts/hass-tabs-subpage";
import type { PageNavigation } from "@ha/layouts/hass-tabs-subpage";
import "@ha/components/ha-alert";
import "@ha/components/ha-card";
import "@ha/components/ha-circular-progress";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-icon-button";
import "@ha/components/data-table/ha-data-table";
import type { DataTableColumnContainer } from "@ha/components/data-table/ha-data-table";

import "../components/knx-project-tree-view";

import { compare } from "compare-versions";

import { HomeAssistant, Route } from "@ha/types";
import { KNX } from "../types/knx";
import type { GroupRangeSelectionChangedEvent } from "../components/knx-project-tree-view";
import { DPT, GroupAddress, KNXProjectRespone } from "../types/websocket";
import { dptToString } from "../utils/format";
import { getKnxProject } from "../services/websocket.service";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("knx-project-view");
// Minimum XKNXProject Version needed which was used for parsing the ETS Project
const MIN_XKNXPROJECT_VERSION = "3.3.0";

@customElement("knx-project-view")
export class KNXProjectView extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  @property({ type: Array, reflect: false }) public tabs!: PageNavigation[];

  @property({ type: Boolean, reflect: true }) private rangeSelectorHidden = true;

  @state() private _knxProjectResp: KNXProjectRespone | null = null;

  @state() private _visibleGroupAddresses: string[] = [];

  @state() private _groupRangeAvailable: boolean = false;

  protected firstUpdated() {
    this._getKnxProject();
  }

  private _columns = memoize((narrow, _language): DataTableColumnContainer<GroupAddress> => {
    const addressWidth = "95px";
    const dptWidth = "80px";

    return {
      address: {
        filterable: true,
        sortable: true,
        title: "Address",
        width: "95px",
      },
      name: {
        filterable: true,
        sortable: true,
        title: "Name",
        width: narrow
          ? "calc(100% - " + dptWidth + " - " + addressWidth + ")"
          : "calc(50% - " + dptWidth + ")",
      },
      description: {
        filterable: true,
        sortable: true,
        hidden: narrow,
        title: "Description",
        width: "calc(50% - " + addressWidth + ")",
      },
      dpt: {
        sortable: true,
        filterable: true,
        title: "DPT",
        type: "numeric",
        width: "80px",
        template: (dpt: DPT | null) => dptToString(dpt),
      },
    };
  });

  private _getKnxProject() {
    getKnxProject(this.hass).then(
      (knxProjectResp) => {
        this._knxProjectResp = knxProjectResp;
        this._groupRangeAvailable = compare(
          knxProjectResp.knxproject.info.xknxproject_version ?? "0.0.0",
          MIN_XKNXPROJECT_VERSION,
          ">=",
        );
        this.requestUpdate();
      },
      (err) => {
        logger.error("getKnxProject", err);
      },
    );
  }

  private _getRows(visibleGroupAddresses: string[]): GroupAddress[] {
    if (!visibleGroupAddresses.length)
      // if none is set, default to show all
      return Object.values(this._knxProjectResp!.knxproject.group_addresses);

    return Object.entries(this._knxProjectResp!.knxproject.group_addresses).reduce(
      (result, [key, groupAddress]) => {
        if (visibleGroupAddresses.includes(key)) {
          result.push(groupAddress);
        }
        return result;
      },
      [] as GroupAddress[],
    );
  }

  private _visibleAddressesChanged(ev: HASSDomEvent<GroupRangeSelectionChangedEvent>) {
    this._visibleGroupAddresses = ev.detail.groupAddresses;
  }

  protected render(): TemplateResult | void {
    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        .narrow=${this.narrow!}
        .route=${this.route!}
        .tabs=${this.tabs}
        .localizeFunc=${this.knx.localize}
      >
        ${this._knxProjectResp
          ? this._renderProjectView()
          : html` <div style="display: flex; justify-content: center;">
              <ha-circular-progress alt="Loading..." size="large" active></ha-circular-progress>
            </div>`}
      </hass-tabs-subpage>
    `;
  }

  private _renderProjectView(): TemplateResult {
    const filtered = this._getRows(this._visibleGroupAddresses);
    return html`
      ${this._knxProjectResp?.project_loaded
        ? html`${this.narrow && this._groupRangeAvailable
              ? html`<ha-icon-button
                  slot="toolbar-icon"
                  .label=${this.hass.localize("ui.components.related-filter-menu.filter")}
                  .path=${mdiFilterVariant}
                  @click=${this._toggleRangeSelector}
                ></ha-icon-button>`
              : nothing}
            <div class="sections">
              ${this._groupRangeAvailable
                ? html`
                    <knx-project-tree-view
                      .data=${this._knxProjectResp.knxproject}
                      @knx-group-range-selection-changed=${this._visibleAddressesChanged}
                    ></knx-project-tree-view>
                  `
                : nothing}
              <ha-data-table
                class="ga-table"
                .hass=${this.hass}
                .columns=${this._columns(this.narrow, this.hass.language)}
                .data=${filtered}
                .hasFab=${false}
                .searchLabel=${this.hass.localize("ui.components.data-table.search")}
                .clickable=${false}
              ></ha-data-table>
            </div>`
        : html` <ha-card .header=${this.knx.localize("attention")}>
            <div class="card-content">
              <p>${this.knx.localize("project_view_upload")}</p>
            </div>
          </ha-card>`}
    `;
  }

  private _toggleRangeSelector() {
    this.rangeSelectorHidden = !this.rangeSelectorHidden;
  }

  static get styles() {
    return css`
      .sections {
        display: flex;
        flex-direction: row;
        height: 100%;
      }

      :host([narrow]) knx-project-tree-view {
        position: absolute;
        max-width: calc(100% - 60px); /* 100% -> max 871px before not narrow */
        z-index: 1;
        right: 0;
        transition: 0.5s;
        border-left: 1px solid var(--divider-color);
      }

      :host([narrow][rangeSelectorHidden]) knx-project-tree-view {
        width: 0;
      }

      :host(:not([narrow])) knx-project-tree-view {
        max-width: 255px; /* min 616px - 816px for tree-view + ga-table (depending on side menu) */
      }

      .ga-table {
        flex: 1;
      }

      ha-circular-progress {
        margin-top: 32px;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-project-view": KNXProjectView;
  }
}
