import {
  mdiAlertCircleOutline,
  mdiCheck,
  mdiCloseCircleOutline,
  mdiCogOutline,
  mdiEmailArrowRight,
  mdiLanConnect,
  mdiFileImportOutline,
  mdiClockOutline,
  mdiHelpCircleOutline,
} from "@mdi/js";
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { map } from "lit/directives/map";
import { SubscribeMixin } from "@ha/mixins/subscribe-mixin";

import { fireEvent } from "@ha/common/dom/fire_event";
import "@ha/components/ha-card";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-icon-next";
import "@ha/components/ha-md-list";
import "@ha/components/ha-md-list-item";
import "@ha/components/ha-svg-icon";
import { fetchIntegrationManifest } from "@ha/data/integration";
import "@ha/layouts/hass-subpage";
import { showConfigFlowDialog } from "@ha/dialogs/config-flow/show-dialog-config-flow";
import { showOptionsFlowDialog } from "@ha/dialogs/config-flow/show-dialog-options-flow";
import { subscribeConfigEntries } from "@ha/data/config_entries";
import type { ConfigEntry } from "@ha/data/config_entries";
import type { HomeAssistant } from "@ha/types";
import { documentationUrl } from "@ha/util/documentation-url";
import { brandsUrl } from "@ha/util/brands-url";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";

import { showKnxProjectUploadDialog } from "../dialogs/show-knx-project-upload-dialog";
import { showKnxTimeServerDialog } from "../dialogs/show-knx-time-server-dialog";
import { showKnxSendDialog } from "../dialogs/show-knx-send-dialog";
import type { KnxPageNavigation, KnxTranslationKey } from "../types/navigation";
import type { KNX } from "../types/knx";
import { knxMainTabs } from "../knx-router";
import { KNXLogger } from "../tools/knx-logger";
import { deviceFromIdentifier } from "../utils/device";

const logger = new KNXLogger("knx-dashboard");

export const getConnectionStatus = (
  configState: ConfigEntry["state"],
  sensorState?: string,
): "connected" | "disconnected" | "unavailable" => {
  if (configState !== "loaded") return "unavailable";
  if (sensorState === "unavailable") return "disconnected";
  // The connected_since sensor is available only while the KNX bus is connected.
  if (sensorState && sensorState !== "unknown") return "connected";
  return "unavailable";
};

/** One of the action buttons below the navigation list. */
interface DashboardButton {
  /** Root key; `.title` and `.description` below it name the button. */
  translationKey: KnxTranslationKey;
  click: () => void;
  iconPath: string;
  iconColor: string;
  validConfigEntryStates: Set<string>;
}

