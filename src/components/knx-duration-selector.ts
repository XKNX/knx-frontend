import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";

import "@ha/components/ha-selector/ha-selector";
import { durationDataToSeconds } from "@ha/common/datetime/duration_to_seconds";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { HaDurationData } from "@ha/components/ha-duration-input";
import type { DurationSelector } from "@ha/data/selector";
import type { HomeAssistant, ValueChangedEvent } from "@ha/types";

const durationFromSeconds = (seconds: number): HaDurationData => {
  const totalMilliseconds = Math.round(seconds * 1000);
  return {
    days: Math.floor(totalMilliseconds / 86_400_000),
    hours: Math.floor((totalMilliseconds % 86_400_000) / 3_600_000),
    minutes: Math.floor((totalMilliseconds % 3_600_000) / 60_000),
    seconds: Math.floor((totalMilliseconds % 60_000) / 1000),
    milliseconds: totalMilliseconds % 1000,
  };
};

@customElement("knx-duration-selector")
export class KnxDurationSelector extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public selector!: DurationSelector;

  @property({ attribute: false }) public value?: number;

  @property({ type: Boolean }) public disabled = false;

  @property({ attribute: false }) public placeholder?: unknown;

  @property({ attribute: false }) public localizeValue?: (key: string) => string;

  @property() public helper?: string;

  protected render() {
    return html`<ha-selector
      .hass=${this.hass}
      .selector=${this.selector}
      .value=${this.value === undefined ? undefined : durationFromSeconds(this.value)}
      .disabled=${this.disabled}
      .placeholder=${this.placeholder}
      .localizeValue=${this.localizeValue}
      .helper=${this.helper}
      @value-changed=${this._valueChanged}
    ></ha-selector>`;
  }

  private _valueChanged(ev: ValueChangedEvent<HaDurationData | null | undefined>): void {
    ev.stopPropagation();
    fireEvent(this, "value-changed", {
      value: ev.detail.value == null ? undefined : durationDataToSeconds(ev.detail.value),
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-duration-selector": KnxDurationSelector;
  }
}
