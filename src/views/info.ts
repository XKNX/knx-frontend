import { mdiFileUpload } from "@mdi/js";
import { css, nothing, html, LitElement, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";

import "@ha/components/ha-button-menu";
import "@ha/components/ha-card";
import "@ha/layouts/ha-app-layout";
import "@ha/layouts/hass-subpage";
import "@ha/components/ha-button";
import "@ha/components/ha-file-upload";
import "@ha/components/ha-selector/ha-selector-text";
import { uploadFile } from "@ha/data/file_upload";
import { extractApiErrorMessage } from "@ha/data/hassio/common";
import { showAlertDialog, showConfirmationDialog } from "@ha/dialogs/generic/show-dialog-box";
import { HomeAssistant } from "@ha/types";

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

  @state() private knxInfoData: KNXInfoData | null = null;

  @state() private _projectPassword?: string;

  @state() private _uploading = false;

  @state() private _projectFile?: File;

  protected firstUpdated() {
    this.loadKnxInfo();
  }

  protected render(): TemplateResult | void {
    if (!this.knxInfoData) {
      return html`Loading...`;
    }

    return html`
      <div class="columns">
        <ha-card class="knx-info" .header=${this.knx.localize("info_information_header")}>
          <div class="card-content knx-info-section">
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
                  this.knxInfoData?.connected ? "ui.common.yes" : "ui.common.no"
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
        </ha-card>
        ${this.knxInfoData?.project ? this._projectCard(this.knxInfoData.project) : nothing}
        <ha-card class="knx-info" .header=${this.knx.localize("info_project_file_header")}>
          <div class="knx-project-description">
            ${this.knx.localize("info_project_upload_description")}
          </div>
          <div class="knx-content-row">
            <ha-file-upload
              .hass=${this.hass}
              accept=".knxproj"
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
          <div class="knx-content-button">
            <ha-button @click=${this._uploadFile} .disabled=${this._uploading || !this._projectFile}
              >${this.hass.localize("ui.common.submit")}</ha-button
            >
          </div>
        </ha-card>
      </div>
    `;
  }

  private _projectCard(projectInfo: KNXProjectInfo) {
    return html`
      <ha-card class="knx-info" .header=${this.knx.localize("info_project_data_header")}>
        <div class="card-content knx-info-section">
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
        </div>
        <div class="knx-delete-project-button">
          <ha-button
            class="knx-warning"
            @click=${this._removeProject}
            .disabled=${this._uploading || !this.knxInfoData?.project}
            >${this.knx.localize("info_project_delete")}</ha-button
          >
        </div>
      </ha-card>
    `;
  }

  private loadKnxInfo() {
    getKnxInfoData(this.hass).then(
      (knxInfoData) => {
        this.knxInfoData = knxInfoData;
        this.requestUpdate();
      },
      (err) => {
        logger.error("getKnxInfoData", err);
      }
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

  static get styles() {
    return css`
      .columns {
        display: flex;
        justify-content: center;
      }

      .columns > ha-card {
        min-width: 400px;
      }

      @media screen and (max-width: 1232px) {
        .columns {
          flex-direction: column;
        }

        .columns > ha-card {
          width: 96.5%;
        }

        .knx-delete-project-button {
          top: 20px;
        }

        .knx-info {
          margin-right: 8px;
          max-width: 96.5%;
        }
      }

      @media screen and (min-width: 1233px) {
        .knx-info {
          max-width: 400px;
        }
      }

      .knx-info {
        margin-left: 8px;
        margin-top: 8px;
      }

      .knx-info-section {
        display: flex;
        flex-direction: column;
      }

      .knx-content-row {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
      }

      .knx-content-row > div:nth-child(2) {
        margin-left: 1rem;
      }

      .knx-content-button {
        display: flex;
        flex-direction: row-reverse;
        justify-content: space-between;
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

      ha-file-upload,
      ha-selector-text {
        width: 100%;
        margin: 0 8px 8px;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-info": KNXInfo;
  }
}
