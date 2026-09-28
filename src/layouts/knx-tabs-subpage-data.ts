import { ResizeController } from "@lit-labs/observers/resize-controller";
import { mdiFilterVariant } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, queryAssignedElements, state } from "lit/decorators";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { LocalizeFunc } from "@ha/common/translations/localize";
import type { HomeAssistant, Route } from "@ha/types";
import "@ha/components/ha-filter-pane-chip";
import "@ha/layouts/hass-tabs-subpage";
import type { PageNavigation } from "@ha/layouts/hass-tabs-subpage";
import "./knx-tabs-subpage-data-filter-pane";
import "./knx-tabs-subpage-data-toolbar";

/**
 * HA tabs subpage with toolbar and filter pane for content other than a data table,
 * following the layout of HA's `hass-tabs-subpage-data-table`.
 *
 * The filter pane holds filter controls on the start side; the active filters row shows
 * selected filters as chips below the toolbar; the sidebar slot takes supplementary
 * content on the end side (right in LTR layouts). The page owns searching, filtering,
 * chip removal and content rendering, and imports the HA controls it slots in.
 * Optional slots need no visibility switches because an empty slot takes no space.
 *
 * Mount below `knx-frontend`, which supplies HA contexts within the iframe, and pass
 * its `hass`, `route` and `narrow` values. A standalone host must provide equivalent
 * contexts, including internationalization and `narrowViewportContext`: setting this
 * element's `narrow` property alone does not configure HA's tab layout.
 * Give the host a bounded height; the page content must provide its own scrolling.
 *
 * The filter pane is inline above 750px component width, otherwise an HA adaptive
 * dialog. `filterPaneNarrow` overrides this; `narrow` is the fallback before the first
 * resize measurement. HA chooses dialog versus bottom sheet from the viewport when the
 * adaptive dialog mounts, independently of this mode.
 *
 * User interactions update `showFilters` before notifying the page.
 * Property assignments do not emit change events. Events bubble across shadow roots;
 * `clear-filter` is forwarded from the filter pane without changing filter values.
 *
 * @slot - Page content.
 * @slot header - Replaces the HA page title where HA renders it (narrow or fewer than
 *   two visible tabs). Suppresses moving the search into the header when populated.
 * @slot toolbar-icon - Page actions in the HA top bar, e.g. `ha-icon-button`.
 * @slot toolbar-leading - Toolbar actions before the search, e.g. `ha-assist-chip`.
 * @slot toolbar-search - Search field, e.g. `ha-input-search`. With `narrow` and no custom
 *   header it replaces the page title; include the page name in its localized label.
 * @slot toolbar-trailing - Toolbar actions after the search, e.g. `ha-assist-chip`.
 * @slot active-filters - Active filters below the toolbar, slotted directly as `ha-input-chip`s.
 *   The row collapses while the slot is empty. Call `preventDefault()` in the chip's
 *   `remove` handler and update your state, or the chip removes itself from the DOM.
 * @slot banner - Full-width notice below the active filters row, e.g. `ha-alert`.
 * @slot sidebar - Supplementary content right of the content and its footer. Frameless and
 *   without state: the page owns its width, visibility and narrow presentation, e.g. an
 *   `ha-adaptive-dialog`.
 * @slot content-footer - Below the content, next to the sidebar. Frameless.
 * @slot footer - Below content and sidebar. Frameless.
 * @slot filter-pane - Filter controls, e.g. `knx-list-filter`; requires `hasFilters` and
 *   `showFilters`. Closing the pane leaves the filter values unchanged.
 * @slot filter-pane-actions - Actions in the open filter pane's header, e.g. `ha-icon-button`.
 * @fires show-filters-changed - Filter pane toggled by the user; `detail.value` is its new
 *   boolean visibility. Synchronize any visibility state owned by the consuming page.
 * @fires clear-filter - Request to clear active filters; no application payload. The page
 *   must reset its filters, chips and counts. Clearing does not close the filter pane.
 * @cssprop [--knx-tabs-subpage-data-filter-pane-width=250px] - Inline filter pane width.
 *
 * @example
 * // In a Lit page under knx-frontend; values and handlers belong to that page.
 * // _showFiltersChanged copies event.detail.value into reactive _showFilters state.
 * // Import the shell and any slotted controls in the page module.
 * import "../layouts/knx-tabs-subpage-data";
 * import "@ha/components/input/ha-input-search";
 * html`<knx-tabs-subpage-data
 *   .hass=${this.hass} .route=${this.route} .tabs=${this.tabs} .narrow=${this.narrow}
 *   .hasFilters=${true} .filters=${this._activeFilterCount} .showFilters=${this._showFilters}
 *   @show-filters-changed=${this._showFiltersChanged}
 *   @clear-filter=${this._clearFilters}
 * >
 *   <ha-input-search slot="toolbar-search" .label=${this._searchLabel}
 *     @input=${this._searchChanged}></ha-input-search>
 *   <div slot="filter-pane">${this._renderFilters()}</div>
 *   ${this._renderContent()}
 * </knx-tabs-subpage-data>`;
 */
