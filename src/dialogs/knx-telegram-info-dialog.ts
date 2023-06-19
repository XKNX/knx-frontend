import "@material/mwc-button/mwc-button";
import { LitElement, nothing, html, css } from "lit";
import { customElement, property } from "lit/decorators";

import { fireEvent } from "@ha/common/dom/fire_event";
import { haStyleDialog } from "@ha/resources/styles";
import { HomeAssistant } from "@ha/types";

import { HaDialog, createCloseHeading } from "@ha/components/ha-dialog";
import { HaDialogHeader } from "@ha/components/ha-dialog-header";
import { KNXTelegram } from "../types/websocket";

declare global {
  // for fire event
  interface HASSDomEvents {
    "next-telegram": undefined;
    "previous-telegram": undefined;
    "dialog-close": undefined;
  }
}

@customElement("knx-telegram-info-dialog")
class TelegramInfoDialog extends LitElement {
  public hass!: HomeAssistant;

  @property() public index?: number;

  @property() public telegram?: KNXTelegram;

  @property() public disableNext = false;

  @property() public disablePrevious = false;

  public closeDialog() {
    this.telegram = undefined;
    this.index = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName }, { bubbles: false });
  }

  protected render() {
    if (this.telegram == null) {
      this.closeDialog();
      return nothing;
    }
    return html`<ha-dialog
      open
      @closed=${this.closeDialog}
      .heading=${createCloseHeading(this.hass, "Telegram " + this.index)}
    >
      <div class="content">
        <div>Source address ${this.telegram.source_address}</div>
        <div>Source text ${this.telegram.source_text}</div>
        <div>Destination address ${this.telegram.destination_address}</div>
        <div>Destination text ${this.telegram.destination_text}</div>
      </div>
      <mwc-button
        slot="secondaryAction"
        @click=${this.previousTelegram}
        .disabled=${this.disablePrevious}
      >
        ${this.hass.localize("ui.common.previous")}
      </mwc-button>
      <mwc-button slot="primaryAction" @click=${this.nextTelegram} .disabled=${this.disableNext}>
        ${this.hass.localize("ui.common.next")}
      </mwc-button>
    </ha-dialog>`;
  }

  private nextTelegram() {
    fireEvent(this, "next-telegram");
  }

  private previousTelegram() {
    fireEvent(this, "previous-telegram");
  }

  static get styles() {
    return [
      haStyleDialog,
      HaDialog.styles,
      HaDialogHeader.styles,
      css`
        ha-dialog {
          /* Set the top top of the dialog to a fixed position, so it doesnt jump when the content changes size */
          --vertical-align-dialog: flex-start;
          --dialog-surface-margin-top: 40px;
          --dialog-z-index: 20;
        }

        .content {
          display: flex;
          flex-direction: column;
          outline: none;
          flex: 1;
        }

        .child-view {
          display: flex;
          flex-direction: column;
          flex: 1;
        }

        ha-more-info-history-and-logbook {
          padding: 8px 24px 24px 24px;
          display: block;
        }

        @media all and (max-width: 450px), all and (max-height: 500px) {
          /* When in fullscreen dialog should be attached to top */
          ha-dialog {
            --dialog-surface-margin-top: 0px;
          }
        }

        @media all and (min-width: 600px) and (min-height: 501px) {
          ha-dialog {
            --mdc-dialog-min-width: 580px;
            --mdc-dialog-max-width: 580px;
            --mdc-dialog-max-height: calc(100% - 72px);
          }

          .main-title {
            cursor: default;
          }

          :host([large]) ha-dialog {
            --mdc-dialog-min-width: 90vw;
            --mdc-dialog-max-width: 90vw;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-telegram-info-dialog": TelegramInfoDialog;
  }
}
