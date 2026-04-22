import { mdiExport } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing, unsafeCSS } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume, type ContextType } from "@lit/context";
import { repeat } from "lit/directives/repeat";

import "@ha/components/chips/ha-chip-set";
import "@ha/components/ha-dropdown";
import "@ha/components/ha-dropdown-item";
import "@ha/components/ha-label";
import "@ha/components/ha-svg-icon";

import { navigate } from "@ha/common/navigate";
import { localizeContext } from "@ha/data/context";
import { stopPropagation } from "@ha/common/dom/stop_propagation";

import { exposeTab } from "../../knx-router";

@customElement("knx-data-table-related-label")
class KnxDataTableRelatedLabel extends LitElement {
  @property({ attribute: false }) public exposes: string[] = [];

  @state()
  @consume({ context: localizeContext, subscribe: true })
  private localize!: ContextType<typeof localizeContext>;

  protected render(): TemplateResult | typeof nothing {
    const exposes = this.exposes;
    if (!exposes.length) {
      return nothing;
    }
    if (exposes.length <= 1) {
      return html`
        <ha-chip-set>
          ${repeat(
            exposes,
            (itemId) => itemId,
            (itemId) => this._renderExposeItem(itemId),
          )}
        </ha-chip-set>
      `;
    }
    return html`
      <ha-chip-set>
        ${this._renderExposeItem(exposes[0])}
        <ha-dropdown role="button" tabindex="0" @click=${stopPropagation}>
          <ha-label slot="trigger" class="plus" dense> +${exposes.length - 1} </ha-label>
          ${repeat(
            exposes.slice(1),
            (itemId) => itemId,
            (item) => html`
              <ha-dropdown-item .value=${item}> ${this._renderExposeItem(item)} </ha-dropdown-item>
            `,
          )}
        </ha-dropdown>
      </ha-chip-set>
    `;
  }

  private _renderExposeItem(itemId: string): TemplateResult {
    return html`
      <a class="related-item link" href=${this._exposeHref(itemId)} @click=${this._linkClicked}>
        <ha-label dense .description=${this.localize("component.knx.config_panel.expose.title")}>
          <ha-svg-icon slot="icon" .path=${mdiExport}></ha-svg-icon>
          ${itemId}
        </ha-label>
      </a>
    `;
  }

  private _exposeHref(entityId: string): string {
    return `/knx/expose/edit/${entityId}`;
  }

  private _linkClicked(ev: MouseEvent): void {
    // Use navigate() for normal clicks to stay in the HA SPA context (avoids iframe double-menu).
    // Middle-click and Ctrl/Cmd+click fall through to the browser to open in a new tab.
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
    ev.preventDefault();
    ev.stopPropagation();
    navigate((ev.currentTarget as HTMLAnchorElement).href);
  }

  static styles = css`
    :host {
      display: block;
      flex-grow: 1;
    }

    ha-chip-set {
      flex-direction: column;
      flex-wrap: nowrap;
      align-items: flex-start;
      row-gap: 4px;
    }

    ha-label {
      --ha-label-background-color: ${unsafeCSS(exposeTab.iconColor)};
      --ha-label-background-opacity: 0.5;
    }

    .link {
      color: inherit;
      text-decoration: none;
    }

    .related-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .plus {
      --ha-label-background-color: transparent;
      border: 1px solid var(--divider-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-data-table-related-label": KnxDataTableRelatedLabel;
  }
}
