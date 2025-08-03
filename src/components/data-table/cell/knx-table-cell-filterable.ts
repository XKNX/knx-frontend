/**
 * Filterable Table Cell Component
 *
 * An enhanced table cell that extends the base knx-table-cell with filtering
 * capabilities. Provides interactive filter button that appears on hover,
 * visual indication of active filter state, customizable filter values and
 * display text and localized tooltips for accessibility.
 *
 * The component is designed for ha data tables where users need to quickly filter
 * content by clicking on cell values. It maintains the base cell layout while
 * adding an optional filter button. On mobile touch devices, filtering can be
 * disabled for better user experience by setting filterDisabled=true.
 */

import { html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { mdiFilterVariant, mdiFilterVariantRemove } from "@mdi/js";
import "@ha/components/ha-icon-button";

import type { KNX } from "../../../types/knx";
import { KnxTableCell } from "./knx-table-cell";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Event details for the toggle-filter custom event
 * Provides information about the filter value and its new state
 */
export interface ToggleFilterEvent {
  /** The filter value that was toggled */
  value: string;
  /** Whether the filter is now active (true) or inactive (false) */
  active: boolean;
}

@customElement("knx-table-cell-filterable")
export class KnxTableCellFilterable extends KnxTableCell {
  /**
   * KNX integration instance for localization support
   * Required for generating accessible tooltips and UI text
   */
  @property({ type: Object }) public knx!: KNX;

  /**
   * The unique identifier value used for filtering operations
   * This is the actual value that will be passed to filter logic
   */
  @property({ attribute: false }) public filterValue!: string;

  /**
   * Optional human-readable display text for tooltips
   * Falls back to filterValue if not provided
   */
  @property({ attribute: false }) public filterDisplayText?: string;

  /**
   * Current filter state for this value
   * Controls visual styling and icon display
   */
  @property({ attribute: false }) public filterActive = false;

  /**
   * Whether filtering functionality should be disabled
   * When true, no filter button will be shown
   */
  @property({ attribute: false }) public filterDisabled = false;

  /**
   * Component-specific styles.
   */
  public static styles = [
    ...KnxTableCell.styles,
    css`
      .filter-button {
        display: none;
        flex-shrink: 0;
      }
      .container:hover .filter-button {
        display: block;
      }
      .filter-active {
        display: block;
        color: var(--primary-color);
      }
    `,
  ];

  // ============================================================================
  // Render Methods
  // ============================================================================

  /**
   * Renders the complete filterable cell structure
   *
   * Extends the base cell template with:
   * - Filter button that appears on hover or when active
   * - Dynamic icon based on filter state
   * - Localized tooltips for accessibility
   * - Conditional rendering based on filterValue presence
   *
   * @returns Template combining base cell content with filter functionality
   */
  protected render() {
    return html`
      <div class="container">
        <div class="content-wrapper">
          <slot name="primary"></slot>
          <slot name="secondary"></slot>
        </div>
        <!-- Filter Button - conditionally rendered based on filterValue and filterDisabled -->
        ${this.filterValue && !this.filterDisabled
          ? html`
              <div class="filter-button ${this.filterActive ? "filter-active" : ""}">
                <ha-icon-button
                  .path=${this.filterActive ? mdiFilterVariantRemove : mdiFilterVariant}
                  @click=${this._handleFilterClick}
                  .title=${this.knx.localize(
                    this.filterActive
                      ? "knx_table_cell_filterable_filter_remove_tooltip"
                      : "knx_table_cell_filterable_filter_set_tooltip",
                    { value: this.filterDisplayText || this.filterValue },
                  )}
                >
                </ha-icon-button>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Handles filter button click events
   *
   * Responsibilities:
   * - Prevents event propagation to avoid triggering row selection
   * - Dispatches custom 'toggle-filter' event with filter details
   * - Updates local filter state for immediate visual feedback
   *
   * @param ev - The click event from the filter button
   */
  private _handleFilterClick(ev: Event): void {
    ev.stopPropagation();

    // Dispatch toggle filter event with current state information
    this.dispatchEvent(
      new CustomEvent("toggle-filter", {
        bubbles: true,
        composed: true,
        detail: {
          value: this.filterValue,
          active: !this.filterActive,
        },
      }),
    );

    // Update local state for immediate visual feedback
    this.filterActive = !this.filterActive;
  }
}

// ============================================================================
// TypeScript Declarations
// ============================================================================

/**
 * Extend HTMLElementTagNameMap for TypeScript support
 */
declare global {
  interface HTMLElementTagNameMap {
    "knx-table-cell-filterable": KnxTableCellFilterable;
  }

  /**
   * Define custom events for the filterable cell component
   */
  interface HASSDomEvents {
    "toggle-filter": ToggleFilterEvent;
  }
}
