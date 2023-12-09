import { mdiPlus } from "@mdi/js";
import { LitElement, TemplateResult, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";

import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-subpage";
import "@ha/components/ha-button";
import "@ha/components/ha-card";
import "@ha/components/ha-fab";
import "@ha/components/ha-form/ha-form";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-navigation-list";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-icon-overflow-menu";
import "@ha/components/ha-selector/ha-selector";
import "@ha/components/ha-selector/ha-selector-select";
import "@ha/components/ha-settings-row";
import "@ha/panels/config/ha-config-section";
import { navigate } from "@ha/common/navigate";

import "../components/knx-project-tree-view";
import "../components/knx-configure-switch";

import { HomeAssistant, Route } from "@ha/types";
import { createEntity } from "services/websocket.service";
import { CreateEntityData } from "types/entity_data";
import { KNX } from "../types/knx";
import { platformConstants } from "../utils/common";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("knx-create-entity");

@customElement("knx-create-entity")
export class KNXCreateEntity extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Object }) public route!: Route;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: String, attribute: "back-path" }) public backPath?: string;

  @state() private _config?: CreateEntityData;

  entityPlatform?: string;

  protected firstUpdated() {
    if (!this.knx.project) {
      this.knx.loadProject().then(() => {
        this.requestUpdate();
      });
    }
  }

  protected willUpdate() {
    // const urlParams = new URLSearchParams(mainWindow.location.search);
    // const referrerGA = urlParams.get("ga");
    // console.log(referrerGA);
    this.entityPlatform = this.route.path.split("/")[1];
  }

  protected render(): TemplateResult | void {
    if (!this.hass || !this.knx.project) {
      return html` <hass-loading-screen></hass-loading-screen> `;
    }
    let content: TemplateResult;
    switch (this.entityPlatform) {
      case "switch": {
        content = this._renderSwitch();
        break;
      }
      // case "light": {
      //   content = this._renderLight();
      //   break;
      // }
      default: {
        content = this._renderTypeSelection();
      }
    }

    return content;
  }

  private _renderTypeSelection(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow!}
        .back-path=${this.backPath}
        .header=${"Select entity type"}
      >
        <ha-config-section .narrow=${this.narrow} .isWide=${false}>
          <ha-card outlined .header=${"Create KNX entity"}>
            <!-- <p>Some help text</p> -->
            <ha-navigation-list
              .hass=${this.hass}
              .narrow=${this.narrow}
              .pages=${[
                {
                  name: platformConstants.switch.name,
                  description: "Description",
                  iconPath: platformConstants.switch.iconPath,
                  iconColor: platformConstants.switch.color,
                  path: "/knx/entities/create/switch",
                },
                {
                  name: platformConstants.light.name,
                  description: "Description",
                  iconPath: platformConstants.light.iconPath,
                  iconColor: platformConstants.light.color,
                  path: "/knx/entities/create/light",
                },
              ]}
              hasSecondary
              .label=${"Select entity type"}
            ></ha-navigation-list>
          </ha-card>
        </ha-config-section>
      </hass-subpage>
    `;
  }

  private _renderSwitch(): TemplateResult {
    return html`<hass-subpage
      .hass=${this.hass}
      .narrow=${this.narrow!}
      .back-path=${this.backPath}
      .header=${"Create new entity"}
    >
      <ha-config-section .narrow=${this.narrow} .isWide=${false}>
        <knx-configure-switch
          .hass=${this.hass}
          .knx=${this.knx}
          @knx-entity-configuration-changed=${this._configChanged}
        ></knx-configure-switch>
      </ha-config-section>

      <ha-fab
        slot="fab"
        .label=${"Create"}
        extended
        @click=${this._entityCreate}
        ?disabled=${this._config === undefined}
      >
        <ha-svg-icon slot="icon" .path=${mdiPlus}></ha-svg-icon>
      </ha-fab>
    </hass-subpage>`;
  }

  private _configChanged(ev) {
    ev.stopPropagation();
    logger.warn("configChanged", ev.detail);
    this._config = ev.detail;
  }

  private _entityCreate(ev) {
    ev.stopPropagation();
    if (this._config === undefined) {
      logger.error("No config found.");
      return;
    }
    createEntity(this.hass, this._config)
      .then(() => {
        logger.debug("created entity!");
        navigate("/knx/entities", { replace: true });
      })
      .catch((err) => {
        logger.error("Error creating entity", err);
      });
  }

  static get styles() {
    return css`
      hass-loading-screen {
        --app-header-background-color: var(--sidebar-background-color);
        --app-header-text-color: var(--sidebar-text-color);
      }

      ha-expansion-panel {
        margin: 16px;
      }

      .spacer {
        height: 16px;
      }

      ha-config-section:last-of-type {
        margin-bottom: 48px;
      }

      ha-card > ha-settings-row:first-child {
        border-top: 0;
      }

      ha-settings-row {
        margin-bottom: 16px;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-create-entity": KNXCreateEntity;
  }
}
