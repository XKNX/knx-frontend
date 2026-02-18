import { mdiArrowLeft, mdiArrowRight } from "@mdi/js";
import { LitElement, nothing, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant } from "@ha/types";
import type { HassDialog } from "@ha/dialogs/make-dialog-manager";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-button";

import {
  formatDateTimeWithMilliseconds,
  formatIsoTimestampWithMicroseconds,
} from "../../../utils/format";
import type { KNX } from "../../../types/knx";
import type { TelegramRow } from "../types/telegram-row";
import "@ha/components/ha-relative-time";
import "@ha/components/ha-wa-dialog";

/**
 * Parameters for TelegramInfoDialog
 *
 * @property knx - KNX instance for localization and project data access
 * @property telegram - The telegram data to display
 * @property narrow - Whether to use narrow/mobile layout
 * @property filteredTelegrams - Array of filtered telegrams for navigation
 */
export interface TelegramInfoDialogParams {
  knx: KNX;
  telegram: TelegramRow;
  narrow: boolean;
  filteredTelegrams: TelegramRow[];
}

/**
 * Dialog component to display detailed information about a single KNX telegram
 *
 * Features:
 * - Displays telegram metadata (source, destination, timestamp, direction)
 * - Shows decoded value and raw payload data
 * - Enables keyboard navigation between telegrams (arrow keys)
 * - Updates navigation when telegram list changes via custom events
 * - Supports both incoming and outgoing telegram types
 * - Responsive layout for narrow/mobile screens
 *
 * Implements HassDialog interface for standard Home Assistant dialog conventions.
 */
