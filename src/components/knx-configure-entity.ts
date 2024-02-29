import { css, html, LitElement, TemplateResult, nothing } from "lit";
import { customElement, property } from "lit/decorators";

import "@ha/components/ha-card";
import "@ha/components/ha-control-select";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-selector/ha-selector";
import "@ha/components/ha-settings-row";

import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant } from "@ha/types";

import "./knx-group-address-selector";
import "./knx-sync-state-selector-row";
import { renderConfigureEntityCard } from "./knx-configure-entity-options";
import { KNXLogger } from "../tools/knx-logger";
import { extractValidationErrors } from "../utils/validation";
import type { EntityData, ErrorDescription } from "../types/entity_data";
import type { KNX } from "../types/knx";
import type { PlatformInfo } from "../utils/common";
import type { SettingsGroup, SelectorSchema, GroupSelect } from "../utils/schema";

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
    const errors = extractValidationErrors(this.validationErrors, "data"); // "data" is root key in our python schema
    return html`
      <div class="header">
        <h1><ha-svg-icon .path=${this.platform.iconPath}></ha-svg-icon>${this.platform.name}</h1>
        <p>${this.platform.description}</p>
      </div>
      <slot name="knx-validation-error"></slot>
      <ha-card outlined>
        <h1 class="card-header">KNX configuration</h1>
        ${this.generateRootGroups(this.platform.schema, errors)}
      </ha-card>
      ${renderConfigureEntityCard(this.hass, this.config.entity ?? {}, this._updateEntityConfig)}
    `;
  }

  generateRootGroups(schema: SettingsGroup[], errors?: ErrorDescription[]) {
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
      ${regular_items.map((group: SettingsGroup) => this._generateSettingsGroup(group, errors))}
      ${advanced_items.length
        ? html` <ha-expansion-panel .header=${"Advanced"} outlined>
            ${advanced_items.map((group: SettingsGroup) =>
              this._generateSettingsGroup(group, errors),
            )}
          </ha-expansion-panel>`
        : nothing}
    `;
  }

  _generateSettingsGroup(group: SettingsGroup, errors?: ErrorDescription[]) {
    return html` <ha-settings-row narrow>
      <div slot="heading">${group.heading}</div>
      <div slot="description">${group.description}</div>
      ${this._generateItems(group.selectors, errors)}
    </ha-settings-row>`;
  }

  _generateItems(selectors: SelectorSchema[], errors?: ErrorDescription[]) {
    return html`${selectors.map((selector: SelectorSchema) =>
      this._generateItem(selector, errors),
    )}`;
  }

  _generateItem(selector: SelectorSchema, errors?: ErrorDescription[]) {
    switch (selector.type) {
      case "group_address":
        return html`
          <knx-group-address-selector
            .hass=${this.hass}
            .knx=${this.knx}
            .key=${selector.name}
            .label=${selector.label}
            .config=${this.config[selector.name] ?? {}}
            .options=${selector.options}
            .validationErrors=${extractValidationErrors(errors, selector.name)}
            @value-changed=${this._updateConfig}
          ></knx-group-address-selector>
        `;
      case "selector":
        // apply default value if available and no value is set
        if (selector.default !== undefined && this.config[selector.name] == null) {
          this.config[selector.name] = selector.default;
        }
        return html`
          <ha-selector
            .hass=${this.hass}
            .selector=${selector.selector}
            .label=${selector.label}
            .helper=${selector.helper}
            .key=${selector.name}
            .value=${this.config[selector.name]}
            @value-changed=${this._updateConfig}
          ></ha-selector>
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
      case "group_select":
        return this._generateGroupSelect(selector, errors);
      default:
        logger.error("Unknown selector type", selector);
        return nothing;
    }
  }

  _generateGroupSelect(selector: GroupSelect, errors?: ErrorDescription[]) {
    const value: string =
      this.config[selector.name] ??
      // set default if nothing is set yet
      (this.config[selector.name] = selector.options[0].value);
    const option = selector.options.find((item) => item.value === value);
    if (option === undefined) {
      logger.error("No option found for value", value);
    }
    return html` <ha-control-select
        .options=${selector.options}
        .value=${value}
        .key=${selector.name}
        @value-changed=${this._updateConfig}
      ></ha-control-select>
      ${option
        ? html` <p class="group-description">${option.description}</p>
            <div class="group-selection">
              ${option.schema.map((item: SettingsGroup | SelectorSchema) => {
                switch (item.type) {
                  case "settings_group":
                    return this._generateSettingsGroup(item, errors);
                  default:
                    return this._generateItem(item, errors);
                }
              })}
            </div>`
        : nothing}`;
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
    fireEvent(this, "knx-entity-configuration-changed", this.config);
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
      }
      ha-control-select {
        padding: 0;
        margin-bottom: 16px;
      }

      .group-description {
        align-items: center;
        margin-top: -8px;
        padding-left: 8px;
        padding-bottom: 8px;
      }

      .group-selection {
        padding-left: 16px;
        padding-right: 16px;
        & ha-settings-row:first-child {
          border-top: 0;
        }
      }

      knx-group-address-selector,
      ha-selector,
      ha-selector-text,
      ha-selector-select,
      knx-sync-state-selector-row {
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
    "knx-entity-configuration-changed": EntityData;
  }
}
