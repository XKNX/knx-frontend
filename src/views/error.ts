import { html, LitElement, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators";

import { mainWindow } from "@ha/common/dom/get_main_window";
import "@ha/layouts/hass-tabs-subpage";
import "@ha/layouts/hass-error-screen";

import type { PageNavigation } from "@ha/layouts/hass-tabs-subpage";
import type { HomeAssistant, Route } from "@ha/types";

import type { KNX } from "../types/knx";

@customElement("knx-error")
export class KNXError extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: Object }) public route?: Route;

  @property({ type: Array, reflect: false }) public tabs!: PageNavigation[];

  protected render(): TemplateResult | void {
    const error = mainWindow.history.state?.message ?? "Unknown error";
    return html`
      <hass-error-screen
        .hass=${this.hass}
        .error=${error}
        .toolbar=${true}
        .rootnav=${false}
        .narrow=${this.narrow}
      ></hass-error-screen>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-error": KNXError;
  }
}
