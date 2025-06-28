import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";

import "@ha/components/ha-alert";
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
import { setNestedValue, getNestedValue } from "../utils/config-helper";
import { extractValidationErrors, getValidationError } from "../utils/validation";
import type { EntityData, ErrorDescription, SupportedPlatform } from "../types/entity_data";
import type { KNX } from "../types/knx";
import { platformConstants } from "../utils/common";
import type { Section, SelectorSchema, GroupSelect, GASelector } from "../utils/schema";

const logger = new KNXLogger("knx-configure-entity");

@customElement("knx-configure-entity")
export class KNXConfigureEntity extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: String }) public platform!: SupportedPlatform;

  @property({ type: Object }) public config?: EntityData;

  @property({ type: Array }) public schema!: Section[];

  @property({ attribute: false }) public validationErrors?: ErrorDescription[];

  @state() private _selectedGroupSelectOptions: Record<string, number> = {};

  private _backendLocalize = (path: string) =>
    this.hass.localize(`component.knx.config_panel.entities.create.${this.platform}.${path}`) ||
    this.hass.localize(`component.knx.config_panel.entities.create._.${path}`);

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
        setNestedValue(this.config!, path, value, logger);
        fireEvent(this, "knx-entity-configuration-changed", this.config);
      }
    }
  }

  protected render(): TemplateResult {
    const errors = extractValidationErrors(this.validationErrors, "data"); // "data" is root key in our python schema
    const knxErrors = extractValidationErrors(errors, "knx");
    const knxBaseError = getValidationError(knxErrors);
    const platformInfo = platformConstants[this.platform];

    return html`
      <div class="header">
        <h1>
          <ha-svg-icon
            .path=${platformInfo.iconPath}
            style=${styleMap({ "background-color": platformInfo.color })}
          ></ha-svg-icon>
          ${this.hass.localize(`component.${this.platform}.title`) || this.platform}
        </h1>
        <p>${this._backendLocalize("description")}</p>
      </div>
      <slot name="knx-validation-error"></slot>
      <ha-card outlined>
        <h1 class="card-header">${this._backendLocalize("knx.title")}</h1>
        ${knxBaseError
          ? html`<ha-alert .alertType=${"error"} .title=${knxBaseError.error_message}></ha-alert>`
          : nothing}
        ${this.generateRootGroups(this.schema, knxErrors)}
      </ha-card>
      ${renderConfigureEntityCard(
        this.hass,
        this.config!.entity ?? {},
        this._updateConfig,
        extractValidationErrors(errors, "entity"),
        this._backendLocalize,
      )}
    `;
  }

  generateRootGroups(schema: Section[], errors?: ErrorDescription[]) {
    return html` ${schema.map((item: Section) => this._generateItem(item, "knx", errors))} `;
  }

  private _generateSection(section: Section, path: string, errors?: ErrorDescription[]) {
    const sectionBaseError = getValidationError(errors);
    return html` <ha-expansion-panel
      .header=${this._backendLocalize(`${path}.title`)}
      .secondary=${this._backendLocalize(`${path}.description`)}
      .expanded=${!section.collapsible || this._groupHasGroupAddressInConfig(section, path)}
      .noCollapse=${!section.collapsible}
      .outlined=${!!section.collapsible}
    >
      ${sectionBaseError
        ? html` <ha-alert .alertType=${"error"} .title=${"Validation error"}
            >${sectionBaseError.error_message}</ha-alert
          >`
        : nothing}
      ${this._generateSectionItems(section.schema, path, errors)}
    </ha-expansion-panel>`;
  }

  private _generateSectionItems(
    schema: SelectorSchema[],
    path: string,
    errors?: ErrorDescription[],
  ) {
    return html`${schema.map((selector: SelectorSchema) =>
      this._generateItem(selector, path, errors),
    )}`;
  }

  private _generateGroupSelect(selector: GroupSelect, path: string, errors?: ErrorDescription[]) {
    if (!(path in this._selectedGroupSelectOptions)) {
      // if not set, get index of first option that has all required keys in config
      // this is used to keep the selected option when editing
      this._selectedGroupSelectOptions[path] = this._getOptionIndex(selector, path);
    }
    const optionIndex = this._selectedGroupSelectOptions[path];

    const currentOption = selector.schema[optionIndex];
    if (currentOption === undefined) {
      logger.error("No option for index", optionIndex, selector.schema);
    }

    const controlSelectOptions: ControlSelectOption[] = selector.schema.map((option, index) => ({
      value: index.toString(),
      label: this._backendLocalize(`${path}.options.${option.translation_key}.label`),
    }));

    return html` <ha-expansion-panel
      .header=${this._backendLocalize(`${path}.title`)}
      .secondary=${this._backendLocalize(`${path}.description`)}
      .expanded=${!selector.collapsible || this._groupHasGroupAddressInConfig(selector, path)}
      .noCollapse=${!selector.collapsible}
      .outlined=${!!selector.collapsible}
    >
      <ha-control-select
        .options=${controlSelectOptions}
        .value=${optionIndex.toString()}
        .key=${path}
        @value-changed=${this._updateGroupSelectOption}
      ></ha-control-select>
      ${currentOption
        ? html` <p class="group-description">
              ${this._backendLocalize(
                `${path}.options.${currentOption.translation_key}.description`,
              )}
            </p>
            <div class="group-selection">
              ${currentOption.schema.map((item: Section | SelectorSchema) =>
                this._generateItem(item, path, errors),
              )}
            </div>`
        : nothing}
    </ha-expansion-panel>`;
  }

  private _generateItem(
    selector: Section | SelectorSchema,
    path: string,
    errors?: ErrorDescription[],
  ) {
    const selectorPath = path + "." + selector.name;
    const selectorErrors = extractValidationErrors(errors, selector.name);

    switch (selector.type) {
      case "knx_section":
        return this._generateSection(selector, selectorPath, selectorErrors);
      case "knx_group_select":
        return this._generateGroupSelect(selector, selectorPath, selectorErrors);
      case "knx_group_address":
        return html`
          <knx-group-address-selector
            .hass=${this.hass}
            .knx=${this.knx}
            .key=${selectorPath}
            .label=${this._backendLocalize(`${selectorPath}.label`)}
            .config=${getNestedValue(this.config!, selectorPath) ?? {}}
            .options=${selector.options}
            .validationErrors=${selectorErrors}
            .localizeFunction=${this._backendLocalize}
            @value-changed=${this._updateConfig}
          ></knx-group-address-selector>
        `;
      case "knx_sync_state":
        return html`
          <ha-expansion-panel
            .header=${this._backendLocalize(`${selectorPath}.title`)}
            .secondary=${this._backendLocalize(`${selectorPath}.description`)}
            .outlined=${true}
          >
            <knx-sync-state-selector-row
              .hass=${this.hass}
              .key=${selectorPath}
              .value=${getNestedValue(this.config!, selectorPath) ?? true}
              .allowFalse=${selector.allow_false}
              .localizeFunction=${this._backendLocalize}
              @value-changed=${this._updateConfig}
            ></knx-sync-state-selector-row
          ></ha-expansion-panel>
        `;
      case "ha_selector":
        return html`
          <knx-selector-row
            .hass=${this.hass}
            .key=${selectorPath}
            .selector=${selector}
            .value=${getNestedValue(this.config!, selectorPath)}
            .validationErrors=${selectorErrors}
            .localizeFunction=${this._backendLocalize}
            @value-changed=${this._updateConfig}
          ></knx-selector-row>
        `;
      default:
        logger.error("Unknown selector type", selector);
        return nothing;
    }
  }

  private _groupHasGroupAddressInConfig(group: Section | GroupSelect, path: string) {
    if (this.config === undefined) {
      return false;
    }
    return group.schema.some((selector) => {
      if (selector.type === "knx_group_address")
        return this._hasGroupAddressInConfig(selector, path);
      if (selector.type === "knx_section") {
        const groupPath = path + "." + selector.name;
        return this._groupHasGroupAddressInConfig(selector.schema, groupPath);
      }
      if (selector.type === "knx_group_select") {
        const groupPath = path + "." + selector.name;
        if (groupPath in this._selectedGroupSelectOptions) return true;
        return selector.schema.some((option) =>
          option.schema.some((schema) => {
            if (schema.type === "knx_section")
              return this._groupHasGroupAddressInConfig(schema, groupPath); // TODO: does this need to add section-name?
            if (schema.type === "knx_group_address")
              return this._hasGroupAddressInConfig(schema, groupPath);
            return false;
          }),
        );
      }
      return false;
    });
  }

  private _hasGroupAddressInConfig(ga_selector: GASelector, path: string) {
    const gaData = getNestedValue(this.config!, path + "." + ga_selector.name);
    if (!gaData) return false;
    if (gaData.write !== undefined) return true;
    if (gaData.state !== undefined) return true;
    if (gaData.passive?.length) return true;

    return false;
  }

  private _getRequiredKeys(options: (Section | SelectorSchema)[]): string[] {
    const requiredOptions: string[] = [];
    options.forEach((option) => {
      if (option.type === "knx_section") {
        // TODO: knx_section was transparent (flattend) - does this still work or do we need to traverse nested required keys in _getOptionIndex?
        requiredOptions.push(...this._getRequiredKeys(option.schema));
        return;
      }
      if (option.type === "knx_group_address") {
        if (option.options.write?.required || option.options.state?.required) {
          requiredOptions.push(option.name);
        }
        return;
      }
      if (option.type === "ha_selector" && !option.optional) {
        requiredOptions.push(option.name);
      }
      // optional "selector", nested "knx_group_select" and "knx_sync_state" are ignored
    });
    return requiredOptions;
  }

  private _getOptionIndex(selector: GroupSelect, groupPath: string): number {
    // check if sub-schema is in this.config
    const configFragment = getNestedValue(this.config!, groupPath);
    if (configFragment === undefined) {
      logger.debug("No config found for group select", groupPath);
      return 0; // Fallback to first option if key is not in config
    }
    // get non-optional subkeys for each groupSelect schema by index
    // get index of first option that has all keys in config
    const optionIndex = selector.schema.findIndex((option) => {
      const requiredKeys = this._getRequiredKeys(option.schema);
      if (requiredKeys.length === 0) {
        // no required keys, so this option would always be valid - warn to fix schema
        logger.warn("No required keys for GroupSelect option", groupPath, option);
        return false; // skip this option
      }
      return requiredKeys.every((key) => key in configFragment);
    });
    if (optionIndex === -1) {
      logger.debug("No valid option found for group select", groupPath, configFragment);
      return 0; // Fallback to the first option if no match is found
    }
    return optionIndex;
  }

  private _updateGroupSelectOption(ev: ValueChangedEvent<any>) {
    ev.stopPropagation();
    const key = ev.target.key;
    const selectedIndex = parseInt(ev.detail.value, 10);
    // clear data of key when changing option
    setNestedValue(this.config!, key, undefined, logger);
    // keep index in state
    // TODO: Optional: while editing, keep config data of non-active option in map (FE only)
    //       to be able to peek other options and go back without loosing config
    this._selectedGroupSelectOptions[key] = selectedIndex;
    fireEvent(this, "knx-entity-configuration-changed", this.config);
    this.requestUpdate();
  }

  private _updateConfig(ev: ValueChangedEvent<any>) {
    ev.stopPropagation();
    const key = ev.target.key;
    const value = ev.detail.value;
    setNestedValue(this.config!, key, value, logger);
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
