import { mdiFileUpload } from "@mdi/js";
import { css, nothing, CSSResultGroup, html, LitElement, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";

import "@ha/components/ha-card";
import "@ha/components/ha-expansion-panel";
import "@ha/layouts/hass-tabs-subpage";
import "@ha/components/ha-button";
import "@ha/components/buttons/ha-progress-button";
import "@ha/components/ha-file-upload";
import "@ha/components/ha-selector/ha-selector";
import { uploadFile } from "@ha/data/file_upload";
import { extractApiErrorMessage } from "@ha/data/hassio/common";
import { SelectSelector } from "@ha/data/selector";
import { showAlertDialog, showConfirmationDialog } from "@ha/dialogs/generic/show-dialog-box";
import { HomeAssistant, Route } from "@ha/types";

import { knxMainTabs } from "../knx-router";
import {
  getSettingsInfoData,
  subscribeGatewayScanner,
  writeConnectionData,
} from "../services/websocket.service";

import { KNX } from "../types/knx";
import {
  ConnectionType,
  SettingsInfoData,
  IntegrationSettingsData,
  ConnectionData,
} from "../types/websocket";
import { KNXLogger } from "../tools/knx-logger";
import { haStyle } from "@ha/resources/styles";

const logger = new KNXLogger("connection");

const enum ConnectionMainType {
  Automatic = "automatic",
  Tunnelling = "tunnelling",
  Routing = "routing",
}

const connectionTypeSelector: SelectSelector = {
  select: {
    multiple: false,
    custom_value: false,
    mode: "list",
    options: [
      { value: ConnectionMainType.Automatic, label: "Automatic" },
      { value: ConnectionMainType.Tunnelling, label: "Tunnelling" },
      { value: ConnectionMainType.Routing, label: "Routing" },
    ],
  },
};

const connectionTunnellingSelector: SelectSelector = {
  select: {
    multiple: false,
    custom_value: false,
    mode: "dropdown",
    options: [
      { value: ConnectionType.TunnellingUDP, label: "UDP" },
      { value: ConnectionType.TunnellingTCP, label: "TCP" },
      { value: ConnectionType.TunnellingSecure, label: "Secure" },
    ],
  },
};

@customElement("knx-settings")
export class KNXSettingsView extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  @state() private unsubscribe?: () => void;

  @state() private _localInterfaces: string[] = [];

  @state() private newConnectionData!: ConnectionData;

  @state() private oldConnectionData!: ConnectionData;

  @state() private newSettingsData!: IntegrationSettingsData;

  @state() private oldSettingsData!: IntegrationSettingsData;

  public disconnectedCallback() {
    super.disconnectedCallback();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  protected async firstUpdated() {
    this._loadKnxConnectionInfo();
    this.unsubscribe = await subscribeGatewayScanner(
      this.hass,
      this.oldConnectionData?.local_ip ?? null,
      (message) => {
        logger.debug(message);
        this.requestUpdate();
      },
    );
  }

  private _loadKnxConnectionInfo() {
    getSettingsInfoData(this.hass).then(
      (settingsInfoData) => {
        const { config_entry, local_interfaces } = settingsInfoData;
        // split ConfigEntryData into ConnectionData and IntegrationSettingsData to be
        // able to have independent save buttons activation states
        const connectionData: ConnectionData = {
          connection_type: config_entry.connection_type,
          individual_address: config_entry.individual_address,
          local_ip: config_entry.local_ip,
          multicast_group: config_entry.multicast_group,
          multicast_port: config_entry.multicast_port,
          route_back: config_entry.route_back,
          host: config_entry.host,
          port: config_entry.port,
          tunnel_endpoint_ia: config_entry.tunnel_endpoint_ia,
          user_id: config_entry.user_id,
          user_password: config_entry.user_password,
          device_authentication: config_entry.device_authentication,
          knxkeys_filename: config_entry.knxkeys_filename,
          knxkeys_password: config_entry.knxkeys_password,
          backbone_key: config_entry.backbone_key,
          sync_latency_tolerance: config_entry.sync_latency_tolerance,
        };
        this.newConnectionData = connectionData;
        this.oldConnectionData = { ...connectionData };

        const settingsData: IntegrationSettingsData = {
          state_updater: config_entry.state_updater,
          rate_limit: config_entry.rate_limit,
          telegram_log_size: config_entry.telegram_log_size,
        };
        this.newSettingsData = settingsData;
        this.oldSettingsData = { ...settingsData };

        this._localInterfaces = local_interfaces;

        logger.debug("settingsInfoData", settingsInfoData);
        this.requestUpdate();
      },
      (err) => {
        logger.error("getSettingsInfoData", err);
      },
    );
  }

  protected _updateConnectionSetting(item_name: string, value_fn: (v: any) => any = (v) => v) {
    return (ev: CustomEvent): void => {
      const new_value = value_fn(ev.detail.value);
      logger.debug("Update connection setting", item_name, "to", new_value, typeof new_value);
      this.newConnectionData[item_name] = new_value;
      this.requestUpdate(); // mutable object changes need requestUpdate
    };
  }

  protected _updateIntegrationSetting(item_name: string, value_fn: (v: any) => any = (v) => v) {
    return (ev: CustomEvent): void => {
      const new_value = value_fn(ev.detail.value);
      logger.debug("Update integration setting", item_name, "to", new_value, typeof new_value);
      this.newSettingsData[item_name] = new_value;
      this.requestUpdate(); // mutable object changes need requestUpdate
    };
  }

  protected render(): TemplateResult | void {
    if (!this.newConnectionData) {
      return html`Loading...`;
    }
    const connectionDataUnchanged =
      JSON.stringify(this.oldConnectionData, Object.keys(this.oldConnectionData).sort()) ===
      JSON.stringify(this.newConnectionData, Object.keys(this.newConnectionData).sort());

    const settingsDataUnchanged =
      JSON.stringify(this.oldSettingsData, Object.keys(this.oldSettingsData).sort()) ===
      JSON.stringify(this.newSettingsData, Object.keys(this.newSettingsData).sort());

    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        .narrow=${this.narrow!}
        .route=${this.route!}
        .tabs=${knxMainTabs}
        .localizeFunc=${this.knx.localize}
      >
        <div class="columns">
          <ha-card class="knx-info" .header=${"Connection"}>
            <div class="card-content knx-info-section">
              ${this.connectionSettingsCardContent()}
              <!-- TODO: remove -->
              ${Object.entries(this.newConnectionData).map(
                ([key, val]) => html`
                  <div class="knx-content-row">
                    <div>${key}</div>
                    <div>${val}</div>
                  </div>
                `,
              )}
            </div>
            <div class="card-actions">
              <ha-progress-button
                .disabled=${connectionDataUnchanged}
                @click=${this._saveConnectionSettings}
              >
                ${this.hass.localize("ui.common.save")}
              </ha-progress-button>
            </div>
          </ha-card>
          <ha-card class="knx-info" .header=${"Integration settings"}>
            <div class="card-content knx-info-section">
              ${this.integrationSettingsCardContent()}
              <!-- TODO: remove -->
              ${Object.entries(this.newSettingsData).map(
                ([key, val]) => html`
                  <div class="knx-content-row">
                    <div>${key}</div>
                    <div>${val}</div>
                  </div>
                `,
              )}
            </div>
            <div class="card-actions">
              <ha-progress-button
                .disabled=${settingsDataUnchanged}
                @click=${this._saveIntegrationSettings}
              >
                ${this.hass.localize("ui.common.save")}
              </ha-progress-button>
            </div>
          </ha-card>
        </div>
      </hass-tabs-subpage>
    `;
  }

  private async _saveConnectionSettings(ev: CustomEvent): Promise<void> {
    const button = ev.currentTarget as any;
    button.progress = true;

    try {
      logger.debug("_saveConnectionSettings", this.newConnectionData);
      await writeConnectionData(this.hass, this.newConnectionData);
    } catch (err: any) {
      logger.debug("Error _saveConnectionSettings", err);
      showAlertDialog(this, {
        title: "Error saving connection settings",
        text: extractApiErrorMessage(err),
      });
    }
    button.progress = false;
  }

  private async _saveIntegrationSettings(ev: CustomEvent): Promise<void> {
    const button = ev.currentTarget as any;
    button.progress = true;

    try {
      logger.debug("_saveIntegrationSettings", this.newSettingsData);
      await writeConnectionData(this.hass, this.newSettingsData);
    } catch (err: any) {
      logger.debug("Error _saveIntegrationSettings", err);
      showAlertDialog(this, {
        title: "Error saving integration settings",
        text: extractApiErrorMessage(err),
      });
    }
    button.progress = false;
  }

  private integrationSettingsCardContent(): TemplateResult {
    return html`<ha-selector
        .hass=${this.hass}
        .label=${"Telegram log size"}
        .selector=${{ number: { min: 0, max: 5000, step: 1, unit_of_measurement: "telegrams" } }}
        .value=${this.newSettingsData.telegram_log_size}
        @value-changed=${this._updateIntegrationSetting("telegram_log_size")}
      ></ha-selector>
      ${this._advanecedIntegrationSettings()}`;
  }

  private _advanecedIntegrationSettings() {
    return this.hass.userData?.showAdvanced
      ? html`<ha-selector
          .hass=${this.hass}
          .label=${"Rate limit"}
          .selector=${{
            number: { min: 0, max: 50, step: 1, unit_of_measurement: "telegrams / second" },
          }}
          .value=${this.newSettingsData.rate_limit}
          @value-changed=${this._updateIntegrationSetting("rate_limit")}
        ></ha-selector>`
      : nothing;
  }

  protected _mainConnectionTypeFromInfoData(): ConnectionMainType {
    switch (this.newConnectionData?.connection_type) {
      case ConnectionType.TunnellingUDP:
      case ConnectionType.TunnellingTCP:
      case ConnectionType.TunnellingSecure:
        return ConnectionMainType.Tunnelling;
      case ConnectionType.RoutingPlain:
      case ConnectionType.RoutingSecure:
        return ConnectionMainType.Routing;
      default:
        return ConnectionMainType.Automatic;
    }
  }

  protected connectionSettingsCardContent(): TemplateResult {
    const currentMainTypeSelection = this._mainConnectionTypeFromInfoData();

    return html`
      <ha-selector
        .hass=${this.hass}
        .label=${"Connection type"}
        .selector=${connectionTypeSelector}
        .value=${currentMainTypeSelection}
        @value-changed=${this._changeConnectionMain}
      ></ha-selector>
      ${this.connectionSettingsForType(currentMainTypeSelection)}
      ${this._advanecedConnectionSettings()}
    `;
  }

  protected _changeConnectionMain(ev: CustomEvent): void {
    logger.debug(
      "connectionMainChanged",
      this.newConnectionData.connection_type,
      "to",
      ev.detail.value,
    );
    const connectionMainType: ConnectionMainType = ev.detail.value;
    switch (connectionMainType) {
      case ConnectionMainType.Tunnelling:
        if (this.oldConnectionData.connection_type === ConnectionType.TunnellingSecure) {
          this.newConnectionData.connection_type = ConnectionType.TunnellingSecure;
        } else if (this.oldConnectionData.connection_type === ConnectionType.TunnellingTCP) {
          this.newConnectionData.connection_type = ConnectionType.TunnellingTCP;
        } else {
          this.newConnectionData.connection_type = ConnectionType.TunnellingUDP;
        }
        break;
      case ConnectionMainType.Routing:
        if (this.oldConnectionData.connection_type === ConnectionType.RoutingSecure) {
          this.newConnectionData.connection_type = ConnectionType.RoutingSecure;
        } else {
          this.newConnectionData.connection_type = ConnectionType.RoutingPlain;
        }
        break;
      default:
        this.newConnectionData.connection_type = ConnectionType.Automatic;
    }
    this.requestUpdate(); // mutable object changes need requestUpdate
  }

  protected connectionSettingsForType(connectionMainType: ConnectionMainType) {
    switch (connectionMainType) {
      case ConnectionMainType.Tunnelling:
        return this._connectionSettingsTunnelling();
      case ConnectionMainType.Routing:
        return this._connectionSettingsRouting();
      default:
        // Automatic doesn't need any specific settings
        return nothing;
    }
  }

  protected _connectionSettingsTunnelling(): TemplateResult {
    return html`
      <ha-selector
        .hass=${this.hass}
        .label=${"Tunnelling Type"}
        .selector=${connectionTunnellingSelector}
        .value=${this.newConnectionData!.connection_type}
        @value-changed=${this._updateConnectionSetting("connection_type")}
      ></ha-selector>
      <ha-selector
        .hass=${this.hass}
        .label=${"Interface IP"}
        .selector=${{ text: { multiline: false, type: "text" } }}
        .value=${this.newConnectionData!.host}
        .required=${true}
        @value-changed=${this._updateConnectionSetting("host")}
      ></ha-selector>
      <ha-selector
        .hass=${this.hass}
        .label=${"Port"}
        .selector=${{ number: { min: 0, max: 65535, step: 1, mode: "box" } }}
        .value=${this.newConnectionData!.port}
        .required=${true}
        @value-changed=${this._updateConnectionSetting("port")}
      ></ha-selector>
      ${this.newConnectionData.connection_type === ConnectionType.TunnellingUDP
        ? html`<ha-selector
            .hass=${this.hass}
            .label=${"Route back / NAT mode"}
            .selector=${{ boolean: {} }}
            .value=${this.newConnectionData!.route_back}
            @value-changed=${this._updateConnectionSetting("route_back")}
          ></ha-selector>`
        : html`<ha-selector
            .hass=${this.hass}
            .label=${"Tunnel endpoint address"}
            .selector=${{ text: { multiline: false, type: "text" } }}
            .value=${this.newConnectionData!.tunnel_endpoint_ia}
            .required=${false}
            @value-changed=${this._updateConnectionSetting("tunnel_endpoint_ia")}
          ></ha-selector> `}
      ${this.newConnectionData.connection_type === ConnectionType.TunnellingSecure
        ? html`<ha-selector
              .hass=${this.hass}
              .label=${"User ID"}
              .selector=${{ number: { min: 2, max: 20, step: 1, mode: "box" } }}
              .value=${this.newConnectionData!.user_id}
              .required=${true}
              @value-changed=${this._updateConnectionSetting("user_id")}
            ></ha-selector>
            <ha-selector
              .hass=${this.hass}
              .label=${"User password"}
              .selector=${{ text: { multiline: false, type: "text" } }}
              .value=${this.newConnectionData!.user_password}
              @value-changed=${this._updateConnectionSetting("user_password")}
            ></ha-selector>
            <ha-selector
              .hass=${this.hass}
              .label=${"Device authentication"}
              .selector=${{ text: { multiline: false, type: "text" } }}
              .value=${this.newConnectionData!.device_authentication}
              @value-changed=${this._updateConnectionSetting("device_authentication")}
            ></ha-selector>`
        : nothing}
    `;
  }

  protected _connectionSettingsRouting(): TemplateResult {
    return html`
      <ha-selector
        .hass=${this.hass}
        .label=${"IP Secure"}
        .selector=${{ boolean: {} }}
        .value=${this.newConnectionData.connection_type === ConnectionType.RoutingSecure}
        @value-changed=${this._updateConnectionSetting("connection_type", (v) =>
          v ? ConnectionType.RoutingSecure : ConnectionType.RoutingPlain,
        )}
      ></ha-selector>
      <ha-selector
        .hass=${this.hass}
        .label=${"Individual Address"}
        .selector=${{ text: { multiline: false, type: "text" } }}
        .value=${this.newConnectionData!.individual_address}
        .required=${true}
        @value-changed=${this._updateConnectionSetting("individual_address")}
      ></ha-selector>
      <ha-selector
        .hass=${this.hass}
        .label=${"Multicast Group"}
        .selector=${{ text: { multiline: false, type: "text" } }}
        .value=${this.newConnectionData!.multicast_group}
        .required=${true}
        @value-changed=${this._updateConnectionSetting("multicast_group")}
      ></ha-selector>
      <ha-selector
        .hass=${this.hass}
        .label=${"Multicast Port"}
        .selector=${{ number: { min: 0, max: 65535, step: 1, mode: "box" } }}
        .value=${this.newConnectionData!.multicast_port}
        .required=${true}
        @value-changed=${this._updateConnectionSetting("multicast_port")}
      ></ha-selector>
      ${this.newConnectionData.connection_type === ConnectionType.RoutingSecure
        ? html`<ha-selector
              .hass=${this.hass}
              .label=${"Backbone Key"}
              .selector=${{ text: { multiline: false, type: "text" } }}
              .value=${this.newConnectionData!.backbone_key}
              @value-changed=${this._updateConnectionSetting("backbone_key")}
            ></ha-selector>
            <ha-selector
              .hass=${this.hass}
              .label=${"Sync latency tolerance"}
              .selector=${{
                number: {
                  min: 500,
                  max: 5000,
                  step: 100,
                  mode: "slider",
                  unit_of_measurement: "ms",
                },
              }}
              .value=${this.newConnectionData!.sync_latency_tolerance}
              .required=${true}
              @value-changed=${this._updateConnectionSetting("sync_latency_tolerance")}
            ></ha-selector>`
        : nothing}
    `;
  }

  private _advanecedConnectionSettings() {
    const interfaces = this._localInterfaces.map((iface) => ({ label: iface, value: iface }));
    interfaces.unshift({ label: "Automatic", value: "" }); // empty string is automatic -> null

    return this.hass.userData?.showAdvanced
      ? html`<ha-selector
          .hass=${this.hass}
          .label=${"Local interface"}
          .selector=${{
            select: {
              multiple: false,
              custom_value: false,
              mode: "dropdown",
              options: interfaces,
            },
          }}
          .value=${this.newConnectionData.local_ip ?? ""}
          .required=${false}
          @value-changed=${this._updateConnectionSetting("local_ip", (v) => v || null)}
        ></ha-selector>`
      : nothing;
  }

  // private _filePicked(ev) {
  //   this._projectFile = ev.detail.files[0];
  // }

  // private _passwordChanged(ev) {
  //   this._projectPassword = ev.detail.value;
  // }

  // private async _uploadFile(_ev) {
  //   const file = this._projectFile;
  //   if (typeof file === "undefined") {
  //     return;
  //   }

  //   let error: Error | undefined;
  //   this._uploading = true;
  //   try {
  //     const project_file_id = await uploadFile(this.hass, file);
  //     await processProjectFile(this.hass, project_file_id, this._projectPassword || "");
  //   } catch (err: any) {
  //     error = err;
  //     showAlertDialog(this, {
  //       title: "Upload failed",
  //       text: extractApiErrorMessage(err),
  //       confirmText: "ok",
  //     });
  //   } finally {
  //     if (!error) {
  //       this._projectFile = undefined;
  //       this._projectPassword = undefined;
  //     }
  //     this._uploading = false;
  //     this.loadKnxInfo();
  //   }
  // }

  // private async _removeProject(_ev) {
  //   const confirmed = await showConfirmationDialog(this, {
  //     text: this.knx.localize("info_project_delete"),
  //   });
  //   if (!confirmed) {
  //     logger.debug("User cancelled deletion");
  //     return;
  //   }

  //   try {
  //     await removeProjectFile(this.hass);
  //   } catch (err: any) {
  //     showAlertDialog(this, {
  //       title: "Deletion failed",
  //       text: extractApiErrorMessage(err),
  //       confirmText: "ok",
  //     });
  //   } finally {
  //     this.loadKnxInfo();
  //   }
  // }

  // static get styles(): CSSResultGroup {
  //   return haStyle;
  // }
  static get styles() {
    return css`
      .columns {
        display: flex;
        justify-content: center;
      }

      @media screen and (max-width: 1232px) {
        .columns {
          flex-direction: column;
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
          width: 400px;
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
    "knx-settings": KNXSettingsView;
  }
}
