import { mdiChevronDown } from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";

import "@ha/components/ha-svg-icon";
import { fireEvent } from "@ha/common/dom/fire_event";

/**
 * An expansion panel card whose header sticks to the top of the nearest
 * scroll container while its content is scrolled.
 *
 * It exists because ha-expansion-panel animates its height by measuring the
 * content once and writing an inline height, which goes stale when nested or
 * dynamic content grows afterwards. This panel renders content while expanded
 * instead, and clips the card with `overflow: clip`, which - unlike `hidden` -
 * does not create a scroll container, so the sticky header keeps pinning to
 * the list rather than to the card.
 *
 * Expansion behaves like ha-expansion-panel: the panel toggles itself and
 * reports it, so it works with no wiring at all. A parent that owns the
 * state can take over by calling `preventDefault()` on the click/keydown in
 * the capture phase and setting `expanded` itself.
 *
 * Collapsing a panel that is scrolled past would drop its header above the
 * scrollport and yank the following panels upwards, so on collapse the card
 * scrolls itself back to the top edge - see `_anchorAfterCollapse`.
 *
 * @slot header - Header content, always visible, sticky while scrolling.
 * @slot - Panel content, rendered when expanded.
 * @fires expanded-will-change - Upcoming state as `{ expanded: boolean }`.
 * @fires expanded-changed - New state as `{ expanded: boolean }`.
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
        id="summary"
        part="summary"
        class="header ${this.expanded ? "expanded" : ""}"
        role=${ifDefined(collapsible ? "button" : undefined)}
        tabindex=${ifDefined(collapsible ? "0" : undefined)}
        aria-expanded=${this.expanded}
        @click=${collapsible ? this._toggle : nothing}
        @keydown=${collapsible ? this._toggle : nothing}
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

  private _toggle(ev: Event): void {
    // a parent that owns `expanded` suppresses the self-toggle from the
    // capture phase, the same way ha-expansion-panel can be controlled
    if (ev.defaultPrevented) {
      return;
    }
    if (ev.type === "keydown") {
      const key = (ev as KeyboardEvent).key;
      if (key !== "Enter" && key !== " ") {
        return;
      }
    }
    ev.preventDefault();
    const expanded = !this.expanded;
    fireEvent(this, "expanded-will-change", { expanded });
    this.expanded = expanded;
    fireEvent(this, "expanded-changed", { expanded });
  }

  protected updated(changedProperties: PropertyValues): void {
    // observing the property rather than the click covers both the self-toggle
    // and a parent that owns `expanded`, so anchoring works either way
    if (changedProperties.get("expanded") === true && !this.expanded) {
      this._anchorAfterCollapse();
    }
  }

  /**
   * Keeps a collapsed card in place instead of letting it fall out of view.
   *
   * Collapsing only removes height below the card's top edge, so a card that
   * was scrolled into keeps its top above the scrollport: its header is gone
   * from view and everything below slides up. Pulling the scroll offset back
   * by that overshoot lands the header at the top edge, where the reader left
   * it. A card whose top is already visible does not move, so it is left alone.
   */
  private _anchorAfterCollapse(): void {
    const scroller = this._scrollParent();
    if (!scroller) {
      return;
    }
    // clientTop skips the border, leaving the padding box - the edge sticky
    // headers pin to, and the one the card top should line up with
    const scrollportTop = scroller.getBoundingClientRect().top + scroller.clientTop;
    const overshoot = this.getBoundingClientRect().top - scrollportTop;
    if (overshoot < 0) {
      scroller.scrollTop += overshoot;
    }
  }

  /** Nearest scrollable ancestor, crossing shadow boundaries on the way up. */
  private _scrollParent(): Element | null {
    let node: Node | null = this.parentNode;
    while (node) {
      const host = (node as ShadowRoot).host;
      if (host) {
        node = host;
        continue;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        // no scrollHeight check: a scroller that is not overflowing right now
        // is still the element that owns this card's scroll offset
        if (/^(auto|scroll|overlay)$/.test(getComputedStyle(element).overflowY)) {
          return element;
        }
      }
      node = node.parentNode;
    }
    return null;
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
      /* drawn as a shadow, not a border: it takes no layout space and is
         clipped by the card once the header is pushed onto the bottom edge,
         so it cannot stack with the card border into a 2px line */
      box-shadow: 0 1px 0 var(--divider-color);
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
