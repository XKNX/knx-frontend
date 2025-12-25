import { LitElement, html, css, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";

import { fireEvent } from "@ha/common/dom/fire_event";
import "@ha/components/ha-checkbox";
import "@ha/components/ha-selector/ha-selector";
import "@ha/components/ha-switch";

import type { HomeAssistant } from "@ha/types";
import { getValidationError } from "../utils/validation";
import type { ErrorDescription } from "../types/entity_data";
import type { KnxHaSelector } from "../types/schema";

@customElement("knx-selector-row")
export class KnxSelectorRow extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public key!: string;

  @property({ attribute: false }) public selector!: KnxHaSelector;

  @property() public value?: any;

  @property({ attribute: false }) public validationErrors?: ErrorDescription[];

  @property({ attribute: false }) public localizeFunction: (key: string) => string = (
    key: string,
  ) => key;

  @state() private _enabled = true;

  private _haSelectorValue: any = null;

  private _inlineSelector = false;

  private _optionalBooleanSelector = false;

  protected willUpdate(_changedProperties: PropertyValues): void {
    if (_changedProperties.has("selector") || _changedProperties.has("key")) {
      const isRequired = !!this.selector.required;
      const isBoolean = "boolean" in this.selector.selector;
      const isNumber = "number" in this.selector.selector;

      // Inline selector only for required boolean/number
      this._inlineSelector = isRequired && (isBoolean || isNumber);

      // Optional boolean uses a single switch not 2 (enable and value switch)
      this._optionalBooleanSelector = !isRequired && isBoolean;

      if (this._optionalBooleanSelector) {
        // no explicit default (undefined) -> default to false
        const defaultBool = !!this.selector.default;
        // Only write the non-default value, otherwise undefined
        this._haSelectorValue = !defaultBool;
        // switch should represent the actually used value (written or default)
        this._enabled = this.value ?? defaultBool;
      } else {
        // For required or non-boolean selectors: enabled unless optional and unset
        this._enabled = isRequired || this.value !== undefined;
        // apply default value if available or no value is set yet
        // TODO: consider also using suggested_value ?
        this._haSelectorValue = this.value ?? this.selector.default ?? null;
      }
    }
  }

  protected render(): TemplateResult {
    const invalid = getValidationError(this.validationErrors);
    const haSelector = this._optionalBooleanSelector
      ? nothing
      : html`<ha-selector
          class=${classMap({ "newline-selector": !this._inlineSelector })}
          .hass=${this.hass}
          .selector=${this.selector.selector}
          .disabled=${!this._enabled}
          .value=${this._haSelectorValue}
          .localizeValue=${this.hass.localize}
          @value-changed=${this._valueChange}
        ></ha-selector>`;

    return html`
      <div class="body">
        <div class="text">
          <p class="heading ${classMap({ invalid: !!invalid })}">
            ${this.localizeFunction(`${this.key}.label`)}
          </p>
          <p class="description">${this.localizeFunction(`${this.key}.description`)}</p>
        </div>
        ${!this.selector.required // TODO: && (this.selector.default !== undefined)  // since default is applied in schema anyway? test this!
          ? html`<ha-selector
              class="optional-switch"
              .selector=${{ boolean: {} }}
              .value=${this._enabled}
              @value-changed=${this._toggleEnabled}
            ></ha-selector>`
          : nothing}
        ${
          // inline selector is never optional, so optional-switch and this can't be shown together
          this._inlineSelector ? haSelector : nothing
        }
      </div>
      ${this._inlineSelector ? nothing : haSelector}
      ${invalid ? html`<p class="invalid-message">${invalid.error_message}</p>` : nothing}
    `;
  }

  private _toggleEnabled(ev: Event) {
    ev.stopPropagation();
    this._enabled = !this._enabled;
    this._propagateValue();
  }

  private _valueChange(ev: CustomEvent<{ value: any }>) {
    ev.stopPropagation();
    this._haSelectorValue = ev.detail.value;
    this._propagateValue();
  }

  private _propagateValue() {
    if (this._optionalBooleanSelector) {
      // For optional boolean, write the non-default value or remove the key (undefined)
      fireEvent(this, "value-changed", {
        value: this._enabled === this._haSelectorValue ? this._haSelectorValue : undefined,
      });
      return;
    }
    fireEvent(this, "value-changed", { value: this._enabled ? this._haSelectorValue : undefined });
  }

  static styles = css`
    :host {
      display: block;
      padding: 8px 16px 8px 0;
      border-top: 1px solid var(--divider-color);
    }
    .newline-selector {
      display: block;
      padding-top: 8px;
    }
    .body {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      row-gap: 8px;
    }
    .body > * {
      flex-grow: 1;
    }
    .text {
      flex-basis: 260px; /* min size of text - if inline selector is too big it will be pushed to next row */
    }
    .heading {
      margin: 0;
    }
    .description {
      margin: 0;
      display: block;
      padding-top: 4px;
      font-family: var(
        --mdc-typography-body2-font-family,
        var(--mdc-typography-font-family, Roboto, sans-serif)
      );
      -webkit-font-smoothing: antialiased;
      font-size: var(--mdc-typography-body2-font-size, 0.875rem);
      font-weight: var(--mdc-typography-body2-font-weight, 400);
      line-height: normal;
      color: var(--secondary-text-color);
    }

    .invalid {
      color: var(--error-color);
    }
    .invalid-message {
      font-size: 0.75rem;
      color: var(--error-color);
      padding-left: 16px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-selector-row": KnxSelectorRow;
  }
}
