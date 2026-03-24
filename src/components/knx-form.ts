import { LitElement, css, html, nothing } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";
import { keyed } from "lit/directives/keyed";

import "@ha/components/ha-alert";
import "@ha/components/ha-control-select";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-selector/ha-selector";

import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant, ValueChangedEvent } from "@ha/types";
import type { ControlSelectOption } from "@ha/components/ha-control-select";

import "./knx-group-address-selector";
import "./knx-selector-row";
import "./knx-sync-state-selector-row";

import { extractValidationErrors, getValidationError } from "../utils/validation";
import { KNXLogger } from "../tools/knx-logger";
import type { KNX } from "../types/knx";
import type { ErrorDescription } from "../types/entity_data";
import type {
  Section,
  SelectorSchema,
  SectionFlat,
  GroupSelect,
  GASelector,
} from "../types/schema";
import { getNestedValue, setNestedValue } from "../utils/config-helper";

const logger = new KNXLogger("knx-form");

const ROOT_PATH = null;

const pathAdd = (basePath: string | typeof ROOT_PATH, path: string) => {
  if (basePath === ROOT_PATH) return path;
  return `${basePath}.${path}`;
};

@customElement("knx-form")
export class KnxForm extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ attribute: false }) public config!: Record<string, unknown>;

  @property({ attribute: false }) public schema!: SelectorSchema[];

  @property({ attribute: false }) public validationErrors?: ErrorDescription[];

  @property({ attribute: false }) public backendLocalize!: (key: string) => string;

  @state() private _selectedGroupSelectOptions: Record<string, number> = {};

  private _groupSelectOptionCache: Record<string, Record<number, unknown>> = {};

  protected render() {
    const baseError = getValidationError(this.validationErrors);

    return html`
      ${baseError
        ? html`<ha-alert .alertType=${"error"} .title=${baseError.error_message}></ha-alert>`
        : nothing}
      ${this._generateItems(this.schema, ROOT_PATH, this.validationErrors)}
    `;
  }

  private _generateItems(
    schema: SelectorSchema[],
    path: string | typeof ROOT_PATH,
    errors?: ErrorDescription[],
  ) {
    // wrap items into a `knx_section_flat` or forward to _generateItem - schema is flat, not nested

    const result: TemplateResult[] = [];
    let flatSection: SectionFlat | undefined;
    let flatSectionSelectors: Exclude<SelectorSchema, SectionFlat>[] = [];

    const writeFlatSection = () => {
      if (flatSectionSelectors.length === 0 || flatSection === undefined) return; // no content to write
      const flatSectionPath = pathAdd(path, flatSection.name);
      const expanded =
        !flatSection.collapsible ||
        flatSectionSelectors.some((selector) => {
          if (selector.type === "knx_group_address") {
            return this._hasGroupAddressInConfig(selector, path);
          }
          return false;
        });
      result.push(
        html`<ha-expansion-panel
          .header=${this.backendLocalize(`${flatSectionPath}.title`)}
          .secondary=${this.backendLocalize(`${flatSectionPath}.description`)}
          .expanded=${expanded}
          .noCollapse=${!flatSection.collapsible}
          .outlined=${!!flatSection.collapsible}
        >
          ${flatSectionSelectors.map((selector) => this._generateItem(selector, path, errors))}
        </ha-expansion-panel> `,
      );
      flatSectionSelectors = [];
    };

    for (const selector of schema) {
      if (selector.type === "knx_section_flat") {
        // write previous flat-section content if exists
        writeFlatSection();
        flatSection = selector;
        continue;
      } else if (["knx_section", "knx_group_select", "knx_sync_state"].includes(selector.type)) {
        // write previous content before new nested section
        writeFlatSection();
        flatSection = undefined;
      }

      if (flatSection === undefined) {
        // no flat-section for this item, so render it directly
        result.push(this._generateItem(selector, path, errors) as TemplateResult);
      } else {
        flatSectionSelectors.push(selector);
      }
    }
    // render last flat-section content if exists
    writeFlatSection();

    return result;
  }

  private _groupHasGroupAddressInConfig(group: Section | GroupSelect, path: string) {
    if (this.config === undefined) {
      return false;
    }
    if (group.type === "knx_group_select") {
      // check if group select base path is in config
      return !!getNestedValue(this.config!, path);
    }
    return group.schema.some((selector) => {
      if (selector.type === "knx_group_address") {
        return this._hasGroupAddressInConfig(selector, path);
      }
      if (selector.type === "knx_section" || selector.type === "knx_group_select") {
        // nested section or group select
        const groupPath = pathAdd(path, selector.name);
        return this._groupHasGroupAddressInConfig(selector, groupPath);
      }
      return false;
    });
  }

  private _hasGroupAddressInConfig(ga_selector: GASelector, path: string | typeof ROOT_PATH) {
    const gaData = getNestedValue(this.config, pathAdd(path, ga_selector.name));
    if (!gaData) return false;
    if (gaData.write !== undefined) return true;
    if (gaData.state !== undefined) return true;
    if (gaData.passive?.length) return true;
    return false;
  }

  private _generateItem(
    selector: Exclude<SelectorSchema, SectionFlat>,
    path: string | typeof ROOT_PATH,
    errors?: ErrorDescription[],
  ) {
    const selectorPath = pathAdd(path, selector.name);
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
            .required=${selector.required}
            .label=${this.backendLocalize(`${selectorPath}.label`)}
            .config=${getNestedValue(this.config!, selectorPath) ?? {}}
            .options=${selector.options}
            .validationErrors=${selectorErrors}
            .localizeFunction=${this.backendLocalize}
            @value-changed=${this._updateConfig}
          ></knx-group-address-selector>
        `;
      case "knx_sync_state":
        return html`
          <ha-expansion-panel
            .header=${this.backendLocalize(`${selectorPath}.title`)}
            .secondary=${this.backendLocalize(`${selectorPath}.description`)}
            .outlined=${true}
          >
            <knx-sync-state-selector-row
              .hass=${this.hass}
              .key=${selectorPath}
              .value=${getNestedValue(this.config!, selectorPath) ?? true}
              .allowFalse=${selector.allow_false}
              .localizeFunction=${this.backendLocalize}
              @value-changed=${this._updateConfig}
            ></knx-sync-state-selector-row>
          </ha-expansion-panel>
        `;
      case "ha_selector":
        return html`
          <knx-selector-row
            .hass=${this.hass}
            .key=${selectorPath}
            .selector=${selector}
            .value=${getNestedValue(this.config!, selectorPath)}
            .validationErrors=${selectorErrors}
            .localizeFunction=${this.backendLocalize}
            @value-changed=${this._updateConfig}
          ></knx-selector-row>
        `;
      default:
        logger.error("Unknown selector type", selector);
        return nothing;
    }
  }

  private _generateSection(section: Section, path: string, errors?: ErrorDescription[]) {
    const sectionBaseError = getValidationError(errors);
    return html` <ha-expansion-panel
      .header=${this.backendLocalize(`${path}.title`)}
      .secondary=${this.backendLocalize(`${path}.description`)}
      .expanded=${!section.collapsible || this._groupHasGroupAddressInConfig(section, path)}
      .noCollapse=${!section.collapsible}
      .outlined=${!!section.collapsible}
    >
      ${sectionBaseError
        ? html` <ha-alert .alertType=${"error"} .title=${"Validation error"}>
            ${sectionBaseError.error_message}
          </ha-alert>`
        : nothing}
      ${this._generateItems(section.schema, path, errors)}
    </ha-expansion-panel>`;
  }

  private _generateGroupSelect(selector: GroupSelect, path: string, errors?: ErrorDescription[]) {
    const sectionBaseError = getValidationError(errors);

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
      label:
        this.backendLocalize(`${path}.options.${option.translation_key}.label`) +
        (index !== optionIndex && this._groupSelectOptionCache[path]?.[index] !== undefined
          ? " 💭"
          : ""),
    }));

    return html` <ha-expansion-panel
      .header=${this.backendLocalize(`${path}.title`)}
      .secondary=${this.backendLocalize(`${path}.description`)}
      .expanded=${!selector.collapsible ||
      // don't collapse if selection was cleared by user and option changed
      // cache is `{}` then which is truthy
      !!this._groupSelectOptionCache[path] ||
      this._groupHasGroupAddressInConfig(selector, path)}
      .noCollapse=${!selector.collapsible}
      outlined
    >
      ${sectionBaseError
        ? html` <ha-alert .alertType=${"error"} .title=${"Validation error"}>
            ${sectionBaseError.error_message}
          </ha-alert>`
        : nothing}
      <ha-control-select
        .options=${controlSelectOptions}
        .value=${optionIndex.toString()}
        .key=${path}
        @value-changed=${this._updateGroupSelectOption}
      ></ha-control-select>
      ${currentOption
        ? html` <p class="group-description">
              ${this.backendLocalize(
                `${path}.options.${currentOption.translation_key}.description`,
              )}
            </p>
            <div class="group-selection">
              ${keyed(
                // force recreation when selection changes to ensure proper
                // defaults for sub-elements internal states
                optionIndex,
                this._generateItems(currentOption.schema, path, errors),
              )}
            </div>`
        : nothing}
    </ha-expansion-panel>`;
  }

  private _getRequiredKeys(options: SelectorSchema[]): string[] {
    const requiredOptions: string[] = [];
    options.forEach((option) => {
      if (option.type === "knx_section") {
        requiredOptions.push(...this._getRequiredKeys(option.schema));
        return;
      }
      if (option.type === "knx_group_address" && !!option.required) {
        requiredOptions.push(option.name);
        return;
      }
      if (option.type === "ha_selector" && !!option.required) {
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
    const previousIndex = this._selectedGroupSelectOptions[key];

    // Cache current option config so it can be restored later to be able to peek into other options
    if (previousIndex !== undefined) {
      this._cacheOptionConfig(key, previousIndex);
    }

    this._selectedGroupSelectOptions[key] = selectedIndex;
    const cachedConfig = this._groupSelectOptionCache[key]?.[selectedIndex];
    setNestedValue(
      this.config!,
      key,
      cachedConfig === undefined ? undefined : structuredClone(cachedConfig),
      logger,
    );

    fireEvent(this, "knx-form-config-changed", { value: this.config });
    this.requestUpdate();
  }

  private _cacheOptionConfig(path: string, optionIndex: number) {
    const currentValue = getNestedValue(this.config!, path);
    if (!this._groupSelectOptionCache[path]) {
      this._groupSelectOptionCache[path] = {};
    }
    if (currentValue === undefined) {
      delete this._groupSelectOptionCache[path][optionIndex];
      return;
    }
    this._groupSelectOptionCache[path][optionIndex] = structuredClone(currentValue);
  }

  private _updateConfig(ev: ValueChangedEvent<any>) {
    ev.stopPropagation();
    const key = ev.target.key;
    const value = ev.detail.value;
    setNestedValue(this.config!, key, value, logger);
    fireEvent(this, "knx-form-config-changed", { value: this.config });
    this.requestUpdate();
  }

  static styles = css`
    p {
      color: var(--secondary-text-color);
    }

    ::slotted(ha-alert) {
      margin-top: 0 !important;
    }

    ha-expansion-panel {
      margin-bottom: 16px;

      > :first-child {
        /* between header and collapsible container */
        margin-top: 16px;
      }
    }
    ha-expansion-panel > knx-selector-row:first-child {
      border: 0;
    }
    ha-expansion-panel > * {
      margin-left: 8px;
      margin-right: 8px;
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
    "knx-form": KnxForm;
  }
}

declare global {
  // for fire event
  interface HASSDomEvents {
    "knx-form-config-changed": { value: Record<string, unknown> };
  }
}
