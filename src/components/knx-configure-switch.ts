import { css, html, LitElement, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";

import { fireEvent } from "@ha/common/dom/fire_event";
import "@ha/components/ha-button";
import "@ha/components/ha-card";
import "@ha/components/ha-fab";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-navigation-list";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-icon-overflow-menu";
import "@ha/components/ha-selector/ha-selector";
import "@ha/components/ha-selector/ha-selector-select";
import "@ha/components/ha-settings-row";
import "@ha/panels/config/ha-config-section";

import { HomeAssistant } from "@ha/types";
import "./knx-sync-state-selector-row";
import { SwitchEntityData, CreateEntityData } from "../types/entity_data";
import { KNX } from "../types/knx";
import { platformConstants } from "../utils/common";
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

  @state() private config: Partial<SwitchEntityData> = {};

  protected render(): TemplateResult | void {
    const dpt1gas = Object.values(this.knx.project!.knxproject.group_addresses).filter(
      (groupAddress) => groupAddress.dpt?.main === 1,
    );
    const addressOptions = dpt1gas.map((groupAddress) => ({
      value: groupAddress.address,
      label: `${groupAddress.address} - ${groupAddress.name}`,
    }));
    return html`
      <ha-card outlined>
        <h1 class="card-header">
          <ha-svg-icon .path=${platformConstants.switch.iconPath}></ha-svg-icon>Switch - KNX
          configuration
        </h1>
        <p class="card-content">
          The KNX switch platform is used as an interface to switching actuators.
        </p>
        <ha-settings-row narrow>
          <div slot="heading">Switching</div>
          <div slot="description">DPT 1 group addresses controlling the switch function.</div>
          <ha-selector
            .hass=${this.hass}
            .label=${"Address"}
            .selector=${{
              select: { multiple: false, custom_value: true, options: addressOptions },
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
              select: { multiple: false, custom_value: true, options: addressOptions },
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
        <h1 class="card-header">
          <ha-svg-icon .path=${platformConstants.switch.iconPath}></ha-svg-icon>Switch - Entity
          configuration
        </h1>
        <p class="card-content">Home Assistant entity specific settings.</p>
        <ha-settings-row narrow>
          <div slot="heading">Name</div>
          <div slot="description">Name of the entity.</div>
          <ha-selector
            .hass=${this.hass}
            .label=${"Name"}
            .selector=${{
              text: { type: "text" },
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
