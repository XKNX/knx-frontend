import { css, html, LitElement } from "lit";
import { customElement, query } from "lit/decorators";

/**
 * Toolbar row of `knx-tabs-subpage-data` for actions, search and a summary row.
 * An internal part of that layout, not a general-purpose toolbar. Layout only: it has no
 * state or controls of its own and requires no HA context.
 *
 * Empty primary regions collapse; the whole primary row collapses when all three
 * are empty. Forwarded slots are flattened, so an empty forwarding slot is not
 * treated as a control. The summary is independent of primary-row visibility;
 * its consumer must hide or remove an empty summary wrapper.
 *
 * The internally maintained `search-hidden` attribute indicates an empty search slot.
 * Without search, the primary row scrolls horizontally and uses the card background.
 * With search, the leading actions scroll at container widths up to 1017px.
 *
 * @slot leading - Actions before search, e.g. filter toggles or `ha-assist-chip`s.
 * @slot search - Search control stretched to the available width, e.g. `ha-input-search`.
 * @slot trailing - Actions after search, aligned to the end of the row.
 * @slot summary - Full-width, horizontally scrollable summary below the primary row;
 *   `knx-tabs-subpage-data` places its active filters row here.
 */
@customElement("knx-tabs-subpage-data-toolbar")
export class KnxTabsSubpageDataToolbar extends LitElement {
  @query(".primary") private _primary!: HTMLDivElement;

  /** Initializes empty regions after the shadow DOM exists, including a searchless first render. */
  protected firstUpdated(): void {
    this._handleSlotChange();
  }

  /** Recomputes region visibility and search-dependent styling from flattened slot contents. */
  private _handleSlotChange(): void {
    for (const slot of this._primary.querySelectorAll("slot")) {
      const empty = slot.assignedElements({ flatten: true }).length === 0;
      slot.parentElement!.hidden = empty;
      if (slot.name === "search") this.toggleAttribute("search-hidden", empty);
    }
    this._primary.hidden = [...this._primary.children].every(
      (area) => (area as HTMLElement).hidden,
    );
  }

  /** Creates initially hidden primary regions and the independent summary slot. */
  protected render() {
    return html`
      <div class="primary" role="toolbar" hidden>
        <div class="leading" hidden>
          <slot name="leading" @slotchange=${this._handleSlotChange}></slot>
        </div>
        <div class="search" hidden>
          <slot name="search" @slotchange=${this._handleSlotChange}></slot>
        </div>
        <div class="trailing" hidden>
          <slot name="trailing" @slotchange=${this._handleSlotChange}></slot>
        </div>
      </div>
      <slot name="summary"></slot>
    `;
  }

  static styles = css`
    :host {
      display: block;
      container-type: inline-size;
      --ha-assist-chip-container-shape: 10px;
      --ha-assist-chip-container-color: var(--card-background-color);
    }

    .primary {
      display: flex;
      align-items: center;
      min-block-size: 56px;
      padding-inline: var(--ha-space-4, 16px);
      column-gap: var(--ha-space-4, 16px);
      box-sizing: border-box;
      background: var(--primary-background-color);
      box-shadow: inset 0 -1px var(--divider-color);
    }

    .leading,
    .trailing {
      display: flex;
      align-items: center;
      gap: var(--ha-space-4, 16px);
      min-inline-size: 0;
    }
    .trailing {
      margin-inline-start: auto;
    }
    .primary[hidden],
    .primary > [hidden] {
      display: none;
    }
    .search {
      flex: 1;
      min-inline-size: 0;
      --ha-input-search-height: 32px;
      --ha-input-search-border-radius: 10px;
    }

    slot[name="leading"],
    slot[name="trailing"] {
      display: contents;
    }

    ::slotted([slot="search"]),
    ::slotted([slot="summary"]) {
      inline-size: 100%;
      box-sizing: border-box;
    }

    ::slotted([slot="summary"]) {
      display: flex;
      overflow-x: auto;
      white-space: nowrap;
      scrollbar-width: none;
      box-shadow: inset 0 -1px var(--divider-color);
    }

    :host([search-hidden]) .primary,
    :host([search-hidden]) ::slotted([slot="summary"]) {
      background: var(--card-background-color);
    }
    :host([search-hidden]) .primary {
      overflow-x: auto;
      scrollbar-width: none;
    }
    :host([search-hidden]) .primary::-webkit-scrollbar {
      display: none;
    }
    :host([search-hidden]) .leading,
    :host([search-hidden]) .trailing {
      flex: 0 0 auto;
    }

    ::slotted([slot="summary"])::-webkit-scrollbar {
      display: none;
    }

    @container (max-width: 1017px) {
      :host(:not([search-hidden])) .leading {
        align-self: stretch;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
      }
      :host(:not([search-hidden])) .leading::-webkit-scrollbar {
        display: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-tabs-subpage-data-toolbar": KnxTabsSubpageDataToolbar;
  }
}
