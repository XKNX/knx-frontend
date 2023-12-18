import { css, html, LitElement, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators";

import { fireEvent } from "@ha/common/dom/fire_event";
import "@ha/components/ha-card";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-selector/ha-selector";
import "@ha/components/ha-selector/ha-selector-select";
import "@ha/components/ha-settings-row";

import "@ha/components/device/ha-device-picker";

import { HomeAssistant } from "@ha/types";
import "./knx-sync-state-selector-row";
import "./knx-device-picker";
import { SwitchEntityData, CreateEntityData } from "../types/entity_data";
import { KNX } from "../types/knx";
import { platformConstants } from "../utils/common";
import { deviceFromIdentifier } from "../utils/device";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("knx-configure-switch");

declare global {
  // for fire event
  interface HASSDomEvents {
    "knx-entity-configuration-changed": CreateEntityData;
  }
}

@customElement("knx-configure-switch")
export class KNXConfigureSwitch extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Object }) public config: Partial<SwitchEntityData> = {};

  protected render(): TemplateResult | void {
    const dpt1gas = Object.values(this.knx.project!.knxproject.group_addresses).filter(
      (groupAddress) => groupAddress.dpt?.main === 1,
    );
    const addressOptions = dpt1gas.map((groupAddress) => ({
      value: groupAddress.address,
      label: `${groupAddress.address} - ${groupAddress.name}`,
    }));
    logger.debug("config", this.config);
    const device = this.config.device_id
      ? deviceFromIdentifier(this.hass, this.config.device_id)
      : undefined;
    const deviceName = device ? device.name_by_user ?? device.name : "";

    return html`
      <div class="header">
        <h1><ha-svg-icon .path=${platformConstants.switch.iconPath}></ha-svg-icon>Switch</h1>
        <p>The KNX switch platform is used as an interface to switching actuators.</p>
      </div>
      <ha-card outlined>
        <h1 class="card-header">KNX configuration</h1>
        <ha-settings-row narrow>
          <div slot="heading">Switching</div>
          <div slot="description">DPT 1 group addresses controlling the switch function.</div>
          <ha-selector
            .hass=${this.hass}
            .label=${"Address"}
            .selector=${{
              select: { multiple: true, custom_value: true, options: addressOptions },
            }}
            .key=${"switch_address"}
            .value=${this.config.switch_address}
            @value-changed=${this._updateConfig}
          ></ha-selector>
          <div class="spacer"></div>
          <ha-selector
            .hass=${this.hass}
            .label=${"State address"}
            .selector=${{
              select: {
                multiple: true,
                custom_value: true,
                options: addressOptions,
              },
            }}
            .key=${"switch_state_address"}
            .value=${this.config.switch_state_address}
            @value-changed=${this._updateConfig}
          ></ha-selector>
          <ha-selector
            .hass=${this.hass}
            .label=${"Invert"}
            .helper=${"Invert payloads before processing or sending."}
            .selector=${{ boolean: {} }}
            .key=${"invert"}
            .value=${this.config.invert}
            @value-changed=${this._updateConfig}
          ></ha-selector>
          <ha-selector
            .hass=${this.hass}
            .label=${"Respond to read"}
            .helper=${"Respond to GroupValueRead telegrams received to the configured address."}
            .selector=${{ boolean: {} }}
            .key=${"respond_to_read"}
            .value=${this.config.respond_to_read}
            @value-changed=${this._updateConfig}
          ></ha-selector>
        </ha-settings-row>
        <ha-expansion-panel .header=${"Advanced"} outlined>
          <knx-sync-state-selector-row
            .hass=${this.hass}
            .key=${"sync_state"}
            .value=${this.config.sync_state ?? true}
            @value-changed=${this._updateConfig}
          ></knx-sync-state-selector-row>
        </ha-expansion-panel>
      </ha-card>
      <ha-card outlined>
        <h1 class="card-header">Entity configuration</h1>
        <p class="card-content">Home Assistant specific settings.</p>
        <ha-settings-row narrow>
          <div slot="heading">Device</div>
          <div slot="description">A device allows to group multiple entities.</div>
          <knx-device-picker
            .hass=${this.hass}
            .key=${"device_id"}
            .value=${this.config.device_id}
            @value-changed=${this._updateConfig}
          ></knx-device-picker>
        </ha-settings-row>
        <ha-settings-row narrow>
          <div slot="heading">Name</div>
          <div slot="description">Name of the entity.</div>
          <ha-selector
            .hass=${this.hass}
            .label=${"Name"}
            .required=${!this.config.device_id}
            .selector=${{
              text: { type: "text", prefix: deviceName },
            }}
            .key=${"name"}
            .value=${this.config.name}
            @value-changed=${this._updateConfig}
          ></ha-selector>
        </ha-settings-row>
        <ha-expansion-panel .header=${"Advanced"} outlined>
          <ha-settings-row narrow>
            <div slot="heading">Entity settings</div>
            <div slot="description">Description</div>
            <ha-selector
              .hass=${this.hass}
              .label=${"Entity category"}
              .helper=${"Leave empty for standard behaviour."}
              .required=${false}
              .selector=${{
                select: {
                  multiple: false,
                  custom_value: false,
                  mode: "dropdown",
                  options: [
                    { value: "config", label: "Config" },
                    { value: "diagnostic", label: "Diagnostic" },
                  ],
                },
              }}
              .key=${"entity_category"}
              .value=${this.config.entity_category}
              @value-changed=${this._updateConfig}
            ></ha-selector>
          </ha-settings-row>
        </ha-expansion-panel>
      </ha-card>
    `;
  }

  private _updateConfig(ev) {
    ev.stopPropagation();
    this.config[ev.target.key] = ev.detail.value;
    logger.warn(ev.target);
    logger.warn("update key", ev.target.key);
    logger.warn("update value", ev.detail.value);
    logger.warn("new_config", this.config);
    if (true) {
      // validate
      fireEvent(this, "knx-entity-configuration-changed", {
        platform: "switch",
        data: this.config,
      });
    }
    this.requestUpdate();
  }

  static get styles() {
    return css`
      .spacer {
        height: 16px;
      }

      .divider {
        height: 1px;
        background-color: var(--divider-color);
        margin-top: 10px;
        margin-right: 0px;
      }

      .card-header {
        display: inline-flex;
        align-items: center;
      }

      .header {
        color: var(--ha-card-header-color, --primary-text-color);
        font-family: var(--ha-card-header-font-family, inherit);
        padding: 0 16px 16px;
        & h1 {
          display: inline-flex;
          align-items: center;
          font-size: 26px;
          letter-spacing: -0.012em;
          line-height: 48px;
          font-weight: normal;
          margin-bottom: 14px;
        }
        & p {
          margin-top: -8px;
          line-height: 24px;
        }
      }

      ha-card {
        margin-bottom: 24px;
        padding: 16px;
      }

      ha-svg-icon {
        color: var(--text-primary-color);
        padding: 8px;
        background-color: var(--blue-color);
        border-radius: 50%;
      }

      h1 > * {
        margin-right: 8px;
      }

      p {
        color: var(--secondary-text-color);
      }

      ha-settings-row {
        padding: 0;
        margin-bottom: 16px;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-configure-switch": KNXConfigureSwitch;
  }
}
