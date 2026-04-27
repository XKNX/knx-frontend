/**
 * KNX Time-Delta Context Filter Component
 *
 * A filter panel that allows users to specify a time window (in milliseconds)
 * around filter-matching telegrams. When active, telegrams within ±delta of
 * any matching telegram are included in results, even if they don't match
 * the other active filters (source, destination, type, direction).
 *
 * This is only enabled when at least one other filter is active.
 */

import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { mdiFilterVariantRemove } from "@mdi/js";

import "@ha/components/ha-icon-button";
import "@ha/components/ha-selector/ha-selector-number";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant } from "@ha/types";

import "../../flex-content-expansion-panel";
import type { KNX } from "../../../types/knx";

// ============================================================================
// Event Interfaces
// ============================================================================

/**
 * Event payload for time-delta value changes
 */
export interface TimeDeltaChangedEvent {
  /** Milliseconds before a matching telegram */
  deltaBefore: number;
  /** Milliseconds after a matching telegram */
  deltaAfter: number;
}

/**
 * Event payload for expansion state changes
 */
export interface TimeDeltaExpandedChangedEvent {
  /** Whether the panel is now expanded */
  expanded: boolean;
}

@customElement("knx-time-delta-filter")
export class KnxTimeDeltaFilter extends LitElement {
  @property({ attribute: false, hasChanged: () => false }) public hass!: HomeAssistant;

  /**
   * KNX integration instance providing localization
   */
  @property({ attribute: false }) public knx!: KNX;

  /**
   * Current expansion state of the filter panel
   */
  @property({ type: Boolean, reflect: true }) public expanded = false;

  /**
   * Milliseconds before a matching telegram to include
   */
  @property({ type: Number, attribute: "delta-before" }) public deltaBefore = 0;

  /**
   * Milliseconds after a matching telegram to include
   */
  @property({ type: Number, attribute: "delta-after" }) public deltaAfter = 0;

  /**
   * Number of telegrams added by this filter
   */
  @property({ type: Number, attribute: "added-count" }) public addedCount = 0;

  /**
   * Whether the filter is disabled (no other filters active)
   */
  @property({ type: Boolean }) public disabled = false;

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private _expandedChanged(ev: CustomEvent<{ expanded: boolean }>): void {
    this.expanded = ev.detail.expanded;
    fireEvent(this, "expanded-changed", { expanded: this.expanded });
  }

  private _handleBeforeInput(ev: CustomEvent): void {
    const value = Math.max(0, Math.floor(Number(ev.detail.value) || 0));
    if (value !== this.deltaBefore) {
      this.deltaBefore = value;
      this._fireTimeDeltaChanged();
    }
  }

  private _handleAfterInput(ev: CustomEvent): void {
    const value = Math.max(0, Math.floor(Number(ev.detail.value) || 0));
    if (value !== this.deltaAfter) {
      this.deltaAfter = value;
      this._fireTimeDeltaChanged();
    }
  }

  private _handleClearFiltersButtonClick(ev: MouseEvent): void {
    ev.stopPropagation();
    ev.preventDefault();
    if (this.deltaBefore > 0 || this.deltaAfter > 0) {
      this.deltaBefore = 0;
      this.deltaAfter = 0;
      this._fireTimeDeltaChanged();
    }
  }

  private _fireTimeDeltaChanged(): void {
    fireEvent(this, "time-delta-changed", {
      deltaBefore: this.deltaBefore,
      deltaAfter: this.deltaAfter,
    });
  }

  // ============================================================================
  // Render
  // ============================================================================

