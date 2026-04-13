import type { TemplateResult, PropertyValues } from "lit";
import { LitElement, html, css, nothing } from "lit";
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
  private static readonly _DEBOUNCE_INTERVAL_MS = 750;

  @property({ attribute: false }) public entityId!: string;

  @property({ attribute: false }) public attribute?: string;

  @property({ attribute: false }) public valueTemplate?: string;

  @state() private _templateResult?: string;

  @state() private _error?: string;

  @state() private _typingIndicator = false;

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
  private _stateOrAttribute?: unknown;

  @state()
  @consume({ context: localizeContext, subscribe: true })
  private localize!: ContextType<typeof localizeContext>;

  private _unsubRenderTemplate?: UnsubscribeFunc;

  private _updateDebounceHandle?: number;

  private _lastTemplateUpdateAt = 0;

  private _updateRequestId = 0;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    // Invalidate pending async update runs when element disconnects.
    this._updateRequestId++;
    this._clearUpdateDebounce();
    this._unsubscribeTemplate();
  }

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("valueTemplate")) {
      this._scheduleTemplateUpdateTyping();
    } else if (
      changedProperties.has("entityId") ||
      // to update value variable for template calculation
      changedProperties.has("attribute") ||
      changedProperties.has("_stateOrAttribute")
    ) {
      this._rateLimitTemplateUpdate();
    }
  }

  /**
   * Recreates the template subscription so the preview always reflects
   * the latest template text and current input value.
   */
  private async _updateValueTemplate() {
    const requestId = ++this._updateRequestId;
    await this._unsubscribeTemplate();

    if (requestId !== this._updateRequestId) {
      return;
    }

    this._templateResult = undefined;
    if (!this.valueTemplate) {
      this._typingIndicator = false;
      this._error = undefined;
      return;
    }
    logger.debug("Updating value template", this.valueTemplate, this._stateOrAttribute);
    try {
      const unsubscribe = await subscribeRenderTemplate(
        this._connection,
        (result) => {
          if (requestId !== this._updateRequestId) {
            return;
          }

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

      if (requestId !== this._updateRequestId) {
        unsubscribe();
        return;
      }

      this._unsubRenderTemplate = unsubscribe;
    } catch (err) {
      if (requestId !== this._updateRequestId) {
        return;
      }

      logger.error("Template subscription error", err);
      this._unsubRenderTemplate = undefined;
      this._templateResult = undefined;
      this._error =
        err instanceof Error
          ? err.message
          : this.localize("ui.panel.config.developer-tools.tabs.templates.unknown_error_template");
    }
  }

  /**
   * When the template itself changes, we want to wait until the user stops
   * typing before refreshing the preview and show a typing indicator.
   */
  private _scheduleTemplateUpdateTyping(): void {
    this._queueTemplateUpdate(KnxExposeTemplatePreview._DEBOUNCE_INTERVAL_MS);
    this._typingIndicator = true;
  }

  /**
   * Entity or attribute changes should usually refresh immediately, but they still
   * respect the active debounce window and the minimum interval between updates.
   */
  private _rateLimitTemplateUpdate(): void {
    if (this._updateDebounceHandle !== undefined) {
      return;
    }

    const elapsed = Date.now() - this._lastTemplateUpdateAt;
    if (elapsed >= KnxExposeTemplatePreview._DEBOUNCE_INTERVAL_MS) {
      this._triggerTemplateUpdate();
      return;
    }
    this._queueTemplateUpdate(KnxExposeTemplatePreview._DEBOUNCE_INTERVAL_MS - elapsed);
  }

  /**
   * A queued update collapses repeated requests into a single refresh, regardless
   * of whether it came from typing debounce or post-update rate limiting.
   */
  private _queueTemplateUpdate(delay: number): void {
    this._clearUpdateDebounce();
    this._updateDebounceHandle = window.setTimeout(() => {
      this._updateDebounceHandle = undefined;
      this._triggerTemplateUpdate();
    }, delay);
  }

  /**
   * Records when the real subscription refresh starts so subsequent callers can
   * enforce the shared minimum interval between template updates.
   */
  private _triggerTemplateUpdate(): void {
    this._lastTemplateUpdateAt = Date.now();
    this._typingIndicator = false;
    this._updateValueTemplate();
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
    } finally {
      this._unsubRenderTemplate = undefined;
      logger.debug("Unsubscribed from template");
    }
  }

  private _toRawValueString(value: unknown): string {
    if (value === null || value === undefined) return "None";
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  protected render(): TemplateResult | typeof nothing {
    return this.valueTemplate
      ? html`<div class="container">
          ${this._error
            ? html`<div class="error">
                ${this.localize("ui.panel.config.integrations.config_flow.error")}: ${this._error}
              </div>`
            : html`<div class="preview">
                ${this.localize("ui.panel.config.integrations.config_flow.preview")}
                <code class="value-preview">
                  value: ${this._toRawValueString(this._stateOrAttribute)}</code
                >
                ${this._typingIndicator
                  ? html`<span class="typing-indicator" aria-hidden="true">…</span>`
                  : nothing}
                <div class="template-result">
                  <code>${this._toRawValueString(this._templateResult)}</code>
                </div>
              </div>`}
        </div>`
      : nothing;
  }

  static styles = css`
    .container {
      background-color: var(--secondary-background-color);
      border-radius: 4px;
      margin-top: 8px;
      padding: 8px;
    }
    .error {
      color: var(--error-color);
    }
    .preview {
      color: var(--secondary-text-color);
    }
    .value-preview {
      margin-inline: 12px;
      color: var(--primary-text-color);
    }
    .typing-indicator {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.4rem;
      height: 0.7rem;
      border: 1px solid var(--divider-color);
      border-radius: 999px;
      background-color: var(--secondary-background-color);
      font-size: 0.75rem;
      line-height: 1;
      vertical-align: middle;
    }
    .template-result {
      margin-top: 4px;
      margin-left: 20px;
      color: var(--primary-text-color);
      overflow-wrap: break-word;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-expose-template-preview": KnxExposeTemplatePreview;
  }
}
