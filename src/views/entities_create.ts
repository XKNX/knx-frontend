import { mdiPlus, mdiFloppy } from "@mdi/js";
import type { TemplateResult, PropertyValues } from "lit";
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state, query } from "lit/decorators";
import { ContextProvider } from "@lit/context";
import { Task } from "@lit/task";

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
import type {
  EntityData,
  ErrorDescription,
  CreateEntityResult,
  SupportedPlatform,
} from "types/entity_data";

import { getPlatformStyle } from "../utils/common";
import { validDPTsForSchema } from "../utils/dpt";
import { dragDropContext, DragDropContext } from "../utils/drag-drop-context";
import { KNXLogger } from "../tools/knx-logger";
import type { KNX } from "../types/knx";

const logger = new KNXLogger("knx-create-entity");

@customElement("knx-create-entity")
export class KNXCreateEntity extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Object }) public route!: Route;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: String, attribute: "back-path" }) public backPath?: string;

  @state() private _config?: EntityData;

  @state() private _validationErrors?: ErrorDescription[];

  @state() private _validationBaseError?: string;

  @query("ha-alert") private _alertElement!: HTMLDivElement;

  private _intent?: "create" | "edit";

  // setting entityPlatform or entityId will trigger the load tasks and a rerender
  private entityPlatform?: string;

  private entityId?: string; // only used for "edit" intent

  private _projectLoadTask = new Task(this, {
    args: () => [],
    task: async () => {
      if (!this.knx.projectInfo) return; // no project
      if (this.knx.projectData) return; // already loaded
      await this.knx.loadProject();
    },
  });

  private _schemaLoadTask = new Task(this, {
    args: () => [this.entityPlatform] as const,
    task: async ([entityPlatform]) => {
      if (!entityPlatform) return;
      await this.knx.loadSchema(entityPlatform);
    },
  });

  private _entityConfigLoadTask = new Task(this, {
    args: () => [this.entityId] as const,
    task: async ([entityId]) => {
      if (!entityId) return;
      const { platform, data } = await getEntityConfig(this.hass, entityId);
      this.entityPlatform = platform;
      this._config = data;
    },
  });

  private _dragDropContextProvider = new ContextProvider(this, {
    context: dragDropContext,
    initialValue: new DragDropContext(() => {
      this._dragDropContextProvider.updateObservers();
    }),
  });

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

      this._config = undefined; // clear config - eg. when `back` was used
      this._validationErrors = undefined; // clear validation errors - eg. when `back` was used
      this._validationBaseError = undefined;

      if (intent === "create") {
        // knx/entities/create -> path: ""; knx/entities/create/ -> path: "/"
        // knx/entities/create/light -> path: "/light"
        this.entityId = undefined; // clear entityId for create intent
        this.entityPlatform = this.route.path.split("/")[1];
      } else if (intent === "edit") {
        // knx/entities/edit/light.living_room -> path: "/light.living_room"
        this.entityId = this.route.path.split("/")[1];
        // this.entityPlatform will be set from load task result - triggering the next load task
      }
    }
  }

  protected render(): TemplateResult {
    if (!this.hass || !this._intent) {
      return html` <hass-loading-screen></hass-loading-screen> `;
    }
    return this._projectLoadTask.render({
      initial: () => html`
        <hass-loading-screen .message=${"Waiting to fetch project data."}></hass-loading-screen>
      `,
      pending: () => html`
        <hass-loading-screen .message=${"Loading KNX project data."}></hass-loading-screen>
      `,
      error: (err) => this._renderError("Error loading KNX project", err),
      complete: () => {
        if (this._intent === "edit") {
          return this._renderEdit();
        }
        return this._renderCreate();
      },
    });
  }

  private _renderCreate(): TemplateResult {
    if (!this.entityPlatform) {
      return this._renderTypeSelection();
    }
    if (!this.knx.supportedPlatforms.includes(this.entityPlatform)) {
      logger.error("Unknown platform", this.entityPlatform);
      return this._renderTypeSelection();
    }
    return this._renderLoadSchema();
  }

  private _renderEdit(): TemplateResult {
    return this._entityConfigLoadTask.render({
      initial: () => html`
        <hass-loading-screen .message=${"Waiting to fetch entity data."}></hass-loading-screen>
      `,
      pending: () => html`
        <hass-loading-screen .message=${"Loading entity data."}></hass-loading-screen>
      `,
      error: (err) =>
        this._renderError(
          html`${this.hass.localize("ui.card.common.entity_not_found")}:
            <code>${this.entityId}</code>`,
          err,
        ),
      complete: () => {
        if (!this.entityPlatform) {
          return this._renderError(
            html`${this.hass.localize("ui.card.common.entity_not_found")}:
              <code>${this.entityId}</code>`,
            new Error("Entity platform unknown"),
          );
        }
        if (!this.knx.supportedPlatforms.includes(this.entityPlatform)) {
          return this._renderError(
            "Unsupported platform",
            "Unsupported platform: " + this.entityPlatform,
          );
        }
        return this._renderLoadSchema();
      },
    });
  }

  private _renderLoadSchema(): TemplateResult {
    return this._schemaLoadTask.render({
      initial: () => html`
        <hass-loading-screen .message=${"Waiting to fetch schema."}></hass-loading-screen>
      `,
      pending: () => html`
        <hass-loading-screen .message=${"Loading entity platform schema."}></hass-loading-screen>
      `,
      error: (err) => this._renderError("Error loading schema", err),
      complete: () => this._renderEntityConfig(this.entityPlatform),
    });
  }

  private _renderError(
    errorContent: TemplateResult | string,
    error?: Error | string,
  ): TemplateResult {
    logger.error("Error in create/edit entity", error);
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow!}
        .back-path=${this.backPath}
        .header=${this.hass.localize("ui.panel.config.integrations.config_flow.error")}
      >
        <div class="content">
          <ha-alert alert-type="error"> ${errorContent} </ha-alert>
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
        .header=${this.hass.localize(
          "component.knx.config_panel.entities.create.type_selection.title",
        )}
      >
        <div class="type-selection">
          <ha-card
            outlined
            .header=${this.hass.localize(
              "component.knx.config_panel.entities.create.type_selection.header",
            )}
          >
            <!-- <p>Some help text</p> -->
            <ha-navigation-list
              .hass=${this.hass}
              .narrow=${this.narrow}
              .pages=${this.knx.supportedPlatforms.map((platform) => {
                const platformStyle = getPlatformStyle(platform);
                return {
                  name: `${this.hass.localize(`component.${platform}.title`)}`,
                  description: `${this.hass.localize(`component.knx.config_panel.entities.create.${platform}.description`)}`,
                  iconPath: platformStyle.iconPath,
                  iconColor: platformStyle.color,
                  path: `/knx/entities/create/${platform}`,
                };
              })}
              has-secondary
              .label=${this.hass.localize(
                "component.knx.config_panel.entities.create.type_selection.title",
              )}
            ></ha-navigation-list>
          </ha-card>
        </div>
      </hass-subpage>
    `;
  }

  private _renderEntityConfig(platform: SupportedPlatform): TemplateResult {
    const create = this._intent === "create";
    const schema = this.knx.schema[platform]!;

    return html`<hass-subpage
      .hass=${this.hass}
      .narrow=${this.narrow!}
      .back-path=${this.backPath}
      .header=${create
        ? this.hass.localize("component.knx.config_panel.entities.create.header")
        : `${this.hass.localize("ui.common.edit")}: ${this.entityId}`}
    >
      <div class="content">
        <div class="entity-config">
          <knx-configure-entity
            .hass=${this.hass}
            .knx=${this.knx}
            .platform=${platform}
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
            .label=${create
              ? this.hass.localize("ui.common.create")
              : this.hass.localize("ui.common.save")}
            extended
            @click=${create ? this._entityCreate : this._entityUpdate}
            ?disabled=${this._config === undefined}
          >
            <ha-svg-icon slot="icon" .path=${create ? mdiPlus : mdiFloppy}></ha-svg-icon>
          </ha-fab>
        </div>
        ${this.knx.projectData
          ? html` <div class="panel">
              <knx-project-device-tree
                .data=${this.knx.projectData}
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
