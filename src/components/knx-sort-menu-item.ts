/**
 * KNX Sort Menu Item Component
 *
 * Individual sort option component for the KNX sort menu system that provides
 * interactive sort direction selection (ascending/descending), visual feedback
 * for active sort state, customizable icons and text labels, accessibility
 * support with ARIA attributes, hover effects for better user experience,
 * and integration with the parent sort menu component.
 *
 * Includes default direction support for initial sort selection, custom icon
 * support for ascending/descending buttons, localized text labels with
 * fallback support, click handling for both item and individual direction
 * buttons, event propagation control for nested interactions, and responsive
 * button visibility (hidden until hover or active).
 */

import { css, html, LitElement } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "@ha/common/dom/fire_event";

import { mdiArrowDown, mdiArrowUp } from "@mdi/js";

import "@ha/components/ha-icon-button";
import "@ha/components/ha-svg-icon";
import "@material/mwc-list/mwc-list-item";

import type { SortDirection, SortCriterion } from "../types/sorting";
import { KnxSortMenu } from "./knx-sort-menu";
import type { KNX } from "../types/knx";

/**
 * Individual sort menu item component that handles single sort criterion
 * Provides interactive buttons for ascending and descending sort directions
 */
@customElement("knx-sort-menu-item")
export class KnxSortMenuItem extends LitElement {
  // ============================================================================
  // Static Constants
  // ============================================================================

  /** Default icon for ascending sort direction */
  static readonly DEFAULT_ASC_ICON: string = mdiArrowUp;

  /** Default icon for descending sort direction */
  static readonly DEFAULT_DESC_ICON: string = mdiArrowDown;

  /**
   * KNX instance for accessing localization and utilities
   * Required for generating localized button labels and tooltips
   */
  @property({ type: Object }) public knx!: KNX;

  /**
   * The sort criterion identifier for this menu item
   * Corresponds to field names in the data configuration
   */
  @property({ type: String }) public criterion: SortCriterion = "idField";

  /**
   * Human-readable display name for this sort option
   * Shown as the main label for the sort criterion
   */
  @property({ type: String, attribute: "display-name" }) public displayName = "";

  /**
   * Default sort direction when this criterion is first selected
   * Determines initial behavior when user clicks the main item
   */
  @property({ type: String, attribute: "default-direction" })
  public defaultDirection: SortDirection = KnxSortMenu.DEFAULT_DIRECTION;

  /**
   * Current sort direction when this item is the active sort
   * Updated by the parent sort menu to reflect current state
   */
  @property({ type: String }) public direction: SortDirection = KnxSortMenu.ASC;

  /**
   * Whether this sort option is currently the active sort criterion
   * Controls visual highlighting and button visibility
   */
  @property({ type: Boolean }) public active = false;

  /**
   * Custom text label for the ascending sort button
   * Falls back to localized default if not provided
   */
  @property({ type: String, attribute: "ascending-text" })
  public ascendingText?: string;

  /**
   * Custom text label for the descending sort button
   * Falls back to localized default if not provided
   */
  @property({ type: String, attribute: "descending-text" })
  public descendingText?: string;

  /**
   * Custom icon path for the ascending sort button
   * Allows theming and customization of sort indicators
   */
  @property({ type: String, attribute: "ascending-icon" })
  public ascendingIcon: string = KnxSortMenuItem.DEFAULT_ASC_ICON;

  /**
   * Custom icon path for the descending sort button
   * Allows theming and customization of sort indicators
   */
  @property({ type: String, attribute: "descending-icon" })
  public descendingIcon: string = KnxSortMenuItem.DEFAULT_DESC_ICON;

  // ============================================================================
  // Computed Properties
  // ============================================================================

  /**
   * Gets the localized ascending sort text with fallback
   * Prioritizes custom text, then localization, then empty string
   *
   * @returns Localized or custom ascending sort label
   */
  private get _ascendingText(): string {
    return this.ascendingText ?? this.knx?.localize("knx_sort_menu_item_ascending") ?? "";
  }

  /**
   * Gets the localized descending sort text with fallback
   * Prioritizes custom text, then localization, then empty string
   *
   * @returns Localized or custom descending sort label
   */
  private get _descendingText(): string {
    return this.descendingText ?? this.knx?.localize("knx_sort_menu_item_descending") ?? "";
  }

