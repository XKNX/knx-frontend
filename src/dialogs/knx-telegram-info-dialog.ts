import "@material/mwc-button/mwc-button";
import { LitElement, nothing, html, css } from "lit";
import { customElement, state, property } from "lit/decorators";

import { fireEvent } from "@ha/common/dom/fire_event";
import { haStyleDialog } from "@ha/resources/styles";
import { ShowDialogParams } from "@ha/dialogs/make-dialog-manager";
import { HomeAssistant } from "@ha/types";

import type { TelegramInfoDialogParams } from "./show-knx-dialog";
import { KNXLogger } from "../tools/knx-logger";
import { KNXTelegram } from "../types/websocket";
import { HaDialog, createCloseHeading } from "@ha/components/ha-dialog";
import { HaDialogHeader } from "@ha/components/ha-dialog-header";

const logger = new KNXLogger("knx-telegram-info-dialog");

@customElement("knx-telegram-info-dialog")
class TelegramInfoDialog extends LitElement {
  public hass!: HomeAssistant;

  @state() private _params?: TelegramInfoDialogParams;

  public showDialog(params: TelegramInfoDialogParams) {
    logger.debug("showDialog", params);
    this._params = params;
    if (this._params == null) {
      this.closeDialog();
      return;
    }
    logger.debug("showDialog - showing dialog", this._params.index);
  }

  public closeDialog() {
    logger.debug("closeDialog");
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    logger.debug("render info dialog", this._params?.index);
    if (this._params == null) {
      return nothing;
    }
    return html`<ha-dialog
      open
      @closed=${this.closeDialog}
      .heading=${createCloseHeading(this.hass, "Telegram " + this._params.index)}
    >
      <div class="content">
        <div>Source address ${this._params.telegram.source_address}</div>
        <div>Source text ${this._params.telegram.source_text}</div>
        <div>Destination address ${this._params.telegram.destination_address}</div>
        <div>Destination text ${this._params.telegram.destination_text}</div>
      </div>
      <mwc-button
        slot="secondaryAction"
        @click=${this._params.previous}
        .disabled=${this._params.previous == null}
      >
        ${this.hass.localize("ui.common.previous")}
      </mwc-button>
      <mwc-button
        slot="primaryAction"
        @click=${this._params.next}
        .disabled=${this._params.next == null}
      >
        ${this.hass.localize("ui.common.next")}
      </mwc-button>
    </ha-dialog>`;
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
