import { mdiClose, mdiFileDocumentOutline, mdiFileUpload } from "@mdi/js";
import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import memoizeOne from "memoize-one";

import "@ha/components/ha-button";
import "@ha/components/ha-dialog-footer";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-file-upload";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-markdown";
import "@ha/components/ha-selector/ha-selector-text";
import "@ha/components/ha-dialog";
import "@ha/components/ha-svg-icon";
import "@ha/components/item/ha-list-item-value";
import "@ha/components/list/ha-list-base";

import { STRINGS_SEPARATOR_DOT } from "@ha/common/const";
import { fireEvent } from "@ha/common/dom/fire_event";
import { formatDateTime } from "@ha/common/datetime/format_date_time";
import { relativeTime } from "@ha/common/datetime/relative_time";
import { DialogMixin } from "@ha/dialogs/dialog-mixin";
import { uploadFile } from "@ha/data/file_upload";
import type { StringSelector } from "@ha/data/selector";
import { showAlertDialog } from "@ha/dialogs/generic/show-dialog-box";
import type { FrontendLocaleData } from "@ha/data/translation";
import type { HassConfig } from "home-assistant-js-websocket";
import type { HomeAssistant, ValueChangedEvent } from "@ha/types";

import { processProjectFile } from "../services/websocket.service";
import type { KNX } from "../types/knx";
import type { KNXProjectInfo } from "../types/websocket";
import { errorMessage } from "../utils/error";
import { parseProjectLastModified } from "../utils/project-info";

export interface KnxProjectUploadDialogParams {
  hass: HomeAssistant;
  knx: KNX;
}

/** Leading major[.minor] of a numeric ETS tool version like `6.1.5686.0`. */
const NUMERIC_TOOL_VERSION = /^\d+(?:\.\d+)?/;

const PASSWORD_SELECTOR: StringSelector = { text: { multiline: false, type: "password" } };

interface CurrentProjectView {
  title: string;
  name: string;
  summary: string;
  details: { label: string; value: string }[];
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

  // Keep the dialog open while uploading, also when closed programmatically
  // (e.g. on browser back navigation); the dialog manager keeps it on its stack.
  public closeDialog(historyState?: unknown): Promise<boolean> | boolean {
    if (this._uploading) {
      return false;
    }
    return super.closeDialog(historyState);
  }

  private _backendLocalize = (key: string, replace?: Record<string, string>) =>
    this.hass.localize(`component.knx.config_panel.dialogs.project_upload.${key}`, replace);

  // Core translations take precedence; local keys remain as fallback during the migration.
  private _currentProjectLocalize(
    coreKey: string,
    localKey: string,
    replace?: Record<string, string>,
  ): string {
    return (
      this._backendLocalize(`current_project.${coreKey}`, replace) ||
      this.params!.knx.localize(localKey, replace)
    );
  }

