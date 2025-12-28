import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators";

import "@ha/components/ha-card";
import "@ha/components/ha-menu-button";
import "@ha/components/ha-navigation-list";
import "@ha/panels/config/ha-config-section";
import "@ha/components/ha-top-app-bar-fixed";
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
    return html`
      <ha-top-app-bar-fixed .narrow=${this.narrow}>
        <ha-menu-button
          slot="navigationIcon"
          .hass=${this.hass}
          .narrow=${this.narrow}
        ></ha-menu-button>
        <div slot="title">KNX</div>
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
      </ha-top-app-bar-fixed>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
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
