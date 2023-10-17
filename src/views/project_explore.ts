import { LitElement, TemplateResult, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";

import { HASSDomEvent } from "@ha/common/dom/fire_event";
import "@ha/layouts/hass-tabs-subpage";
import type { PageNavigation } from "@ha/layouts/hass-tabs-subpage";
import "@ha/components/ha-card";
import "@ha/components/ha-circular-progress";
import "@ha/components/ha-expansion-panel";
import "@ha/components/data-table/ha-data-table";
import type {
  DataTableColumnContainer,
  DataTableRowData,
} from "@ha/components/data-table/ha-data-table";

import "../components/knx-project-tree-view";

import { compare } from "compare-versions";

import { HomeAssistant, Route } from "@ha/types";
import { KNX } from "../types/knx";
import type { GroupRangeSelectionChangedEvent } from "../components/knx-project-tree-view";
import { GroupAddress, KNXProjectRespone } from "../types/websocket";
import { getKnxProject } from "../services/websocket.service";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("knx-project-explore");
// Minimum XKNXProject Version needed which was used for parsing the ETS Project
const MIN_XKNXPROJECT_VERSION = "3.3.0";

@customElement("knx-project-explore")
export class KNXProjectExplore extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  @property({ type: Array, reflect: false }) public tabs!: PageNavigation[];

  @state() private _knxProjectResp: KNXProjectRespone | null = null;

  @state() private _columns: DataTableColumnContainer = {};

  @state() private _visibleGroupAddresses: string[] = [];

  protected firstUpdated() {
    this._getKnxProject();

    this._columns = {
      address: {
        filterable: true,
        sortable: true,
        title: "Address",
        width: "10%",
      },
      text: {
        filterable: true,
        sortable: true,
        title: "Name",
        width: "40%",
      },
      description: {
        filterable: true,
        sortable: true,
        title: "Description",
        width: "40%",
      },
      dpt: {
        sortable: true,
        filterable: true,
        title: "DPT",
        width: "10%",
      },
    };
  }

  private _getKnxProject() {
    getKnxProject(this.hass).then(
      (knxProjectResp) => {
        this._knxProjectResp = knxProjectResp;
        this.requestUpdate();
      },
      (err) => {
        logger.error("getKnxProject", err);
      },
    );
  }

  private _groupAddressToRow(groupAddress: GroupAddress, _index: number): DataTableRowData {
    const dpt = groupAddress.dpt
      ? groupAddress.dpt.main +
        (groupAddress.dpt.sub ? "." + groupAddress.dpt.sub.toString().padStart(3, "0") : "")
      : "";
    return {
      address: groupAddress.address,
      text: groupAddress.name,
      description: groupAddress.description,
      dpt: dpt,
    };
  }

  private _getRows(visibleGroupAddresses: string[]): DataTableRowData[] {
    return Object.entries(this._knxProjectResp!.knxproject.group_addresses)
      .filter(([key, _val]) =>
        // if none is set, default to show all
        visibleGroupAddresses.length ? visibleGroupAddresses.includes(key) : true,
      )
      .map(([_ga, groupAddress], index) => this._groupAddressToRow(groupAddress, index));
  }

  private _visibleAddressesChanged(ev: HASSDomEvent<GroupRangeSelectionChangedEvent>) {
    this._visibleGroupAddresses = ev.detail.groupAddresses;
  }

  private _renderTreeView(): TemplateResult {
    const filtered = this._getRows(this._visibleGroupAddresses);
    return html`
      ${this._knxProjectResp?.project_loaded
        ? html` <ha-expansion-panel
              class="knx-project-tree"
              outlined
              .header=${this.knx.localize("project_explore_tree_view_title")}
            >
              <div class="card-content">
                ${compare(
                  this._knxProjectResp?.knxproject.info.xknxproject_version ?? "0.0.0",
                  MIN_XKNXPROJECT_VERSION,
                  ">=",
                )
                  ? html`
                      <knx-project-tree-view
                        .data=${this._knxProjectResp.knxproject}
                        @knx-group-range-selection-changed=${this._visibleAddressesChanged}
                      ></knx-project-tree-view>
                    `
                  : html`
                      <p>${this.knx.localize("project_explore_version_l1")}</p>
                      <p style="margin-left: 16px;font-weight: bold">
                        ${this._knxProjectResp?.knxproject.info.xknxproject_version} &lt;
                        ${MIN_XKNXPROJECT_VERSION}
                        (${this.knx.localize("project_explore_version_l2")})
                      </p>
                      <p>${this.knx.localize("project_explore_version_l3")}</p>
                    `}
              </div>
            </ha-expansion-panel>
            <ha-data-table
              class="ga-table"
              .hass=${this.hass}
              .columns=${this._columns}
              .data=${filtered}
              .hasFab=${false}
              .searchLabel=${this.hass.localize("ui.components.data-table.search")}
              id="index"
              .clickable=${false}
            ></ha-data-table>`
        : html` <ha-card class="knx-project-tree" .header=${this.knx.localize("attention")}>
            <div class="card-content">
              <p>${this.knx.localize("project_explore_upload")}</p>
            </div>
          </ha-card>`}
    `;
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
        <div class="rows">
          ${this._knxProjectResp
            ? this._renderTreeView()
            : html` <div style="display: flex; justify-content: center;">
                <ha-circular-progress alt="Loading..." size="large" active></ha-circular-progress>
              </div>`}
        </div>
      </hass-tabs-subpage>
    `;
  }

  static get styles() {
    return css`
      .rows {
        display: flex;
        /* justify-content: center; */
        flex-direction: column;
        height: 100%;
      }

      .knx-project-tree {
        margin: 8px;
        flex: 0;
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
    "knx-project-explore": KNXProjectExplore;
  }
}