  protected render() {
    if (!this.params) {
      return nothing;
    }
    return html`
      <ha-dialog
        open
        ?prevent-scrim-close=${this._uploading}
        @closed=${this.closeDialog}
        .headerTitle=${this._backendLocalize("title")}
      >
        <ha-icon-button
          slot="headerNavigationIcon"
          .label=${this.hass.localize("ui.common.close")}
          .path=${mdiClose}
          .disabled=${this._uploading}
          @click=${this.closeDialog}
        ></ha-icon-button>
        <div class="content">
          <ha-markdown
            class="description"
            breaks
            .content=${this._backendLocalize("description")}
          ></ha-markdown>
          ${this._renderCurrentProject()}
          <ha-file-upload
            accept=".knxproj, .knxprojarchive"
            .icon=${mdiFileUpload}
            .label=${this._backendLocalize("file_upload_label")}
            .value=${this._projectFile?.name}
            .uploading=${this._uploading}
            .disabled=${this._uploading}
            @file-picked=${this._filePicked}
            @files-cleared=${this._filePicked}
          ></ha-file-upload>
          <ha-selector-text
            .value=${this._projectPassword || ""}
            .label=${this.hass.localize("ui.login-form.password")}
            .selector=${PASSWORD_SELECTOR}
            .required=${false}
            .disabled=${this._uploading}
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

  private _etsVersionSummary(toolVersion: string): string {
    const shortVersion = NUMERIC_TOOL_VERSION.exec(toolVersion)?.[0];
    // ETS 4 reports a descriptive version like "ETS 4.2.0 (Build 3884)"; show it as is.
    return shortVersion
      ? this._currentProjectLocalize("short_ets_version", "project_upload_ets_version_short", {
          version: shortVersion,
        })
      : toolVersion;
  }

  // Recomputed only when the project or the translation and locale inputs change,
  // not on every re-render (e.g. while typing the password).
  private _currentProjectView = memoizeOne(
    (
      projectInfo: KNXProjectInfo,
      _localize: HomeAssistant["localize"],
      locale: FrontendLocaleData,
      config: HassConfig,
    ): CurrentProjectView => {
      const lastModified = parseProjectLastModified(projectInfo);
      const details: CurrentProjectView["details"] = [];
      if (lastModified) {
        details.push({
          label: this._currentProjectLocalize(
            "last_modified.label",
            "info_project_data_last_modified",
          ),
          value: formatDateTime(lastModified, locale, config),
        });
      }
      if (projectInfo.tool_version) {
        details.push({
          label: this._currentProjectLocalize("ets_version.label", "project_upload_ets_version"),
          value: projectInfo.tool_version,
        });
      }
      details.push({
        label: this._currentProjectLocalize("imported_with.label", "project_upload_imported_with"),
        value: `xknxproject ${projectInfo.xknxproject_version}`,
      });
      return {
        title: this._currentProjectLocalize("title", "project_upload_current_project"),
        name: projectInfo.name,
        summary: [
          projectInfo.tool_version ? this._etsVersionSummary(projectInfo.tool_version) : undefined,
          lastModified
            ? this._currentProjectLocalize("modified", "project_upload_modified", {
                relative_time: relativeTime(lastModified, locale),
              })
            : undefined,
        ]
          .filter(Boolean)
          .join(STRINGS_SEPARATOR_DOT),
        details,
      };
    },
  );

  private _renderCurrentProject() {
    const projectInfo = this.params?.knx.projectInfo;
    if (!projectInfo) {
      return nothing;
    }
    const view = this._currentProjectView(
      projectInfo,
      this.hass.localize,
      this.hass.locale,
      this.hass.config,
    );

    return html`
      <section class="current-project" aria-labelledby="current-project-header">
        <div class="section-header" id="current-project-header">${view.title}</div>
        <ha-expansion-panel outlined .header=${view.name} .secondary=${view.summary}>
          <div slot="leading-icon" class="project-icon" aria-hidden="true">
            <ha-svg-icon .path=${mdiFileDocumentOutline}></ha-svg-icon>
          </div>
          <ha-list-base>
            ${view.details.map(
              ({ label, value }) =>
                html`<ha-list-item-value .label=${label}>${value}</ha-list-item-value>`,
            )}
          </ha-list-base>
        </ha-expansion-panel>
      </section>
    `;
  }

  private _filePicked(ev: CustomEvent<{ files?: File[] }>) {
    // `files-cleared` is fired without files.
    this._projectFile = ev.detail.files?.[0];
  }

  private _passwordChanged(ev: ValueChangedEvent<string>) {
    this._projectPassword = ev.detail.value;
  }

  private async _uploadFile() {
    const file = this._projectFile;
    if (!file) {
      return;
    }
    const password = this._projectPassword || "";

    this._uploading = true;
    try {
      const projectFileId = await uploadFile(this.hass, file);
      await processProjectFile(this.hass, projectFileId, password);
    } catch (err: unknown) {
      this._uploading = false;
      showAlertDialog(this, {
        title: this.hass.localize("ui.components.selectors.file.upload_failed"),
        text: errorMessage(err) ?? this.hass.localize("ui.common.unknown_error"),
      });
      return;
    }
    this._uploading = false;
    this.closeDialog();
    fireEvent(this, "knx-reload");
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
