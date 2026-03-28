import { mdiFileUpload } from "@mdi/js";
import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators";

import "@ha/components/ha-button";
import "@ha/components/ha-dialog-footer";
import "@ha/components/ha-file-upload";
import "@ha/components/ha-markdown";
import "@ha/components/ha-selector/ha-selector-text";
import "@ha/components/ha-dialog";

import { fireEvent } from "@ha/common/dom/fire_event";
import { DialogMixin } from "@ha/dialogs/dialog-mixin";
import { uploadFile } from "@ha/data/file_upload";
import { extractApiErrorMessage } from "@ha/data/hassio/common";
import { showAlertDialog } from "@ha/dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "@ha/types";

import { processProjectFile } from "../services/websocket.service";

export interface KnxProjectUploadDialogParams {
  hass: HomeAssistant;
}

@customElement("knx-project-upload-dialog")
export class KnxProjectUploadDialog extends DialogMixin<KnxProjectUploadDialogParams>(LitElement) {
  @state() public hass!: HomeAssistant;

  @state() private _projectPassword?: string;

  @state() private _uploading = false;

  @state() private _projectFile?: File;

  public connectedCallback() {
    super.connectedCallback();

    if (this.params) {
      this.hass = this.params.hass;
    }
  }

  private _backendLocalize = (key: string) =>
    this.hass.localize(`component.knx.config_panel.dialogs.project_upload.${key}`);

  protected render() {
    return html`
      <ha-dialog open @closed=${this.closeDialog} .headerTitle=${this._backendLocalize("title")}>
        <div class="content">
          <ha-markdown
            class="description"
            breaks
            .content=${this._backendLocalize("description")}
          ></ha-markdown>
          <ha-file-upload
            .hass=${this.hass}
            accept=".knxproj, .knxprojarchive"
            .icon=${mdiFileUpload}
            .label=${this._backendLocalize("file_upload_label")}
            .value=${this._projectFile?.name}
            .uploading=${this._uploading}
            @file-picked=${this._filePicked}
            @files-cleared=${this._filePicked}
          ></ha-file-upload>
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
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="primaryAction"
            @click=${this._uploadFile}
            .disabled=${this._uploading || !this._projectFile}
          >
            ${this.hass.localize("ui.common.submit")}
          </ha-button>
          <ha-button slot="secondaryAction" @click=${this.closeDialog} .disabled=${this._uploading}>
            ${this.hass.localize("ui.common.cancel")}
          </ha-button></ha-dialog-footer
        >
      </ha-dialog>
    `;
  }

  private _filePicked(ev) {
    if (ev.detail.files) {
      this._projectFile = ev.detail.files[0];
    } else {
      // files-cleared event
      this._projectFile = undefined;
    }
  }

  private _passwordChanged(ev) {
    this._projectPassword = ev.detail.value;
  }

  private async _uploadFile() {
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
      });
    } finally {
      this._uploading = false;
      if (!error) {
        this.closeDialog();
        fireEvent(this, "knx-reload");
      }
    }
  }

  static styles = css`
    .content {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .description {
      margin-bottom: 8px;
    }

    ha-selector-text {
      width: 100%;
    }

    ha-markdown {
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-project-upload-dialog": KnxProjectUploadDialog;
  }
}
