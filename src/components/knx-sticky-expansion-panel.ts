import { mdiChevronDown } from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";

import "@ha/components/ha-svg-icon";
import { fireEvent } from "@ha/common/dom/fire_event";

/** Longer than the collapse, so it only ever fires when the transition did not. */
const UNMOUNT_FALLBACK_MS = 1000;

/**
 * An expansion panel card whose header sticks to the top of the nearest
 * scroll container while its content is scrolled.
 *
 * It exists because ha-expansion-panel animates its height by measuring the
 * content once and writing an inline height, which goes stale when nested or
 * dynamic content grows afterwards. This panel animates an `0fr`/`1fr` grid
 * track instead: the browser keeps deriving the size, so there is nothing to
 * measure and nothing to go stale.
 *
 * The card clips itself with `overflow: clip`, which - unlike `hidden` - does
 * not create a scroll container, so the sticky header keeps pinning to the
 * list rather than to the card.
 *
 * Expansion behaves like ha-expansion-panel: the panel toggles itself and
 * reports it, so it works with no wiring at all. A parent that owns the
 * state can take over by calling `preventDefault()` on the click/keydown in
 * the capture phase and setting `expanded` itself.
 *
 * Collapsing a panel that is scrolled past would drop its header above the
 * scrollport and yank the following panels upwards, so the card scrolls back
 * to the top edge as the collapse starts - see `_anchorOnCollapse`.
 *
 * @slot header - Header content, always visible, sticky while scrolling.
 * @slot - Panel content, rendered while expanded and during the collapse.
 * @fires expanded-will-change - Upcoming state as `{ expanded: boolean }`.
 * @fires expanded-changed - New state as `{ expanded: boolean }`.
 */
@customElement("knx-sticky-expansion-panel")
export class KnxStickyExpansionPanel extends LitElement {
  @property({ type: Boolean, reflect: true }) public expanded = false;

  @property({ attribute: "no-collapse", type: Boolean, reflect: true })
  public noCollapse = false;

  /**
   * Content stays rendered for the length of the collapse, so there is
   * something to animate away. It is not rendered while collapsed: the
   * devices view has a card per device, and mounting every one of them
   * would cost far more than the animation is worth.
   */
  @state() private _showContent = this.expanded;

  private _unmountTimeout?: number;

  protected render(): TemplateResult {
    const collapsible = !this.noCollapse;
    return html`
      <div
        id="summary"
        part="summary"
        class="header ${this._showContent ? "with-content" : ""}"
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
      <div
        class="expander ${this.expanded ? "expanded" : ""}"
        @transitionend=${this._handleTransitionEnd}
      >
        <div class="clip">
          ${this._showContent ? html`<div class="content"><slot></slot></div>` : nothing}
        </div>
      </div>
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

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("expanded") && this.expanded) {
      // mount in the same update that starts the track towards 1fr, so the
      // content is there to give the track a size to grow into
      this._showContent = true;
      this._clearUnmount();
    }
  }

  protected updated(changedProperties: PropertyValues): void {
    // observing the property rather than the click covers both the self-toggle
    // and a parent that owns `expanded`, so this works either way
    if (changedProperties.get("expanded") === true && !this.expanded) {
      this._anchorOnCollapse();
      this._scheduleUnmount();
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._clearUnmount();
  }

  private _handleTransitionEnd(ev: TransitionEvent): void {
    // transitions from the content bubble up here too - a nested
    // ha-expansion-panel animates its height inside this very card - so only
    // this card's own track may unmount it
    if (ev.propertyName !== "grid-template-rows" || ev.target !== ev.currentTarget) {
      return;
    }
    if (!this.expanded) {
      this._clearUnmount();
      this._showContent = false;
    }
  }

  /**
   * A collapse that never animates never ends: a card hidden by a filter
   * mid-collapse gets no transitionend, and its content would stay mounted
   * for good. Unmount on a timer as well and take whichever comes first.
   */
  private _scheduleUnmount(): void {
    this._clearUnmount();
    this._unmountTimeout = window.setTimeout(() => {
      this._unmountTimeout = undefined;
      if (!this.expanded) {
        this._showContent = false;
      }
    }, UNMOUNT_FALLBACK_MS);
  }

  private _clearUnmount(): void {
    if (this._unmountTimeout !== undefined) {
      clearTimeout(this._unmountTimeout);
      this._unmountTimeout = undefined;
    }
  }

  /**
   * Keeps a collapsing card in place instead of letting it fall out of view.
   *
   * Collapsing only removes height below the card's top edge, so a card that
   * was scrolled into keeps its top above the scrollport: its header is gone
   * from view and everything below slides up. Pulling the scroll offset back
   * by that overshoot lands the header at the top edge, where the reader left
   * it. A card whose top is already visible does not move, so it is left alone.
   *
   * The overshoot does not depend on the card's height, so this runs as the
   * collapse starts rather than after it: the card top reaches the scrollport
   * edge while the content is still at full height, and the shrinking that
   * follows moves nothing. Anchoring afterwards, or midway, would mean
   * chasing the scroll offset for every frame of the animation instead.
   */
  private _anchorOnCollapse(): void {
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

    .header.with-content {
      /* follows the content rather than the expanded state, so the divider
         lasts exactly as long as there is content to divide - it would
         otherwise vanish at the start of the collapse, with content still
         on screen.

         drawn as a shadow, not a border: it takes no layout space and is
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

    .expander {
      /* an fr track animates without anyone measuring the content, so nested
         panels and late values can resize it mid-animation and it still lands
         on the right height - the whole reason this is not an inline height */
      display: grid;
      grid-template-rows: 0fr;
      /* the duration collapses to 1ms under prefers-reduced-motion */
      transition: grid-template-rows var(--ha-animation-duration-normal, 250ms)
        cubic-bezier(0.4, 0, 0.2, 1);
    }

    .expander.expanded {
      grid-template-rows: 1fr;
    }

    .clip {
      /* clips the content to the track while it animates, and lets the track
         reach 0fr at all by taking the grid item's min-height off "auto".
         it can stay on at rest: the card already clips itself anyway */
      overflow: hidden;
    }

    .content {
      /* padding belongs inside the clip, not on the grid item: a stretched
         item keeps its padding in a 0fr track, leaving the card propped open */
      padding: var(--sticky-expansion-panel-content-padding, 0 8px 4px);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-sticky-expansion-panel": KnxStickyExpansionPanel;
  }
}
