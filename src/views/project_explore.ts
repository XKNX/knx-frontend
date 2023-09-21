import { LitElement, TemplateResult, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";

import "@ha/layouts/hass-tabs-subpage";
import "@ha/components/ha-card";
import "@ha/components/ha-circular-progress"
import "../components/knx-project-tree-view";

import { HomeAssistant, Route } from "@ha/types";
import { KNX } from "../types/knx";
import { knxMainTabs } from "../knx-router";
import { KNXProject } from "../types/websocket";
import {
  getKnxProject,
} from "../services/websocket.service";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("info");

@customElement("knx-project-explore")
export class KNXProjectExplore extends LitElement {
    @property({ type: Object }) public hass!: HomeAssistant;

    @property({ attribute: false }) public knx!: KNX;

    @property({ type: Boolean, reflect: true }) public narrow!: boolean;

    @property({ type: Object }) public route?: Route;

    @state() private _knxProject: KNXProject | null = null;

    protected firstUpdated() {
      this._getKnxProject();
    }

    private _getKnxProject() {
      getKnxProject(this.hass).then(
        (knxProject) => {
          this._knxProject = knxProject;
          this.requestUpdate();
        },
        (err) => {
          logger.error("getKnxProject", err);
        },
      );
    }

    private _renderTreeView(): TemplateResult {
      return html`
        ${this._knxProject?.project_loaded 
          ? html`
          <ha-card class="knx-project-tree" .header=${this.knx.localize("project_explore_tree_view_title")}>
            <div class="card-content">
              <knx-project-tree-view .data=${this._knxProject.knxproject}></knx-project-tree-view>
            </div>
          </ha-card>`
          : html`
          <ha-card class="knx-project-tree" .header=${this.knx.localize("attention")}>
            <div class="card-content">
              <p>${this.knx.localize("project_explore_upload")}</p>
            </div>
          </ha-card>`
        }
      `
    }

    protected render(): TemplateResult | void {
        return html`
            <hass-tabs-subpage
                .hass=${this.hass}
                .narrow=${this.narrow!}
                .route=${this.route!}
                .tabs=${knxMainTabs}
                .localizeFunc=${this.knx.localize}
            >
              <div class="columns">
                ${this._knxProject 
                  ? this._renderTreeView() 
                  : html`<ha-circular-progress alt="Loading..." size="large" active></ha-circular-progress>`
                }
              </div>
            </hass-tabs-subpage>
        `;
    }

    static get styles() {
      return css`
        .columns {
          display: flex;
          justify-content: center;
          flex-direction: column;
        }

        .knx-project-tree {
          margin-right: 8px;
          margin-left: 8px;
          margin-top: 8px;
        }
      `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "knx-project-explore": KNXProjectExplore;
    }
}