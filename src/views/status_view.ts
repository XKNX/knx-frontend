import type { CSSResultGroup } from "lit";
import { css, LitElement } from "lit";
import { property } from "lit/decorators";

import "@ha/components/ha-button";
import { goBack, navigate } from "@ha/common/navigate";
import type { HomeAssistant, Route } from "@ha/types";

import "../components/knx-status-page";
import { BASE_URL } from "../knx-router";
import type { KNX } from "../types/knx";

/**
 * Base of the panel's full-page status views (not found, error).
 *
 * A status view renders a `knx-status-page` with its texts and actions. This
 * base carries what every view gets from the router and the two navigation
 * actions the status pages share: a step back and the panel dashboard.
 */
export abstract class KnxStatusView extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route?: Route;

  /** One step back; when there is no history of our own, the dashboard. */
  protected _goBack(): void {
    goBack(BASE_URL);
  }

  protected _goToDashboard(): void {
    navigate(BASE_URL);
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
      height: 100%;
    }
  `;
}
