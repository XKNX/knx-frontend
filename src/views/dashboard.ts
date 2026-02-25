import { mdiCogOutline, mdiLanConnect, mdiFileImportOutline, mdiClockOutline } from "@mdi/js";
import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";
import { map } from "lit/directives/map";
import { SubscribeMixin } from "@ha/mixins/subscribe-mixin";

import { fireEvent } from "@ha/common/dom/fire_event";
import "@ha/components/ha-card";
import "@ha/components/ha-md-list";
import "@ha/components/ha-md-list-item";
import "@ha/components/ha-navigation-list";
import { fetchIntegrationManifest } from "@ha/data/integration";
import "@ha/layouts/hass-subpage";
import "@ha/panels/config/ha-config-section";
import { showConfigFlowDialog } from "@ha/dialogs/config-flow/show-dialog-config-flow";
import { showOptionsFlowDialog } from "@ha/dialogs/config-flow/show-dialog-options-flow";
import { subscribeConfigEntries } from "@ha/data/config_entries";
import type { HomeAssistant } from "@ha/types";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";

import { showKnxProjectUploadDialog } from "../dialogs/show-knx-project-upload-dialog";
import { showKnxTimeServerDialog } from "../dialogs/show-knx-time-server-dialog";
import type { KnxPageNavigation } from "../types/navigation";
import type { KNX } from "../types/knx";
import { knxMainTabs } from "../knx-router";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("knx-dashboard");

@customElement("knx-dashboard")
export class KnxDashboard extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @state() private _configEntryState = "unknown";

  protected hassSubscribe(): UnsubscribeFunc[] {
    return [this._unsubscribeConfigEntries()];
  }

  private _unsubscribeConfigEntries() {
    // SubscribeMixin checks `instanceof Promise` when unsubscribing, but that doesn't
    // work always work properly across realm boundaries, so we wrap the async unsubscribe
    const _async_unsub = subscribeConfigEntries(
      this.hass,
      async (updates) => {
        const newState = updates.find((update) => update.entry.domain === "knx")?.entry.state;
        if (newState && newState !== this._configEntryState) {
          logger.debug("KNX dashboard config entry state update", newState);
          this._configEntryState = newState;
        }
      },
      { domain: "knx" },
    );
    return () => {
      _async_unsub.then((unsub) => unsub());
    };
  }

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
      iconColor: "var(--purple-color)",
      click: this._openOptionFlow,
      validConfigEntryStates: new Set(["loaded"]),
    },
    {
      translationKey: "component.knx.config_panel.dashboard.time_server",
      click: this._openTimeServerDialog,
      iconPath: mdiClockOutline,
      iconColor: "var(--blue-color)",
      validConfigEntryStates: new Set(["loaded"]),
    },
    {
      translationKey: "component.knx.config_panel.dashboard.project_upload",
      click: this._openProjectUploadDialog,
      iconPath: mdiFileImportOutline,
      iconColor: "var(--teal-color)",
      validConfigEntryStates: new Set(["loaded"]),
    },
    {
      translationKey: "component.knx.config_panel.dashboard.connection_flow",
      iconPath: mdiLanConnect,
      iconColor: "var(--green-color)",
      click: this._openReconfigureFlow,
      validConfigEntryStates: new Set(["loaded", "not_loaded"]),
    },
  ];

  private async _openOptionFlow() {
    showOptionsFlowDialog(this, this.knx.config_entry);
  }

  private _openProjectUploadDialog() {
    showKnxProjectUploadDialog(this);
  }

  private _openTimeServerDialog() {
    showKnxTimeServerDialog(this);
  }

  private async _openReconfigureFlow() {
    showConfigFlowDialog(this, {
      startFlowHandler: this.knx.config_entry.domain,
      showAdvanced: this.hass.userData?.showAdvanced,
      manifest: await fetchIntegrationManifest(this.hass, this.knx.config_entry.domain),
      entryId: this.knx.config_entry.entry_id,
      dialogClosedCallback: (params) => {
        if (params?.flowFinished) {
          fireEvent(this, "knx-reload");
        }
      },
    });
  }

  protected render() {
    return html`
      <hass-subpage .narrow=${this.narrow} .hass=${this.hass} header="KNX" back-path="/config">
        <ha-config-section .isWide=${this.isWide}>
          <ha-card outlined>
            <ha-navigation-list
              .hass=${this.hass}
              .narrow=${this.narrow}
              .pages=${this._getPages()}
              has-secondary
            ></ha-navigation-list>
          </ha-card>
          <ha-card outlined>
            <ha-md-list has-secondary>
              ${map(
                this._buttonItems,
                (item) =>
                  html` <ha-md-list-item
                    type="button"
                    @click=${item.click}
                    ?disabled=${!item.validConfigEntryStates.has(this._configEntryState)}
                  >
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
