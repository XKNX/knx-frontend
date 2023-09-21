import { mdiFileUpload } from "@mdi/js";
import { css, nothing, html, LitElement, TemplateResult, CSSResultGroup } from "lit";
import { customElement, property, state } from "lit/decorators";

import "@ha/components/ha-card";
import "@ha/layouts/hass-tabs-subpage";
import "@ha/components/ha-button";
import "@ha/components/ha-file-upload";
import "@ha/components/ha-selector/ha-selector-text";
import "@ha/components/ha-circular-progress"
import { uploadFile } from "@ha/data/file_upload";
import { extractApiErrorMessage } from "@ha/data/hassio/common";
import { showAlertDialog, showConfirmationDialog } from "@ha/dialogs/generic/show-dialog-box";
import { HomeAssistant, Route } from "@ha/types";

import { knxMainTabs, getTabPath } from "../knx-router";
import {
  getKnxInfoData,
  processProjectFile,
  removeProjectFile,
} from "../services/websocket.service";

import { KNX } from "../types/knx";
import { KNXInfoData, KNXProjectInfo } from "../types/websocket";
import { KNXLogger } from "../tools/knx-logger";
import { VERSION } from "../version";

const logger = new KNXLogger("info");

@customElement("knx-info")
export class KNXInfo extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  @state() private knxInfoData: KNXInfoData | null = null;

  @state() private _projectPassword?: string;

  @state() private _uploading = false;

  @state() private _projectFile?: File;

  protected firstUpdated() {
    this.loadKnxInfo();
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
          ${this.knxInfoData 
          ? html`
            ${this._renderInfoCard()}
            ${this.knxInfoData?.project ? this._renderProjectDataCard(this.knxInfoData.project) : nothing}
            ${this._renderProjectUploadCard()}
          `
          : html`
            <ha-circular-progress alt="Loading..." size="large" active></ha-circular-progress>
          `}
        </div>
      </hass-tabs-subpage>
    `;
  }

  private _renderInfoCard() {
    return html`
      <ha-card class="knx-info">
        <div class="card-content knx-info-section">
          <div class="knx-content-row header">
            ${this.knx.localize("info_information_header")}
          </div>

          <div class="knx-content-row">
            <div>XKNX Version</div>
            <div>${this.knxInfoData?.version}</div>
          </div>

          <div class="knx-content-row">
            <div>KNX-Frontend Version</div>
            <div>${VERSION}</div>
          </div>

          <div class="knx-content-row">
            <div>${this.knx.localize("info_connected_to_bus")}</div>
            <div>
              ${this.hass.localize(
                this.knxInfoData?.connected ? "ui.common.yes" : "ui.common.no",
              )}
            </div>
          </div>

          <div class="knx-content-row">
            <div>${this.knx.localize("info_individual_address")}</div>
            <div>${this.knxInfoData?.current_address}</div>
          </div>

          <div class="knx-bug-report">
            <div>${this.knx.localize("info_issue_tracker")}</div>
            <ul>
              <li>
                <a href="https://github.com/XKNX/knx-frontend/issues" target="_blank"
                  >${this.knx.localize("info_issue_tracker_knx_frontend")}</a
                >
              </li>
              <li>
                <a href="https://github.com/XKNX/xknxproject/issues" target="_blank"
                  >${this.knx.localize("info_issue_tracker_xknxproject")}</a
                >
              </li>
              <li>
                <a href="https://github.com/XKNX/xknx/issues" target="_blank"
                  >${this.knx.localize("info_issue_tracker_xknx")}</a
                >
              </li>
            </ul>
          </div>
        </div>
      </ha-card>`
  }

  private _renderProjectDataCard(projectInfo: KNXProjectInfo) {
    return html`
      <ha-card class="knx-info">
          <div class="card-content knx-content">
            <div class="header knx-content-row">
              ${this.knx.localize("info_project_data_header")}
            </div>
            <div class="knx-content-row">
              <div>${this.knx.localize("info_project_data_name")}</div>
              <div>${projectInfo.name}</div>
            </div>
            <div class="knx-content-row">
              <div>${this.knx.localize("info_project_data_last_modified")}</div>
              <div>${new Date(projectInfo.last_modified).toUTCString()}</div>
            </div>
            <div class="knx-content-row">
              <div>${this.knx.localize("info_project_data_tool_version")}</div>
              <div>${projectInfo.tool_version}</div>
            </div>
            <div class="knx-content-row">
              <div>${this.knx.localize("info_project_data_xknxproject_version")}</div>
              <div>${projectInfo.xknxproject_version}</div>
            </div>
            <div class="knx-button-row">
              <a href=${getTabPath("explore")}>
                <ha-button class="knx-project-explore">
                  ${this.knx.localize("project_explore_title")}
                </ha-button>
              </a>
              <ha-button
                class="knx-warning push-right"
                @click=${this._removeProject}
                .disabled=${this._uploading || !this.knxInfoData?.project}
                >
                ${this.knx.localize("info_project_delete")}
              </ha-button>
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }

  private _renderProjectUploadCard() {
    return html`
      <ha-card class="knx-info">
        <div class="card-content knx-content">
          <div class="knx-content-row header">
            ${this.knx.localize("info_project_file_header")}
          </div>
          <div class="knx-content-row">
            ${this.knx.localize("info_project_upload_description")}
          </div>
          <div class="knx-content-row">
            <ha-file-upload
              .hass=${this.hass}
              accept=".knxproj, .knxprojarchive"
              .icon=${mdiFileUpload}
              .label=${this.knx.localize("info_project_file")}
              .value=${this._projectFile?.name}
              .uploading=${this._uploading}
              @file-picked=${this._filePicked}
            ></ha-file-upload>
          </div>
          <div class="knx-content-row">
            <ha-selector-text
              .hass=${this.hass}
              .value=${this._projectPassword || ""}
              .label=${this.hass.localize("ui.login-form.password")}
              .selector=${{ text: { multiline: false, type: "password" } }}
              .required=${false}
              @value-changed=${this._passwordChanged}
            >
            </ha-selector-text>
          </div>
          <div class="knx-button-row">
            <ha-button
              class="push-right"
              @click=${this._uploadFile}
              .disabled=${this._uploading || !this._projectFile}
              >${this.hass.localize("ui.common.submit")}</ha-button
            >
          </div>
        </div>
      </ha-card>`;
  }

  private loadKnxInfo() {
    getKnxInfoData(this.hass).then(
      (knxInfoData) => {
        this.knxInfoData = knxInfoData;
        this.requestUpdate();
      },
      (err) => {
        logger.error("getKnxInfoData", err);
      },
    );
  }

  private _filePicked(ev) {
    this._projectFile = ev.detail.files[0];
  }

  private _passwordChanged(ev) {
    this._projectPassword = ev.detail.value;
  }

  private async _uploadFile(_ev) {
    const file = this._projectFile;
    if (typeof file === "undefined") {
      return;
    }

    let error: Error | undefined;
    this._uploading = true;
    try {
      const project_file_id = await uploadFile(this.hass, file);
      await processProjectFile(this.hass, project_file_id, this._projectPassword || "");
    } catch (err: any) {
      error = err;
      showAlertDialog(this, {
        title: "Upload failed",
        text: extractApiErrorMessage(err),
        confirmText: "ok",
      });
    } finally {
      if (!error) {
        this._projectFile = undefined;
        this._projectPassword = undefined;
      }
      this._uploading = false;
      this.loadKnxInfo();
    }
  }

  private async _removeProject(_ev) {
    const confirmed = await showConfirmationDialog(this, {
      text: this.knx.localize("info_project_delete"),
    });
    if (!confirmed) {
      logger.debug("User cancelled deletion");
      return;
    }

    try {
      await removeProjectFile(this.hass);
    } catch (err: any) {
      showAlertDialog(this, {
        title: "Deletion failed",
        text: extractApiErrorMessage(err),
        confirmText: "ok",
      });
    } finally {
      this.loadKnxInfo();
    }
  }

  static get styles(): CSSResultGroup {
    return css`
      .columns {
        display: flex;
        justify-content: center;
      }

      @media screen and (max-width: 1232px) {
        .columns {
          flex-direction: column;
        }

        .knx-button-row {
          margin-top: 20px;
        }

        .knx-info {
          margin-right: 8px;
        }
      }

      @media screen and (min-width: 1233px) {
        .knx-button-row {
          margin-top: auto;
        }

        .knx-info {
          width: 400px;
        }
      }

      .knx-info {
        margin-left: 8px;
        margin-top: 8px;
      }

      .knx-content {
        display: flex;
        flex-direction: column;
        height: 100%;
        box-sizing: border-box;
      }

      .knx-content-row {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
      }

      .knx-content-row > div:nth-child(2) {
        margin-left: 1rem;
      }

      .knx-button-row {
        display: flex;
        flex-direction: row;
        vertical-align: bottom;
        padding-top: 16px;
      }

      .push-left {
        margin-right: auto;
      }

      .push-right {
        margin-left: auto;
      }

      .knx-warning {
        --mdc-theme-primary: var(--error-color);
      }

      .knx-project-description {
        margin-top: -8px;
        padding: 0px 16px 16px;
      }

      .knx-delete-project-button {
        position: absolute;
        bottom: 0;
        right: 0;
      }

      .knx-bug-report {
        margin-top: 20px;
      }

      .knx-bug-report > ul > li > a {
        text-decoration: none;
        color: var(--mdc-theme-primary);
      }

      .header {
        color: var(--ha-card-header-color, --primary-text-color);
        font-family: var(--ha-card-header-font-family, inherit);
        font-size: var(--ha-card-header-font-size, 24px);
        letter-spacing: -0.012em;
        line-height: 48px;
        padding: -4px 16px 16px;
        display: inline-block;
        margin-block-start: 0px;
        margin-block-end: 4px;
        font-weight: normal;
      }

      ha-file-upload,
      ha-selector-text {
        width: 100%;
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
    "knx-info": KNXInfo;
  }
}
