/**
 * KNX Sort Menu Component
 *
 * A comprehensive dropdown menu component for sorting data tables that provides:
 * - Dynamic menu items through slotted child components
 * - Customizable header with title and toolbar slots
 * - Sort state management and synchronization
 * - Event-driven communication with parent components
 * - Accessibility support with proper ARIA implementation
 * - Material Design integration with mwc-menu
 * - Flexible positioning and anchor support
 *
 * Architecture:
 * - Uses composition pattern with slotted knx-sort-menu-item children
 * - Manages active state and propagates sort configuration changes
 * - Provides programmatic API for opening/closing menu
 * - Supports custom toolbar buttons (like pin toggles)
 * - Handles bidirectional data flow between parent and children
 *
 * Integration:
 * - Works with knx-sort-menu-item components as children
 * - Dispatches sort-changed events for parent consumption
 * - Synchronizes state with child menu items automatically
 * - Supports localization through KNX instance
 */

import { css, html, LitElement } from "lit";
import type { PropertyValues } from "lit";
import { customElement, property, query, queryAssignedElements } from "lit/decorators";
import { fireEvent } from "@ha/common/dom/fire_event";

import "@ha/components/ha-icon-button";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-switch";
import "@material/mwc-menu";
import "@material/mwc-list/mwc-list-item";

import "@ha/components/ha-icon-button-toggle";
import type { SortDirection } from "../types/sorting";
import type { KnxSortMenuItem } from "./knx-sort-menu-item";
import type { KNX } from "../types/knx";
import "./knx-sort-menu-item";

/**
 * Dropdown menu component that manages a collection of sort options
 * Uses slotted children for flexible menu item configuration
 */
@customElement("knx-sort-menu")
export class KnxSortMenu extends LitElement {
  // ============================================================================
  // Static Constants
  // ============================================================================

  /** Ascending sort direction constant */
  static readonly ASC: SortDirection = "asc";

  /** Descending sort direction constant */
  static readonly DESC: SortDirection = "desc";

  /** Default sort direction used when none specified */
  static readonly DEFAULT_DIRECTION: SortDirection = KnxSortMenu.ASC;

  /**
   * KNX instance for accessing localization and utilities
   * Required for generating localized text and accessing KNX-specific functionality
   */
  @property({ type: Object }) public knx!: KNX;

  /**
   * Currently active sort criterion identifier
   * Determines which menu item should be highlighted as active
   */
  @property({ type: String, attribute: "sort-criterion" })
  public sortCriterion = "";

  /**
   * Current sort direction (ascending or descending)
   * Applied to the active sort criterion
   */
  @property({ type: String, attribute: "sort-direction" })
  public sortDirection: SortDirection = KnxSortMenu.DEFAULT_DIRECTION;

  // ============================================================================
  // Internal References
  // ============================================================================

  /**
   * Reference to the underlying mwc-menu element
   * Used for programmatic menu control (open/close/positioning)
   */
  @query("mwc-menu") private _menu?: any;

