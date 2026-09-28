import { mdiFileDocumentOutline, mdiFileUpload } from "@mdi/js";
import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators";

import "@ha/components/ha-button";
import "@ha/components/ha-dialog-footer";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-file-upload";
import "@ha/components/ha-markdown";
import "@ha/components/ha-selector/ha-selector-text";
import "@ha/components/ha-dialog";
import "@ha/components/ha-svg-icon";
import "@ha/components/item/ha-list-item-value";
import "@ha/components/list/ha-list-base";

import { fireEvent } from "@ha/common/dom/fire_event";
import { formatDateTime } from "@ha/common/datetime/format_date_time";
import { relativeTime } from "@ha/common/datetime/relative_time";
import { DialogMixin } from "@ha/dialogs/dialog-mixin";
import { uploadFile } from "@ha/data/file_upload";
import { extractApiErrorMessage } from "@ha/data/hassio/common";
import { showAlertDialog } from "@ha/dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "@ha/types";

import { processProjectFile } from "../services/websocket.service";
import type { KNX } from "../types/knx";
import type { KNXProjectInfo } from "../types/websocket";

export interface KnxProjectUploadDialogParams {
  hass: HomeAssistant;
  knx: KNX;
}

const parseLastModified = (projectInfo: KNXProjectInfo): Date | undefined => {
  if (!projectInfo.last_modified) {
    return undefined;
  }
  const date = new Date(projectInfo.last_modified);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** Reduce an ETS tool version like `6.1.5686.0` to its major.minor part. */
const shortToolVersion = (toolVersion: string): string =>
  toolVersion.split(".").slice(0, 2).join(".");

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
    if (!this.params) {
      return nothing;
    }
    return html`
      <ha-dialog open @closed=${this.closeDialog} .headerTitle=${this._backendLocalize("title")}>
        <div class="content">
          <ha-markdown
            class="description"
            breaks
            .content=${this._backendLocalize("description")}
          ></ha-markdown>
          ${this._renderCurrentProject()}
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

  private _renderCurrentProject() {
    const projectInfo = this.params?.knx.projectInfo;
    if (!projectInfo) {
      return nothing;
    }
    const knx = this.params!.knx;
    const lastModified = parseLastModified(projectInfo);
    const summary = [
      projectInfo.tool_version
        ? knx.localize("project_upload_ets_version_short", {
            version: shortToolVersion(projectInfo.tool_version),
          })
        : undefined,
      lastModified
        ? knx.localize("project_upload_modified", {
            time: relativeTime(lastModified, this.hass.locale),
          })
        : undefined,
    ]
      .filter(Boolean)
      .join(" · ");

    return html`
      <section class="current-project" aria-labelledby="current-project-header">
        <div class="section-header" id="current-project-header">
          ${knx.localize("project_upload_current_project")}
        </div>
        <ha-expansion-panel outlined .header=${projectInfo.name} .secondary=${summary}>
          <div slot="leading-icon" class="project-icon" aria-hidden="true">
            <ha-svg-icon .path=${mdiFileDocumentOutline}></ha-svg-icon>
          </div>
          <ha-list-base>
            ${
              lastModified
                ? html`<ha-list-item-value
                    .label=${knx.localize("info_project_data_last_modified")}
                  >
                    ${formatDateTime(lastModified, this.hass.locale, this.hass.config)}
                  </ha-list-item-value>`
                : nothing
            }
            ${
              projectInfo.tool_version
                ? html`<ha-list-item-value .label=${knx.localize("project_upload_ets_version")}>
                    ${projectInfo.tool_version}
                  </ha-list-item-value>`
                : nothing
            }
            <ha-list-item-value .label=${knx.localize("project_upload_imported_with")}>
              xknxproject ${projectInfo.xknxproject_version}
            </ha-list-item-value>
          </ha-list-base>
        </ha-expansion-panel>
      </section>
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

    .section-header {
      margin: 0 0 var(--ha-space-2);
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
      color: var(--secondary-text-color);
    }

    ha-expansion-panel {
      --outline-color: var(--divider-color);
      --expansion-panel-summary-padding: var(--ha-space-2) var(--ha-space-3);
      --expansion-panel-content-padding: 0;
    }

    .project-icon {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: var(--ha-space-10);
      height: var(--ha-space-10);
      margin-inline-end: var(--ha-space-3);
      border-radius: var(--ha-border-radius-circle);
      overflow: hidden;
      color: var(--primary-color);
    }

    .project-icon::before {
      content: "";
      position: absolute;
      inset: 0;
      background-color: var(--primary-color);
      opacity: 0.2;
    }

    .project-icon ha-svg-icon {
      position: relative;
    }

    ha-list-base {
      --ha-row-item-padding-inline: var(--ha-space-3);
      --ha-list-item-value-max-width: 70%;
    }

    ha-list-item-value {
      border-top: var(--ha-border-width-sm) solid var(--divider-color);
      font-variant-numeric: tabular-nums;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-project-upload-dialog": KnxProjectUploadDialog;
  }
}
