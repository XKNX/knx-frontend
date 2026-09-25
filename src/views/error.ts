import type { TemplateResult } from "lit";
import { html } from "lit";
import { customElement } from "lit/decorators";

import { navigate } from "@ha/common/navigate";
import { mainWindow } from "@ha/common/dom/get_main_window";

import { KnxStatusView } from "./status_view";

/** Issue tracker of the KNX integration, where backend errors belong. */
const ISSUES_URL = "https://github.com/XKNX/knx-integration/issues";

/**
 * Error page of the KNX panel, reached through `navigateToError` when a
 * backend call fails.
 *
 * The history state carries the error message, shown as copyable detail, and
 * the path of the page where the call failed: "Try again" returns there so
 * the user can redo the action. Without that path, e.g. after a reload, it
 * is a plain step back. The bus scene tells the story of rejected telegrams.
 */
@customElement("knx-error")
export class KNXError extends KnxStatusView {
  protected render(): TemplateResult {
    const message =
      mainWindow.history.state?.message ?? this.hass.localize("ui.common.unknown_error");
    return html`
      <knx-status-page
        .hass=${this.hass}
        .narrow=${this.narrow}
        header="KNX"
        variant="error"
        .eyebrow=${this.knx.localize("error_eyebrow")}
        .rateUnit=${this.knx.localize("status_rate_unit")}
        .headline=${this.knx.localize("error_headline")}
        .description=${this.knx.localize("error_description")}
        .detailLabel=${this.knx.localize("error_message")}
        .detail=${message}
        copyable
      >
        <ha-button appearance="filled" size="s" @click=${this._retry}>
          ${this.knx.localize("status_try_again")}
        </ha-button>
        <ha-button appearance="plain" size="s" @click=${this._goToDashboard}>
          ${this.knx.localize("status_go_to_dashboard")}
        </ha-button>
        <ha-button appearance="plain" size="s" href=${ISSUES_URL} target="_blank" rel="noreferrer">
          ${this.knx.localize("error_report")}
        </ha-button>
      </knx-status-page>
    `;
  }

  private _retry(): void {
    const retryPath: string | undefined = mainWindow.history.state?.retryPath;
    if (retryPath) {
      navigate(retryPath, { replace: true });
    } else {
      this._goBack();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-error": KNXError;
  }
}
