/**
 * KNX Sort Menu - A dropdown wrapper for sorting data tables
 *
 * Extends ha-dropdown with sort-specific state management:
 * - Tracks active sort criterion and direction
 * - Synchronizes state with child knx-sort-menu-item components
 * - Dispatches sort-changed events on selection
 * - Supports customizable header with title and toolbar slots
 *
 * Architecture:
 * - Uses composition pattern with slotted knx-sort-menu-item children
 * - Manages active state and propagates sort configuration changes
 * - Supports custom toolbar buttons (like pin toggles)
 * - Handles bidirectional data flow between parent and children
 */

import { css, html, LitElement } from "lit";
import type { PropertyValues } from "lit";
import { customElement, property, query, queryAssignedElements } from "lit/decorators";
import { fireEvent } from "@ha/common/dom/fire_event";

import "@ha/components/ha-dropdown";
import type { SortDirection } from "../types/sorting";
import { SORT_ASC } from "../types/sorting";
import type { KnxSortMenuItem } from "./knx-sort-menu-item";
import type { KNX } from "../types/knx";
import "./knx-sort-menu-item";

@customElement("knx-sort-menu")
export class KnxSortMenu extends LitElement {
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
  public sortDirection: SortDirection = SORT_ASC;

  /**
   * Whether this is a mobile device (mobile/tablet)
   * Controls button visibility behavior in child menu items
   */
  @property({ type: Boolean, attribute: "is-mobile-device" })
  public isMobileDevice = false;

  @query("ha-dropdown") private _dropdown?: any;

  @queryAssignedElements({ selector: "knx-sort-menu-item" })
  private _sortMenuItems!: KnxSortMenuItem[];

  /**
   * Lifecycle hook called when component properties change
   * Synchronizes state with child menu items when sort configuration updates
   */
  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (
      changedProps.has("sortCriterion") ||
      changedProps.has("sortDirection") ||
      changedProps.has("isMobileDevice")
    ) {
      this._updateMenuItems();
    }
  }

  /**
   * Synchronizes sort state with all child menu items
   * Updates active state, direction, and propagates KNX instance and mobile device state
   */
  private _updateMenuItems(): void {
    if (!this._sortMenuItems) return;
    this._sortMenuItems.forEach((item) => {
      item.active = item.criterion === this.sortCriterion;
      item.direction =
        item.criterion === this.sortCriterion ? this.sortDirection : item.defaultDirection;
      // Propagate knx object to child items for localization
      item.knx = this.knx;
      // Propagate mobile device state to child items
      item.isMobileDevice = this.isMobileDevice;
    });
  }

  /**
   * Main render method that creates the dropdown menu structure
   * - ha-dropdown with a slotted trigger button
   * - Slotted header with customizable title and toolbar
   * - Slotted menu items with event delegation
   */
  protected render() {
    return html`
      <ha-dropdown .placement=${"bottom-start"} @wa-after-show=${this._handleMenuOpened}>
        <!-- Trigger button slotted in by parent component -->
        <slot name="trigger" slot="trigger"></slot>

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
        </slot>

        <!-- Menu items will be slotted here -->
        <slot @sort-option-selected=${this._handleSortOptionSelected}></slot>
      </ha-dropdown>
    `;
  }

  /**
   * Updates the current sorting configuration and dispatches change event
   * Only fires event if the sort configuration actually changed
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

  /**
   * Handles menu opened event
   * Ensures child menu items are synchronized when menu becomes visible
   */
  private _handleMenuOpened(): void {
    this._updateMenuItems();
  }

  /**
   * Handles sort option selection events from child menu items
   * Processes selection and closes menu after updating sort state
   */
  private _handleSortOptionSelected(e: CustomEvent): void {
    const { criterion, direction } = e.detail;
    this._updateSorting(criterion, direction);
    if (this._dropdown) {
      this._dropdown.open = false;
    }
  }

  /**
   * Component-specific styles for menu container and header
   */
  static styles = css`
    .header {
      position: sticky;
      top: 0;
      z-index: 1;
      background-color: var(--card-background-color, #fff);
      border-bottom: 1px solid var(--divider-color);
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
