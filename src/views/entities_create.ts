import { mdiPlus, mdiFloppy } from "@mdi/js";
import type { TemplateResult, PropertyValues } from "lit";
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state, query } from "lit/decorators";
import { ContextProvider } from "@lit/context";

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
import { throttle } from "@ha/common/util/throttle";
import type { HomeAssistant, Route } from "@ha/types";

import "../components/knx-configure-entity";
import "../components/knx-project-device-tree";

import {
  createEntity,
  updateEntity,
  getEntityConfig,
  validateEntity,
} from "services/websocket.service";
import type { EntityData, ErrorDescription, CreateEntityResult } from "types/entity_data";

import { platformConstants } from "../utils/common";
import { validDPTsForSchema } from "../utils/dpt";
import { dragDropContext, DragDropContext } from "../utils/drag-drop-context";
import { KNXLogger } from "../tools/knx-logger";
import type { KNX } from "../types/knx";
import type { PlatformInfo } from "../utils/common";
import type { Section } from "../utils/schema";

const logger = new KNXLogger("knx-create-entity");

@customElement("knx-create-entity")
export class KNXCreateEntity extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Object }) public route!: Route;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: String, attribute: "back-path" }) public backPath?: string;

  @state() private _config?: EntityData;

  @state() private _loading = false;

  @state() private _validationErrors?: ErrorDescription[];

  @state() private _validationBaseError?: string;

  @query("ha-alert") private _alertElement!: HTMLDivElement;

  private _intent?: "create" | "edit";

  private entityPlatform?: string;

  private entityId?: string; // only used for "edit" intent

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

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("route")) {
      const intent = this.route.prefix.split("/").at(-1);
      if (intent === "create" || intent === "edit") {
        this._intent = intent;
      } else {
        logger.error("Unknown intent", intent);
        this._intent = undefined;
        return;
      }

      this._loading = true;
      if (intent === "create") {
        // knx/entities/create -> path: ""; knx/entities/create/ -> path: "/"
        // knx/entities/create/light -> path: "/light"
        const entityPlatform = this.route.path.split("/")[1];
        this.entityPlatform = entityPlatform;
        this._config = undefined; // clear config - eg. when `back` was used
        this._validationErrors = undefined; // clear validation errors - eg. when `back` was used
        this._validationBaseError = undefined;
      } else if (intent === "edit") {
        // knx/entities/edit/light.living_room -> path: "/light.living_room"
        this.entityId = this.route.path.split("/")[1];
        getEntityConfig(this.hass, this.entityId)
          .then((entityConfigData) => {
            const { platform: entityPlatform, data: config } = entityConfigData;
            this.entityPlatform = entityPlatform;
            this._config = config;
          })
          .catch((err) => {
            logger.warn("Fetching entity config failed.", err);
            this.entityPlatform = undefined; // used as error marker
          });
      }
      if (!this.entityPlatform) {
        this._loading = false;
        return;
      }
      this.knx
        .loadSchema(this.entityPlatform)
        .catch((err) => {
          logger.warn("Fetching entity schema failed.", err);
          this.entityPlatform = undefined; // used as error marker
          navigate("/knx/error", { replace: true, data: err });
        })
        .finally(() => {
          this._loading = false;
        });
    }
  }

  protected render(): TemplateResult {
    if (!this.hass || !this.knx.project || !this._intent || this._loading) {
      return html` <hass-loading-screen></hass-loading-screen> `;
    }
    if (this._intent === "edit") return this._renderEdit();
    return this._renderCreate();
  }

  private _renderCreate(): TemplateResult {
    if (!this.entityPlatform) {
      return this._renderTypeSelection();
    }
    const schema = this.knx.schema[this.entityPlatform];
    const platformInfo = platformConstants[this.entityPlatform];
    if (!platformInfo) {
      logger.error("Unknown platform", this.entityPlatform);
      return this._renderTypeSelection();
    }
    return this._renderEntityConfig(schema, platformInfo, true);
  }

  private _renderEdit(): TemplateResult {
    if (!this.entityPlatform) {
      return this._renderNotFound();
    }
    const schema = this.knx.schema[this.entityPlatform];
    const platformInfo = platformConstants[this.entityPlatform];
    if (!platformInfo) {
      logger.error("Unknown platform", this.entityPlatform);
      return this._renderNotFound();
    }
    return this._renderEntityConfig(schema, platformInfo, false);
  }

  private _renderNotFound(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow!}
        .back-path=${this.backPath}
        .header=${"Edit entity"}
      >
        <div class="content">
          <ha-alert alert-type="error">Entity not found: <code>${this.entityId}</code></ha-alert>
        </div>
      </hass-subpage>
    `;
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
              .pages=${Object.entries(platformConstants).map(([platform, platformInfo]) => ({
                name: platformInfo.name,
                description: platformInfo.description,
                iconPath: platformInfo.iconPath,
                iconColor: platformInfo.color,
                path: `/knx/entities/create/${platform}`,
              }))}
              has-secondary
              .label=${"Select entity type"}
            ></ha-navigation-list>
          </ha-card>
        </div>
      </hass-subpage>
    `;
  }

  private _renderEntityConfig(
    schema: Section[],
    platformInfo: PlatformInfo,
    create: boolean,
  ): TemplateResult {
    return html`<hass-subpage
      .hass=${this.hass}
      .narrow=${this.narrow!}
      .back-path=${this.backPath}
      .header=${create ? "Create new entity" : `Edit ${this.entityId}`}
    >
      <div class="content">
        <div class="entity-config">
          <knx-configure-entity
            .hass=${this.hass}
            .knx=${this.knx}
            .platform=${platformInfo}
            .config=${this._config}
            .schema=${schema}
            .validationErrors=${this._validationErrors}
            @knx-entity-configuration-changed=${this._configChanged}
          >
            ${this._validationBaseError
              ? html`<ha-alert slot="knx-validation-error" alert-type="error">
                  <details>
                    <summary><b>Validation error</b></summary>
                    <p>Base error: ${this._validationBaseError}</p>
                    ${this._validationErrors?.map(
                      (err) =>
                        html`<p>
                          ${err.error_class}: ${err.error_message} in ${err.path?.join(" / ")}
                        </p>`,
                    ) ?? nothing}
                  </details>
                </ha-alert>`
              : nothing}
          </knx-configure-entity>
          <ha-fab
            .label=${create ? "Create" : "Save"}
            extended
            @click=${create ? this._entityCreate : this._entityUpdate}
            ?disabled=${this._config === undefined}
          >
            <ha-svg-icon slot="icon" .path=${create ? mdiPlus : mdiFloppy}></ha-svg-icon>
          </ha-fab>
        </div>
        ${this.knx.project?.project_loaded
          ? html` <div class="panel">
              <knx-project-device-tree
                .data=${this.knx.project.knxproject}
                .validDPTs=${validDPTsForSchema(schema)}
              ></knx-project-device-tree>
            </div>`
          : nothing}
      </div>
    </hass-subpage>`;
  }

  private _configChanged(ev) {
    ev.stopPropagation();
    logger.debug("configChanged", ev.detail);
    this._config = ev.detail;
    if (this._validationErrors) {
      this._entityValidate();
    }
  }

  private _entityValidate = throttle(() => {
    logger.debug("validate", this._config);
    if (this._config === undefined || this.entityPlatform === undefined) return;
    validateEntity(this.hass, { platform: this.entityPlatform, data: this._config })
      .then((createEntityResult) => {
        this._handleValidationError(createEntityResult, false);
      })
      .catch((err) => {
        logger.error("validateEntity", err);
        navigate("/knx/error", { replace: true, data: err });
      });
  }, 250);

  private _entityCreate(ev) {
    ev.stopPropagation();
    if (this._config === undefined || this.entityPlatform === undefined) {
      logger.error("No config found.");
      return;
    }
    createEntity(this.hass, { platform: this.entityPlatform, data: this._config })
      .then((createEntityResult) => {
        if (this._handleValidationError(createEntityResult, true)) return;
        logger.debug("Successfully created entity", createEntityResult.entity_id);
        navigate("/knx/entities", { replace: true });
        if (!createEntityResult.entity_id) {
          logger.error("entity_id not found after creation.");
          return;
        }
        this._entityMoreInfoSettings(createEntityResult.entity_id);
      })
      .catch((err) => {
        logger.error("Error creating entity", err);
        navigate("/knx/error", { replace: true, data: err });
      });
  }

  private _entityUpdate(ev) {
    ev.stopPropagation();
    if (
      this._config === undefined ||
      this.entityId === undefined ||
      this.entityPlatform === undefined
    ) {
      logger.error("No config found.");
      return;
    }
    updateEntity(this.hass, {
      platform: this.entityPlatform,
      entity_id: this.entityId,
      data: this._config,
    })
      .then((createEntityResult) => {
        if (this._handleValidationError(createEntityResult, true)) return;
        logger.debug("Successfully updated entity", this.entityId);
        navigate("/knx/entities", { replace: true });
      })
      .catch((err) => {
        logger.error("Error updating entity", err);
        navigate("/knx/error", { replace: true, data: err });
      });
  }

  private _handleValidationError(result: CreateEntityResult, final: boolean): boolean {
    // return true if validation error; scroll to alert if final
    if (result.success === false) {
      logger.warn("Validation error", result);
      this._validationErrors = result.errors;
      this._validationBaseError = result.error_base;
      if (final) {
        setTimeout(() => this._alertElement.scrollIntoView({ behavior: "smooth" }));
      }
      return true;
    }
    this._validationErrors = undefined;
    this._validationBaseError = undefined;
    logger.debug("Validation passed", result.entity_id);
    return false;
  }

  private _entityMoreInfoSettings(entityId: string) {
    fireEvent(mainWindow.document.querySelector("home-assistant")!, "hass-more-info", {
      entityId,
      view: "settings",
    });
  }

  static styles = css`
    hass-loading-screen {
      --app-header-background-color: var(--sidebar-background-color);
      --app-header-text-color: var(--sidebar-text-color);
    }

    .type-selection {
      margin: 20px auto 80px;
      max-width: 720px;
    }

    @media screen and (max-width: 600px) {
      .panel {
        display: none;
      }
    }

    .content {
      display: flex;
      flex-direction: row;
      height: 100%;
      width: 100%;

      & > .entity-config {
        flex-grow: 1;
        flex-shrink: 1;
        height: 100%;
        overflow-y: scroll;
      }

      & > .panel {
        flex-grow: 0;
        flex-shrink: 3;
        width: 480px;
        min-width: 280px;
      }
    }

    knx-configure-entity {
      display: block;
      margin: 20px auto 40px; /* leave 80px space for fab */
      max-width: 720px;
    }

    ha-alert {
      display: block;
      margin: 20px auto;
      max-width: 720px;

      & summary {
        padding: 10px;
      }
    }

    ha-fab {
      /* not slot="fab" to move out of panel */
      float: right;
      margin-right: calc(16px + env(safe-area-inset-right));
      margin-bottom: 40px;
      z-index: 1;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-create-entity": KNXCreateEntity;
  }
}
