import "@material/mwc-button/mwc-button";
import { LitElement, nothing, html, css } from "lit";
import { customElement, property } from "lit/decorators";

import { fireEvent } from "@ha/common/dom/fire_event";
import { haStyleDialog } from "@ha/resources/styles";
import type { HomeAssistant } from "@ha/types";
import { createCloseHeading } from "@ha/components/ha-dialog";

import type { KNX } from "../types/knx";
import type { TelegramDict } from "../types/websocket";
import { TelegramDictFormatter } from "../utils/format";

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

  @property({ attribute: false }) public knx!: KNX;

  @property({ attribute: false }) public index?: number;

  @property({ attribute: false }) public telegram?: TelegramDict;

  @property({ attribute: false }) public disableNext = false;

  @property({ attribute: false }) public disablePrevious = false;

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
      .heading=${createCloseHeading(
        this.hass,
        this.knx.localize("group_monitor_telegram") + " " + this.index,
      )}
    >
      <div class="content">
        <div class="row">
          <div>${TelegramDictFormatter.dateWithMilliseconds(this.telegram)}</div>
          <div>${this.knx.localize(this.telegram.direction)}</div>
        </div>
        <div class="section">
          <h4>${this.knx.localize("group_monitor_source")}</h4>
          <div class="row-inline">
            <div>${this.telegram.source}</div>
            <div>${this.telegram.source_name}</div>
          </div>
        </div>
        <div class="section">
          <h4>${this.knx.localize("group_monitor_destination")}</h4>
          <div class="row-inline">
            <div>${this.telegram.destination}</div>
            <div>${this.telegram.destination_name}</div>
          </div>
        </div>
        <div class="section">
          <h4>${this.knx.localize("group_monitor_message")}</h4>
          <div class="row">
            <div>${this.telegram.telegramtype}</div>
            <div><code>${TelegramDictFormatter.dptNameNumber(this.telegram)}</code></div>
          </div>
          ${this.telegram.payload != null
            ? html` <div class="row">
                <div>${this.knx.localize("group_monitor_payload")}</div>
                <div><code>${TelegramDictFormatter.payload(this.telegram)}</code></div>
              </div>`
            : nothing}
          ${this.telegram.value != null
            ? html` <div class="row">
                <div>${this.knx.localize("group_monitor_value")}</div>
                <pre><code>${TelegramDictFormatter.valueWithUnit(this.telegram)}</code></pre>
              </div>`
            : nothing}
        </div>
      </div>
      <mwc-button
        slot="secondaryAction"
        @click=${this._previousTelegram}
        .disabled=${this.disablePrevious}
      >
        ${this.hass.localize("ui.common.previous")}
      </mwc-button>
      <mwc-button slot="primaryAction" @click=${this._nextTelegram} .disabled=${this.disableNext}>
        ${this.hass.localize("ui.common.next")}
      </mwc-button>
    </ha-dialog>`;
  }

  private _nextTelegram() {
    fireEvent(this, "next-telegram");
  }

  private _previousTelegram() {
    fireEvent(this, "previous-telegram");
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
          }
        }
        @media all and (min-width: 600px) and (min-height: 501px) {
          /* Set the dialog to a fixed size, so it doesnt jump when the content changes size */
          ha-dialog {
            --mdc-dialog-min-width: 580px;
            --mdc-dialog-max-width: 580px;
            --mdc-dialog-min-height: 70%;
            --mdc-dialog-max-height: 70%;
          }
        }

        .content {
          display: flex;
          flex-direction: column;
          outline: none;
          flex: 1;
        }

        h4 {
          margin-top: 24px;
          margin-bottom: 12px;
          border-bottom: 1px solid var(--divider-color);
          color: var(--secondary-text-color);
        }

        .section > div {
          margin-bottom: 12px;
        }
        .row {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          flex-wrap: wrap;
        }

        .row-inline {
          display: flex;
          flex-direction: row;
          gap: 10px;
        }

        pre {
          margin-top: 0;
          margin-bottom: 0;
        }

        mwc-button {
          user-select: none;
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
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
