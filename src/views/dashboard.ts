import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators";

import "@ha/components/ha-card";
import "@ha/components/ha-navigation-list";
import "@ha/layouts/hass-subpage";
import "@ha/panels/config/ha-config-section";
import type { HomeAssistant } from "@ha/types";
import type { KnxPageNavigation } from "../types/navigation";

import type { KNX } from "../types/knx";
import { knxMainTabs } from "../knx-router";

@customElement("knx-dashboard")
export class KnxDashboard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  private _getPages(): KnxPageNavigation[] {
    return knxMainTabs(!!this.knx.projectInfo).map((page) => ({
      ...page,
      name: this.hass.localize(page.translationKey) || page.name,
      description: this.hass.localize(page.descriptionTranslationKey) || page.description,
    }));
  }

  protected render() {
    // main page for narrow layout to show menu icon instead of back button
    return html`
      <hass-subpage
        .narrow=${this.narrow}
        .hass=${this.hass}
        header="KNX"
        ?main-page=${this.narrow}
      >
        <ha-config-section .narrow=${this.narrow} .isWide=${this.isWide}>
          <ha-card outlined>
            <ha-navigation-list
              .hass=${this.hass}
              .narrow=${this.narrow}
              .pages=${this._getPages()}
              has-secondary
            ></ha-navigation-list>
          </ha-card>
        </ha-config-section>
      </hass-subpage>
    `;
  }

  static styles = css`
    ha-card {
      overflow: hidden;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-dashboard": KnxDashboard;
  }
}
