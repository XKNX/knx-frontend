import { mdiDelete, mdiPlus } from "@mdi/js";
import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";

import "@ha/components/ha-button";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-selector/ha-selector";
import "@ha/components/ha-svg-icon";
import "@ha/components/input/ha-input";

import { fireEvent } from "@ha/common/dom/fire_event";
import { clamp } from "@ha/common/number/clamp";
import type { HaInput } from "@ha/components/input/ha-input";
import type { NumberSelector } from "@ha/data/selector";
import type { HomeAssistant } from "@ha/types";

import "./knx-payload-selector";
import type { PayloadConfigValue } from "./knx-payload-selector";
import { extractValidationErrors, getValidationError } from "../utils/validation";
import type { ErrorDescription } from "../types/entity_data";
import type { KNX } from "../types/knx";

export interface SelectOption extends PayloadConfigValue {
  option: string;
}

// maximum KNX payload length in bytes
const MAX_PAYLOAD_LENGTH = 14;

@customElement("knx-select-options-list")
export class KnxSelectOptionsList extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property() public key!: string;

  // Relative path to the linked group address, used by the payload selectors.
  @property({ attribute: false }) public gaKey?: string;

  @property({ attribute: false }) public dpt?: string;

  @property({ type: Boolean }) public required?: boolean;

  @property({ attribute: false }) public value?: SelectOption[];

  @property({ attribute: false }) public validationErrors?: ErrorDescription[];

  @property({ attribute: false }) public localizeFunction: (key: string) => string = (
    key: string,
  ) => key;

  // DPT of the linked group address, tracked live so options added after the DPT
  // was selected still see it (they miss the initial knx-dpt-selector-changed event).
  @state() private _linkedDpt?: string;

  // One shared raw payload length for all options (they all target the same address).
  @state() private _payloadLength = 1;

  private _lengthInitialized = false;

  protected willUpdate(changedProperties: PropertyValues): void {
    if (!this._lengthInitialized && changedProperties.has("value") && this.value?.length) {
      const withLength = this.value.find((o) => typeof o.payload_length === "number");
      if (withLength?.payload_length !== undefined) {
        this._payloadLength = withLength.payload_length;
      }
      this._lengthInitialized = true;
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(
      "knx-dpt-selector-changed",
      this._handleGroupAddressChanged as EventListener,
    );
  }

  disconnectedCallback(): void {
    window.removeEventListener(
      "knx-dpt-selector-changed",
      this._handleGroupAddressChanged as EventListener,
    );
    super.disconnectedCallback();
  }

  private _handleGroupAddressChanged = (ev: CustomEvent<{ key: string; dpt?: string }>) => {
    if (!this.gaKey || ev.detail.key !== this.gaKey) {
      return;
    }
    this._linkedDpt = ev.detail.dpt;
  };

  private get _effectiveDpt(): string | undefined {
    return this.dpt ?? this._linkedDpt;
  }

  // Always show at least one (empty) option row, like the expose editor.
  private get _displayOptions(): SelectOption[] {
    return this.value?.length ? this.value : [{ option: "" }];
  }

  // A required list keeps its last option; an optional one can be cleared
  // completely. The placeholder row shown for an empty list has nothing to delete.
  private get _canDeleteOption(): boolean {
    return this._displayOptions.length > 1 || (!this.required && !!this.value?.length);
  }

  protected render(): TemplateResult {
    const invalid = getValidationError(this.validationErrors);
    const options = this._displayOptions;

    return html`
      <div class="text">
        <p class="heading ${classMap({ invalid: !!invalid })}">
          ${this.localizeFunction(this.key + ".label")}
        </p>
        <p class="description">${this.localizeFunction(this.key + ".description")}</p>
      </div>
      ${
        this._effectiveDpt
          ? nothing
          : html`<ha-selector
              class="payload-length"
              .hass=${this.hass}
              .selector=${
                {
                  number: { mode: "box", min: 0, max: MAX_PAYLOAD_LENGTH, step: 1 },
                } as NumberSelector
              }
              .label=${this._localizePayload("raw_length")}
              .helper=${this._localizePayload("raw_length_description")}
              .value=${this._payloadLength}
              @value-changed=${this._payloadLengthChanged}
            ></ha-selector>`
      }
      <div class="options">
        ${options.map((option, index) => this._renderOption(option, index, this._canDeleteOption))}
      </div>
      <ha-button appearance="filled" size="small" @click=${this._addOption}>
        <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
        ${this._localize("add_option")}
      </ha-button>
      ${invalid ? html`<p class="invalid-message">${invalid.message}</p>` : nothing}
    `;
  }

  // Name and payload are always required - an option row that exists has to be
  // complete, no matter whether the list itself is required.
  private _renderOption(option: SelectOption, index: number, canDelete: boolean): TemplateResult {
    const { option: name, ...payload } = option;
    const { name: nameError, payload: payloadErrors } = this._optionValidationErrors(index);
    return html`<div class="option">
      <div class="option-header">
        <ha-input
          class="option-name"
          .value=${name ?? ""}
          .label=${this._localize("option")}
          .type=${"text"}
          .required=${true}
          .invalid=${!!nameError}
          .validationMessage=${nameError?.message}
          data-index=${index}
          @input=${this._optionNameChanged}
          @change=${this._optionNameChanged}
        ></ha-input>
        <ha-icon-button
          class="remove"
          .path=${mdiDelete}
          .label=${this.hass.localize("ui.common.remove")}
          .disabled=${!canDelete}
          data-index=${index}
          @click=${this._removeOption}
        ></ha-icon-button>
      </div>
      <knx-payload-selector
        .hass=${this.hass}
        .knx=${this.knx}
        .key=${`${this.key}_${index}`}
        .gaKey=${this.gaKey}
        .dpt=${this._effectiveDpt}
        .rawLength=${this._effectiveDpt ? undefined : this._payloadLength}
        .required=${true}
        .value=${payload as PayloadConfigValue}
        .validationErrors=${payloadErrors}
        .localizeFunction=${this._emptyLocalize}
        data-index=${index}
        @value-changed=${this._payloadChanged}
      ></knx-payload-selector>
    </div>`;
  }

  /** Backend errors for one option, split into the name error and the payload subtree.
   *
   * Options are validated as a list, so their errors are indexed by position.
   * The name is validated alongside the payload keys, both below that index.
   */
  private _optionValidationErrors(index: number): {
    name?: ErrorDescription;
    payload?: ErrorDescription[];
  } {
    const errors = extractValidationErrors(this.validationErrors, String(index));
    const payload = errors?.filter((error) => error.path?.[0] !== "option");
    return {
      name: getValidationError(errors, "option"),
      payload: payload?.length ? payload : undefined,
    };
  }

  private _emptyLocalize = (_key: string): string => "";

  private _localizePayload = (key: string): string =>
    this.hass.localize(`component.knx.config_panel.selectors.knx-payload-selector.${key}`);

  private _payloadLengthChanged(ev: CustomEvent<{ value: number }>): void {
    ev.stopPropagation();
    const length = Math.floor(Number(ev.detail.value));
    this._payloadLength = Number.isFinite(length) ? clamp(length, 0, MAX_PAYLOAD_LENGTH) : 1;
    // apply the shared length to every raw option
    const options = (this.value ?? []).map((o) =>
      o.payload !== undefined ? { ...o, payload_length: this._payloadLength } : o,
    );
    if (options.length) {
      this._emit(options);
    }
  }

  private _optionNameChanged(ev: Event): void {
    const index = this._indexOf(ev);
    this._updateOption(index, { option: (ev.target as HaInput).value ?? "" });
  }

  private _payloadChanged(ev: CustomEvent<{ value: PayloadConfigValue | undefined }>): void {
    ev.stopPropagation();
    const index = this._indexOf(ev);
    const options = [...this._displayOptions];
    const current = options[index];
    if (!current) return;
    options[index] = { option: current.option, ...(ev.detail.value ?? {}) };
    this._emit(options);
  }

  private _addOption(): void {
    this._emit([...this._displayOptions, { option: "" }]);
  }

  private _removeOption(ev: Event): void {
    const index = this._indexOf(ev);
    const options = [...this._displayOptions];
    options.splice(index, 1);
    this._emit(options);
  }

  private _updateOption(index: number, patch: Partial<SelectOption>): void {
    const options = [...this._displayOptions];
    if (!options[index]) return;
    options[index] = { ...options[index], ...patch };
    this._emit(options);
  }

  private _emit(options: SelectOption[]): void {
    fireEvent(this, "value-changed", { value: options.length ? options : undefined });
  }

  private _indexOf(ev: Event): number {
    return Number((ev.currentTarget as HTMLElement).dataset.index);
  }

  private _localize = (key: string): string =>
    this.hass.localize(`component.knx.config_panel.selectors.knx-select-options-selector.${key}`);

  static styles = css`
    :host {
      display: block;
      padding: 8px 16px 8px 0;
      border-top: 1px solid var(--divider-color);
    }

    .text {
      margin-bottom: 8px;
    }

    .heading {
      margin: 0;
    }

    .description {
      margin: 0;
      padding-top: 4px;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }

    .payload-length {
      display: block;
      max-width: 220px;
      margin-bottom: 12px;
    }

    .options {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 12px;
    }

    .option {
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      padding: 8px 12px;
    }

    .option-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .option-name {
      flex: 1;
    }

    knx-payload-selector {
      border-top: 0;
      padding-bottom: 0;
    }

    .invalid {
      color: var(--error-color);
    }

    .invalid-message {
      font-size: 0.75rem;
      color: var(--error-color);
      padding-left: 16px;
      margin: 6px 0 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-select-options-list": KnxSelectOptionsList;
  }
}
