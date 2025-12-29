import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators";
import { map } from "lit/directives/map";
import { mdiCogOutline } from "@mdi/js";

import "@ha/components/ha-card";
import "@ha/components/ha-md-list";
import "@ha/components/ha-md-list-item";
import "@ha/components/ha-navigation-list";
import "@ha/layouts/hass-subpage";
import "@ha/panels/config/ha-config-section";
import { showOptionsFlowDialog } from "@ha/dialogs/config-flow/show-dialog-options-flow";
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

  private _buttonItems = [
    {
      translationKey: "component.knx.config_panel.dashboard.options_flow",
      iconPath: mdiCogOutline,
      iconColor: "var(--indigo-color)",
      click: this._openOptionFlow,
    },
  ];

  private async _openOptionFlow() {
    showOptionsFlowDialog(this, this.knx.config_entry);
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
          <ha-card outlined>
            <ha-md-list .hass=${this.hass} .narrow=${this.narrow} has-secondary>
              ${map(
                this._buttonItems,
                (item) =>
                  html` <ha-md-list-item type="button" @click=${item.click}>
                    <div
                      slot="start"
                      class="icon-background"
                      .style=${`background-color: ${item.iconColor}`}
                    >
                      <ha-svg-icon .path=${item.iconPath}></ha-svg-icon>
                    </div>
                    <span slot="headline"
                      >${this.hass.localize(`${item.translationKey}.title`)}</span
                    >
                    <span slot="supporting-text"
                      >${this.hass.localize(`${item.translationKey}.description`)}</span
                    >
                  </ha-md-list-item>`,
              )}
            </ha-md-list>
          </ha-card>
        </ha-config-section>
      </hass-subpage>
    `;
  }

  static styles = css`
    ha-card {
      overflow: hidden;
    }
    ha-svg-icon {
      color: var(--secondary-text-color);
      height: 24px;
      width: 24px;
      display: block;
      padding: 8px;
    }
    .icon-background {
      border-radius: var(--ha-border-radius-circle);
    }
    .icon-background ha-svg-icon {
      color: #fff;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-dashboard": KnxDashboard;
  }
}
