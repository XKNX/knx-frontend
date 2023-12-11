import { mdiFloppy } from "@mdi/js";
import { LitElement, TemplateResult, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";

import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-subpage";
import "@ha/components/ha-alert";
import "@ha/components/ha-fab";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-navigation-list";
import { navigate } from "@ha/common/navigate";

import "../components/knx-configure-switch";

import { HomeAssistant, Route } from "@ha/types";
import { updateEntity, getEntityConfig } from "services/websocket.service";
import { CreateEntityData } from "types/entity_data";
import { KNX } from "../types/knx";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("knx-edit-entity");

@customElement("knx-edit-entity")
export class KNXEditEntity extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ type: Object }) public route!: Route;

  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  @property({ type: String, attribute: "back-path" }) public backPath?: string;

  @state() private _config?: CreateEntityData;

  entityId?: string;

  uniqueId?: string;

  protected firstUpdated() {
    if (!this.knx.project) {
      this.knx.loadProject().then(() => {
        this.requestUpdate();
      });
    }
    this.entityId = this.route.path.split("/")[1];
    getEntityConfig(this.hass, this.entityId)
      .then((entityConfigData) => {
        this._config = entityConfigData;
        this.uniqueId = entityConfigData.unique_id;
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
    let content: TemplateResult;
    switch (this._config.platform) {
      case "switch": {
        content = this._renderSwitch();
        break;
      }
      default: {
        content = this._renderNotFound();
      }
    }

    return content;
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

  private _renderSwitch(): TemplateResult {
    return html`<hass-subpage
      .hass=${this.hass}
      .narrow=${this.narrow!}
      .back-path=${this.backPath}
      .header=${"Edit " + this.entityId}
    >
      <div class="content">
        <knx-configure-switch
          .hass=${this.hass}
          .knx=${this.knx}
          .config=${this._config!.data}
          @knx-entity-configuration-changed=${this._configChanged}
        ></knx-configure-switch>
      </div>

      <ha-fab
        slot="fab"
        .label=${"Save"}
        extended
        @click=${this._entityUpdate}
        ?disabled=${this._config === undefined}
      >
        <ha-svg-icon slot="icon" .path=${mdiFloppy}></ha-svg-icon>
      </ha-fab>
    </hass-subpage>`;
  }

  private _configChanged(ev) {
    ev.stopPropagation();
    logger.warn("configChanged", ev.detail);
    this._config = { unique_id: this.uniqueId, ...ev.detail };
  }

  private _entityUpdate(ev) {
    ev.stopPropagation();
    if (this._config === undefined || this.uniqueId === undefined) {
      logger.error("No config found.");
      return;
    }
    updateEntity(this.hass, { unique_id: this.uniqueId, ...this._config })
      .then(() => {
        logger.debug("successfully updated entity!");
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
        margin: 20px auto 80px; /* leave space for fab */
        max-width: 720px;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-edit-entity": KNXEditEntity;
  }
}
