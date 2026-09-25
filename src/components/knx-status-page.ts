import { mdiContentCopy } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query } from "lit/decorators";

import "@ha/components/ha-icon-button";
import "@ha/layouts/hass-subpage";
import { copyToClipboard } from "@ha/common/util/copy-clipboard";
import type { HomeAssistant } from "@ha/types";
import { showToast } from "@ha/util/toast";

import "./knx-bus-scene";
import type { KnxBusScene, KnxBusSceneVariant } from "./knx-bus-scene";

/** Taps on these keep their own meaning instead of sending a telegram. */
const CONTROLS = new Set(["ha-button", "button", "a", "input", "select", "textarea"]);

/**
 * Full-page status screen of the KNX panel: a subpage with the bus scene,
 * an eyebrow, a headline, a description, an optional technical detail
 * (a path, an error message) and slotted actions below.
 *
 * The whole content area is the send button: every pointer-down that is not
 * on a control fires a telegram on the scene.
 *
 * Views tune the headline through `--knx-status-page-headline-font` and
 * `--knx-status-page-headline-size`.
 */
@customElement("knx-status-page")
export class KnxStatusPage extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  /** Toolbar title. */
  @property() public header?: string;

  /** Short plain-language line above the headline, e.g. "Page not found". */
  @property() public eyebrow?: string;

  @property() public headline?: string;

  @property() public description?: string;

  /** Label of the technical detail, e.g. "Requested path". */
  @property({ attribute: "detail-label" }) public detailLabel?: string;

  /** The technical detail itself, shown in monospace. */
  @property() public detail?: string;

  /** Offer a copy button next to the detail. */
  @property({ type: Boolean }) public copyable = false;

  @property({ reflect: true }) public variant: KnxBusSceneVariant = "not-found";

  /** Unit label of the scene's telegram rate readout. */
  @property({ attribute: "rate-unit" }) public rateUnit = "telegrams/s";

  @query("knx-bus-scene") private _scene?: KnxBusScene;

  protected render(): TemplateResult {
    return html`
      <hass-subpage .hass=${this.hass} .narrow=${this.narrow} .header=${this.header}>
        <div class="content" @pointerdown=${this._tap}>
          <knx-bus-scene .variant=${this.variant} .rateUnit=${this.rateUnit}></knx-bus-scene>
          ${this.eyebrow ? html`<p class="eyebrow">${this.eyebrow}</p>` : nothing}
          <h1>${this.headline}</h1>
          ${this.description ? html`<p class="description">${this.description}</p>` : nothing}
          ${
            this.detail
              ? html`<div class="detail">
                  <span class="detail-label">${this.detailLabel}</span>
                  <div class="detail-body">
                    <code>${this.detail}</code>
                    ${
                      this.copyable
                        ? html`<ha-icon-button
                            .path=${mdiContentCopy}
                            label=${this.hass.localize("ui.common.copy")}
                            @click=${this._copy}
                          ></ha-icon-button>`
                        : nothing
                    }
                  </div>
                </div>`
              : nothing
          }
          <div class="actions"><slot></slot></div>
        </div>
      </hass-subpage>
    `;
  }

  private _tap(ev: PointerEvent): void {
    if (ev.button !== 0) {
      return;
    }
    const onControl = ev
      .composedPath()
      .some((node) => node instanceof Element && CONTROLS.has(node.localName));
    if (!onControl) {
      this._scene?.fire();
    }
  }

  private async _copy(): Promise<void> {
    await copyToClipboard(this.detail!);
    showToast(this, { message: this.hass.localize("ui.common.copied_clipboard") });
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }

    .content {
      /* fast taps anywhere: no iOS highlight box, no double-tap zoom, no callout */
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
      touch-action: manipulation;
      user-select: none;
      box-sizing: border-box;
      min-height: 100%;
      max-width: 520px;
      margin: 0 auto;
      /* a touch above the vertical centre reads calmer than dead centre */
      padding: 24px 16px 14vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: var(--primary-text-color);
    }

    knx-bus-scene {
      margin-bottom: 28px;
    }

    /* the requested path stays copyable */
    ::slotted(*) {
      user-select: text;
    }

    .eyebrow {
      margin: 0 0 6px;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
      font-weight: var(--ha-font-weight-medium, 500);
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0 0 12px;
      font-family: var(--knx-status-page-headline-font, var(--ha-font-family-body, inherit));
      font-size: var(--knx-status-page-headline-size, var(--ha-font-size-3xl, 28px));
      font-weight: var(--ha-font-weight-medium, 500);
      line-height: var(--ha-line-height-condensed, 1.2);
    }

    .description {
      margin: 0;
      max-width: 42ch;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-l, 16px);
      line-height: var(--ha-line-height-normal, 1.6);
    }

    /* the technical detail: quiet, left-aligned, monospace, copyable */
    .detail {
      width: 100%;
      margin-top: 24px;
      text-align: left;
    }

    .detail-label {
      display: block;
      margin: 0 0 6px 2px;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
      font-weight: var(--ha-font-weight-medium, 500);
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .detail-body {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      padding: 8px 6px 8px 14px;
      border-radius: var(--ha-border-radius-md, 12px);
      background: var(--secondary-background-color);
    }

    .detail-body code {
      flex: 1;
      padding: 6px 0;
      font-family: var(--ha-font-family-code, monospace);
      font-size: var(--ha-font-size-s, 12px);
      line-height: var(--ha-line-height-normal, 1.6);
      color: var(--primary-text-color);
      overflow-wrap: anywhere;
      user-select: text;
    }

    .detail-body ha-icon-button {
      --mdc-icon-button-size: 36px;
      --mdc-icon-size: 18px;
      margin: -2px 0;
      color: var(--secondary-text-color);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin-top: 28px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-status-page": KnxStatusPage;
  }
}
