import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";

import "@ha/components/ha-card";
import "@ha/components/ha-control-select";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-selector/ha-selector";
import "@ha/components/ha-settings-row";

import { mainWindow } from "@ha/common/dom/get_main_window";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant, ValueChangedEvent } from "@ha/types";
import type { ControlSelectOption } from "@ha/components/ha-control-select";

import "./knx-group-address-selector";
import "./knx-selector-row";
import "./knx-sync-state-selector-row";
import { renderConfigureEntityCard } from "./knx-configure-entity-options";
import { KNXLogger } from "../tools/knx-logger";
import { extractValidationErrors } from "../utils/validation";
import type { EntityData, ErrorDescription } from "../types/entity_data";
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

  @state() private _selectedGroupSelectOptions: Record<string, number> = {};

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
      const url_suggestions = Object.fromEntries(urlParams.entries());
      for (const [path, value] of Object.entries(url_suggestions)) {
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
    if (value === undefined) {
      logger.debug(`remove ${keysTail} at ${path}`);
      delete current[keysTail];
    } else {
      logger.debug(`update ${keysTail} at ${path} with value`, value);
      current[keysTail] = value;
    }
  }

  private _getNestedValue(path: string) {
    const keys = path.split(".");
    const keysTail = keys.pop();
    if (!keysTail) return undefined;
    let current = this.config!;
    for (const key of keys) {
      if (!(key in current)) {
        return undefined;
      }
      current = current[key];
    }
    return current[keysTail];
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
        this._updateConfig,
        extractValidationErrors(errors, "entity"),
      )}
    `;
  }

  generateRootGroups(schema: SettingsGroup[], errors?: ErrorDescription[]) {
    return html`
      ${schema.map((group: SettingsGroup) => this._generateSettingsGroup(group, "knx", errors))}
    `;
  }

  private _generateSettingsGroup(group: SettingsGroup, path: string, errors?: ErrorDescription[]) {
    return html` <ha-expansion-panel
      .header=${group.heading}
      .secondary=${group.description}
      .expanded=${!group.collapsible || this._groupHasGroupAddressInConfig(group, path)}
      .noCollapse=${!group.collapsible}
      .outlined=${!!group.collapsible}
      >${this._generateItems(group.selectors, path, errors)}
    </ha-expansion-panel>`;
  }

  private _groupHasGroupAddressInConfig(group: SettingsGroup, path: string) {
    if (this.config === undefined) {
      return false;
    }
    return group.selectors.some((selector) => {
      if (selector.type === "group_address") return this._hasGroupAddressInConfig(selector, path);
      if (selector.type === "group_select")
        return selector.options.some((options) =>
          options.schema.some((schema) => {
            if (schema.type === "settings_group")
              return this._groupHasGroupAddressInConfig(schema, path);
            if (schema.type === "group_address") return this._hasGroupAddressInConfig(schema, path);
            return false;
          }),
        );
      return false;
    });
  }

  private _hasGroupAddressInConfig(ga_selector: GASchema, path: string) {
    const gaData = this._getNestedValue(path + "." + ga_selector.name);
    if (!gaData) return false;
    if (gaData.write !== undefined) return true;
    if (gaData.state !== undefined) return true;
    if (gaData.passive?.length) return true;

    return false;
  }

  private _generateItems(selectors: SelectorSchema[], path: string, errors?: ErrorDescription[]) {
    return html`${selectors.map((selector: SelectorSchema) =>
      this._generateItem(selector, path, errors),
    )}`;
  }

  private _generateItem(selector: SelectorSchema, path: string, errors?: ErrorDescription[]) {
    const selectorPath = path + "." + selector.name;
    switch (selector.type) {
      case "group_address":
        return html`
          <knx-group-address-selector
            .hass=${this.hass}
            .knx=${this.knx}
            .key=${selectorPath}
            .label=${selector.label}
            .config=${this._getNestedValue(selectorPath) ?? {}}
            .options=${selector.options}
            .validationErrors=${extractValidationErrors(errors, selector.name)}
            @value-changed=${this._updateConfig}
          ></knx-group-address-selector>
        `;
      case "selector":
        return html`
          <knx-selector-row
            .hass=${this.hass}
            .key=${selectorPath}
            .selector=${selector}
            .value=${this._getNestedValue(selectorPath)}
            @value-changed=${this._updateConfig}
          ></knx-selector-row>
        `;
      case "sync_state":
        return html`
          <knx-sync-state-selector-row
            .hass=${this.hass}
            .key=${selectorPath}
            .value=${this._getNestedValue(selectorPath) ?? true}
            .noneValid=${false}
            @value-changed=${this._updateConfig}
          ></knx-sync-state-selector-row>
        `;
      case "group_select":
        return this._generateGroupSelect(selector, path, errors);
      default:
        logger.error("Unknown selector type", selector);
        return nothing;
    }
  }

  private _getRequiredKeys(options: (SettingsGroup | SelectorSchema)[]): string[] {
    const requiredOptions: string[] = [];
    options.forEach((option) => {
      if (option.type === "settings_group") {
        // settings_group is transparent (flattend)
        requiredOptions.push(...this._getRequiredKeys(option.selectors));
        return;
      }
      if (option.type === "group_address") {
        if (option.options.write?.required || option.options.state?.required) {
          requiredOptions.push(option.name);
        }
        return;
      }
      if (option.type === "selector" && !option.optional) {
        requiredOptions.push(option.name);
      }
      // optional "selector", nested "group_select" and "sync_state" are ignored
    });
    return requiredOptions;
  }

  private _getOptionIndex(selector: GroupSelect, groupPath: string): number {
    // check if sub-schema is in this.config
    const keys = groupPath.split(".");
    let configFragment = this.config!;
    for (const key of keys) {
      if (!(key in configFragment)) {
        return 0; // default to first option if key is not in config
      }
      configFragment = configFragment[key];
    }
    // get non-optional subkeys for each groupSelect schema by index
    // get index of first option that has all keys in config
    const optionIndex = selector.options.findIndex((option) =>
      this._getRequiredKeys(option.schema).every((key) => key in configFragment[selector.name]),
    );
    if (optionIndex === -1) {
      logger.debug("No valid option found for group select", groupPath, configFragment);
      return 0; // Fallback to the first option if no match is found
    }
    return optionIndex;
  }

  private _generateGroupSelect(selector: GroupSelect, path: string, errors?: ErrorDescription[]) {
    const groupPath = path + "." + selector.name;
    const optionIndex =
      this._selectedGroupSelectOptions[groupPath] ?? this._getOptionIndex(selector, groupPath);
    const option = selector.options[optionIndex];
    if (option === undefined) {
      logger.error("No option for index", optionIndex, selector.options);
    }

    const controlSelectOptions: ControlSelectOption[] = selector.options.map((item, index) => ({
      value: index.toString(), // maybe use item.label here too
      label: item.label,
    }));

    return html` <ha-control-select
        .options=${controlSelectOptions}
        .value=${optionIndex.toString()}
        .key=${groupPath}
        @value-changed=${this._updateGroupSelectOption}
      ></ha-control-select>
      ${option
        ? html` <p class="group-description">${option.description}</p>
            <div class="group-selection">
              ${option.schema.map((item: SettingsGroup | SelectorSchema) => {
                switch (item.type) {
                  case "settings_group":
                    return this._generateSettingsGroup(item, groupPath, errors);
                  default:
                    return this._generateItem(item, groupPath, errors);
                }
              })}
            </div>`
        : nothing}`;
  }

  private _updateGroupSelectOption(ev: ValueChangedEvent<any>) {
    ev.stopPropagation();
    const key = ev.target.key;
    const selectedIndex = parseInt(ev.detail.value, 10);
    // clear data of key when changing option
    this._setNestedValue(key, {});
    // keep index in state
    // TODO: Optional: while editing, keep data (in FE) of non-active option in config to be able to peek other options and go back
    this._selectedGroupSelectOptions[key] = selectedIndex;
    fireEvent(this, "knx-entity-configuration-changed", this.config);
    this.requestUpdate();
  }

  private _updateConfig(ev: ValueChangedEvent<any>) {
    ev.stopPropagation();
    const key = ev.target.key;
    const value = ev.detail.value;
    this._setNestedValue(key, value);
    fireEvent(this, "knx-entity-configuration-changed", this.config);
    this.requestUpdate();
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
