import { mdiChevronDown } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";

import "@ha/components/ha-svg-icon";
import { fireEvent } from "@ha/common/dom/fire_event";

/**
 * A controlled expansion panel card whose header sticks to the top of the
 * nearest scroll container while its content is scrolled.
 *
 * Unlike ha-expansion-panel it never toggles itself: a header click or
 * Enter/Space key press only fires `expanded-changed` with the requested
 * state; the parent owns the `expanded` property. Content is only rendered
 * while expanded, and without a height animation stale inline heights
 * cannot occur when nested or dynamic content grows.
 *
 * The card clips its content at the rounded corners with `overflow: clip`,
 * which - unlike `hidden` - does not create a scroll container, so the
 * sticky header keeps working.
 *
 * @slot header - Header content, always visible, sticky while scrolling.
 * @slot - Panel content, rendered when expanded.
 * @fires expanded-changed - Requested state as `{ expanded: boolean }`.
 */
@customElement("knx-sticky-expansion-panel")
export class KnxStickyExpansionPanel extends LitElement {
  @property({ type: Boolean, reflect: true }) public expanded = false;

  @property({ attribute: "no-collapse", type: Boolean, reflect: true })
  public noCollapse = false;

  protected render(): TemplateResult {
    const collapsible = !this.noCollapse;
    return html`
      <div
        class="header ${this.expanded ? "expanded" : ""}"
        role=${ifDefined(collapsible ? "button" : undefined)}
        tabindex=${ifDefined(collapsible ? "0" : undefined)}
        aria-expanded=${this.expanded}
        @click=${collapsible ? this._toggleRequested : nothing}
        @keydown=${collapsible ? this._toggleRequested : nothing}
      >
        ${collapsible
          ? html`<ha-svg-icon
              class="chevron ${this.expanded ? "expanded" : ""}"
              .path=${mdiChevronDown}
            ></ha-svg-icon>`
          : nothing}
        <slot name="header"></slot>
      </div>
      ${this.expanded ? html`<div class="content"><slot></slot></div>` : nothing}
    `;
  }

  private _toggleRequested(ev: Event): void {
    if (ev.type === "keydown") {
      const key = (ev as KeyboardEvent).key;
      if (key !== "Enter" && key !== " ") {
        return;
      }
    }
    ev.preventDefault();
    fireEvent(this, "expanded-changed", { expanded: !this.expanded });
  }

  static styles = css`
    :host {
      display: block;
      border: 1px solid var(--outline-color);
      border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg, 12px));
      background-color: var(--card-background-color);
      /* clip scrolling content at the rounded corners; unlike "hidden"
         this does not create a scroll container, so sticky keeps working */
      overflow: clip;
    }

    .header {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      align-items: center;
      min-width: 0;
      min-height: 48px;
      box-sizing: border-box;
      padding: var(--sticky-expansion-panel-header-padding, 4px 8px);
      /* no border-radius: the card clips it; rounded corners would let
         scrolling content shine through while the header is stuck */
      background-color: var(--card-background-color);
    }

    .header[role="button"] {
      cursor: pointer;
      outline: none;
    }

    .header.expanded {
      border-bottom: 1px solid var(--divider-color);
    }

    .header:focus-visible {
      background-color: var(--input-fill-color, var(--secondary-background-color));
    }

    .chevron {
      flex: 0 0 auto;
      margin-right: 8px;
      color: var(--secondary-text-color);
      transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .chevron.expanded {
      transform: rotate(180deg);
    }

    .content {
      padding: var(--sticky-expansion-panel-content-padding, 0 8px 4px);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-sticky-expansion-panel": KnxStickyExpansionPanel;
  }
}
