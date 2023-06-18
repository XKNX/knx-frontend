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

  @property() private _telegram?: KNXTelegram;

  @property() private _index?: number;

  @property() private _previous?: (prevIndex: number) => TelegramInfoDialogParams;

  @property() private _next?: (prevIndex: number) => TelegramInfoDialogParams;

  public showDialog(params: TelegramInfoDialogParams) {
    logger.debug("showDialog", params);
    this._updateDialog(params);
    if (this._telegram == null || this._index == null) {
      this.closeDialog();
      return;
    }
    logger.debug("showDialog - showing dialog", this._index);
  }

  private _updateDialog(params: TelegramInfoDialogParams) {
    this._telegram = params.telegram;
    this._index = params.index;
    this._previous = params.previous;
    this._next = params.next;
  }

  public closeDialog() {
    logger.debug("closeDialog");
    this._telegram = undefined;
    this._index = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    logger.debug("render info dialog", this._index);
    if (this._telegram == null) {
      this.closeDialog();
      return nothing;
    }
    return html`<ha-dialog
      open
      @closed=${this.closeDialog}
      .heading=${createCloseHeading(this.hass, "Telegram " + this._index)}
    >
      <div class="content">
        <div>Source address ${this._telegram.source_address}</div>
        <div>Source text ${this._telegram.source_text}</div>
        <div>Destination address ${this._telegram.destination_address}</div>
        <div>Destination text ${this._telegram.destination_text}</div>
      </div>
      <mwc-button
        slot="secondaryAction"
        @click=${this._previousTelegram}
        .disabled=${this._previous === undefined}
      >
        ${this.hass.localize("ui.common.previous")}
      </mwc-button>
      <mwc-button
        slot="primaryAction"
        @click=${this._nextTelegram}
        .disabled=${this._next === undefined}
      >
        ${this.hass.localize("ui.common.next")}
      </mwc-button>
    </ha-dialog>`;
  }

  private _nextTelegram() {
    if (this._next === undefined) {
      return;
    }
    const params = this._next(this._index!);
    this._updateDialog(params);
  }

  private _previousTelegram() {
    if (this._previous === undefined) {
      return;
    }
    const params = this._previous(this._index!);
    this._updateDialog(params);
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
