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
import "@ha/components/ha-selector/ha-selector";
import { navigate } from "@ha/common/navigate";
import { mainWindow } from "@ha/common/dom/get_main_window";
import { fireEvent } from "@ha/common/dom/fire_event";
import { throttle } from "@ha/common/util/throttle";
import type { HomeAssistant, ValueChangedEvent, Route } from "@ha/types";
import { subscribeRenderTemplate } from "@ha/data/ws-templates";
import "../components/knx-configure-entity";
import "../components/knx-project-device-tree";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import {
  createEntity,
  updateEntity,
  getEntityConfig,
  validateEntity,
} from "services/websocket.service";
import type { ErrorDescription, CreateEntityResult } from "types/entity_data";

import { dragDropContext, DragDropContext } from "../utils/drag-drop-context";
import { KNXLogger } from "../tools/knx-logger";
import type { KNX } from "../types/knx";

const logger = new KNXLogger("knx-create-entity");

@customElement("knx-create-expose")
export class KNXCreateExpose extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Object }) public route!: Route;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: String, attribute: "back-path" }) public backPath?: string;

  @state() private _config?;

  @state() private _loading = false;

  @state() private _validationErrors?: ErrorDescription[];

  @state() private _validationBaseError?: string;

  @query("ha-alert") private _alertElement!: HTMLDivElement;

  private _intent?: "create" | "edit";

  private entityPlatform?: string;

  @state() private entityId?: string; // only used for "edit" intent

  @state() private _templateResult?: string;

  @state() private _unsubRenderTemplate?: Promise<UnsubscribeFunc>;

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeTemplate();
  }

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

      if (intent === "create") {
        // knx/entities/create -> path: ""; knx/entities/create/ -> path: "/"
        // knx/entities/create/light -> path: "/light"
        const entityPlatform = this.route.path.split("/")[1];
        this.entityPlatform = entityPlatform;
        this._config = undefined; // clear config - eg. when `back` was used
        this._validationErrors = undefined; // clear validation errors - eg. when `back` was used
        this._validationBaseError = undefined;
        this._loading = false;
      } else if (intent === "edit") {
        // knx/entities/edit/light.living_room -> path: "/light.living_room"
        this.entityId = this.route.path.split("/")[1];
        this._loading = true;
        getEntityConfig(this.hass, this.entityId)
          .then((entityConfigData) => {
            const { platform: entityPlatform, data: config } = entityConfigData;
            this.entityPlatform = entityPlatform;
            this._config = config;
          })
          .catch((err) => {
            logger.warn("Fetching entity config failed.", err);
            this.entityPlatform = undefined; // used as error marker
          })
          .finally(() => {
            this._loading = false;
          });
      }
    }
  }

  protected render(): TemplateResult {
    // if (!this.hass || !this.knx.project || !this._intent || this._loading) {
    //   return html` <hass-loading-screen></hass-loading-screen> `;
    // }
    return this._renderEntityConfig(this._intent !== "edit");
  }

  private _renderEntityConfig(create: boolean): TemplateResult {
    if (this.entityId) {
      console.log("entity", this.hass.entities[this.entityId]);
    }
    return html`<hass-subpage
      .hass=${this.hass}
      .narrow=${this.narrow!}
      .back-path=${this.backPath}
      .header=${create ? "Create new expose" : `Edit ${this.entityId}`}
    >
      <div class="content">
        <div class="entity-config">
          <div class="knx-configure-expose">
            <ha-selector
              .key=${"entity_id"}
              .hass=${this.hass}
              .label=${"Entity"}
              .selector=${{ entity: null }}
              .value=${this._config?.entity_id}
              @value-changed=${this._updateConfig}
            ></ha-selector>
            <ha-selector
              .key=${"attribute"}
              .hass=${this.hass}
              .label=${"Attribute"}
              .selector=${{ attribute: { entity_id: this._config?.entity_id } }}
              .value=${this._config?.attribute}
              @value-changed=${this._updateConfig}
            ></ha-selector>
            ${this.entityId
              ? html` <p>Value: ${this.hass.states[this.entityId]?.state}</p> `
              : nothing}
            <ha-selector
              .key=${"value_template"}
              .hass=${this.hass}
              .label=${"Value Template"}
              .selector=${{ template: null }}
              .value=${this._config?.value_template}
              @value-changed=${this._updateConfig}
            ></ha-selector>
            ${this._config?.value_template
              ? html`
                  <p>Value Template: ${this._config?.value_template}</p>
                  <p>Result: ${this._templateResult}</p>
                `
              : nothing}
          </div>
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
                .validDPTs=${undefined}
              ></knx-project-device-tree>
            </div>`
          : nothing}
      </div>
    </hass-subpage>`;
  }

  private async _updateConfig(ev: ValueChangedEvent<any>) {
    ev.stopPropagation();
    const key = ev.target.key;
    const value = ev.detail.value;
    // TODO: use nested-set and nested-get helpers to remove when empty
    if (this._config === undefined) {
      this._config = {};
    }
    this._config[key] = value;
    logger.debug(`Config updated ${key}: ${value}`, this._config);
    await this._updateValueTemplate();
    this.requestUpdate();
  }

  private async _updateValueTemplate() {
    await this._unsubscribeTemplate();
    this._templateResult = undefined;
    console.log("Updating value template for", this._config?.value_template);
    if (this._config?.value_template) {
      const value = this._config.attribute
        ? this.hass.states[this._config.entity_id]?.attributes[this._config.attribute]
        : this.hass.states[this._config.entity_id]?.state || "";
      console.log("Updating value template", this._config.value_template, value);
      this._unsubRenderTemplate = subscribeRenderTemplate(
        this.hass.connection,
        (result) => {
          if ("error" in result) {
            logger.error("Template render error", result.error);
            // TODO: proper error in UI
            this._templateResult = "Error rendering template";
            return;
          }
          this._templateResult = result.result;
        },
        {
          template: this._config.value_template,
          timeout: 3,
          report_errors: true,
          variables: { value },
        },
      );
      await this._unsubRenderTemplate;
    }
  }

  private async _unsubscribeTemplate(): Promise<void> {
    if (!this._unsubRenderTemplate) {
      return;
    }

    try {
      const unsub = await this._unsubRenderTemplate;
      unsub();
      this._unsubRenderTemplate = undefined;
    } catch (err: any) {
      if (err.code === "not_found") {
        // If we get here, the connection was probably already closed. Ignore.
      } else {
        throw err;
      }
    }
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

    .knx-configure-expose {
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
    "knx-create-expose": KNXCreateExpose;
  }
}
