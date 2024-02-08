import { mdiPlus } from "@mdi/js";
import { LitElement, TemplateResult, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { ContextProvider } from "@lit-labs/context";

import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-subpage";
import "@ha/components/ha-alert";
import "@ha/components/ha-card";
import "@ha/components/ha-fab";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-navigation-list";
import { navigate } from "@ha/common/navigate";
import { mainWindow } from "@ha/common/dom/get_main_window";
import { fireEvent } from "@ha/common/dom/fire_event";

import "../components/knx-configure-switch";
import "../components/knx-project-device-tree";

import { HomeAssistant, Route } from "@ha/types";
import { createEntity, getPlatformSchemaOptions } from "services/websocket.service";
import { CreateEntityData, SchemaOptions, ErrorDescription } from "types/entity_data";
import { KNX } from "../types/knx";
import { platformConstants } from "../utils/common";
import { dragDropContext, DragDropContext } from "../utils/drag-drop-context";
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

  @state() private _validationErrors?: ErrorDescription[];

  @state() private _validationBaseError?: string;

  entityPlatform?: string;

  private _dragDropContextProvider = new ContextProvider(this, {
    context: dragDropContext,
    initialValue: new DragDropContext(() => {
      this._dragDropContextProvider.updateObservers();
    }),
  });

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
        <div class="type-selection">
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
    // TODO: get validDPT from schema to pass to device-tree
    return html`<hass-subpage
      .hass=${this.hass}
      .narrow=${this.narrow!}
      .back-path=${this.backPath}
      .header=${"Create new entity"}
    >
      <div class="content">
        <div>
          <knx-configure-switch
            class="config"
            .hass=${this.hass}
            .knx=${this.knx}
            .schemaOptions=${this._schemaOptions}
            .validationErrors=${this._validationErrors}
            @knx-entity-configuration-changed=${this._configChanged}
          ></knx-configure-switch>
          ${this._validationBaseError
            ? html`<ha-alert alert-type="error" .title=${"Validation error"}>
                ${this._validationBaseError}
              </ha-alert>`
            : nothing}
          <ha-fab
            .label=${"Create"}
            extended
            @click=${this._entityCreate}
            ?disabled=${this._config === undefined}
          >
            <ha-svg-icon slot="icon" .path=${mdiPlus}></ha-svg-icon>
          </ha-fab>
        </div>
        ${this.knx.project
          ? html` <div class="panel">
              <knx-project-device-tree
                .data=${this.knx.project.knxproject}
                .validDPTs=${[{ main: 1, sub: null }]}
              ></knx-project-device-tree>
            </div>`
          : nothing}
      </div>
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
      .then((createEntityResult) => {
        if (createEntityResult.success === false) {
          logger.warn("Error creating entity", createEntityResult.error_base);
          this._validationErrors = createEntityResult.errors;
          this._validationBaseError = createEntityResult.error_base;
          return;
        }
        this._validationErrors = undefined;
        this._validationBaseError = undefined;
        logger.debug("created entity", createEntityResult.entity_id);
        navigate("/knx/entities", { replace: true });
        if (!createEntityResult.entity_id) {
          logger.error("entity_id not found after creation.");
          return;
        }
        this._entityMoreInfoSettings(createEntityResult.entity_id);
      })
      .catch((err) => {
        logger.error("Error creating entity", err);
      });
  }

  private _entityMoreInfoSettings(entityId: string) {
    fireEvent(mainWindow.document.querySelector("home-assistant")!, "hass-more-info", {
      entityId,
      view: "settings",
    });
  }

  static get styles() {
    return css`
      hass-loading-screen {
        --app-header-background-color: var(--sidebar-background-color);
        --app-header-text-color: var(--sidebar-text-color);
      }

      .type-selection {
        margin: 20px auto 80px;
        max-width: 720px;
      }

      .content {
        display: flex;
        flex-direction: row;
        height: 100%;
        width: 100%;

        & > :first-child {
          flex-grow: 1;
          flex-shrink: 1;
          height: 100%;
          overflow-y: scroll;
        }

        & > .panel {
          flex-grow: 0;
          flex-shrink: 3;
          max-width: 480px;
          min-width: 280px;
        }
      }

      .config {
        display: block;
        margin: 20px auto 40px; /* leave 80px space for fab */
        max-width: 720px;
      }

      ha-alert {
        display: block;
        margin: 20px auto;
        max-width: 720px;
      }

      ha-fab {
        /* not slot="fab" to move out of panel */
        float: right;
        margin-right: calc(16px + env(safe-area-inset-right));
        margin-bottom: 40px;
        z-index: 1;
      }

      /* knx-project-device-tree {
        position: absolute;
        right: 0;
        top: 0;
        max-width: calc(100% - 60px);
      } */
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-create-entity": KNXCreateEntity;
  }
}
