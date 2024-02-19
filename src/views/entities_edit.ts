import { mdiFloppy } from "@mdi/js";
import { LitElement, TemplateResult, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { ContextProvider } from "@lit-labs/context";

import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-subpage";
import "@ha/components/ha-alert";
import "@ha/components/ha-card";
import "@ha/components/ha-fab";
import "@ha/components/ha-svg-icon";
import { navigate } from "@ha/common/navigate";
import { throttle } from "@ha/common/util/throttle";
import type { HomeAssistant, Route } from "@ha/types";

import "../components/knx-configure-entity";
import "../components/knx-project-device-tree";

import { updateEntity, getEntityConfig, validateEntity } from "services/websocket.service";
import type { CreateEntityData, SchemaOptions, ErrorDescription } from "types/entity_data";

import { KNXLogger } from "../tools/knx-logger";
import { platformConstants } from "../utils/common";
import { validDPTsForSchema } from "../utils/dpt";
import { dragDropContext, DragDropContext } from "../utils/drag-drop-context";
import type { KNX } from "../types/knx";
import type { PlatformInfo } from "../utils/common";

const logger = new KNXLogger("knx-edit-entity");

@customElement("knx-edit-entity")
export class KNXEditEntity extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Object }) public route!: Route;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: String, attribute: "back-path" }) public backPath?: string;

  @state() private _config?: CreateEntityData;

  @state() private _schemaOptions!: SchemaOptions;

  @state() private _validationErrors?: ErrorDescription[];

  @state() private _validationBaseError?: string;

  entityId?: string;

  uniqueId?: string;

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
    this.entityId = this.route.path.split("/")[1];
    getEntityConfig(this.hass, this.entityId)
      .then((entityConfigData) => {
        const { schema_options: schemaOptions, unique_id: uniqueId, ...config } = entityConfigData;
        this._config = config;
        this._schemaOptions = schemaOptions ?? {};
        this.uniqueId = uniqueId;
      })
      .catch((err) => {
        logger.warn("Fetching entity config failed.", err);
        this._config = {};
      })
      .finally(() => this.requestUpdate());
  }

  protected render(): TemplateResult | void {
    if (!this.hass || !this.knx.project || !this._config) {
      return html` <hass-loading-screen></hass-loading-screen> `;
    }
    const platformInfo = platformConstants[this._config.platform];
    if (!platformInfo) {
      logger.error("Unknown platform", this._config.platform);
      return this._renderNotFound();
    }
    return this._renderEntityConfig(platformInfo);
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

  private _renderEntityConfig(platformInfo: PlatformInfo): TemplateResult {
    return html`<hass-subpage
      .hass=${this.hass}
      .narrow=${this.narrow!}
      .back-path=${this.backPath}
      .header=${"Edit " + this.entityId}
    >
      <div class="content">
        <div>
          <knx-configure-entity
            class="config"
            .hass=${this.hass}
            .knx=${this.knx}
            .platform=${platformInfo}
            .config=${this._config!.data}
            .schemaOptions=${this._schemaOptions}
            .validationErrors=${this._validationErrors}
            @knx-entity-configuration-changed=${this._configChanged}
          ></knx-configure-entity>
          ${this._validationBaseError
            ? html`<ha-alert alert-type="error" .title=${"Validation error"}>
                ${this._validationBaseError}
              </ha-alert>`
            : nothing}
          <ha-fab
            .label=${"Save"}
            extended
            @click=${this._entityUpdate}
            ?disabled=${this._config === undefined}
          >
            <ha-svg-icon slot="icon" .path=${mdiFloppy}></ha-svg-icon
          ></ha-fab>
        </div>
        ${this.knx.project
          ? html` <div class="panel">
              <knx-project-device-tree
                .data=${this.knx.project.knxproject}
                .validDPTs=${validDPTsForSchema(platformInfo.schema)}
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
    if (this._validationErrors) {
      this._entityValidate();
    }
  }

  private _entityValidate = throttle(() => {
    logger.debug("validate", this._config);
    if (this._config === undefined) return;
    validateEntity(this.hass, this._config).then((createEntityResult) => {
      if (createEntityResult.success === false) {
        logger.warn("Validation failed", createEntityResult.error_base);
        this._validationErrors = createEntityResult.errors;
        this._validationBaseError = createEntityResult.error_base;
        return;
      }
      this._validationErrors = undefined;
      this._validationBaseError = undefined;
      logger.debug("Validation passed", createEntityResult.entity_id);
    });
  }, 250);

  private _entityUpdate(ev) {
    ev.stopPropagation();
    if (this._config === undefined || this.uniqueId === undefined) {
      logger.error("No config found.");
      return;
    }
    updateEntity(this.hass, { unique_id: this.uniqueId, ...this._config })
      .then((createEntityResult) => {
        if (createEntityResult.success === false) {
          logger.warn("Validation error updating entity", createEntityResult.error_base);
          this._validationErrors = createEntityResult.errors;
          this._validationBaseError = createEntityResult.error_base;
          return;
        }
        this._validationErrors = undefined;
        this._validationBaseError = undefined;
        logger.debug("Successfully updated entity", this.entityId);
        navigate("/knx/entities", { replace: true });
      })
      .catch((err) => {
        logger.error("Error updating entity", err);
      });
  }

  static get styles() {
    return css`
      hass-loading-screen {
        --app-header-background-color: var(--sidebar-background-color);
        --app-header-text-color: var(--sidebar-text-color);
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
          width: 480px;
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
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-edit-entity": KNXEditEntity;
  }
}
