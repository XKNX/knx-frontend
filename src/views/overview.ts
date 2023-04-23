import { mdiFileUpload } from "@mdi/js";
import { css, nothing, html, LitElement, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";

import "@ha/components/ha-button-menu";
import "@ha/components/ha-card";
import "@ha/layouts/ha-app-layout";
import "@ha/layouts/hass-subpage";
import "@ha/components/ha-file-upload";
import "@ha/components/ha-textfield";
import "@ha/components/ha-button";
import { uploadFile } from "@ha/data/file_upload";
import { extractApiErrorMessage } from "@ha/data/hassio/common";
import { showAlertDialog } from "@ha/dialogs/generic/show-dialog-box";
import { HomeAssistant } from "@ha/types";

import { getKnxInfo, processProjectFile } from "../services/websocket.service";
import { KNXInfo, KNXProjectInfo } from "../types/websocket";
import { localize } from "../localize/localize";

@customElement("knx-overview")
export class KNXOverview extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @state() private knxInfo: KNXInfo | null = null;

  @state() private _projectPassword?: string;

  @state() private _uploading = false;

  @state() private _projectFile?: File;

  protected firstUpdated() {
    this.loadKnxInfo();
  }

  protected render(): TemplateResult | void {
    if (!this.knxInfo) {
      return html`Loading...`;
    }

    return html`
      <ha-card class="knx-info" header="KNX Information">
        <div class="card-content knx-info-section">
          <div class="knx-content-row">
            <div>XKNX Version</div>
            <div>${this.knxInfo?.version}</div>
          </div>

          <div class="knx-content-row">
            <div>${localize(this.hass!.language, "overview_connected_to_bus")}</div>
            <div>${this.knxInfo?.connected ? "Yes" : "No"}</div>
          </div>

          <div class="knx-content-row">
            <div>${localize(this.hass!.language, "overview_individual_address")}</div>
            <div>${this.knxInfo?.current_address}</div>
          </div>
        </div>
      </ha-card>
      ${this.knxInfo?.project ? this._projectCard(this.knxInfo.project) : nothing}
      <ha-card class="knx-info" header="KNX Project Upload">
        <div class="knx-content-row">
          <ha-file-upload
            .hass=${this.hass}
            accept=".knxproj"
            .icon=${mdiFileUpload}
            label="Project File"
            .value=${this._projectFile?.name || "Select file..."}
            .uploading=${this._uploading}
            @file-picked=${this._filePicked}
          ></ha-file-upload>
        </div>
        <div class="knx-content-row">
          <ha-textfield
            .name=${"project_password"}
            .label=${"Project Password"}
            .value=${this._projectPassword || ""}
            placeholder="Project Password"
            autocapitalize="none"
            spellcheck="false"
            @input=${this._passwordChanged}
          >
          </ha-textfield>
        </div>
        <div class="knx-content-row">
          <ha-button @click=${this._uploadFile} .disabled=${this._uploading || !this._projectFile}
            >Upload</ha-button
          >
        </div>
      </ha-card>
    `;
  }

  private _projectCard(projectInfo: KNXProjectInfo) {
    return html`
      <ha-card class="knx-info" header="KNX Project File">
        <div class="card-content knx-info-section">
          <div class="knx-content-row">
            <div>Project name</div>
            <div>${projectInfo.name}</div>
          </div>

          <div class="knx-content-row">
            <div>Last modified</div>
            <div>${projectInfo.last_modified}</div>
          </div>

          <div class="knx-content-row">
            <div>Tool version</div>
            <div>${projectInfo.tool_version}</div>
          </div>
        </div>
      </ha-card>
    `;
  }

  private loadKnxInfo() {
    getKnxInfo(this.hass).then(
      (knxInfo) => {
        this.knxInfo = knxInfo;
        this.requestUpdate();
      },
      (err) => {
        console.error("getKnxInfo", err); // eslint-disable-line no-console
      }
    );
  }

  private _filePicked(ev) {
    this._projectFile = ev.detail.files[0];
  }

  private _passwordChanged(ev) {
    this._projectPassword = ev.target.value;
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

  static get styles() {
    return css`
      .knx-info {
        max-width: 400px;
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
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-overview": KNXOverview;
  }
}
