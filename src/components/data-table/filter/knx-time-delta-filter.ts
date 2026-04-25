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

import "@ha/components/ha-textfield";
import { fireEvent } from "@ha/common/dom/fire_event";

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

  private _handleBeforeInput(ev: InputEvent): void {
    const target = ev.target as HTMLInputElement;
    const value = Math.max(0, Math.floor(Number(target.value) || 0));
    if (value !== this.deltaBefore) {
      this.deltaBefore = value;
      this._fireTimeDeltaChanged();
    }
  }

  private _handleAfterInput(ev: InputEvent): void {
    const target = ev.target as HTMLInputElement;
    const value = Math.max(0, Math.floor(Number(target.value) || 0));
    if (value !== this.deltaAfter) {
      this.deltaAfter = value;
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
            ${hasValues && !this.disabled ? html`<div class="badge">●</div>` : nothing}
          </span>
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
                        <label class="input-label" for="delta-before">
                          ${this.knx.localize("group_monitor_time_delta_before")}
                        </label>
                        <div class="input-wrapper">
                          <ha-textfield
                            id="delta-before"
                            type="number"
                            .value=${this.deltaBefore.toString()}
                            .placeholder=${this.knx.localize(
                              "group_monitor_time_delta_placeholder",
                            )}
                            min="0"
                            .disabled=${this.disabled}
                            @change=${this._handleBeforeInput}
                            suffix="ms"
                          ></ha-textfield>
                        </div>
                      </div>

                      <div class="input-row">
                        <label class="input-label" for="delta-after">
                          ${this.knx.localize("group_monitor_time_delta_after")}
                        </label>
                        <div class="input-wrapper">
                          <ha-textfield
                            id="delta-after"
                            type="number"
                            .value=${this.deltaAfter.toString()}
                            .placeholder=${this.knx.localize(
                              "group_monitor_time_delta_placeholder",
                            )}
                            min="0"
                            .disabled=${this.disabled}
                            @change=${this._handleAfterInput}
                            suffix="ms"
                          ></ha-textfield>
                        </div>
                      </div>
                    `}
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
      font-size: 10px;
      color: var(--primary-color);
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

    .input-label {
      font-size: 0.8em;
      font-weight: 500;
      color: var(--secondary-text-color);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }

    .input-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    ha-textfield {
      flex: 1;
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
