import { css, html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators";

import "@ha/components/ha-bottom-sheet";
import "@ha/components/ha-dialog-header";

import { DialogMixin } from "@ha/dialogs/dialog-mixin";
import type { HomeAssistant } from "@ha/types";

import type { KNX } from "../types/knx";
import type { KnxReadResponse } from "../types/websocket";
import { TelegramDictFormatter } from "../utils/format";

/** How long the sheet stays open before it dismisses itself. */
export const READ_RESPONSE_DISMISS_MS = 10000;

export interface KnxReadResponseDialogParams {
  hass: HomeAssistant;
  knx: KNX;
  address: string;
  response: KnxReadResponse;
}

/**
 * Bottom sheet showing the answer to a read request sent from the send dialog.
 * Dismissed by tapping outside, swiping down, or on its own after a while.
 */
@customElement("knx-read-response-dialog")
export class KnxReadResponseDialog extends DialogMixin<KnxReadResponseDialogParams>(LitElement) {
  private _dismissTimer?: ReturnType<typeof setTimeout>;

  public connectedCallback() {
    super.connectedCallback();
    this._dismissTimer = setTimeout(() => this.closeDialog(), READ_RESPONSE_DISMISS_MS);
  }

  public disconnectedCallback() {
    clearTimeout(this._dismissTimer);
    super.disconnectedCallback();
  }

  protected render() {
    if (!this.params) {
      return nothing;
    }
    const { knx, address, response } = this.params;
    const localize = (key: string) =>
      knx.localize(`component.knx.config_panel.dialogs.${key}` as const);
    const value = TelegramDictFormatter.valueWithUnit(response);
    const dpt = TelegramDictFormatter.dptNameNumber(response);

    return html`
      <ha-bottom-sheet open @closed=${this.closeDialog}>
        <ha-dialog-header slot="header">
          <span slot="title">${localize("read_response.title")}</span>
          <span slot="subtitle">${address}</span>
        </ha-dialog-header>
        <div class="value">
          <div class="label">${localize("telegram_info.value")}</div>
          <div class="content">${value || "—"}</div>
        </div>
        <div class="details">
          <div class="label">${localize("telegram_info.source")}</div>
          <div>
            ${response.source}
            ${response.source_name ? html`<span class="name">${response.source_name}</span>` : nothing}
          </div>
          ${
            dpt
              ? html`
                  <div class="label">${knx.localize("component.knx.config_panel.common.dpt")}</div>
                  <div>${dpt}</div>
                `
              : nothing
          }
          <div class="label">${localize("telegram_info.payload")}</div>
          <code>${TelegramDictFormatter.payload(response)}</code>
        </div>
      </ha-bottom-sheet>
    `;
  }

  static styles = css`
    .value {
      padding: 0 0 16px;
    }
    .value .content {
      font-size: var(--ha-font-size-2xl, 24px);
      font-weight: var(--ha-font-weight-medium, 500);
      line-height: var(--ha-line-height-condensed, 1.2);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .details {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 4px 16px;
      align-items: baseline;
    }
    .label {
      font-size: var(--ha-font-size-s, 12px);
      color: var(--secondary-text-color);
    }
    .name {
      margin-left: 8px;
      color: var(--secondary-text-color);
    }
    code {
      font-family: var(--ha-font-family-code, monospace);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-read-response-dialog": KnxReadResponseDialog;
  }
}
