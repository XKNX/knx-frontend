import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";

import "@ha/components/ha-control-select";
import "@ha/components/ha-selector/ha-selector";
import "@ha/components/input/ha-input";

import { fireEvent } from "@ha/common/dom/fire_event";
import type { HaInput } from "@ha/components/input/ha-input";
import type { NumberSelector, SelectSelector, StringSelector } from "@ha/data/selector";
import type { HomeAssistant } from "@ha/types";
import type { ControlSelectOption } from "@ha/components/ha-control-select";

import { getValidationError } from "../utils/validation";
import { numberRangeHelper, snakeToTitleCase } from "../utils/format";
import type { ErrorDescription } from "../types/entity_data";
import type { KNX } from "../types/knx";
import type { DPTComplexFieldSchema, DPTMetadata } from "../types/websocket";
import { KNXLogger } from "../tools/knx-logger";
import "./knx-selector-row";
import type { KnxHaSelector } from "../types/schema";

const logger = new KNXLogger("knx-payload-selector");

interface PayloadConfigValue {
  value?: boolean | number | string | Record<string, unknown>;
  payload?: string;
  payload_length?: number;
}

@customElement("knx-payload-selector")
export class KnxPayloadSelector extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property() public key!: string;

  @property({ attribute: false }) public gaKey?: string;

  @property({ attribute: false }) public dpt?: string;

  @property({ type: Boolean }) public required?: boolean;

  @property({ type: Boolean, attribute: "disable-raw" }) public disableRaw?: boolean;

  @property({ attribute: false }) public value?: PayloadConfigValue;

  @property({ attribute: false }) public validationErrors?: ErrorDescription[];

  @property({ attribute: false }) public localizeFunction: (key: string) => string = (
    key: string,
  ) => key;

  @state() private _mode: "typed" | "raw" = "raw";

  @state() private _typedValue?: boolean | number | string | Record<string, unknown>;

  @state() private _rawPayload?: string;

  @state() private _rawLength = 1;

  @state() private _linkedDpt?: string;

  // Caches survive mode switches so values are restored when switching back.
  private _cachedTypedValue?: boolean | number | string | Record<string, unknown>;

  private _cachedRawPayload?: string;

  private _cachedRawLength = 1;

  private _initialized = false;

  connectedCallback(): void {
    super.connectedCallback();
    // Listen globally so payload selector reacts immediately to DPT changes,
    // even before a group-address config object exists (standalone/decoupled selectors).
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

  shouldUpdate(changedProperties: Map<string, any>) {
    // Omit rerender when only hass changed
    return !(changedProperties.has("hass") && changedProperties.size === 1);
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (!this._initialized && changedProperties.has("value")) {
      this._mode = this._inferMode();
      this._typedValue = this.value?.value;
      this._rawPayload = this.value?.payload;
      const rawLength = this.value?.payload_length ?? 1;
      this._rawLength = this._clampRawLength(rawLength);
      this._initialized = true;
    } else if (changedProperties.has("dpt") || changedProperties.has("_linkedDpt")) {
      this._mode = this._inferMode();
      const dpt = this._effectiveDpt();
      const dptMeta = dpt ? this.knx.dptMetadata[dpt] : undefined;
      if (dptMeta?.dpt_class === "numeric" && typeof this._typedValue === "number") {
        this._typedValue = Math.min(
          dptMeta.max ?? this._typedValue,
          Math.max(dptMeta.min ?? this._typedValue, this._typedValue),
        );
      } else if (
        dptMeta?.dpt_class === "enum" &&
        dptMeta.options &&
        !dptMeta.options.includes(this._typedValue as string)
      ) {
        // set initial value for enum selector
        this._typedValue = dptMeta.options[0];
      } else if (dptMeta?.dpt_class === "complex" && dptMeta.schema) {
        this._typedValue = {};
        // set initial values for enum fields in complex DPTs
        for (const field of dptMeta.schema) {
          if (field.type === "enum" && field.required && field.options) {
            this._typedValue[field.name] = field.options[0];
          }
        }
      } else {
        this._typedValue = undefined;
      }
      const dptPayloadLength = dptMeta ? dptMeta.payload_length : undefined;
      this._rawLength = dptPayloadLength ?? this._clampRawLength(this._rawLength);
      this._rawPayload = this._clampRawPayload(this._rawPayload);
      this._emitValue();
    }
  }

  protected render(): TemplateResult {
    const invalid = getValidationError(this.validationErrors);
    const dpt = this._effectiveDpt();
    const dptMeta = dpt ? this.knx.dptMetadata[dpt] : undefined;

    return html`
      <div class="body">
        <div class="text">
          <p class="heading ${classMap({ invalid: !!invalid })}">
            ${this.localizeFunction(this.key + ".label")}
          </p>
          <p class="description">${this.localizeFunction(this.key + ".description")}</p>
          ${dpt
            ? html`<p class="description dpt-line">DPT: ${dpt}</p>`
            : html`<p class="description dpt-line">${this._localizeSelector("dpt_missing")}</p>`}
        </div>
      </div>

      <ha-control-select
        .label=${this._localizeSelector("mode.label")}
        .options=${this._modeOptions}
        .value=${this._mode}
        .disabled=${!dpt}
        @value-changed=${this._modeChanged}
      ></ha-control-select>
      ${this._mode === "raw" ? this._renderRawMode() : this._renderTypedModeOrRawFallback(dptMeta)}
      ${invalid ? html`<p class="invalid-message">${invalid.error_message}</p>` : nothing}
    `;
  }

  private get _modeOptions(): ControlSelectOption[] {
    const options: ControlSelectOption[] = [
      {
        value: "typed",
        label: this._localizeSelector("mode.typed"),
      },
    ];
    if (!(this.disableRaw ?? false)) {
      options.push({
        value: "raw",
        label: this._localizeSelector("mode.raw"),
      });
    }
    return options;
  }

  private _renderTypedModeOrRawFallback(dptMeta?: DPTMetadata): TemplateResult | typeof nothing {
    try {
      return this._renderTypedMode(dptMeta);
    } catch (err) {
      logger.warn("Falling back to raw mode:", err);
      this._mode = "raw";
      this._cachedTypedValue = undefined; // clear typed value in case of error
      this._typedValue = undefined;
      this._setRawPayloadAndLengthFromCache();
      // triggers a re-render with raw mode so ne need to render anything here
      return nothing;
    }
  }

  private _renderTypedMode(dptMeta?: DPTMetadata): TemplateResult {
    const dpt = this._effectiveDpt();
    if (!dpt || !dptMeta) {
      throw new Error(`No DPT metadata available for ${dpt}`);
    }

    if (dptMeta.dpt_class === "numeric") {
      const numberSelector: NumberSelector = {
        number: {
          mode: "box",
          min: dptMeta.min,
          max: dptMeta.max,
          step: dptMeta.step,
          unit_of_measurement: dptMeta.unit ?? undefined,
        },
      };
      return html`<ha-selector
        .hass=${this.hass}
        .selector=${numberSelector}
        .helper=${numberRangeHelper(dptMeta.min, dptMeta.max)}
        .value=${typeof this._typedValue === "number" ? this._typedValue : undefined}
        @value-changed=${this._typedValueChanged}
      ></ha-selector>`;
    }

    if (dptMeta.dpt_class === "string") {
      const textSelector: StringSelector = { text: {} };
      return html`<ha-selector
        .hass=${this.hass}
        .selector=${textSelector}
        .value=${typeof this._typedValue === "string" ? this._typedValue : undefined}
        @value-changed=${this._typedValueChanged}
      ></ha-selector>`;
    }

    if (dptMeta.dpt_class === "complex") {
      if (!dptMeta.schema?.length) {
        throw new Error(`Typed mode not implemented for DPT ${dpt}`);
      }
      logger.debug(`Rendering complex fields for DPT ${dpt}:`, dptMeta.schema);
      return this._renderComplexFields(dptMeta.schema);
    }

    if (dptMeta.dpt_class === "enum") {
      // DPT 1.x are binary; all other enums use backend-provided options.
      const enumOptions: { value: string; label: string }[] =
        dptMeta.options?.map((optionValue) => ({
          value: optionValue,
          label: snakeToTitleCase(optionValue),
        })) ?? [];

      if (enumOptions.length === 0) {
        throw new Error(`No enum options available for DPT ${dpt}`);
      }

      const selectSelector: SelectSelector = {
        select: { options: enumOptions, mode: "dropdown" },
      };
      return html`<ha-selector
        .hass=${this.hass}
        .selector=${selectSelector}
        .value=${this._typedValue}
        @value-changed=${this._typedValueChanged}
      ></ha-selector>`;
    }

    throw new Error(`Typed mode not implemented for dpt_class ${dptMeta.dpt_class} of DPT ${dpt}`);
  }

  private _typedValueChanged(ev: CustomEvent<{ value: unknown }>) {
    ev.stopPropagation();
    const next = ev.detail.value;
    this._typedValue =
      typeof next === "number" || typeof next === "string" || typeof next === "boolean"
        ? next
        : undefined;
    this._emitValue();
  }

  private _knxHaSelector(
    field: DPTComplexFieldSchema,
    selector: KnxHaSelector["selector"],
  ): KnxHaSelector {
    return {
      type: "ha_selector",
      name: field.name,
      required: field.required,
      default: field.default,
      selector,
    };
  }

  private _fieldToKnxHaSelector(field: DPTComplexFieldSchema): KnxHaSelector {
    if (field.type === "integer" || field.type === "float") {
      return this._knxHaSelector(field, {
        number: {
          mode: "box",
          min: field.value_min,
          max: field.value_max,
          step: field.type === "float" ? 0.01 : 1,
        },
      });
    }
    if (field.type === "enum") {
      const options = (field.options ?? []).map((opt) => ({
        value: opt,
        label: snakeToTitleCase(opt),
      }));
      return this._knxHaSelector(field, { select: { options, mode: "dropdown" } });
    }
    if (field.type === "boolean") {
      return this._knxHaSelector(field, { boolean: {} });
    }
    if (field.type === "string") {
      return this._knxHaSelector(field, { text: {} });
    }
    throw new Error(`Unsupported complex field type: ${field.type}`);
  }

  private get _typedRecord(): Record<string, unknown> {
    return this._typedValue !== null && typeof this._typedValue === "object"
      ? (this._typedValue as Record<string, unknown>)
      : {};
  }

  private _renderComplexFields(schema: DPTComplexFieldSchema[]): TemplateResult {
    const currentValue = this._typedRecord;
    // For complex fields no validation errors can be provided as this isn't voluptuous-based
    return html`
      ${schema.map(
        (field) => html`
          <knx-selector-row
            .hass=${this.hass}
            .key=${field.name}
            .selector=${this._fieldToKnxHaSelector(field)}
            .value=${currentValue[field.name]}
            .localizeFunction=${this._complexFieldLocalizeFunction}
            @value-changed=${this._complexFieldChanged}
          ></knx-selector-row>
        `,
      )}
    `;
  }

  private _complexFieldLocalizeFunction = (key: string): string => {
    // use xknx field names as labels for selectors
    return key.endsWith(".label") ? snakeToTitleCase(key.slice(0, -6)) : "";
  };

  private _complexFieldChanged = (ev: CustomEvent<{ value: unknown }>) => {
    ev.stopPropagation();
    const fieldName = (ev.currentTarget as unknown as { key: string }).key;
    if (!fieldName) return;
    const current = this._typedRecord;
    if (ev.detail.value === undefined) {
      const updated = { ...current };
      delete updated[fieldName];
      this._typedValue = Object.keys(updated).length ? updated : undefined;
    } else {
      this._typedValue = { ...current, [fieldName]: ev.detail.value };
    }
    this._emitValue();
  };

  private _renderRawMode(): TemplateResult {
    const maxLength = this._rawMaxLength();
    const rawLengthSelector: NumberSelector = {
      number: { mode: "box", min: 0, max: maxLength, step: 1 },
    };
    const disableLength = this._effectiveDpt() !== undefined;

    return html`
      <div class="raw-grid">
        <ha-selector
          .hass=${this.hass}
          .selector=${rawLengthSelector}
          .label=${this._localizeSelector("raw_length")}
          .helper=${`${disableLength ? "" : numberRangeHelper(0, maxLength) + " "}${this._localizeSelector("raw_length_description")}`}
          .value=${this._rawLength}
          @value-changed=${this._rawLengthChanged}
          .disabled=${disableLength}
        ></ha-selector>
        ${this._renderRawPayloadValueHex()}
      </div>
    `;
  }

  private _renderRawPayloadValueHex(): TemplateResult {
    let payloadValue = this._rawPayload?.toLowerCase();
    // selector works without 0x prefix - value-changed adds it back
    payloadValue = payloadValue?.startsWith("0x") ? payloadValue.slice(2) : payloadValue;
    let rawInvalidMessage: string | undefined;
    if (this._rawPayload && !/^0x[0-9a-fA-F]*$/.test(this._rawPayload)) {
      rawInvalidMessage = "Invalid hex string";
    } else if (this._clampRawPayload(this._rawPayload) !== this._rawPayload) {
      rawInvalidMessage = "Value out of range for selected payload length";
    }
    return html`<ha-input
      .value=${payloadValue}
      .hint=${`${`0x0 \u2026 0x${this._rawPayloadMax().toString(16)}`} ${this._localizeSelector("raw_payload_description")}`}
      .type=${"text"}
      @input=${this._rawPayloadChanged}
      @change=${this._rawPayloadChanged}
      .label=${this._localizeSelector("raw_payload")}
      .required=${true}
      .maxlength=${(this._rawLength || 1) * 2}
      .invalid=${!!rawInvalidMessage}
      .validationMessage=${rawInvalidMessage}
    >
      <span slot="start">0x</span>
    </ha-input>`;
  }

  private _modeChanged(ev: CustomEvent<{ value: string }>) {
    ev.stopPropagation();
    const nextMode = ev.detail.value === "raw" && !(this.disableRaw ?? false) ? "raw" : "typed";
    if (nextMode === this._mode) return;

    if (nextMode === "raw") {
      this._cachedTypedValue = this._typedValue;
      this._typedValue = undefined;
      this._setRawPayloadAndLengthFromCache();
    } else {
      this._cachedRawPayload = this._rawPayload;
      this._cachedRawLength = this._rawLength;
      this._rawPayload = undefined;
      this._typedValue = this._cachedTypedValue;
    }
    this._mode = nextMode;
    this._emitValue();
  }

  private _setRawPayloadAndLengthFromCache(): void {
    this._rawPayload = this._cachedRawPayload;
    const dpt = this._effectiveDpt();
    const dptPayloadLength = dpt
      ? (this.knx.dptMetadata[dpt]?.payload_length ?? this._cachedRawLength)
      : this._cachedRawLength;
    this._rawLength = this._clampRawLength(dptPayloadLength);
  }

  private _rawPayloadChanged(ev: CustomEvent<{ value: string }>) {
    ev.stopPropagation();
    // add 0x prefix, trim whitespace, lower case for matching with clamp. Exact validation is done in backend.
    const payloadRaw = (ev.target as HaInput).value?.trim().toLowerCase();
    if (!payloadRaw) {
      this._rawPayload = undefined;
    } else {
      this._rawPayload = `0x${payloadRaw}`;
    }

    this._emitValue();
  }

  private _rawLengthChanged(ev: CustomEvent<{ value: number }>) {
    ev.stopPropagation();
    const length = Math.floor(Number(ev.detail.value));
    this._rawLength = this._clampRawLength(Number.isFinite(length) ? length : 0);
    this._rawPayload = this._clampRawPayload(this._rawPayload);
    this._emitValue();
  }

  private _rawMaxLength(): number {
    const dpt = this._effectiveDpt();
    if (!dpt) {
      return 14;
    }
    const main = Number.parseInt(dpt.split(".")[0], 10);
    if (main === 1 || main === 2 || main === 3) {
      // DPT 1.x, 2.x, and 3.x use payload_length 0 to indicate payload integrated in APDU header
      return 0;
    }
    return this.knx.dptMetadata[dpt]?.payload_length ?? 14;
  }

  private _clampRawLength(length: number): number {
    const max = this._rawMaxLength();
    return Math.min(max, Math.max(0, length));
  }

  private _rawPayloadMax(): bigint {
    const dpt = this._effectiveDpt();
    if (dpt) {
      const main = Number.parseInt(dpt.split(".")[0], 10);
      if (main === 1 || main === 2 || main === 3) {
        // DPT 1.x, 2.x, and 3.x use payload_length 0 to indicate payload integrated in APDU header
        const dptLength = this.knx.dptMetadata[dpt]?.payload_length;
        if (dptLength !== undefined) {
          return BigInt(dptLength);
        }
        return 63n;
      }
    }
    return this._rawLength === 0 ? 63n : 2n ** BigInt(this._rawLength * 8) - 1n;
  }

  private _clampRawPayload(payload: string | undefined): string | undefined {
    if (payload === undefined) {
      return undefined;
    }
    if (!payload.startsWith("0x")) {
      logger.warn(`Invalid raw payload input: ${payload}`);
      return payload;
    }
    const payloadBigInt = BigInt(payload); // throws if not a valid hex number
    if (payloadBigInt < 0n) {
      return "0x0";
    }
    const payloadMax = this._rawPayloadMax();
    if (payloadBigInt > payloadMax) {
      return `0x${payloadMax.toString(16)}`;
    }
    return `0x${payloadBigInt.toString(16)}`;
  }

  private _emitValue() {
    let value: PayloadConfigValue | undefined;
    if (this._mode === "raw") {
      value =
        this._rawPayload !== undefined
          ? { payload: this._rawPayload, payload_length: this._rawLength }
          : undefined;
    } else {
      value =
        this._typedValue !== undefined && this._typedValue !== ""
          ? { value: this._typedValue }
          : undefined;
    }
    fireEvent(this, "value-changed", { value });
  }

  private _inferMode(): "typed" | "raw" {
    // No DPT -> only raw mode is possible
    if (!this._effectiveDpt()) {
      return "raw";
    }
    // if raw is in config, don't switch to typed mode
    if (this.value?.payload !== undefined || this.value?.payload_length !== undefined) {
      return "raw";
    }
    return "typed";
  }

  private _effectiveDpt(): string | undefined {
    return this.dpt ?? this._linkedDpt;
  }

  private _handleGroupAddressChanged = (ev: CustomEvent<{ key: string; dpt?: string }>) => {
    if (!this.gaKey || ev.detail.key !== this.gaKey) {
      return;
    }
    this._linkedDpt = ev.detail.dpt;
  };

  private _localizeSelector = (key: string): string =>
    this.hass.localize(`component.knx.config_panel.selectors.knx-payload-selector.${key}`);

  static styles = css`
    :host {
      display: block;
      padding: 8px 16px 8px 0;
      border-top: 1px solid var(--divider-color);
    }

    .body {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }

    .text {
      flex: 1;
      min-width: 0;
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

    .dpt-line {
      font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Courier New", monospace;
    }

    .raw-grid {
      display: grid;
      grid-template-columns: 2fr 5fr;
      gap: 12px;
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

    ha-control-select {
      padding: 0;
      margin-left: 0;
      margin-right: 0;
      margin-bottom: 16px;
    }

    knx-selector-row:first-child {
      border: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-payload-selector": KnxPayloadSelector;
  }
}
