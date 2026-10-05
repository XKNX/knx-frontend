import type { TemplateResult } from "lit";
import { css, nothing, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";

import { formatDateTime } from "@ha/common/datetime/format_date_time";
import { fireEvent } from "@ha/common/dom/fire_event";
import "@ha/components/ha-card";
import "@ha/layouts/hass-subpage";
import "@ha/components/ha-button";
import { showAlertDialog, showConfirmationDialog } from "@ha/dialogs/generic/show-dialog-box";
import type { HomeAssistant, Route } from "@ha/types";

import { removeProjectFile } from "../services/websocket.service";

import type { KNX } from "../types/knx";
import type { KNXProjectInfo } from "../types/websocket";
import { KNXLogger } from "../tools/knx-logger";
import { errorMessage } from "../utils/error";
import { parseProjectLastModified } from "../utils/project-info";
import { VERSION } from "../version";
import { infoTab } from "../knx-router";

const logger = new KNXLogger("info");

@customElement("knx-info")
export class KNXInfo extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow!}
        .header=${this.hass.localize(infoTab.translationKey)}
      >
        <div class="columns">
          ${this._renderInfoCard()}
          ${this.knx.projectInfo ? this._renderProjectDataCard(this.knx.projectInfo) : nothing}
        </div>
      </hass-subpage>
    `;
  }

  private _renderInfoCard() {
    return html` <ha-card class="knx-info">
      <div class="card-content knx-info-section">
        <div class="knx-content-row header">
          ${this.hass.localize("component.knx.config_panel.info.title")}
        </div>

        <div class="knx-content-row">
          <div>XKNX Version</div>
          <div>${this.knx.connectionInfo.version}</div>
        </div>

        <div class="knx-content-row">
          <div>KNX-Frontend Version</div>
          <div>${VERSION}</div>
        </div>

        <div class="knx-content-row">
          <div>${this.hass.localize("component.knx.config_panel.info.connected_to_bus.label")}</div>
          <div>
            ${this.hass.localize(
              this.knx.connectionInfo.connected ? "ui.common.yes" : "ui.common.no",
            )}
          </div>
        </div>

        <div class="knx-content-row">
          <div>
            ${this.hass.localize("component.knx.config_panel.info.individual_address.label")}
          </div>
          <div>${this.knx.connectionInfo.current_address}</div>
        </div>

        <div class="knx-content-row">
          <div>${this.hass.localize("component.knx.config_panel.info.telegram_storage.label")}</div>
          <div>
            ${this.hass.localize(
              `component.knx.config_panel.info.telegram_storage.backend.options.${this.knx.connectionInfo.telegram_backend.toLowerCase()}`,
            )}
          </div>
        </div>

        ${
          this.knx.connectionInfo.telegram_retention != null
            ? html`
                <div class="knx-content-row">
                  <div>
                    ${this.hass.localize("component.knx.config_panel.info.telegram_storage.retention.label")}
                  </div>
                  <div>
                    ${
                      this.knx.connectionInfo.telegram_retention === 1
                        ? this.hass.localize(
                            "component.knx.config_panel.info.telegram_storage.retention.day",
                          )
                        : this.hass.localize(
                            "component.knx.config_panel.info.telegram_storage.retention.days",
                            {
                              retention: String(this.knx.connectionInfo.telegram_retention),
                            },
                          )
                    }
                  </div>
                </div>
              `
            : nothing
        }
        ${
          this.knx.connectionInfo.telegram_max_count != null
            ? html`
                <div class="knx-content-row">
                  <div>
                    ${this.hass.localize("component.knx.config_panel.info.telegram_storage.limit.label")}
                  </div>
                  <div>${this.knx.connectionInfo.telegram_max_count}</div>
                </div>
              `
            : nothing
        }

        <div class="knx-bug-report">
          ${this.hass.localize("component.knx.config_panel.info.issue_tracker.description")}
          <a href="https://github.com/XKNX/knx-integration" target="_blank">xknx/knx-integration</a>
        </div>

        <div class="knx-bug-report">
          ${this.hass.localize("component.knx.config_panel.info.my_knx.description")}
          <a href="https://my.knx.org" target="_blank">my.knx.org</a>
        </div>
      </div>
    </ha-card>`;
  }

  private _renderProjectDataCard(projectInfo: KNXProjectInfo) {
    const lastModified = parseProjectLastModified(projectInfo);
    return html`
      <ha-card class="knx-info">
          <div class="card-content knx-content">
            <div class="header knx-content-row">
              ${this.hass.localize("component.knx.config_panel.info.project_data.title")}
            </div>
            <div class="knx-content-row">
              <div>${this.hass.localize("component.knx.config_panel.info.project_data.name.label")}</div>
              <div>${projectInfo.name}</div>
            </div>
            ${
              lastModified
                ? html`<div class="knx-content-row">
                    <div>
                      ${this.hass.localize("component.knx.config_panel.info.project_data.last_modified.label")}
                    </div>
                    <div>${formatDateTime(lastModified, this.hass.locale, this.hass.config)}</div>
                  </div>`
                : nothing
            }
            <div class="knx-content-row">
              <div>${this.hass.localize("component.knx.config_panel.info.project_data.tool_version.label")}</div>
              <div>${projectInfo.tool_version}</div>
            </div>
            <div class="knx-content-row">
              <div>${this.hass.localize("component.knx.config_panel.info.project_data.xknxproject_version.label")}</div>
              <div>${projectInfo.xknxproject_version}</div>
            </div>
            <div class="knx-button-row">
              <ha-button
                class="knx-warning push-right"
                @click=${this._removeProject}
                >
                ${this.hass.localize("component.knx.config_panel.info.project_data.delete")}
              </ha-button>
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }

  private async _removeProject(_ev) {
    const confirmed = await showConfirmationDialog(this, {
      text: this.hass.localize("component.knx.config_panel.info.project_data.delete"),
    });
    if (!confirmed) {
      logger.debug("User cancelled deletion");
      return;
    }

    try {
      await removeProjectFile(this.hass);
    } catch (err: unknown) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.common.deleting_failed"),
        text: errorMessage(err) ?? this.hass.localize("ui.common.unknown_error"),
      });
    } finally {
      fireEvent(this, "knx-reload");
    }
  }

  static styles = css`
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
      gap: 8px;
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

    .knx-delete-project-button {
      position: absolute;
      bottom: 0;
      right: 0;
    }

    .knx-bug-report {
      margin-top: 20px;

      a {
        text-decoration: none;
      }
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
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-info": KNXInfo;
  }
}
