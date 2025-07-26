import type { TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";

import { fireEvent } from "@ha/common/dom/fire_event";
import "@ha/components/ha-selector/ha-selector-number";
import "@ha/components/ha-selector/ha-selector-select";
import type { HomeAssistant } from "@ha/types";

@customElement("knx-sync-state-selector-row")
export class KnxSyncStateSelectorRow extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public value: string | boolean = true;

  @property() public key = "sync_state";

  @property({ attribute: false }) allowFalse?: boolean = false;

  @property({ attribute: false }) public localizeFunction: (key: string) => string = (
    key: string,
  ) => key;

  private _strategy: boolean | "init" | "expire" | "every" = true;

  private _minutes = 60;

  private get _options(): (boolean | "init" | "expire" | "every")[] {
    return this.allowFalse
      ? [true, "init", "expire", "every", false]
      : [true, "init", "expire", "every"];
  }

  protected _hasMinutes(strategy: boolean | string): boolean {
    return strategy === "expire" || strategy === "every";
  }

  protected willUpdate() {
    if (typeof this.value === "boolean") {
      this._strategy = this.value;
      return;
    }
    const [strategy, minutes] = this.value.split(" ");
    this._strategy = strategy;
    if (+minutes) {
      this._minutes = +minutes;
    }
  }

  protected render(): TemplateResult {
    return html` <div class="inline">
      <ha-selector-select
        .hass=${this.hass}
        .label=${this.localizeFunction(`${this.key}.title`)}
        .localizeValue=${this.localizeFunction}
        .selector=${{
          select: {
            translation_key: this.key,
            multiple: false,
            custom_value: false,
            mode: "dropdown",
            options: this._options,
          },
        }}
        .key=${"strategy"}
        .value=${this._strategy}
        @value-changed=${this._handleChange}
      >
      </ha-selector-select>
      <ha-selector-number
        .hass=${this.hass}
        .disabled=${!this._hasMinutes(this._strategy)}
        .selector=${{
          number: {
            min: 2,
            max: 1440,
            step: 1,
            unit_of_measurement: "minutes",
          },
        }}
        .key=${"minutes"}
        .value=${this._minutes}
        @value-changed=${this._handleChange}
      >
      </ha-selector-number>
    </div>`;
  }

  private _handleChange(ev) {
    ev.stopPropagation();
    let strategy: boolean | string;
    let minutes: number;
    if (ev.target.key === "strategy") {
      strategy = ev.detail.value;
      minutes = this._minutes;
    } else {
      strategy = this._strategy;
      minutes = ev.detail.value;
    }
    const value = this._hasMinutes(strategy) ? `${strategy} ${minutes}` : strategy;
    fireEvent(this, "value-changed", { value });
  }

  static styles = css`
    .description {
      margin: 0;
      display: block;
      padding-top: 4px;
      padding-bottom: 8px;
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
    .inline {
      width: 100%;
      display: inline-flex;
      flex-flow: row wrap;
      gap: 16px;
      justify-content: space-between;
    }
    .inline > * {
      flex: 1;
      width: 100%; /* to not overflow when wrapped */
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-sync-state-selector-row": KnxSyncStateSelectorRow;
  }
}
