import type { TemplateResult, PropertyValues } from "lit";
import { LitElement, html, css } from "lit";
import { consume } from "@lit/context";
import { customElement, property, state } from "lit/decorators";

import type { HassEntities, UnsubscribeFunc } from "home-assistant-js-websocket";

import { connectionContext, statesContext } from "@ha/data/context";

import { transform } from "@ha/common/decorators/transform";
import type { HomeAssistant } from "@ha/types";
import { subscribeRenderTemplate } from "@ha/data/ws-templates";

import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("knx-expose-template-preview");

@customElement("knx-expose-template-preview")
export class KnxExposeTemplatePreview extends LitElement {
  @property({ attribute: false }) public entityId!: string;

  @property({ attribute: false }) public attribute?: string;

  @property({ attribute: false }) public valueTemplate?;

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

  private _unsubRenderTemplate?: UnsubscribeFunc;

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (
      changedProperties.has("valueTemplate") ||
      changedProperties.has("entityId") ||
      // to update value variable for template calculation
      changedProperties.has("attribute") ||
      changedProperties.has("_stateOrAttribute")
    ) {
      this._updateValueTemplate();
    }
  }

  protected render(): TemplateResult {
    return html`${this._templateResult} - ${this._error}`;
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

  private async _unsubscribeTemplate(): Promise<void> {
    if (!this._unsubRenderTemplate) {
      return;
    }

    try {
      this._unsubRenderTemplate();
      // const unsub = await this._unsubRenderTemplate();
      // unsub();
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

  static styles = css``;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-expose-template-preview": KnxExposeTemplatePreview;
  }
}