@customElement("knx-tabs-subpage-data")
export class KnxTabsSubpageData extends LitElement {
  /** Required HA state for navigation and labels; does not itself provide child contexts. */
  @property({ attribute: false }) public hass!: HomeAssistant;
  /** Current HA route, forwarded to the subpage for active-tab selection. */
  @property({ attribute: false }) public route!: Route;
  /** HA navigation entries; a single visible entry supplies the fallback page title. */
  @property({ attribute: false }) public tabs: PageNavigation[] = [];
  /** Optional destination for HA's back navigation. */
  @property({ attribute: "back-path" }) public backPath?: string;
  /** Resolves tab translation keys; defaults to `hass.localize` in the HA subpage. */
  @property({ attribute: false }) public localizeFunc?: LocalizeFunc;
  /** Host viewport flag for search placement; keep aligned with HA's narrow viewport context. */
  @property({ type: Boolean, reflect: true }) public narrow = false;
  /** Enables the filter toggle and pane; independent of whether any filters are active. */
  @property({ attribute: "has-filters", type: Boolean }) public hasFilters = false;
  /** Active-filter count for the toggle badge and clear action; supplied by the page. */
  @property({ type: Number }) public filters = 0;
  /** Opens the filter pane when `hasFilters` is true; user actions also update this value. */
  @property({ attribute: "show-filters", type: Boolean }) public showFilters = false;
  /** Result count for the filter dialog's close action; undefined uses the generic Close label. */
  @property({ attribute: false }) public resultCount?: number;
  /** Localized filter toggle/pane title; defaults to HA's Filters label. */
  @property({ attribute: false }) public filterLabel?: string;
  /**
   * Overrides the filter pane layout.
   * Undefined follows component width; true forces the adaptive dialog, false the inline pane.
   * Does not change search placement or HA's tab layout.
   */
  @property({ attribute: false }) public filterPaneNarrow?: boolean;
  @state() private _hasHeader = false;
  @state() private _hasSearch = false;
  @state() private _hasActiveFilterContent = false;

  @queryAssignedElements({ slot: "toolbar-search", flatten: true })
  private _searchElements!: HTMLElement[];

  @queryAssignedElements({ slot: "active-filters", flatten: true })
  private _activeFilterSlotElements!: HTMLElement[];

  /** Measures component width, not viewport width, to place the filter pane inline or in a dialog. */
  private _showPaneController = new ResizeController(this, {
    callback: (entries) => entries[0]?.contentRect.width > 750,
  });

  /** Tracks custom header content so an empty forwarding slot preserves HA's title fallback. */
  private _headerChanged(ev: Event): void {
    this._hasHeader =
      (ev.currentTarget as HTMLSlotElement).assignedElements({ flatten: true }).length > 0;
  }

  /** Reads the current search slot after moves between toolbar and header. */
  private _searchChanged(): void {
    this._hasSearch = this._searchElements.length > 0;
  }

  /** Collapses the active filters row when its last assigned element is removed. */
  private _activeFilterContentChanged(): void {
    this._hasActiveFilterContent = this._activeFilterSlotElements.length > 0;
  }

  /** Applies user-requested visibility and emits once per change, without altering filters. */
  private _setShowFilters(value: boolean): void {
    if (this.showFilters === value) return;
    this.showFilters = value;
    fireEvent(this, "show-filters-changed", { value });
  }

  /** Handles the toolbar chip's request to open or close the filter pane. */
  private _toggleFilters(): void {
    this._setShowFilters(!this.showFilters);
  }

  /** Handles pane dismissal while preserving the consumer's active filters. */
  private _closeFilters(): void {
    this._setShowFilters(false);
  }

  /** Returns the filter pane in the given mode while filters are enabled and the pane is open. */
  private _renderFilterPane(compact: boolean) {
    return this.hasFilters && this.showFilters
      ? html`<knx-tabs-subpage-data-filter-pane
          .narrow=${compact}
          .label=${this.filterLabel}
          .count=${this.filters}
          .resultCount=${this.resultCount}
          @close-filter-pane=${this._closeFilters}
        >
          <slot name="filter-pane-actions" slot="actions"></slot>
          <slot name="filter-pane"></slot>
        </knx-tabs-subpage-data-filter-pane>`
      : nothing;
  }

  /** Keeps the filter toggle in the toolbar unless the open inline pane supplies its own. */
  private _renderFilterChip(compact: boolean) {
    return this.hasFilters && (!this.showFilters || compact)
      ? html`<ha-filter-pane-chip
          slot="leading"
          .label=${this.filterLabel ?? this.hass.localize("ui.components.subpage-data-table.filters")}
          .path=${mdiFilterVariant}
          .count=${this.filters}
          .active=${Boolean(this.filters)}
          @click=${this._toggleFilters}
        ></ha-filter-pane-chip>`
      : nothing;
  }