  /**
   * References to all slotted knx-sort-menu-item children
   * Automatically updated when child elements change
   */
  @queryAssignedElements({
    selector: "knx-sort-menu-item",
  })
  private _sortMenuItems!: KnxSortMenuItem[];

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Lifecycle hook called when component properties change
   * Synchronizes state with child menu items when sort configuration updates
   *
   * @param changedProps - Map of changed property names to previous values
   */
  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (changedProps.has("sortCriterion") || changedProps.has("sortDirection")) {
      this._updateMenuItems();
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Synchronizes sort state with all child menu items
   * Updates active state, direction, and propagates KNX instance
   *
   * Called automatically when sort configuration changes
   */
  private _updateMenuItems(): void {
    if (!this._sortMenuItems) return;
    this._sortMenuItems.forEach((item) => {
      item.active = item.criterion === this.sortCriterion;
      item.direction =
        item.criterion === this.sortCriterion ? this.sortDirection : item.defaultDirection;
      // Propagate knx object to child items for localization
      item.knx = this.knx;
    });
  }

  // ============================================================================
  // Render Methods
  // ============================================================================

  /**
   * Main render method that creates the dropdown menu structure
   *
   * Structure:
   * - mwc-menu container with positioning and event handling
   * - Slotted header with customizable title and toolbar
   * - Divider separator between header and items
   * - Slotted menu items with event delegation
   *
   * @returns Template result for the complete menu component
   */
  protected render() {
    return html`
      <div class="menu-container">
        <mwc-menu
          .corner=${"BOTTOM_START"}
          .fixed=${true}
          @opened=${this._handleMenuOpened}
          @closed=${this._handleMenuClosed}
        >
          <slot name="header">
            <div class="header">
              <div class="title">
                <!-- Slot for custom title -->
                <slot name="title">${this.knx?.localize("knx_sort_menu_sort_by") ?? ""}</slot>
              </div>
              <div class="toolbar">
                <!-- Slot for adding custom buttons to the header -->
                <slot name="toolbar"></slot>
              </div>
            </div>
            <li divider></li>
          </slot>

          <!-- Menu items will be slotted here -->
          <slot @sort-option-selected=${this._handleSortOptionSelected}></slot>
        </mwc-menu>
      </div>
    `;
  }

  // ============================================================================
  // Public API Methods
  // ============================================================================

  /**
   * Opens the dropdown menu anchored to the specified element
   * Provides programmatic control for parent components
   *
   * @param anchorEl - HTML element to anchor the menu to
   */
  public openMenu(anchorEl: HTMLElement): void {
    if (this._menu) {
      this._menu.anchor = anchorEl;
      this._menu.show();
    }
  }

  /**
   * Closes the dropdown menu programmatically
   * Can be called from parent components or event handlers
   */
  public closeMenu(): void {
    if (this._menu) {
      this._menu.close();
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Updates the current sorting configuration and dispatches change event
   * Only fires event if the sort configuration actually changed
   *
   * @param criterion - The sort criterion identifier
   * @param direction - The sort direction ("asc" or "desc")
   */
  private _updateSorting(criterion: string, direction: SortDirection): void {
    // Only update and fire event if something actually changed
    if (criterion !== this.sortCriterion || direction !== this.sortDirection) {
      this.sortCriterion = criterion;
      this.sortDirection = direction;
      // Use as any to bypass type checking for the custom event
      fireEvent(this, "sort-changed", { criterion, direction } as any);
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Handles menu opened event
   * Ensures child menu items are synchronized when menu becomes visible
   */
  private _handleMenuOpened(): void {
    this._updateMenuItems();
  }

  /**
   * Handles menu closed event
   * Available for additional cleanup or state management if needed
   */
  private _handleMenuClosed(): void {
    // Additional actions when menu closes (if needed)
  }

  /**
   * Handles sort option selection events from child menu items
   * Processes selection and closes menu after updating sort state
   *
   * @param e - Custom event containing criterion and direction
   */
  private _handleSortOptionSelected(e: CustomEvent): void {
    const { criterion, direction } = e.detail;
    this._updateSorting(criterion, direction);
    this.closeMenu();
  }

  // ============================================================================
  // Styles
  // ============================================================================

  /**
   * Component-specific styles.
   */

  static styles = css`
    .menu-container {
      position: relative;
      z-index: 1000;
      --mdc-list-vertical-padding: 0;
    }

    .header {
      position: sticky;
      top: 0;
      z-index: 1;
      background-color: var(--card-background-color, #fff);
      border-bottom: 1px solid var(--divider-color);
      font-weight: 500;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      height: 48px;
      gap: 20px;
      width: 100%;
      box-sizing: border-box;
    }

    .header .title {
      font-size: 14px;
      color: var(--secondary-text-color);
      font-weight: 500;
      flex: 1;
    }

    .header .toolbar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0px;
    }

    .menu-header .title {
      font-size: 14px;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-sort-menu": KnxSortMenu;
  }

  // Define custom events for knx-sort-menu
  interface KnxSortMenuEvents {
    "sort-changed": {
      criterion: string;
      direction: SortDirection;
    };
  }

  // Extend the global HASSDomEvents interface
  interface HASSDomEvents extends KnxSortMenuEvents {}
}
