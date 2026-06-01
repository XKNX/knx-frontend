import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators";

import "@ha/components/radio/ha-radio-group";
import "@ha/components/radio/ha-radio-option";
import { fireEvent } from "@ha/common/dom/fire_event";

import type { DPTOption } from "../types/schema";

@customElement("knx-dpt-option-selector")
class KnxDptOptionSelector extends LitElement {
  @property({ type: Array }) public options!: DPTOption[];

  @property() public value?: string;

  @property() public label?: string;

  @property({ type: Boolean }) public disabled = false;

  @property({ type: Boolean, reflect: true }) public invalid = false;

  @property({ attribute: false }) public invalidMessage?: string;

  @property({ attribute: false }) public localizeValue: (value: string) => string = (key: string) =>
    key;

  @property({ type: String }) public translation_key?: string;

  render() {
    return html`<ha-radio-group
        .label=${this.label ?? ""}
        .disabled=${this.disabled}
        .value=${this.value ?? null}
        @change=${this._valueChanged}
      >
        ${this.options.map(
          (item: DPTOption) => html`
            <ha-radio-option
              .checked=${item.value === this.value}
              .value=${item.value}
              .disabled=${this.disabled}
            >
              <label .value=${item.value} @click=${this._valueChanged}>
                <p>
                  ${this.localizeValue(this.translation_key + ".options." + item.translation_key)}
                </p>
                <p class="secondary">DPT ${item.value}</p>
              </label>
            </ha-radio-option>
          `,
        )}
      </ha-radio-group>
      ${this.invalidMessage ? html`<p class="invalid-message">${this.invalidMessage}</p>` : nothing} `;
  }

  private _valueChanged(ev) {
    ev.stopPropagation();
    const value = ev.target.value;
    if (this.disabled || value === undefined || value === null || value === (this.value ?? "")) {
      return;
    }
    fireEvent(this, "value-changed", { value: value });
  }

  static styles = [
    css`
      :host([invalid]) {
        color: var(--error-color);
      }

      ha-radio-group::part(form-control-label) {
        padding-left: 12px;
      }

      label {
        min-width: 200px; /* to make it easier to click */
      }

      p {
        pointer-events: none;
        color: var(--primary-text-color);
        margin: 0px;
      }

      .secondary {
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

      .invalid-message {
        font-size: 0.75rem;
        color: var(--error-color);
        padding-left: 16px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-dpt-option-selector": KnxDptOptionSelector;
  }
}
