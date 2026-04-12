import type { TemplateResult, PropertyValues } from "lit";
import { LitElement, html, css } from "lit";
import { consume, type ContextType } from "@lit/context";
import { customElement, property, state } from "lit/decorators";

import type { HassEntities, UnsubscribeFunc } from "home-assistant-js-websocket";

import { localizeContext, connectionContext, statesContext } from "@ha/data/context";

import { transform } from "@ha/common/decorators/transform";
import type { HomeAssistant } from "@ha/types";
import { subscribeRenderTemplate } from "@ha/data/ws-templates";

import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("knx-expose-template-preview");

@customElement("knx-expose-template-preview")
export class KnxExposeTemplatePreview extends LitElement {
  private static readonly _UPDATE_DEBOUNCE_MS = 350;

  @property({ attribute: false }) public entityId!: string;

  @property({ attribute: false }) public attribute?: string;

  @property({ attribute: false }) public valueTemplate?: string;

  @state() private _templateResult?: string;

  @state() private _error?: string;

  @consume({ context: connectionContext })
  private _connection!: HomeAssistant["connection"];

  @state()
  @consume({ context: statesContext, subscribe: true })
  @transform({
    transformer: function (this: KnxExposeTemplatePreview, entityStates: HassEntities) {
      return this.attribute
        ? entityStates?.[this.entityId]?.attributes[this.attribute]
        : entityStates?.[this.entityId]?.state || "";
    },
    watch: ["entityId", "attribute"],
  })
  private _stateOrAttribute?: string;

  @state()
  @consume({ context: localizeContext, subscribe: true })
  private localize!: ContextType<typeof localizeContext>;

  private _unsubRenderTemplate?: UnsubscribeFunc;

  private _updateDebounceHandle?: number;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._clearUpdateDebounce();
    this._unsubscribeTemplate();
  }

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("valueTemplate")) {
      this._scheduleTemplateUpdate();
    } else if (
      changedProperties.has("entityId") ||
      // to update value variable for template calculation
      changedProperties.has("attribute") ||
      changedProperties.has("_stateOrAttribute")
    ) {
      this._clearUpdateDebounce();
      this._updateValueTemplate();
    }
  }

  private async _updateValueTemplate() {
    await this._unsubscribeTemplate();
    this._templateResult = undefined;
    if (!this.valueTemplate) {
      this._error = undefined;
      return;
    }
    logger.debug("Updating value template", this.valueTemplate, this._stateOrAttribute);
    this._unsubRenderTemplate = await subscribeRenderTemplate(
      this._connection,
      (result) => {
        if ("error" in result) {
          logger.error("Template render error", result.error);
          this._templateResult = undefined;
          this._error = `Error rendering template: ${result.error}`;
          return;
        }
        this._error = undefined;
        this._templateResult = result.result;
      },
      {
        template: this.valueTemplate,
        timeout: 3,
        report_errors: true,
        variables: { value: this._stateOrAttribute },
      },
    );
  }

  private _scheduleTemplateUpdate(): void {
    this._clearUpdateDebounce();
    this._updateDebounceHandle = window.setTimeout(() => {
      this._updateDebounceHandle = undefined;
      this._updateValueTemplate();
    }, KnxExposeTemplatePreview._UPDATE_DEBOUNCE_MS);
  }

  private _clearUpdateDebounce(): void {
    if (this._updateDebounceHandle === undefined) {
      return;
    }
    window.clearTimeout(this._updateDebounceHandle);
    this._updateDebounceHandle = undefined;
  }

  private async _unsubscribeTemplate(): Promise<void> {
    if (!this._unsubRenderTemplate) {
      return;
    }

    try {
      this._unsubRenderTemplate();
    } catch (err: any) {
      logger.error("Error unsubscribing from template", err);
      if (err.code === "not_found") {
        // If we get here, the connection was probably already closed. Ignore.
      } else {
        throw err;
      }
    } finally {
      this._unsubRenderTemplate = undefined;
      logger.debug("Unsubscribed from template");
    }
  }

  protected render(): TemplateResult {
    return this._error
      ? html`<div class="error">
          ${this.localize("ui.panel.config.integrations.config_flow.error")}: ${this._error}
        </div>`
      : html`<div class="preview">
          ${this.localize("ui.panel.config.integrations.config_flow.preview")}:
          <code>${this._templateResult ?? "None"}</code>
        </div>`;
  }

  static styles = css`
    .error {
      color: var(--error-color);
    }
    .preview {
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-expose-template-preview": KnxExposeTemplatePreview;
  }
}
