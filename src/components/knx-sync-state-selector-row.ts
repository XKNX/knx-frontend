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

  @property({ attribute: false }) noneValid = true;

  private _strategy: boolean | "init" | "expire" | "every" = true;

  private _minutes: number = 60;

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
        .label=${"Strategy"}
        .selector=${{
          select: {
            multiple: false,
            custom_value: false,
            mode: "dropdown",
            options: [
              { value: true, label: "Default" },
              ...(this.noneValid ? [{ value: false, label: "Never" }] : []),
              { value: "init", label: "Once when connection established" },
              { value: "expire", label: "Expire after last value update" },
              { value: "every", label: "Scheduled every" },
            ],
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

  static get styles() {
    return css`
      .inline {
        width: 100%;
        display: inline-flex;
        flex-flow: row wrap;
        gap: 16px;
        justify-content: space-between;
      }

      .inline > * {
        flex: 1;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-sync-state-selector-row": KnxSyncStateSelectorRow;
  }
}
