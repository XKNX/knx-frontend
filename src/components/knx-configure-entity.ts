import type { TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";

import "@ha/components/ha-alert";
import "@ha/components/ha-card";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-selector/ha-selector";

import { mainWindow } from "@ha/common/dom/get_main_window";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant, ValueChangedEvent } from "@ha/types";

import "./knx-form";
import { renderConfigureEntityCard } from "./knx-configure-entity-options";
import { KNXLogger } from "../tools/knx-logger";
import { setNestedValue } from "../utils/config-helper";
import { extractValidationErrors } from "../utils/validation";
import type { EntityData, ErrorDescription, SupportedPlatform } from "../types/entity_data";
import type { KNX } from "../types/knx";
import { getPlatformStyle } from "../utils/common";
import type { PlatformStyle } from "../utils/common";
import type { SelectorSchema } from "../types/schema";

const logger = new KNXLogger("knx-configure-entity");

@customElement("knx-configure-entity")
export class KNXConfigureEntity extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ attribute: false }) public platform!: SupportedPlatform;

  @property({ attribute: false }) public config?: EntityData;

  @property({ attribute: false }) public schema!: SelectorSchema[];

  @property({ attribute: false }) public validationErrors?: ErrorDescription[];

  platformStyle!: PlatformStyle;

  private _backendLocalize = (path: string) =>
    this.hass.localize(`component.knx.config_panel.entities.create.${this.platform}.${path}`) ||
    this.hass.localize(`component.knx.config_panel.entities.create._.${path}`);

  private _backendLocalizeKnx = (path: string) =>
    this.hass.localize(`component.knx.config_panel.entities.create.${this.platform}.knx.${path}`) ||
    this.hass.localize(`component.knx.config_panel.entities.create._.knx.${path}`);

  connectedCallback(): void {
    super.connectedCallback();
    this.platformStyle = getPlatformStyle(this.platform);
    if (!this.config) {
      // set base keys to get better validation error messages
      this.config = { entity: {}, knx: {} };

      // url params are extracted to config.
      // /knx/entities/create/binary_sensor?knx.ga_sensor.state=0/1/4
      // would set this.conifg.knx.ga_sensor.state to "0/1/4"
      // TODO: this is not checked against any schema
      const urlParams = new URLSearchParams(mainWindow.location.search);
      const url_suggestions = Object.fromEntries(urlParams.entries());
      for (const [path, value] of Object.entries(url_suggestions)) {
        setNestedValue(this.config!, path, value, logger);
        fireEvent(this, "knx-entity-configuration-changed", this.config);
      }
    }
  }

  protected render(): TemplateResult {
    const errors = extractValidationErrors(this.validationErrors, "data"); // "data" is root key in our python schema
    const knxErrors = extractValidationErrors(errors, "knx");

    return html`
      <div class="header">
        <h1>
          <ha-svg-icon
            .path=${this.platformStyle.iconPath}
            style=${styleMap({ "background-color": this.platformStyle.color })}
          ></ha-svg-icon>
          ${this.hass.localize(`component.${this.platform}.title`) || this.platform}
        </h1>
        <p>${this._backendLocalize("description")}</p>
      </div>
      <slot name="knx-validation-error"></slot>
      <ha-card outlined>
        <h1 class="card-header">${this._backendLocalize("knx.title")}</h1>
        <knx-form
          .key=${"knx"}
          .hass=${this.hass}
          .knx=${this.knx}
          .config=${this.config!.knx}
          .schema=${this.schema}
          .validationErrors=${knxErrors}
          .backendLocalize=${this._backendLocalizeKnx}
          @knx-form-config-changed=${this._updateConfig}
        ></knx-form>
      </ha-card>
      ${renderConfigureEntityCard(
        this.hass,
        this.config!.entity ?? {},
        this._updateConfig,
        extractValidationErrors(errors, "entity"),
        this._backendLocalize,
      )}
    `;
  }

  private _updateConfig(ev: ValueChangedEvent<any>): void {
    ev.stopPropagation();
    const key = ev.target.key;
    const value = ev.detail.value;
    setNestedValue(this.config!, key, value, logger);
    fireEvent(this, "knx-entity-configuration-changed", this.config);
    this.requestUpdate();
  }

  static styles = css`
    p {
      color: var(--secondary-text-color);
    }

    .header {
      color: var(--ha-card-header-color, --primary-text-color);
      font-family: var(--ha-card-header-font-family, inherit);
      padding: 0 16px 16px;

      & h1 {
        display: inline-flex;
        align-items: center;
        font-size: 26px;
        letter-spacing: -0.012em;
        line-height: 48px;
        font-weight: normal;
        margin-bottom: 14px;

        & ha-svg-icon {
          color: var(--text-primary-color);
          padding: 8px;
          background-color: var(--blue-color);
          border-radius: 50%;
          margin-right: 8px;
        }
      }

      & p {
        margin-top: -8px;
        line-height: 24px;
      }
    }

    ::slotted(ha-alert) {
      margin-top: 0 !important;
    }

    ha-card {
      margin-bottom: 24px;
      padding: 16px;

      & .card-header {
        display: inline-flex;
        align-items: center;
      }
    }

    /* some are used in knx-configure-entity-options */
    ha-expansion-panel {
      margin-bottom: 16px;

      > :first-child {
        /* between header and collapsible container */
        margin-top: 16px;
      }
    }
    ha-expansion-panel > * {
      margin-left: 8px;
      margin-right: 8px;
    }

    ha-selector,
    ha-selector-text,
    ha-selector-select,
    knx-device-picker {
      display: block;
      margin-bottom: 16px;
    }

    ha-alert {
      display: block;
      margin: 20px auto;
      max-width: 720px;

      & summary {
        padding: 10px;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-configure-entity": KNXConfigureEntity;
  }
}

declare global {
  // for fire event
  interface HASSDomEvents {
    "knx-entity-configuration-changed": EntityData;
  }
}
