/**
 * KNX Sort Menu Item Component
 *
 * Individual sort option for knx-sort-menu.
 */

import { css, html, LitElement, nothing } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "@ha/common/dom/fire_event";

import { mdiArrowDown, mdiArrowUp } from "@mdi/js";

import "@ha/components/ha-icon-button";
import "@ha/components/ha-svg-icon";
import "@ha/components/ha-list-item";

import type { SortDirection } from "../types/sorting";
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
  @property({ type: String }) public criterion = "idField";

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

  /**
   * Whether this is a mobile device (mobile/tablet)
   * Controls button visibility behavior: on mobile devices only show active button
   */
  @property({ type: Boolean, attribute: "is-mobile-device" })
  public isMobileDevice = false;

  /**
   * Whether this sort menu item is disabled
   * When disabled, the item and buttons cannot be clicked but the active state is still visible
   */
  @property({ type: Boolean }) public disabled = false;

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
   * - On mobile devices: only show active button that works as toggle
   * - On desktop: show both buttons on hover, always show active button
   * - When disabled: prevent clicks but maintain visual state
   *
   * @returns Template result for the complete menu item
   */
  protected render(): TemplateResult {
    return html`
      <ha-list-item
        class="sort-row ${this.active ? "active" : ""} ${this.disabled ? "disabled" : ""}"
        @click=${this.disabled ? nothing : this._handleItemClick}
      >
        <div class="container">
          <div class="sort-field-name" title=${this.displayName} aria-label=${this.displayName}>
            ${this.displayName}
          </div>
          <div class="sort-buttons">
            ${this.isMobileDevice ? this._renderMobileButtons() : this._renderDesktopButtons()}
          </div>
        </div>
      </ha-list-item>
    `;
  }

  /**
   * Renders buttons for mobile devices (mobile/tablet)
   * Only shows the currently active direction button that acts as a toggle
   *
   * @returns Template result for mobile device buttons
   */
  private _renderMobileButtons(): TemplateResult | typeof nothing {
    if (!this.active) {
      return nothing;
    }

    const isDescending = this.direction === KnxSortMenu.DESC;
    return html`
      <ha-icon-button
        class="active"
        .path=${isDescending ? this.descendingIcon : this.ascendingIcon}
        .label=${isDescending ? this._descendingText : this._ascendingText}
        .title=${isDescending ? this._descendingText : this._ascendingText}
        .disabled=${this.disabled}
        @click=${this.disabled ? nothing : this._handleMobileButtonClick}
      ></ha-icon-button>
    `;
  }

  /**
   * Renders buttons for desktop devices
   * Shows both ascending and descending buttons with hover behavior
   *
   * @returns Template result for desktop buttons
   */
  private _renderDesktopButtons(): TemplateResult {
    return html`
      <ha-icon-button
        class=${this.active && this.direction === KnxSortMenu.DESC ? "active" : ""}
        .path=${this.descendingIcon}
        .label=${this._descendingText}
        .title=${this._descendingText}
        .disabled=${this.disabled}
        @click=${this.disabled ? nothing : this._handleDescendingClick}
      ></ha-icon-button>
      <ha-icon-button
        class=${this.active && this.direction === KnxSortMenu.ASC ? "active" : ""}
        .path=${this.ascendingIcon}
        .label=${this._ascendingText}
        .title=${this._ascendingText}
        .disabled=${this.disabled}
        @click=${this.disabled ? nothing : this._handleAscendingClick}
      ></ha-icon-button>
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

  /**
   * Handles clicks on the mobile device toggle button
   * Toggles between ascending and descending directions
   *
   * @param e - Mouse event from the mobile button
   */
  private _handleMobileButtonClick(e: MouseEvent): void {
    e.stopPropagation();
    const newDirection = this.direction === KnxSortMenu.ASC ? KnxSortMenu.DESC : KnxSortMenu.ASC;
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

    .sort-row.disabled {
      opacity: 0.6;
      cursor: not-allowed;
      pointer-events: auto;
    }

    .sort-row.disabled.active {
      --mdc-theme-text-primary-on-background: var(--primary-color);
      background-color: var(--mdc-theme-surface-variant, rgba(var(--rgb-primary-color), 0.06));
      font-weight: 500;
      opacity: 0.6;
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

    /* Don't show hover buttons when disabled */
    .sort-row.disabled:hover .sort-buttons ha-icon-button:not(.active) {
      display: none;
    }

    .sort-buttons ha-icon-button.active {
      display: flex;
      color: var(--primary-color);
    }

    /* Disabled buttons styling */
    .sort-buttons ha-icon-button[disabled] {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .sort-buttons ha-icon-button.active[disabled] {
      --icon-primary-color: var(--primary-color);
      opacity: 0.6;
    }

    /* Mobile device specific styles */
    .sort-buttons ha-icon-button.mobile-button {
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
      criterion: string;
      direction: SortDirection;
    };
  }
}
