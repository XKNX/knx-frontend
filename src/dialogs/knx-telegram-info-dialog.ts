import "@material/mwc-button/mwc-button";
import { LitElement, nothing, html, css } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "@ha/common/dom/fire_event";
import { haStyleDialog } from "@ha/resources/styles";
import type { HomeAssistant } from "@ha/types";
import "@ha/components/ha-svg-icon";
import "../components/knx-dialog-header";
import { mdiArrowLeft, mdiArrowRight, mdiClose } from "@mdi/js";

import { formatDateTimeWithMilliseconds } from "utils/format";
import type { KNX } from "../types/knx";
import type { TelegramRow } from "../types/telegram-row";
import "@ha/components/ha-relative-time";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-dialog";

/**
 * Custom dialog to display detailed information about a single KNX telegram.
 */
@customElement("knx-telegram-info-dialog")
class TelegramInfoDialog extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ attribute: false }) public telegram?: TelegramRow;

  @property({ attribute: false }) public disableNext = false;

  @property({ attribute: false }) public disablePrevious = false;

  /**
   * Add keyboard event listener when component is connected to DOM
   */
  connectedCallback(): void {
    super.connectedCallback();
    this._handleKeyDown = this._handleKeyDown.bind(this);
    document.addEventListener("keydown", this._handleKeyDown);
  }

  /**
   * Remove keyboard event listener when component is disconnected from DOM
   */
  disconnectedCallback(): void {
    document.removeEventListener("keydown", this._handleKeyDown);
    super.disconnectedCallback();
  }

  /**
   * Close the dialog and reset properties.
   */
  public closeDialog(): void {
    this.telegram = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName }, { bubbles: false });
  }

  /**
   * Render the dialog contents.
   */
  /**
   * Determine if content is scrolled to show border on header
   */
  private _checkScrolled(e: Event): void {
    const target = e.target as HTMLDivElement;
    const header = this.shadowRoot?.querySelector("knx-dialog-header");
    if (header && target.scrollTop > 0) {
      header.showBorder = true;
    } else if (header) {
      header.showBorder = false;
    }
  }

  protected render() {
    if (!this.telegram) {
      this.closeDialog();
      return nothing;
    }

    const isOutgoing = this.telegram.direction === "Outgoing";
    const directionClass = isOutgoing ? "outgoing" : "incoming";

    return html`
      <ha-dialog open @closed=${this.closeDialog} .heading=${"Header"}>
        <knx-dialog-header slot="heading" .showBorder=${true}>
          <ha-icon-button
            slot="navigationIcon"
            .label=${this.hass.localize("ui.dialogs.generic.close")}
            .path=${mdiClose}
            dialogAction="close"
            class="close-button"
          ></ha-icon-button>
          <div slot="title" class="header-title">
            ${this.knx.localize("knx_telegram_info_dialog_telegram")}
          </div>
          <div slot="subtitle">
            ${formatDateTimeWithMilliseconds(this.telegram.timestamp) + " "} (<ha-relative-time
              .hass=${this.hass}
              .datetime=${this.telegram.timestamp}
              .capitalize=${false}
            ></ha-relative-time
            >)
          </div>
          <div slot="actionItems" class="direction-badge ${directionClass}">
            ${this.knx.localize(this.telegram.direction)}
          </div>
        </knx-dialog-header>
        <div class="content" @scroll=${this._checkScrolled}>
          <!-- Body: addresses + value + details -->
          <div class="telegram-body">
            <div class="addresses-row">
              <div class="address-item">
                <div class="item-label">
                  ${this.knx.localize("knx_telegram_info_dialog_source")}
                </div>
                <div class="address-chip">${this.telegram.sourceAddress}</div>
                ${this.telegram.sourceText
                  ? html`<div class="item-name">${this.telegram.sourceText}</div>`
                  : nothing}
              </div>
              <div class="address-item">
                <div class="item-label">
                  ${this.knx.localize("knx_telegram_info_dialog_destination")}
                </div>
                <div class="address-chip">${this.telegram.destinationAddress}</div>
                ${this.telegram.destinationText
                  ? html`<div class="item-name">${this.telegram.destinationText}</div>`
                  : nothing}
              </div>
            </div>

            ${this.telegram.value != null
              ? html`
                  <div class="value-section">
                    <div class="value-label">
                      ${this.knx.localize("knx_telegram_info_dialog_value")}
                    </div>
                    <div class="value-content">${this.telegram.value}</div>
                  </div>
                `
              : nothing}

            <div class="telegram-details">
              <div class="detail-grid">
                <div class="detail-item">
                  <div class="detail-label">
                    ${this.knx.localize("knx_telegram_info_dialog_type")}
                  </div>
                  <div class="detail-value">${this.telegram.type}</div>
                </div>
                <div class="detail-item">
                  <div class="detail-label">DPT</div>
                  <div class="detail-value">${this.telegram.dpt || ""}</div>
                </div>
                ${this.telegram.payload != null
                  ? html`
                      <div class="detail-item payload">
                        <div class="detail-label">
                          ${this.knx.localize("knx_telegram_info_dialog_payload")}
                        </div>
                        <code>${this.telegram.payload}</code>
                      </div>
                    `
                  : nothing}
              </div>
            </div>
          </div>
        </div>

        <!-- Navigation buttons: previous / next -->
        <div slot="secondaryAction" style="margin: 0;">
          <mwc-button
            class="nav-button"
            @click=${this._previousTelegram}
            .disabled=${this.disablePrevious}
          >
            <ha-svg-icon .path=${mdiArrowLeft}></ha-svg-icon>
            ${this.hass.localize("ui.common.previous")}
          </mwc-button>
        </div>
        <div slot="primaryAction">
          <mwc-button class="nav-button" @click=${this._nextTelegram} .disabled=${this.disableNext}>
            ${this.hass.localize("ui.common.next")}
            <ha-svg-icon .path=${mdiArrowRight}></ha-svg-icon>
          </mwc-button>
        </div>
      </ha-dialog>
    `;
  }

  private _nextTelegram() {
    fireEvent(this, "next-telegram", undefined, { bubbles: true });
  }

  private _previousTelegram() {
    fireEvent(this, "previous-telegram", undefined, { bubbles: true });
  }

  /**
   * Handle keyboard events for navigation
   * @param event Keyboard event
   */
  private _handleKeyDown(event: KeyboardEvent): void {
    // Only process keyboard events when dialog is open
    if (!this.telegram) {
      return;
    }

    // Prevent default behavior for arrow keys to avoid scrolling
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        if (!this.disablePrevious) {
          event.preventDefault();
          this._previousTelegram();
        }
        break;
      case "ArrowRight":
      case "ArrowUp":
        if (!this.disableNext) {
          event.preventDefault();
          this._nextTelegram();
        }
        break;
      default:
        // Do nothing for other keys
        break;
    }
  }

  static get styles() {
    return [
      haStyleDialog,
      css`
        ha-dialog {
          --vertical-align-dialog: center;
          --dialog-z-index: 20;
        }
        @media all and (max-width: 450px), all and (max-height: 500px) {
          /* When in fullscreen dialog should be attached to top */
          ha-dialog {
            --dialog-surface-margin-top: 0px;
            --dialog-content-padding: 16px 24px 16px 24px;
          }
        }
        @media all and (min-width: 600px) and (min-height: 501px) {
          /* Set the dialog width and min-height, but let height adapt to content */
          ha-dialog {
            --mdc-dialog-min-width: 580px;
            --mdc-dialog-max-width: 580px;
            --mdc-dialog-min-height: 70%;
            --mdc-dialog-max-height: 100%;
            --dialog-content-padding: 16px 24px 16px 24px;
          }
        }

        /* Custom heading styles */
        .custom-heading {
          display: flex;
          flex-direction: row;
          padding: 16px 24px 12px 16px;
          border-bottom: 1px solid var(--divider-color);
          align-items: center;
          gap: 12px;
        }
        .heading-content {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .header-title {
          margin: 0;
          font-size: 18px;
          font-weight: 500;
          line-height: 1.3;
          color: var(--primary-text-color);
        }
        .close-button {
          color: var(--primary-text-color);
          margin-right: -8px;
        }

        /* General content styling */
        .content {
          display: flex;
          flex-direction: column;
          flex: 1;
          gap: 16px;
          outline: none;
        }

        /* Timestamp style */
        .timestamp {
          font-size: 13px;
          color: var(--secondary-text-color);
          margin-top: 2px;
        }
        .direction-badge {
          font-size: 12px;
          font-weight: 500;
          padding: 3px 10px;
          border-radius: 12px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          white-space: nowrap;
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
          font-style: italic;
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

        /* Navigation buttons */
        .nav-button {
          --mdc-theme-primary: var(--primary-color);
          --mdc-button-disabled-ink-color: var(--disabled-text-color);
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 100px;
        }
        .nav-button ha-svg-icon {
          --mdc-icon-size: 18px;
        }
      `,
    ];
  }
}

declare global {
  interface HASSDomEvents {
    "next-telegram": undefined;
    "previous-telegram": undefined;
  }

  interface HTMLElementTagNameMap {
    "knx-telegram-info-dialog": TelegramInfoDialog;
  }
}
