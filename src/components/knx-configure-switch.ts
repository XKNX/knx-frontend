import { css, html, LitElement, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators";

import "@ha/components/ha-card";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-selector/ha-selector";
import "@ha/components/ha-settings-row";

import { fireEvent } from "@ha/common/dom/fire_event";
import { HomeAssistant } from "@ha/types";

import "./knx-group-address-selector";
import "./knx-sync-state-selector-row";
import { renderConfigureEntityCard } from "./knx-configure-entity-card";
import { KNXLogger } from "../tools/knx-logger";
import {
  SwitchEntityData,
  CreateEntityData,
  SchemaOptions,
  ErrorDescription,
} from "../types/entity_data";
import { KNX } from "../types/knx";
import { platformConstants } from "../utils/common";

const logger = new KNXLogger("knx-configure-switch");

@customElement("knx-configure-switch")
export class KNXConfigureSwitch extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Object }) public config: Partial<SwitchEntityData> = {};

  // no schema options for switch - yet
  @property({ type: Object }) public schemaOptions: SchemaOptions = {};

  // TODO: use this to highlight validation errors
  @property({ type: Array }) public validationErrors?: ErrorDescription[];

  protected render(): TemplateResult | void {
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
          <knx-group-address-selector
            .hass=${this.hass}
            .knx=${this.knx}
            .key=${"ga_switch"}
            .config=${this.config.ga_switch ?? {}}
            .options=${{
              write: { required: true },
              state: { required: false },
              passive: true,
              validDPTs: [{ main: 1, sub: null }],
            }}
            @value-changed=${this._updateConfig}
          ></knx-group-address-selector>
        </ha-settings-row>
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
      ${renderConfigureEntityCard(this.hass, this.config.entity ?? {}, this._updateEntityConfig)}
    `;
  }

  private _updateConfig(ev) {
    ev.stopPropagation();
    this.config[ev.target.key] = ev.detail.value;
    logger.warn(`update base key "${ev.target.key}" with "${ev.detail.value}"`);
    this._propageteNewConfig();
  }

  private _updateEntityConfig(ev) {
    ev.stopPropagation();
    if (!this.config.entity) {
      this.config.entity = {};
    }
    this.config.entity[ev.target.key] = ev.detail.value;
    logger.warn(`update entity key "${ev.target.key}" with "${ev.detail.value}"`);
    this._propageteNewConfig();
  }

  private _propageteNewConfig() {
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

      ha-selector {
        display: block;
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

declare global {
  // for fire event
  interface HASSDomEvents {
    "knx-entity-configuration-changed": CreateEntityData;
  }
}
