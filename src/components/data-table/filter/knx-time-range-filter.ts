/**
 * KNX Time-Range Filter Component
 *
 * A filter panel that lets the user restrict the Group Monitor to a time range.
 * It wraps Home Assistant's `date-range-picker` (calendar + time + preset
 * sidebar). Selecting a range emits `time-range-changed`; the controller then
 * transparently loads any history that isn't already in the buffer.
 *
 * Sidebar presets are "last X" ranges and are reported as open-ended (no end),
 * so the live stream keeps running. A manual calendar selection reports a
 * bounded `[start, end]` range, which the controller treats as absolute history.
 */

import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { mdiFilterVariantRemove } from "@mdi/js";

import "@ha/components/ha-icon-button";
import "@ha/components/ha-alert";
import "@ha/components/ha-spinner";
import "@ha/components/date-picker/ha-date-range-picker";
import type { DateRangePickerRanges } from "@ha/components/date-picker/ha-date-range-picker";
import { formatShortDateTime } from "@ha/common/datetime/format_date_time";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant } from "@ha/types";

import "../../flex-content-expansion-panel";
import type { KNX } from "../../../types/knx";

/** Localize key -> range length in seconds for the preset sidebar. */
const PRESET_RANGES: { labelKey: string; seconds: number }[] = [
  { labelKey: "group_monitor_range_5min", seconds: 5 * 60 },
  { labelKey: "group_monitor_range_30min", seconds: 30 * 60 },
  { labelKey: "group_monitor_range_1h", seconds: 3600 },
  { labelKey: "group_monitor_range_6h", seconds: 6 * 3600 },
  { labelKey: "group_monitor_range_1d", seconds: 86400 },
  { labelKey: "group_monitor_range_1w", seconds: 7 * 86400 },
];

/** Event payload for a selected time range (epoch milliseconds). */
export interface TimeRangeChangedEvent {
  startMs: number;
  /** Undefined for an open-ended ("until now") range. */
  endMs?: number;
}

