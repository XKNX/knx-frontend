import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators";

import "@ha/components/ha-formfield";
import "@ha/components/ha-radio";
import { fireEvent } from "@ha/common/dom/fire_event";

import type { DPTOption } from "../utils/schema";

@customElement("knx-dpt-selector")
class KnxDptSelector extends LitElement {
  @property({ type: Array }) public options!: DPTOption[];

  @property() public value?: string;

  @property() public label?: string;

  @property({ type: Boolean }) public disabled = false;

  @property({ type: Boolean, reflect: true }) public invalid = false;

  @property({ attribute: false }) public invalidMessage?: string;

  render() {
    return html`
      <div>
        ${this.label ?? nothing}
        ${this.options.map(
          (item: DPTOption) => html`
            <div class="formfield">
              <ha-radio
                .checked=${item.value === this.value}
                .value=${item.value}
                .disabled=${this.disabled}
                @change=${this._valueChanged}
              ></ha-radio>
              <label .value=${item.value} @click=${this._valueChanged}>
                <p>${item.label}</p>
                ${item.description ? html`<p class="secondary">${item.description}</p>` : nothing}
              </label>
            </div>
          `,
        )}
        ${this.invalidMessage
          ? html`<p class="invalid-message">${this.invalidMessage}</p>`
          : nothing}
      </div>
    `;
  }

  private _valueChanged(ev) {
    ev.stopPropagation();
    const value = ev.target.value;
    if (this.disabled || value === undefined || value === (this.value ?? "")) {
      return;
    }
    fireEvent(this, "value-changed", { value: value });
  }

  static styles = [
    css`
      :host([invalid]) div {
        color: var(--error-color);
      }

      .formfield {
        display: flex;
        align-items: center;
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
    "knx-dpt-selector": KnxDptSelector;
  }
}