@customElement("knx-dashboard")
export class KnxDashboard extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean }) public narrow = false;

  @state() private _configEntryState: ConfigEntry["state"] | "unknown" = "unknown";

  protected hassSubscribe(): UnsubscribeFunc[] {
    return [this._unsubscribeConfigEntries()];
  }

  private _unsubscribeConfigEntries() {
    // SubscribeMixin checks `instanceof Promise` when unsubscribing, but that doesn't
    // work always work properly across realm boundaries, so we wrap the async unsubscribe
    const _async_unsub = subscribeConfigEntries(
      this.hass,
      async (updates) => {
        const newState = updates.find((update) => update.entry.domain === "knx")?.entry.state;
        if (newState && newState !== this._configEntryState) {
          logger.debug("KNX dashboard config entry state update", newState);
          this._configEntryState = newState;
        }
      },
      { domain: "knx" },
    );
    return () => {
      _async_unsub.then((unsub) => unsub());
    };
  }

  private _getPages(): KnxPageNavigation[] {
    return knxMainTabs(!!this.knx.projectInfo).map((page) => ({
      ...page,
      name: this.hass.localize(page.translationKey) || page.name,
      description: this.hass.localize(page.descriptionTranslationKey) || page.description,
    }));
  }

  private _localizeStatus(
    key: "connected" | "disconnected" | "address" | "via",
    replace?: Record<string, string>,
  ): string {
    return (
      this.hass.localize(`component.knx.config_panel.dashboard.status.${key}`, replace) ||
      this.knx.localize(`dashboard_status_${key}`, replace)
    );
  }

  private _buttonItems: DashboardButton[] = [
    {
      translationKey: "component.knx.config_panel.dashboard.send",
      click: this._openSendDialog,
      iconPath: mdiEmailArrowRight,
      iconColor: "var(--purple-color)",
      validConfigEntryStates: new Set(["loaded"]),
    },
    {
      translationKey: "component.knx.config_panel.dashboard.options_flow",
      iconPath: mdiCogOutline,
      iconColor: "var(--indigo-color)",
      click: this._openOptionFlow,
      validConfigEntryStates: new Set(["loaded"]),
    },
    {
      translationKey: "component.knx.config_panel.dashboard.time_server",
      click: this._openTimeServerDialog,
      iconPath: mdiClockOutline,
      iconColor: "var(--blue-color)",
      validConfigEntryStates: new Set(["loaded"]),
    },
    {
      translationKey: "component.knx.config_panel.dashboard.project_upload",
      click: this._openProjectUploadDialog,
      iconPath: mdiFileImportOutline,
      iconColor: "var(--teal-color)",
      validConfigEntryStates: new Set(["loaded"]),
    },
    {
      translationKey: "component.knx.config_panel.dashboard.connection_flow",
      iconPath: mdiLanConnect,
      iconColor: "var(--green-color)",
      click: this._openReconfigureFlow,
      validConfigEntryStates: new Set(["loaded", "not_loaded"]),
    },
  ];

  private _openSendDialog() {
    showKnxSendDialog(this, { hass: this.hass, knx: this.knx });
  }

  private async _openOptionFlow() {
    // ensure translations are loaded - showOptionsFlowDialog does it too, but sometimes seems to not work
    await this.hass.loadBackendTranslation("options", "knx");
    showOptionsFlowDialog(this, this.knx.config_entry);
  }

  private _openProjectUploadDialog() {
    showKnxProjectUploadDialog(this, { hass: this.hass });
  }

  private _openTimeServerDialog() {
    showKnxTimeServerDialog(this, { hass: this.hass, knx: this.knx });
  }

  private async _openReconfigureFlow() {
    // ensure translations are loaded - showConfigFlowDialog does it too, but sometimes seems to not work
    await this.hass.loadBackendTranslation("config", "knx");
    showConfigFlowDialog(this, {
      startFlowHandler: this.knx.config_entry.domain,
      manifest: await fetchIntegrationManifest(this.hass, this.knx.config_entry.domain),
      entryId: this.knx.config_entry.entry_id,
      dialogClosedCallback: (params) => {
        if (params?.flowFinished) {
          fireEvent(this, "knx-reload");
        }
      },
    });
  }

  protected render() {
    const interfaceDevice = deviceFromIdentifier(
      this.hass,
      `_${this.knx.config_entry.entry_id}_interface`,
    );
    const interfaceEntities = Object.values(this.hass.entities).filter(
      (entity) => entity.platform === "knx" && entity.device_id === interfaceDevice?.id,
    );
    const connectionSensor = interfaceEntities.find(
      (entity) => entity.translation_key === "connected_since",
    );
    const sensorState = connectionSensor
      ? this.hass.states[connectionSensor.entity_id]?.state
      : undefined;
    const status = getConnectionStatus(
      this._configEntryState === "unknown" ? this.knx.config_entry.state : this._configEntryState,
      sensorState,
    );
    const statusIcon =
      status === "connected"
        ? mdiCheck
        : status === "disconnected"
          ? mdiCloseCircleOutline
          : mdiAlertCircleOutline;
    const addressSensor = interfaceEntities.find(
      (entity) => entity.translation_key === "individual_address",
    );
    const address = addressSensor ? this.hass.states[addressSensor.entity_id]?.state : undefined;
    const hasAddress =
      status === "connected" &&
      address &&
      address !== "unavailable" &&
      address !== "unknown" &&
      address !== "0.0.0";
    const interfaceName = interfaceDevice?.name_by_user || interfaceDevice?.name;
    const [interfacePrefix, interfaceSuffix] =
      status === "connected" && interfaceName
        ? this._localizeStatus("via", { interface: "\uFFFC" }).split("\uFFFC")
        : ["", ""];
    const hasStatusDetail = Boolean(hasAddress || (interfaceDevice && interfaceName));
    const statusDetailContent = html`
      ${
        interfaceDevice && interfaceName
          ? html`<span class="interface">
              ${
                interfacePrefix
                  ? html`<span class="interface-affix">${interfacePrefix}</span>`
                  : nothing
              }
              <a href=${`/config/devices/device/${interfaceDevice.id}`} title=${interfaceName}
                >${interfaceName}</a
              >
              ${
                interfaceSuffix
                  ? html`<span class="interface-affix">${interfaceSuffix}</span>`
                  : nothing
              }
            </span>`
          : nothing
      }
      ${
        hasAddress
          ? html`<span class="address"
              >${interfaceDevice && interfaceName ? "· " : nothing}${this._localizeStatus(
                "address",
                {
                  address,
                },
              )}</span
            >`
          : nothing
      }
    `;

    return html`
      <hass-subpage
        .narrow=${this.narrow}
        .hass=${this.hass}
        header="KNX"
        back-path="/config/connectivity"
      >
        <ha-icon-button
          slot="toolbar-icon"
          .path=${mdiHelpCircleOutline}
          .label=${this.hass.localize(
            "ui.panel.config.integrations.config_flow.open_documentation",
          )}
          .href=${documentationUrl(this.hass, "/integrations/knx")}
          target="_blank"
          rel="noopener noreferrer"
        ></ha-icon-button>
        <div class="container">
          <ha-card class="content network-status">
            <div class="card-content">
              <div class="heading">
                <div class="icon ${status}" aria-hidden="true">
                  <ha-svg-icon .path=${statusIcon}></ha-svg-icon>
                </div>
                <div class="details">
                  <span class="status-heading" role="status"
                    >${
                      status === "unavailable"
                        ? this.hass.localize("state.default.unavailable")
                        : this._localizeStatus(status)
                    }</span
                  >
                  ${
                    hasStatusDetail
                      ? html`<br /><small class="status-detail"
                            ><span class="status-detail-content"
                              >${statusDetailContent}</span
                            ></small
                          >`
                      : nothing
                  }
                </div>
                <img
                  class="logo"
                  alt="KNX"
                  crossorigin="anonymous"
                  referrerpolicy="no-referrer"
                  src=${brandsUrl(
                    { domain: "knx", type: "icon", darkOptimized: this.hass.themes?.darkMode },
                    this.hass.auth.data.hassUrl,
                  )}
                />
              </div>
            </div>
          </ha-card>
          <ha-card class="nav-card">
            <div class="card-content">
              <ha-md-list>
                ${map(
                  this._getPages(),
                  (page: KnxPageNavigation) => html`
                    <ha-md-list-item type="link" href=${page.path}>
                      <div
                        slot="start"
                        class="icon-background"
                        .style=${`background-color: ${page.iconColor}`}
                      >
                        <ha-svg-icon
                          .path=${page.iconPath}
                          .secondaryPath=${page.iconSecondaryPath}
                          .viewBox=${page.iconViewBox}
                        ></ha-svg-icon>
                      </div>
                      <span slot="headline">${page.name}</span>
                      <span slot="supporting-text">${page.description}</span>
                      <ha-icon-next slot="end"></ha-icon-next>
                    </ha-md-list-item>
                  `,
                )}
              </ha-md-list>
            </div>
          </ha-card>
          <ha-card class="nav-card">
            <div class="card-content">
              <ha-md-list>
                ${map(
                  this._buttonItems,
                  (item: DashboardButton) =>
                    html` <ha-md-list-item
                      type="button"
                      @click=${item.click}
                      ?disabled=${!item.validConfigEntryStates.has(this._configEntryState)}
                    >
                      <div
                        slot="start"
                        class="icon-background"
                        .style=${`background-color: ${item.iconColor}`}
                      >
                        <ha-svg-icon .path=${item.iconPath}></ha-svg-icon>
                      </div>
                      <span slot="headline"
                        >${this.hass.localize(`${item.translationKey}.title`)}</span
                      >
                      <span slot="supporting-text"
                        >${this.hass.localize(`${item.translationKey}.description`)}</span
                      >
                    </ha-md-list-item>`,
                )}
              </ha-md-list>
            </div>
          </ha-card>
        </div>
      </hass-subpage>
    `;
  }

  static styles = css`
    .container {
      padding: var(--ha-space-2) var(--ha-space-4) var(--ha-space-4);
    }
    ha-card {
      margin: 0px auto var(--ha-space-4);
      max-width: 600px;
      overflow: hidden;
    }
    .content {
      margin-top: var(--ha-space-6);
    }
    .nav-card .card-content {
      padding: 0;
    }
    ha-md-list {
      background: none;
      padding: 0;
    }
    ha-md-list-item {
      --md-item-overflow: visible;
    }
    .network-status div.heading {
      display: flex;
      align-items: center;
      column-gap: var(--ha-space-4);
    }
    .network-status div.heading .logo {
      height: 40px;
      width: 40px;
      margin-inline-start: auto;
      object-fit: contain;
    }
    .network-status div.heading .icon {
      position: relative;
      border-radius: var(--ha-border-radius-2xl);
      width: var(--ha-space-10);
      height: var(--ha-space-10);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
      --icon-color: var(--primary-color);
    }
    .network-status div.heading .icon.connected {
      --icon-color: var(--success-color);
    }
    .network-status div.heading .icon.disconnected {
      --icon-color: var(--error-color);
    }
    .network-status div.heading .icon.unavailable {
      --icon-color: var(--warning-color);
    }
    .network-status div.heading .icon::before {
      display: block;
      content: "";
      position: absolute;
      inset: 0;
      background-color: var(--icon-color, var(--primary-color));
      opacity: 0.2;
    }
    .network-status div.heading .icon ha-svg-icon {
      color: var(--icon-color, var(--primary-color));
      width: var(--ha-space-6);
      height: var(--ha-space-6);
    }
    .network-status div.heading .details {
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-normal);
      line-height: var(--ha-line-height-condensed);
      color: var(--primary-text-color);
      min-width: 0;
      flex: 1;
    }
    .network-status small {
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-normal);
      line-height: var(--ha-line-height-condensed);
      letter-spacing: 0.25px;
      color: var(--secondary-text-color);
    }
    .network-status .status-detail {
      white-space: nowrap;
    }
    .status-detail-content {
      display: inline-flex;
      max-width: 100%;
      gap: var(--ha-space-1);
    }
    .status-detail .interface {
      display: inline-flex;
      min-width: 0;
    }
    .status-detail .interface-affix {
      white-space: pre;
    }
    .status-detail .interface a {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .status-detail .address {
      flex: none;
    }
    .status-detail a {
      color: var(--primary-color);
      text-decoration: underline;
    }
    @media (max-width: 480px) {
      .network-status div.heading {
        position: relative;
      }
      .network-status div.heading .logo {
        position: absolute;
        inset-inline-end: 0;
        top: 0;
        width: var(--ha-space-6);
        height: var(--ha-space-6);
      }
      .status-heading {
        display: inline-block;
        max-width: calc(100% - var(--ha-space-8));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        vertical-align: bottom;
      }
    }
    .icon-background ha-svg-icon {
      height: 24px;
      width: 24px;
      display: block;
      padding: 8px;
      color: #fff;
    }
    .icon-background {
      border-radius: var(--ha-border-radius-circle);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-dashboard": KnxDashboard;
  }
}
