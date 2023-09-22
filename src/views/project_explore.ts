import { LitElement, TemplateResult, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";

import "@ha/layouts/hass-tabs-subpage";
import * as HATS from "@ha/layouts/hass-tabs-subpage";
import "@ha/components/ha-card";
import "@ha/components/ha-circular-progress";
import "../components/knx-project-tree-view";

import { compare } from "compare-versions";

import { HomeAssistant, Route } from "@ha/types";
import { KNX } from "../types/knx";
import { KNXProjectRespone } from "../types/websocket";
import { getKnxProject } from "../services/websocket.service";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("info");
// Minimum XKNXProject Version needed which was used for parsing the ETS Project
const MIN_XKNXPROJECT_VERSION = "3.3.0";

@customElement("knx-project-explore")
export class KNXProjectExplore extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  @property({ type: Array, reflect: false }) public tabs!: HATS.PageNavigation[];

  @state() private _knxProjectResp: KNXProjectRespone | null = null;

  protected firstUpdated() {
    this._getKnxProject();
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

  private _renderTreeView(): TemplateResult {
    return html`
      ${this._knxProjectResp?.project_loaded
        ? html` <ha-card
            class="knx-project-tree"
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
          </ha-card>`
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
            : html`
              <div style="display: flex; justify-content: center;">
                <ha-circular-progress
                  alt="Loading..."
                  size="large"
                  active
                ></ha-circular-progress>
            </div>`}
        </div>
      </hass-tabs-subpage>
    `;
  }

  static get styles() {
    return css`
      .rows {
        display: flex;
        justify-content: center;
        flex-direction: column;
      }

      .knx-project-tree {
        margin-right: 8px;
        margin-left: 8px;
        margin-top: 8px;
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
