import { mdiPlus } from "@mdi/js";
import { LitElement, TemplateResult, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";

import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-subpage";
import "@ha/components/ha-card";
import "@ha/components/ha-fab";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-navigation-list";
import { navigate } from "@ha/common/navigate";

import "../components/knx-configure-switch";

import { HomeAssistant, Route } from "@ha/types";
import { createEntity, getPlatformSchemaOptions } from "services/websocket.service";
import { CreateEntityData, SchemaOptions } from "types/entity_data";
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

  @state() private _schemaOptions?: SchemaOptions;

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
    const entityPlatform = this.route.path.split("/")[1];
    if (!entityPlatform) {
      this._schemaOptions = undefined;
    } else if (entityPlatform !== this.entityPlatform) {
      getPlatformSchemaOptions(this.hass, entityPlatform).then((schemaOptions) => {
        logger.debug("schemaOptions", schemaOptions);
        this._schemaOptions = schemaOptions ?? {};
      });
    }
    this.entityPlatform = entityPlatform;
  }

  protected render(): TemplateResult | void {
    if (!this.hass || !this.knx.project || (!!this.entityPlatform && !this._schemaOptions)) {
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
        <div class="content">
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
                // {
                //   name: platformConstants.light.name,
                //   description: "Description",
                //   iconPath: platformConstants.light.iconPath,
                //   iconColor: platformConstants.light.color,
                //   path: "/knx/entities/create/light",
                // },
              ]}
              hasSecondary
              .label=${"Select entity type"}
            ></ha-navigation-list>
          </ha-card>
        </div>
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
      <div class="content">
        <knx-configure-switch
          .hass=${this.hass}
          .knx=${this.knx}
          .platform=${this.entityPlatform}
          .schemaOptions=${this._schemaOptions}
          @knx-entity-configuration-changed=${this._configChanged}
        ></knx-configure-switch>
      </div>
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

      .content {
        margin: 20px auto 80px; /* leave space for fab */
        max-width: 720px;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-create-entity": KNXCreateEntity;
  }
}
