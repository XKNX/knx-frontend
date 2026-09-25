import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators";

import { KnxStatusView } from "./status_view";

/**
 * Not-found page of the KNX panel, rendered by the routers for paths they
 * have no route for (see `KnxRouter._beforeRender`).
 *
 * The bus scene tells the story: group address 4/0/4 has no receivers. The
 * texts say it plainly, and the path that led here is shown as detail so
 * the user can spot a typo or a stale link.
 */
@customElement("knx-not-found")
export class KnxNotFound extends KnxStatusView {
  /** Path that led here, set by the router before it rewrote the URL. */
  @property({ attribute: false }) public requestedPath?: string;

  protected render(): TemplateResult {
    return html`
      <knx-status-page
        .hass=${this.hass}
        .narrow=${this.narrow}
        header="KNX"
        headline="4/0/4"
        variant="not-found"
        .eyebrow=${this.hass.localize("panel.notfound")}
        .description=${this.knx.localize("not_found_description")}
        .rateUnit=${this.knx.localize("status_rate_unit")}
        .detailLabel=${this.knx.localize("not_found_requested_path")}
        .detail=${this.requestedPath}
      >
        <ha-button appearance="filled" size="s" @click=${this._goBack}>
          ${this.hass.localize("ui.common.back")}
        </ha-button>
        <ha-button appearance="plain" size="s" @click=${this._goToDashboard}>
          ${this.knx.localize("status_go_to_dashboard")}
        </ha-button>
      </knx-status-page>
    `;
  }

  static styles: CSSResultGroup = [
    KnxStatusView.styles,
    css`
      :host {
        /* the headline is a group address, so it reads like one - and big */
        --knx-status-page-headline-font: var(--ha-font-family-code, monospace);
        --knx-status-page-headline-size: clamp(40px, 10vw, 64px);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-not-found": KnxNotFound;
  }
}
