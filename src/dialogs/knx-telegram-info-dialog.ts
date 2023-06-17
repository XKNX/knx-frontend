import { LitElement, nothing, html, css } from "lit";
import { customElement, state, property } from "lit/decorators";

import { fireEvent } from "@ha/common/dom/fire_event";
import { haStyleDialog } from "@ha/resources/styles";
import { ShowDialogParams } from "@ha/dialogs/make-dialog-manager";
import { HomeAssistant } from "@ha/types";

import type { TelegramInfoDialogParams } from "./show-knx-dialog";
import { KNXLogger } from "../tools/knx-logger";
import { HaDialog } from "@ha/components/ha-dialog";
import { HaDialogHeader } from "@ha/components/ha-dialog-header";

const logger = new KNXLogger("knx-telegram-info-dialog");

@customElement("knx-telegram-info-dialog")
class TelegramInfoDialog extends LitElement {
  public hass!: HomeAssistant;

  @state() private _rowId?: number | null = null;

  public showDialog(params: TelegramInfoDialogParams) {
    logger.debug("showDialog", params);
    this._rowId = params.rowId;
    if (this._rowId === null) {
      this.closeDialog();
      return;
    }
    logger.debug("showDialog - showing dialog", this._rowId);
  }

  public closeDialog() {
    logger.debug("closeDialog");
    this._rowId = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    logger.debug("render info dialog", this._rowId);
    if (this._rowId == null) {
      return nothing;
    }
    return html`<ha-dialog
        open
        scrimClickAction
        heading="Test"
      >
        <ha-dialog-header slot="heading">
          <ha-icon-button
            slot="navigationIcon"
            dialogAction="cancel"
            .label=${this.hass.localize("ui.common.close")}
          ></ha-icon-button>
          <span slot="title">Test</span>
        </ha-dialog-header>
        <div class="content">
          <div class="element-preview">
          </div>
        </div>
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
          /* This is needed for the tooltip of the history charts to be positioned correctly */
          --dialog-surface-position: static;
          --dialog-content-position: static;
          --dialog-content-padding: 0;
          --dialog-z-index: 20;
          --chart-base-position: static;
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