  // ============================================================================
  // Render Methods
  // ============================================================================

  /**
   * Main render method that creates the complete sort menu item
   *
   * Structure:
   * - List item container with click handling
   * - Display name for the sort criterion
   * - Direction buttons (ascending/descending) with conditional visibility
   *
   * @returns Template result for the complete menu item
   */
  protected render(): TemplateResult {
    return html`
      <mwc-list-item
        class="sort-row ${this.active ? "active" : ""}"
        @click=${this._handleItemClick}
      >
        <div class="container">
          <div class="sort-field-name" title=${this.displayName} aria-label=${this.displayName}>
            ${this.displayName}
          </div>
          <div class="sort-buttons">
            <ha-icon-button
              class=${this.active && this.direction === KnxSortMenu.DESC ? "active" : ""}
              .path=${this.descendingIcon}
              .label=${this._descendingText}
              .title=${this._descendingText}
              @click=${this._handleDescendingClick}
            ></ha-icon-button>
            <ha-icon-button
              class=${this.active && this.direction === KnxSortMenu.ASC ? "active" : ""}
              .path=${this.ascendingIcon}
              .label=${this._ascendingText}
              .title=${this._ascendingText}
              @click=${this._handleAscendingClick}
            ></ha-icon-button>
          </div>
        </div>
      </mwc-list-item>
    `;
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Handles clicks on the descending sort button
   * Prevents event propagation and dispatches sort selection event
   *
   * @param e - Mouse event from the descending button
   */
  private _handleDescendingClick(e: MouseEvent): void {
    e.stopPropagation();
    fireEvent(this, "sort-option-selected", {
      criterion: this.criterion,
      direction: KnxSortMenu.DESC,
    });
  }

  /**
   * Handles clicks on the ascending sort button
   * Prevents event propagation and dispatches sort selection event
   *
   * @param e - Mouse event from the ascending button
   */
  private _handleAscendingClick(e: MouseEvent): void {
    e.stopPropagation();
    fireEvent(this, "sort-option-selected", {
      criterion: this.criterion,
      direction: KnxSortMenu.ASC,
    });
  }

  /**
   * Handles clicks on the main item area (not on buttons)
   * Toggles sort direction if already active, or sets default direction
   *
   * Logic:
   * - If this item is already active: toggle between ASC and DESC
   * - If this item is not active: use the configured default direction
   */
  private _handleItemClick(): void {
    const newDirection = this.active
      ? this.direction === KnxSortMenu.ASC
        ? KnxSortMenu.DESC
        : KnxSortMenu.ASC
      : this.defaultDirection;

    fireEvent(this, "sort-option-selected", {
      criterion: this.criterion,
      direction: newDirection,
    });
  }

  // ============================================================================
  // Styles
  // ============================================================================

  /**
   * Component-specific styles.
   */

  static styles = css`
    :host {
      display: block;
    }

    .sort-row {
      display: block;
      padding: 0 16px;
    }

    .sort-row.active {
      --mdc-theme-text-primary-on-background: var(--primary-color);
      background-color: var(--mdc-theme-surface-variant, rgba(var(--rgb-primary-color), 0.06));
      font-weight: 500;
    }

    .container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      height: 48px;
      gap: 10px;
    }

    .sort-field-name {
      display: flex;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 1rem;
      align-items: center;
    }

    .sort-buttons {
      display: flex;
      align-items: center;
      min-width: 96px;
      justify-content: flex-end;
    }

    /* Hide sort buttons by default unless active */
    .sort-buttons ha-icon-button:not(.active) {
      display: none;
      color: var(--secondary-text-color);
    }

    /* Show sort buttons on row hover */
    .sort-row:hover .sort-buttons ha-icon-button {
      display: flex;
    }

    .sort-buttons ha-icon-button.active {
      display: flex;
      color: var(--primary-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-sort-menu-item": KnxSortMenuItem;
  }

  interface HASSDomEvents {
    "sort-option-selected": {
      criterion: SortCriterion;
      direction: SortDirection;
    };
  }
}