@customElement("knx-group-monitor-telegram-info-dialog")
export class GroupMonitorTelegramInfoDialog
  extends LitElement
  implements HassDialog<TelegramInfoDialogParams>
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ attribute: false }) public filteredTelegrams: TelegramRow[] = [];

  @state() private _open = false;

  @state() private _params?: TelegramInfoDialogParams;

  /**
   * Get the current navigation state based on filtered telegrams
   *
   * Determines whether next/previous buttons should be disabled based on
   * the current telegram's position in the filtered telegram list.
   *
   * @returns Object with disableNext and disablePrevious flags
   */
  private _getNavigationState(): { disableNext: boolean; disablePrevious: boolean } {
    if (!this._params) {
      return { disableNext: true, disablePrevious: true };
    }
    // Use the current filteredTelegrams property which can be updated
    const telegrams =
      this.filteredTelegrams.length > 0 ? this.filteredTelegrams : this._params.filteredTelegrams;
    const index = telegrams.findIndex((t) => t.id === this._params!.telegram.id);
    return {
      disableNext: index < 0 || index >= telegrams.length - 1,
      disablePrevious: index <= 0,
    };
  }

  /**
   * Add event listeners when component is connected to DOM
   *
   * Binds keyboard event handlers for navigation and telegram list update handlers
   * for real-time synchronization with the group monitor view.
   */
  connectedCallback(): void {
    super.connectedCallback();
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleTelegramListUpdated = this._handleTelegramListUpdated.bind(this);
    document.addEventListener("keydown", this._handleKeyDown);
    document.addEventListener("knx-telegram-list-updated", this._handleTelegramListUpdated);
  }

  /**
   * Remove event listeners when component is disconnected from DOM
   *
   * Cleans up keyboard and custom event listeners to prevent memory leaks.
   */
  disconnectedCallback(): void {
    document.removeEventListener("keydown", this._handleKeyDown);
    document.removeEventListener("knx-telegram-list-updated", this._handleTelegramListUpdated);
    super.disconnectedCallback();
  }

  /**
   * Open the dialog with the given parameters
   *
   * Initializes the dialog with telegram data and filtered telegram list.
   * Stores parameters for navigation and updates the open state.
   *
   * Implements HassDialog interface requirement.
   *
   * @param params - Dialog parameters including telegram data and navigation context
   */
  public async showDialog(params: TelegramInfoDialogParams): Promise<void> {
    this.knx = params.knx;
    this._params = params;
    this.filteredTelegrams = params.filteredTelegrams;
    this._open = true;
  }

  /**
   * Close the dialog
   *
   * Cleans up internal state. The dialog manager handles the dialog lifecycle,
   * so no events are fired to parent components.
   *
   * Implements HassDialog interface requirement.
   *
   * @returns true to indicate successful closure
   */
  public closeDialog(): boolean {
    this._open = false;
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName }, { bubbles: false });
    return true;
  }

  /**
   * Render the dialog contents
   *
   * Displays telegram information including addresses, value, type, DPT,
   * and payload. Shows navigation buttons for moving between telegrams.
   *
   * @returns Template result with dialog markup or nothing if not open
   */

  protected render() {
    if (!this._open || !this._params) {
      return nothing;
    }

    const { telegram, narrow } = this._params;
    const { disableNext, disablePrevious } = this._getNavigationState();
    const isOutgoing = telegram.direction === "Outgoing";
    const directionClass = isOutgoing ? "outgoing" : "incoming";

    return html`
      <ha-wa-dialog .open=${this._open} @closed=${this.closeDialog}>
        <span slot="headerTitle"> ${this.knx.localize("knx_telegram_info_dialog_telegram")} </span>
        <div slot="headerSubtitle">
          <span title=${formatIsoTimestampWithMicroseconds(telegram.timestampIso)}>
            ${formatDateTimeWithMilliseconds(telegram.timestamp) + " "}
          </span>
          ${!narrow
            ? html`
                (<ha-relative-time
                  .hass=${this.hass}
                  .datetime=${telegram.timestamp}
                  .capitalize=${false}
                ></ha-relative-time
                >)
              `
            : nothing}
        </div>
        <div
          slot="headerActionItems"
          class="direction-badge ${directionClass}"
          title=${this.knx.localize(telegram.direction) +
          (telegram.dataSecure ? " DataSecure" : "")}
        >
          ${this.knx.localize(telegram.direction) + (telegram.dataSecure ? " 🔒" : "")}
        </div>

        <div class="content">
          <!-- Body: addresses + value + details -->
          <div class="telegram-body">
            <div class="addresses-row">
              <div class="address-item">
                <div class="item-label">
                  ${this.knx.localize("knx_telegram_info_dialog_source")}
                </div>
                <div class="address-chip">${telegram.sourceAddress}</div>
                ${telegram.sourceText
                  ? html`<div class="item-name">${telegram.sourceText}</div>`
                  : nothing}
              </div>
              <div class="address-item">
                <div class="item-label">
                  ${this.knx.localize("knx_telegram_info_dialog_destination")}
                </div>
                <div class="address-chip">${telegram.destinationAddress}</div>
                ${telegram.destinationText
                  ? html`<div class="item-name">${telegram.destinationText}</div>`
                  : nothing}
              </div>
            </div>

            ${telegram.value != null
              ? html`
                  <div class="value-section">
                    <div class="value-label">
                      ${this.knx.localize("knx_telegram_info_dialog_value")}
                    </div>
                    <div class="value-content">${telegram.value}</div>
                  </div>
                `
              : nothing}

            <div class="telegram-details">
              <div class="detail-grid">
                <div class="detail-item">
                  <div class="detail-label">
                    ${this.knx.localize("knx_telegram_info_dialog_type")}
                  </div>
                  <div class="detail-value">${telegram.type}</div>
                </div>
                <div class="detail-item">
                  <div class="detail-label">DPT</div>
                  <div class="detail-value">${telegram.dpt || ""}</div>
                </div>
                ${telegram.payload != null
                  ? html`
                      <div class="detail-item payload">
                        <div class="detail-label">
                          ${this.knx.localize("knx_telegram_info_dialog_payload")}
                        </div>
                        <code>${telegram.payload}</code>
                      </div>
                    `
                  : nothing}
              </div>
            </div>
          </div>
        </div>

        <!-- Navigation buttons footer -->
        <div slot="footer">
          <ha-button
            appearance="plain"
            @click=${this._previousTelegram}
            .disabled=${disablePrevious}
          >
            <ha-svg-icon .path=${mdiArrowLeft} slot="start"></ha-svg-icon>
            ${this.hass.localize("ui.common.previous")}
          </ha-button>
          <ha-button appearance="plain" @click=${this._nextTelegram} .disabled=${disableNext}>
            ${this.hass.localize("ui.common.next")}
            <ha-svg-icon .path=${mdiArrowRight} slot="end"></ha-svg-icon>
          </ha-button>
        </div>
      </ha-wa-dialog>
    `;
  }

  /**
   * Navigate to the next telegram in the filtered list
   *
   * Updates the dialog parameters to show the next telegram.
   * Does nothing if already at the end of the list.
   */
  private _nextTelegram() {
    if (!this._params) return;
    const telegrams =
      this.filteredTelegrams.length > 0 ? this.filteredTelegrams : this._params.filteredTelegrams;
    const index = telegrams.findIndex((t) => t.id === this._params!.telegram.id);
    if (index >= 0 && index < telegrams.length - 1) {
      this._params = {
        ...this._params,
        telegram: telegrams[index + 1],
      };
    }
  }

  /**
   * Navigate to the previous telegram in the filtered list
   *
   * Updates the dialog parameters to show the previous telegram.
   * Does nothing if already at the beginning of the list.
   */
  private _previousTelegram() {
    if (!this._params) return;
    const telegrams =
      this.filteredTelegrams.length > 0 ? this.filteredTelegrams : this._params.filteredTelegrams;
    const index = telegrams.findIndex((t) => t.id === this._params!.telegram.id);
    if (index > 0) {
      this._params = {
        ...this._params,
        telegram: telegrams[index - 1],
      };
    }
  }

  /**
   * Handle keyboard events for navigation
   *
   * Supports:
   * - ArrowLeft/ArrowDown: Previous telegram
   * - ArrowRight/ArrowUp: Next telegram
   *
   * Only processes events when dialog is open. Prevents default behavior
   * to avoid page scrolling.
   *
   * @param event - Keyboard event to process
   */
  private _handleKeyDown(event: KeyboardEvent): void {
    // Only process keyboard events when dialog is open
    if (!this._open || !this._params) {
      return;
    }

    const { disablePrevious, disableNext } = this._getNavigationState();

    // Prevent default behavior for arrow keys to avoid scrolling
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        if (!disablePrevious) {
          event.preventDefault();
          this._previousTelegram();
        }
        break;
      case "ArrowRight":
      case "ArrowUp":
        if (!disableNext) {
          event.preventDefault();
          this._nextTelegram();
        }
        break;
      default:
        // Do nothing for other keys
        break;
    }
  }

  /**
   * Handle updates to the telegram list from the group monitor view
   *
   * Called when new telegrams arrive or the list is filtered. Updates the
   * internal filteredTelegrams property and triggers a re-render to update
   * navigation button states.
   *
   * @param event - Custom event with updated filtered telegram list
   */
  private _handleTelegramListUpdated = (
    event: Event & { detail?: { filteredTelegrams: TelegramRow[] } },
  ): void => {
    if (event.detail?.filteredTelegrams) {
      this.filteredTelegrams = event.detail.filteredTelegrams;
      this.requestUpdate();
    }
  };

  static get styles() {
    return [
      css`
        ha-wa-dialog {
          --ha-dialog-width-md: 580px;
        }

        ha-button {
          --ha-button-radius: 8px; /* Default is --wa-border-radius-pill */
        }

        /* General content styling */
        .content {
          display: flex;
          flex-direction: column;
          flex: 1;
          gap: 16px;
          outline: none;
        }

        .direction-badge {
          font-size: 12px;
          font-weight: 500;
          padding: 3px 10px;
          border-radius: 12px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          white-space: nowrap;
          margin-right: 16px;
        }
        .direction-badge.outgoing {
          background-color: var(--knx-blue, var(--info-color));
          color: var(--text-primary-color, #fff);
        }
        .direction-badge.incoming {
          background-color: var(--knx-green, var(--success-color));
          color: var(--text-primary-color, #fff);
        }

        /* Body: addresses + value + details */
        .telegram-body {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .addresses-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 450px) {
          .addresses-row {
            grid-template-columns: 1fr;
            gap: 12px;
          }
        }
        .address-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
          background: var(--card-background-color);
          padding: 0px 12px 0px 12px;
          border-radius: 8px;
        }
        .item-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--secondary-text-color);
          margin-bottom: 4px;
          letter-spacing: 0.5px;
        }
        .address-chip {
          font-family: var(--code-font-family, monospace);
          font-size: 16px;
          font-weight: 500;
          background: var(--secondary-background-color);
          border-radius: 12px;
          padding: 6px 12px;
          text-align: center;
          box-shadow: 0 1px 2px rgba(var(--rgb-primary-text-color), 0.06);
        }
        .item-name {
          font-size: 12px;
          color: var(--secondary-text-color);
          margin-top: 4px;
          text-align: center;
        }

        /* Value section */
        .value-section {
          padding: 16px;
          background: var(--primary-background-color);
          border-radius: 8px;
          box-shadow: 0 1px 2px rgba(var(--rgb-primary-text-color), 0.06);
        }
        .value-label {
          font-size: 13px;
          color: var(--secondary-text-color);
          margin-bottom: 8px;
          font-weight: 500;
          letter-spacing: 0.4px;
        }
        .value-content {
          font-family: var(--code-font-family, monospace);
          font-size: 22px;
          font-weight: 600;
          color: var(--primary-color);
          text-align: center;
        }

        /* Telegram details (type/DPT/payload) */
        .telegram-details {
          padding: 16px;
          background: var(--secondary-background-color);
          border-radius: 8px;
          box-shadow: 0 1px 2px rgba(var(--rgb-primary-text-color), 0.06);
        }
        .detail-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .detail-item.payload {
          grid-column: span 2;
          margin-top: 4px;
        }
        .detail-label {
          font-size: 13px;
          color: var(--secondary-text-color);
          font-weight: 500;
        }
        .detail-value {
          font-size: 14px;
          font-weight: 500;
        }
        code {
          font-family: var(--code-font-family, monospace);
          font-size: 13px;
          background: var(--card-background-color);
          padding: 8px 12px;
          border-radius: 6px;
          display: block;
          overflow-x: auto;
          white-space: pre;
          box-shadow: 0 1px 2px rgba(var(--rgb-primary-text-color), 0.04);
          margin-top: 4px;
        }
      `,
    ];
  }
}

declare global {
  interface HASSDomEvents {
    "next-telegram": undefined;
    "previous-telegram": undefined;
    "knx-telegram-list-updated": { filteredTelegrams: TelegramRow[] };
  }

  interface HTMLElementTagNameMap {
    "knx-group-monitor-telegram-info-dialog": GroupMonitorTelegramInfoDialog;
  }
}