  /** Composes the HA shell, relocating search and filter pane without owning their data. */
  protected render() {
    // Like HA's data table: narrow pages trade the title for the search, unless a header is set.
    const searchInHeader = this.narrow && this._hasSearch && !this._hasHeader;
    const search = html`<slot
      name="toolbar-search"
      slot="search"
      @slotchange=${this._searchChanged}
    ></slot>`;
    const compact = this.filterPaneNarrow ?? !(this._showPaneController.value ?? !this.narrow);
    const pane = this._renderFilterPane(compact);
    return html`<hass-tabs-subpage
      .hass=${this.hass}
      .route=${this.route}
      .tabs=${this.tabs}
      .backPath=${this.backPath}
      .localizeFunc=${this.localizeFunc}
    >
      <slot
        name="header"
        slot=${this._hasHeader ? "header" : "unused-header"}
        @slotchange=${this._headerChanged}
      ></slot>
      ${searchInHeader ? html`<div slot="header" class="header-search">${search}</div>` : nothing}
      <slot name="toolbar-icon" slot="toolbar-icon"></slot>
      <div class="workspace">
        ${!compact ? pane : nothing}
        <div class="main">
          <knx-tabs-subpage-data-toolbar>
            ${this._renderFilterChip(compact)}
            <slot name="toolbar-leading" slot="leading"></slot>
            ${searchInHeader ? nothing : search}
            <slot name="toolbar-trailing" slot="trailing"></slot>
            <div class="active-filters" slot="summary" ?hidden=${!this._hasActiveFilterContent}>
              <slot name="active-filters" @slotchange=${this._activeFilterContentChanged}></slot>
            </div>
          </knx-tabs-subpage-data-toolbar>
          <div class="banner"><slot name="banner"></slot></div>
          <div class="body">
            <div class="content">
              ${compact ? pane : nothing}
              <div class="content-body"><slot></slot></div>
              <slot name="content-footer"></slot>
            </div>
            <slot name="sidebar"></slot>
          </div>
          <slot name="footer"></slot>
        </div>
      </div>
    </hass-tabs-subpage>`;
  }

  static styles = css`
    :host,
    hass-tabs-subpage {
      display: block;
      height: 100%;
    }
    :host {
      --ha-filter-pane-width: var(--knx-tabs-subpage-data-filter-pane-width, 250px);
    }
    :host([narrow]) hass-tabs-subpage {
      --main-title-margin: 0;
    }
    .header-search {
      display: flex;
      align-items: center;
      inline-size: 100%;
    }
    .workspace {
      display: flex;
      height: calc(100% - var(--safe-area-inset-bottom, 0px));
      min-height: 0;
      overflow: hidden;
    }
    /* HA's bottom tab bar already reserves the bottom safe area. */
    hass-tabs-subpage[narrow][show-tabs] .workspace {
      height: 100%;
    }
    /* Forwarded consumers keep their public slot names, so toolbar selectors don't match. */
    ::slotted([slot="toolbar-search"]) {
      inline-size: 100%;
      box-sizing: border-box;
    }
    /* Matches the toolbar row above: same inline padding, one scrollable line. */
    .active-filters {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2, 8px);
      padding: var(--ha-space-2, 8px) var(--ha-space-4, 16px);
      box-sizing: border-box;
      overflow-x: auto;
      white-space: nowrap;
      scrollbar-width: none;
      box-shadow: inset 0 -1px var(--divider-color);
    }
    .active-filters[hidden] {
      display: none;
    }
    knx-tabs-subpage-data-toolbar[search-hidden] .active-filters {
      background: var(--card-background-color);
    }
    .active-filters::-webkit-scrollbar {
      display: none;
    }
    /* ha-input-chip sets its shape on :host, so only a rule on the chip itself reaches it. */
    ::slotted(ha-input-chip[slot="active-filters"]) {
      flex-shrink: 0;
      --md-input-chip-container-shape: 10px;
    }
    .main {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }
    /* Edge to edge: notices span the full content width without an outer frame. */
    .banner {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2, 8px);
    }
    .body {
      display: flex;
      flex: 1;
      min-height: 0;
    }
    .content {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      min-height: 0;
    }
    .content-body {
      flex: 1;
      min-height: 0;
    }
    /* Footers are frameless and keep their height while the content scrolls above them. */
    ::slotted([slot="content-footer"]),
    ::slotted([slot="footer"]) {
      flex-shrink: 0;
    }
    /* The page sizes the sidebar; it keeps that width while the content shrinks. */
    ::slotted([slot="sidebar"]) {
      flex-shrink: 0;
      min-height: 0;
    }
  `;
}

declare global {
  interface HASSDomEvents {
    "show-filters-changed": { value: boolean };
  }
  interface HTMLElementTagNameMap {
    "knx-tabs-subpage-data": KnxTabsSubpageData;
  }
}
