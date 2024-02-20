import { css, html, LitElement, TemplateResult, nothing } from "lit";
import { customElement, property } from "lit/decorators";

import "@ha/components/ha-card";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-selector/ha-selector-boolean";
import "@ha/components/ha-settings-row";

import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant } from "@ha/types";

import "./knx-group-address-selector";
import "./knx-sync-state-selector-row";
import { renderConfigureEntityCard } from "./knx-configure-entity-options";
import { KNXLogger } from "../tools/knx-logger";
import { extractValidationErrors } from "../utils/validation";
import type { CreateEntityData, ErrorDescription } from "../types/entity_data";
import type { KNX } from "../types/knx";
import type { PlatformInfo } from "../utils/common";
import type { SettingsGroup, SelectorSchema } from "../utils/schema";

const logger = new KNXLogger("knx-configure-entity");

@customElement("knx-configure-entity")
export class KNXConfigureEntity extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Object }) public platform!: PlatformInfo;

  // TODO: typing
  @property({ type: Object }) public config = {};

  @property({ type: Array }) public schema!: SettingsGroup[];

  @property({ type: Array }) public validationErrors?: ErrorDescription[];

  protected render(): TemplateResult | void {
    return html`
      <div class="header">
        <h1><ha-svg-icon .path=${this.platform.iconPath}></ha-svg-icon>${this.platform.name}</h1>
        <p>${this.platform.description}</p>
      </div>
      <slot name="knx-validation-error"></slot>
      <ha-card outlined>
        <h1 class="card-header">KNX configuration</h1>
        ${this.generateGroups(this.platform.schema)}
      </ha-card>
      ${renderConfigureEntityCard(this.hass, this.config.entity ?? {}, this._updateEntityConfig)}
    `;
  }

  generateGroups(schema: SettingsGroup[]) {
    const regular_items: SettingsGroup[] = [];
    const advanced_items: SettingsGroup[] = [];

    schema.forEach((item: SettingsGroup) => {
      if (item.advanced) {
        advanced_items.push(item);
      } else {
        regular_items.push(item);
      }
    });
    return html`
      ${regular_items.map((group: SettingsGroup) => this._generateSettingsGroup(group))}
      ${advanced_items.length
        ? html` <ha-expansion-panel .header=${"Advanced"} outlined>
            ${advanced_items.map((group: SettingsGroup) => this._generateSettingsGroup(group))}
          </ha-expansion-panel>`
        : nothing}
    `;
  }

  _generateSettingsGroup(group: SettingsGroup) {
    return html` <ha-settings-row narrow>
      <div slot="heading">${group.heading}</div>
      <div slot="description">${group.description}</div>
      ${this._generateItems(
        group.selectors,
        extractValidationErrors(this.validationErrors, "data"), // "data" is root key in our python schema
      )}
    </ha-settings-row>`;
  }

  _generateItems(selectors: SelectorSchema[], errors?: ErrorDescription[]) {
    return html`${selectors.map((selector: SelectorSchema) => {
      switch (selector.type) {
        case "group_address":
          return html`
            <knx-group-address-selector
              .hass=${this.hass}
              .knx=${this.knx}
              .key=${selector.name}
              .config=${this.config[selector.name] ?? {}}
              .options=${selector.options}
              .validationErrors=${extractValidationErrors(errors, selector.name)}
              @value-changed=${this._updateConfig}
            ></knx-group-address-selector>
          `;
        case "boolean":
          return html`
            <ha-selector-boolean
              .hass=${this.hass}
              .label=${selector.label}
              .helper=${selector.helper}
              .key=${selector.name}
              .value=${this.config[selector.name]}
              @value-changed=${this._updateConfig}
            ></ha-selector-boolean>
          `;
        case "sync_state":
          return html`
            <knx-sync-state-selector-row
              .hass=${this.hass}
              .key=${selector.name}
              .value=${this.config[selector.name] ?? true}
              @value-changed=${this._updateConfig}
            ></knx-sync-state-selector-row>
          `;
        default:
          logger.error("Unknown selector type", selector);
          return nothing;
      }
    })} `;
  }

  private _updateConfig(ev) {
    ev.stopPropagation();
    this.config[ev.target.key] = ev.detail.value;
    logger.debug(`update base key "${ev.target.key}" with "${ev.detail.value}"`);
    this._propagateNewConfig();
  }

  private _updateEntityConfig(ev) {
    ev.stopPropagation();
    if (!this.config.entity) {
      this.config.entity = {};
    }
    this.config.entity[ev.target.key] = ev.detail.value;
    logger.debug(`update entity key "${ev.target.key}" with "${ev.detail.value}"`);
    this._propagateNewConfig();
  }

  private _propagateNewConfig() {
    fireEvent(this, "knx-entity-configuration-changed", {
      platform: "switch",
      data: this.config,
    });
    this.requestUpdate();
  }

  static get styles() {
    return css`
      p {
        color: var(--secondary-text-color);
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

          & ha-svg-icon {
            color: var(--text-primary-color);
            padding: 8px;
            background-color: var(--blue-color);
            border-radius: 50%;
            margin-right: 8px;
          }
        }

        & p {
          margin-top: -8px;
          line-height: 24px;
        }
      }

      ::slotted(ha-alert) {
        margin-top: 0 !important;
      }

      ha-card {
        margin-bottom: 24px;
        padding: 16px;

        & .card-header {
          display: inline-flex;
          align-items: center;
        }
      }

      ha-settings-row {
        padding: 0;
        margin-bottom: 16px;
      }

      ha-selector-boolean,
      ha-selector-text,
      ha-selector-select {
        display: block;
        margin-bottom: 16px;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-configure-entity": KNXConfigureEntity;
  }
}

declare global {
  // for fire event
  interface HASSDomEvents {
    "knx-entity-configuration-changed": CreateEntityData;
  }
}