  protected render(): TemplateResult {
    const headerText = this.knx.localize("group_monitor_time_delta_title");
    const hasValues = this.deltaBefore > 0 || this.deltaAfter > 0;

    return html`
      <flex-content-expansion-panel
        leftChevron
        .expanded=${this.expanded}
        @expanded-changed=${this._expandedChanged}
      >
        <div slot="header" class="header">
          <span class="title">
            ${headerText}
            ${hasValues && !this.disabled ? html`<div class="badge">1</div>` : nothing}
          </span>
          <div class="controls">
            ${hasValues && !this.disabled
              ? html`
                  <ha-icon-button
                    .path=${mdiFilterVariantRemove}
                    @click=${this._handleClearFiltersButtonClick}
                    .title=${this.knx.localize("knx_list_filter_clear")}
                  ></ha-icon-button>
                `
              : nothing}
          </div>
        </div>

        ${this.expanded
          ? html`
              <div class="filter-content">
                <p class="description">
                  ${this.knx.localize("group_monitor_time_delta_description")}
                </p>

                ${this.disabled
                  ? html`
                      <p class="disabled-message">
                        ${this.knx.localize("group_monitor_time_delta_disabled")}
                      </p>
                    `
                  : html`
                      <div class="input-row">
                        <div
                          class="input-wrapper"
                          title=${this.knx.localize("group_monitor_time_delta_before")}
                        >
                          <ha-selector-number
                            id="delta-before"
                            .hass=${this.hass}
                            .value=${this.deltaBefore}
                            .disabled=${this.disabled}
                            .required=${false}
                            .label=${this.knx.localize("group_monitor_time_delta_before")}
                            .selector=${{
                              number: {
                                min: 0,
                                step: 10,
                                mode: "box",
                                unit_of_measurement: "ms",
                              },
                            }}
                            @value-changed=${this._handleBeforeInput}
                          ></ha-selector-number>
                        </div>
                      </div>

                      <div class="input-row">
                        <div
                          class="input-wrapper"
                          title=${this.knx.localize("group_monitor_time_delta_after")}
                        >
                          <ha-selector-number
                            id="delta-after"
                            .hass=${this.hass}
                            .value=${this.deltaAfter}
                            .disabled=${this.disabled}
                            .required=${false}
                            .label=${this.knx.localize("group_monitor_time_delta_after")}
                            .selector=${{
                              number: {
                                min: 0,
                                step: 10,
                                mode: "box",
                                unit_of_measurement: "ms",
                              },
                            }}
                            @value-changed=${this._handleAfterInput}
                          ></ha-selector-number>
                        </div>
                      </div>
                    `}
                ${hasValues && !this.disabled
                  ? html`
                      <div class="summary-item">
                        <div class="summary-text">
                          <div class="summary-primary">
                            <span class="summary-label">
                              ${this.knx.localize("group_monitor_time_delta_summary", {
                                before: this.deltaBefore,
                                after: this.deltaAfter,
                              })}
                            </span>
                            <span class="summary-badge">${this.addedCount}</span>
                          </div>
                        </div>
                      </div>
                    `
                  : nothing}
              </div>
            `
          : nothing}
      </flex-content-expansion-panel>
    `;
  }

  // ============================================================================
  // Styles
  // ============================================================================

  static readonly styles = css`
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

    .disabled-message {
      color: var(--secondary-text-color);
      font-size: 0.85em;
      font-style: italic;
      margin: 0 0 8px;
      padding: 8px 12px;
      background: rgba(var(--rgb-primary-text-color), 0.04);
      border-radius: 8px;
    }

    .input-row {
      display: flex;
      flex-direction: column;
      margin-bottom: 8px;
    }

    .input-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    ha-selector-number {
      flex: 1;
      width: 100%;
    }

    .controls {
      display: flex;
      align-items: center;
    }

    .summary-item {
      display: flex;
      align-items: center;
      height: 48px;
      padding: 0 16px;
      margin: 0 -16px 8px -16px;
      background-color: var(--mdc-theme-surface-variant, rgba(var(--rgb-primary-color), 0.06));
    }

    .summary-text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      line-height: normal;
    }

    .summary-primary {
      display: flex;
      align-items: center;
      width: 100%;
      gap: 8px;
    }

    .summary-label {
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .summary-badge {
      display: inline-flex;
      background-color: rgba(var(--rgb-primary-color), 0.15);
      color: var(--primary-color);
      font-weight: 500;
      font-size: 0.75em;
      padding: 1px 6px;
      border-radius: 10px;
      min-width: 20px;
      height: 16px;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
      flex-shrink: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-time-delta-filter": KnxTimeDeltaFilter;
  }

  // for fire event
  interface HASSDomEvents {
    "time-delta-changed": TimeDeltaChangedEvent;
  }
}
