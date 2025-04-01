import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";

import "@ha/components/ha-card";
import "@ha/components/ha-control-select";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-selector/ha-selector";
import "@ha/components/ha-settings-row";

import { mainWindow } from "@ha/common/dom/get_main_window";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant } from "@ha/types";

import "./knx-group-address-selector";
import "./knx-selector-row";
import "./knx-sync-state-selector-row";
import { renderConfigureEntityCard } from "./knx-configure-entity-options";
import { KNXLogger } from "../tools/knx-logger";
import { extractValidationErrors } from "../utils/validation";
import type { EntityData, ErrorDescription, KnxEntityData } from "../types/entity_data";
import type { KNX } from "../types/knx";
import type { PlatformInfo } from "../utils/common";
import type { SettingsGroup, SelectorSchema, GroupSelect, GASchema } from "../utils/schema";

const logger = new KNXLogger("knx-configure-entity");

@customElement("knx-configure-entity")
export class KNXConfigureEntity extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Object }) public platform!: PlatformInfo;

  @property({ type: Object }) public config?: EntityData;

  @property({ type: Array }) public schema!: SettingsGroup[];

  @property({ attribute: false }) public validationErrors?: ErrorDescription[];

  connectedCallback(): void {
    super.connectedCallback();
    if (!this.config) {
      // set base keys to get better validation error messages
      this.config = { entity: {}, knx: {} };

      // url params are extracted to config.
      // /knx/entities/create/binary_sensor?knx.ga_sensor.state=0/1/4
      // would set this.conifg.knx.ga_sensor.state to "0/1/4"
      // TODO: this is not checked against any schema
      const urlParams = new URLSearchParams(mainWindow.location.search);
      this._url_suggestions = Object.fromEntries(urlParams.entries());
      for (const [path, value] of Object.entries(this._url_suggestions)) {
        this._setNestedValue(path, value);
        fireEvent(this, "knx-entity-configuration-changed", this.config);
      }
    }
  }

  private _setNestedValue(path: string, value: any) {
    const keys = path.split(".");
    const keysTail = keys.pop();
    if (!keysTail) return;
    let current = this.config!;
    for (const key of keys) {
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    current[keysTail] = value;
  }

  protected render(): TemplateResult {
    const errors = extractValidationErrors(this.validationErrors, "data"); // "data" is root key in our python schema
    const knxErrors = extractValidationErrors(errors, "knx");
    const knxBaseError = knxErrors?.find((err) => (err.path ? err.path.length === 0 : true));

    return html`
      <div class="header">
        <h1>
          <ha-svg-icon
            .path=${this.platform.iconPath}
            style=${styleMap({ "background-color": this.platform.color })}
          ></ha-svg-icon>
          ${this.platform.name}
        </h1>
        <p>${this.platform.description}</p>
      </div>
      <slot name="knx-validation-error"></slot>
      <ha-card outlined>
        <h1 class="card-header">KNX configuration</h1>
        ${knxBaseError
          ? html`<ha-alert .alertType=${"error"} .title=${knxBaseError.error_message}></ha-alert>`
          : nothing}
        ${this.generateRootGroups(this.platform.schema, knxErrors)}
      </ha-card>
      ${renderConfigureEntityCard(
        this.hass,
        this.config!.entity ?? {},
        this._updateConfig("entity"),
        extractValidationErrors(errors, "entity"),
      )}
    `;
  }

  generateRootGroups(schema: SettingsGroup[], errors?: ErrorDescription[]) {
    return html`
      ${schema.map((group: SettingsGroup) => this._generateSettingsGroup(group, errors))}
    `;
  }

  private _generateSettingsGroup(group: SettingsGroup, errors?: ErrorDescription[]) {
    return html` <ha-expansion-panel
      .header=${group.heading}
      .secondary=${group.description}
      .expanded=${!group.collapsible || this._groupHasGroupAddressInConfig(group)}
      .noCollapse=${!group.collapsible}
      .outlined=${!!group.collapsible}
      >${this._generateItems(group.selectors, errors)}
    </ha-expansion-panel>`;
  }

  private _groupHasGroupAddressInConfig(group: SettingsGroup) {
    if (this.config === undefined) {
      return false;
    }
    return group.selectors.some((selector) => {
      if (selector.type === "group_address")
        return this._hasGroupAddressInConfig(selector, this.config!.knx);
      if (selector.type === "group_select")
        return selector.options.some((options) =>
          options.schema.some((schema) => {
            if (schema.type === "settings_group") return this._groupHasGroupAddressInConfig(schema);
            if (schema.type === "group_address")
              return this._hasGroupAddressInConfig(schema, this.config!.knx);
            return false;
          }),
        );
      return false;
    });
  }

  private _hasGroupAddressInConfig(ga_selector: GASchema, knxData: KnxEntityData) {
    if (!(ga_selector.name in knxData)) return false;

    const knxEntry = knxData[ga_selector.name];
    if (knxEntry.write !== undefined) return true;
    if (knxEntry.state !== undefined) return true;
    if (knxEntry.passive?.length) return true;

    return false;
  }

  private _generateItems(selectors: SelectorSchema[], errors?: ErrorDescription[]) {
    return html`${selectors.map((selector: SelectorSchema) => this._generateItem(selector, errors))}`;
  }

  private _generateItem(selector: SelectorSchema, errors?: ErrorDescription[]) {
    switch (selector.type) {
      case "group_address":
        return html`
          <knx-group-address-selector
            .hass=${this.hass}
            .knx=${this.knx}
            .key=${selector.name}
            .label=${selector.label}
            .config=${this.config!.knx[selector.name] ?? {}}
            .options=${selector.options}
            .validationErrors=${extractValidationErrors(errors, selector.name)}
            @value-changed=${this._updateConfig("knx")}
          ></knx-group-address-selector>
        `;
      case "selector":
        return html`
          <knx-selector-row
            .hass=${this.hass}
            .key=${selector.name}
            .selector=${selector}
            .value=${this.config!.knx[selector.name]}
            @value-changed=${this._updateConfig("knx")}
          ></knx-selector-row>
        `;
      case "sync_state":
        return html`
          <knx-sync-state-selector-row
            .hass=${this.hass}
            .key=${selector.name}
            .value=${this.config!.knx[selector.name] ?? true}
            .noneValid=${false}
            @value-changed=${this._updateConfig("knx")}
          ></knx-sync-state-selector-row>
        `;
      case "group_select":
        return this._generateGroupSelect(selector, errors);
      default:
        logger.error("Unknown selector type", selector);
        return nothing;
    }
  }

  private _generateGroupSelect(selector: GroupSelect, errors?: ErrorDescription[]) {
    const value: string =
      this.config!.knx[selector.name] ??
      // set default if nothing is set yet
      (this.config!.knx[selector.name] = selector.options[0].value);
    const option = selector.options.find((item) => item.value === value);
    if (option === undefined) {
      logger.error("No option found for value", value);
    }
    return html` <ha-control-select
        .options=${selector.options}
        .value=${value}
        .key=${selector.name}
        @value-changed=${this._updateConfig("knx")}
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

  private _updateConfig(baseKey: string) {
    return (ev) => {
      ev.stopPropagation();
      if (!this.config[baseKey]) {
        this.config[baseKey] = {};
      }
      if (ev.detail.value === undefined) {
        logger.debug(`remove ${baseKey} key "${ev.target.key}"`);
        delete this.config[baseKey][ev.target.key];
      } else {
        logger.debug(`update ${baseKey} key "${ev.target.key}" with "${ev.detail.value}"`);
        this.config[baseKey][ev.target.key] = ev.detail.value;
      }
      fireEvent(this, "knx-entity-configuration-changed", this.config);
      this.requestUpdate();
    };
  }

  static styles = css`
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

    ha-expansion-panel {
      margin-bottom: 16px;
    }
    ha-expansion-panel > :first-child:not(ha-settings-row) {
      margin-top: 16px; /* ha-settings-row has this margin internally */
    }
    ha-expansion-panel > ha-settings-row:first-child,
    ha-expansion-panel > knx-selector-row:first-child {
      border: 0;
    }
    ha-expansion-panel > * {
      margin-left: 8px;
      margin-right: 8px;
    }

    ha-settings-row {
      margin-bottom: 8px;
      padding: 0;
    }
    ha-control-select {
      padding: 0;
      margin-left: 0;
      margin-right: 0;
      margin-bottom: 16px;
    }

    .group-description {
      align-items: center;
      margin-top: -8px;
      padding-left: 8px;
      padding-bottom: 8px;
    }

    .group-selection {
      padding-left: 8px;
      padding-right: 8px;
      & ha-settings-row:first-child {
        border-top: 0;
      }
    }

    knx-group-address-selector,
    ha-selector,
    ha-selector-text,
    ha-selector-select,
    knx-sync-state-selector-row,
    knx-device-picker {
      display: block;
      margin-bottom: 16px;
    }

    ha-alert {
      display: block;
      margin: 20px auto;
      max-width: 720px;

      & summary {
        padding: 10px;
      }
    }
  `;
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