@customElement("knx-time-range-filter")
export class KnxTimeRangeFilter extends LitElement {
  @property({ attribute: false, hasChanged: () => false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public expanded = false;

  /** Active range start in epoch milliseconds, or undefined when none. */
  @property({ attribute: false }) public startMs?: number;

  /** Active range end in epoch milliseconds, or undefined for open-ended/live. */
  @property({ attribute: false }) public endMs?: number;

  /** Whether a history load is in progress. */
  @property({ type: Boolean }) public loading = false;

  /** Localized warning text to display, if any. */
  @property({ attribute: false }) public warning?: string;

  /** Set when a sidebar preset was clicked, read on the following value-changed. */
  private _presetSelected = false;

  private _expandedChanged(ev: CustomEvent<{ expanded: boolean }>): void {
    this.expanded = ev.detail.expanded;
    fireEvent(this, "expanded-changed", { expanded: this.expanded });
  }

  private _onPresetSelected(): void {
    this._presetSelected = true;
  }

  private _onValueChanged(ev: CustomEvent<{ value: { startDate: Date; endDate: Date } }>): void {
    const { startDate, endDate } = ev.detail.value;
    // `value-changed` is dispatched before `preset-selected`, so defer reading
    // the flag until both synchronous events have fired.
    queueMicrotask(() => {
      const preset = this._presetSelected;
      this._presetSelected = false;
      fireEvent(this, "time-range-changed", {
        startMs: startDate.getTime(),
        endMs: preset ? undefined : endDate.getTime(),
      });
    });
  }

  private _clear(ev: MouseEvent): void {
    ev.stopPropagation();
    ev.preventDefault();
    fireEvent(this, "time-range-cleared", undefined);
  }

  private get _ranges(): DateRangePickerRanges {
    const now = new Date();
    const ranges: DateRangePickerRanges = {};
    for (const { labelKey, seconds } of PRESET_RANGES) {
      ranges[this.knx.localize(labelKey)] = [new Date(now.getTime() - seconds * 1000), now];
    }
    return ranges;
  }

  private get _summary(): string {
    if (this.startMs === undefined) {
      return this.knx.localize("group_monitor_time_range_select");
    }
    const start = formatShortDateTime(new Date(this.startMs), this.hass.locale, this.hass.config);
    const end =
      this.endMs === undefined
        ? this.knx.localize("group_monitor_time_range_now")
        : formatShortDateTime(new Date(this.endMs), this.hass.locale, this.hass.config);
    return `${start} – ${end}`;
  }

  protected render(): TemplateResult {
    const hasValue = this.startMs !== undefined;
    // Default the picker to the last hour when no range is active.
    const now = new Date();
    const startDate =
      this.startMs !== undefined ? new Date(this.startMs) : new Date(now.getTime() - 3600_000);
    const endDate = this.endMs !== undefined ? new Date(this.endMs) : now;

    return html`
      <flex-content-expansion-panel
        leftChevron
        .expanded=${this.expanded}
        @expanded-changed=${this._expandedChanged}
      >
        <div slot="header" class="header">
          <span class="title">
            ${this.knx.localize("group_monitor_time_range_title")}
            ${hasValue ? html`<div class="badge">1</div>` : nothing}
          </span>
          <div class="controls">
            ${hasValue
              ? html`
                  <ha-icon-button
                    .path=${mdiFilterVariantRemove}
                    @click=${this._clear}
                    .title=${this.knx.localize("knx_list_filter_clear")}
                  ></ha-icon-button>
                `
              : nothing}
          </div>
        </div>

        ${this.expanded
          ? html`
              <div class="filter-content">
                <p class="description">${this.knx.localize("group_monitor_time_range_hint")}</p>
                ${this.warning
                  ? html`<ha-alert alert-type="warning">${this.warning}</ha-alert>`
                  : nothing}
                <div class="picker-row">
                  ${this.loading
                    ? html`<ha-spinner size="small"></ha-spinner>`
                    : html`
                        <ha-date-range-picker
                          minimal
                          .ranges=${this._ranges}
                          .startDate=${startDate}
                          .endDate=${endDate}
                          .popoverPlacement=${"right"}
                          time-picker
                          @preset-selected=${this._onPresetSelected}
                          @value-changed=${this._onValueChanged}
                        ></ha-date-range-picker>
                      `}
                </div>
                ${hasValue
                  ? html`<p class="summary" title=${this._summary}>${this._summary}</p>`
                  : nothing}
              </div>
            `
          : nothing}
      </flex-content-expansion-panel>
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      border-bottom: 1px solid var(--divider-color);
    }

    flex-content-expansion-panel {
      --ha-card-border-radius: 0;
      --expansion-panel-content-padding: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
    }

    .title {
      display: flex;
      align-items: center;
      font-weight: 500;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 8px;
      min-width: 20px;
      height: 20px;
      box-sizing: border-box;
      border-radius: 50%;
      font-weight: 500;
      background-color: var(--primary-color);
      color: var(--text-primary-color, white);
      font-size: 12px;
      padding: 0 4px;
    }

    .controls {
      display: flex;
      align-items: center;
    }

    .filter-content {
      display: flex;
      flex-direction: column;
      padding: 0 16px 16px;
    }

    .description {
      color: var(--secondary-text-color);
      font-size: 0.85em;
      margin: 4px 0 12px;
      line-height: 1.4;
    }

    .picker-row {
      display: flex;
    }

    .summary {
      color: var(--secondary-text-color);
      font-size: 0.85em;
      margin: 4px 0 0;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-time-range-filter": KnxTimeRangeFilter;
  }

  // for fire event
  interface HASSDomEvents {
    "time-range-changed": TimeRangeChangedEvent;
    "time-range-cleared": undefined;
  }
}
