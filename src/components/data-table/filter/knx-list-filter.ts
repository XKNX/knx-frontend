/**
 * KNX List Filter Component
 *
 * A comprehensive filtering component for data tables that provides:
 * - Multi-select filtering with checkbox interface
 * - Real-time search/filtering across configurable fields
 * - Flexible sorting with multiple criteria and custom comparators
 * - Expansion panel layout with customizable title
 * - Selected item pinning to top of list
 * - Responsive design for narrow/mobile layouts
 * - Full localization support
 * - Type-safe configuration system
 *
 * The component is highly configurable through field configurations that control
 * which fields are filterable, sortable, and how they should be displayed.
 * It integrates seamlessly with Home Assistant's design system and supports
 * custom event dispatching for parent component integration.
 */

import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { guard } from "lit/directives/guard";
import { repeat } from "lit/directives/repeat";

import { mdiFilterVariantRemove, mdiPin, mdiSortAscending, mdiSortDescending } from "@mdi/js";

import "@ha/components/ha-checkbox";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-icon-button";
import "@ha/components/ha-icon-button-toggle";
import "@ha/components/ha-svg-icon";
import "@ha/components/search-input-outlined";

import { haStyleScrollbar } from "@ha/resources/styles";

import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant } from "@ha/types";
import type { KNX } from "types/knx";
import type { Comparator, SortDirection } from "../../../types/sorting";
import { SORT_ASC } from "../../../types/sorting";
import { KnxCollator } from "../../../utils/sort";

// 6. Lokale Komponenten (falls verschachtelt)
import "../../flex-content-expansion-panel";
import "../../knx-sort-menu";
import "../../knx-sort-menu-item";

// ============================================================================
// Sorting Types
// ============================================================================

/**
 * Available sort criteria corresponding to the four configurable fields
 * in data table components.
 */
export type SortCriterion = "idField" | "primaryField" | "secondaryField" | "badgeField";

// ============================================================================
// Configuration Interfaces
// ============================================================================

/**
 * Main configuration interface for the list filter component
 * Defines how each of the four fields should behave
 */
export interface Config<T = any> {
  /** Configuration for the unique identifier field */
  idField: FieldConfig<T>;
  /** Configuration for the primary display field */
  primaryField: FieldConfig<T>;
  /** Configuration for the secondary/description field */
  secondaryField: FieldConfig<T>;
  /** Configuration for the badge/count field */
  badgeField: FieldConfig<T>;
}

/**
 * Configuration for individual fields within the list filter
 * Provides complete control over field behavior, display, and interaction
 */
export interface FieldConfig<T = any> {
  /** Whether this field should be included in text-based filtering */
  filterable: boolean;

  /** Whether this field should be available as a sort option */
  sortable: boolean;

  /** The localized display name for this field in sort menus */
  fieldName?: string;

  /** Localized text for ascending sort option (falls back to default) */
  sortAscendingText?: string;

  /** Localized text for descending sort option (falls back to default) */
  sortDescendingText?: string;

  /** Default sort direction when this field is first selected */
  sortDefaultDirection?: SortDirection;

  /** Function to extract the display value from raw data items */
  mapper: (item: T) => string | undefined;

  /** Optional custom comparator for specialized sorting behavior */
  comparator?: Comparator<FilterOption>;
}

// ============================================================================
// Data Interfaces
// ============================================================================

/**
 * Standardized filter option structure with dynamic field mapping
 * All raw data items are transformed into this format for consistent processing
 */
export interface FilterOption {
  /** Unique identifier extracted from the data item */
  idField: string;
  /** Primary display text extracted from the data item */
  primaryField: string;
  /** Optional secondary text (description, name, etc.) */
  secondaryField?: string;
  /** Optional badge text (count, status, etc.) */
  badgeField?: string;
  /** Current selection state for this option */
  selected: boolean;
}

// ============================================================================
// Event Interfaces
// ============================================================================

/**
 * Event payload for selection changes
 * Dispatched when user modifies filter selections
 */
export interface SelectionChangedEvent {
  /** Array of currently selected option IDs */
  value: string[];
  /** Optional set of selected items for performance (deprecated) */
  items?: Set<string>;
}

/**
 * Event payload for expansion state changes
 * Dispatched when the filter panel is expanded or collapsed
 */
export interface ExpandedChangedEvent {
  /** Whether the panel is now expanded */
  expanded: boolean;
}

@customElement("knx-list-filter")
export class KnxListFilter<T = any> extends LitElement {
  /**
   * Home Assistant instance for accessing global functionality
   * Uses hasChanged: false to prevent unnecessary re-renders
   */
  @property({ attribute: false, hasChanged: () => false }) public hass!: HomeAssistant;

  /**
   * KNX integration instance providing localization and utilities
   * Required for generating localized text and accessing KNX-specific functionality
   */
  @property({ attribute: false }) public knx!: KNX;

  /**
   * Raw data array to be filtered and displayed
   * Can be any type T, will be transformed using field mappers
   */
  @property({ attribute: false }) public data: T[] = [];

  /**
   * Array of currently selected option IDs
   * Controls which items appear as checked in the filter list
   */
  @property({ attribute: false }) public selectedOptions?: string[];

  /**
   * Field configuration object defining behavior for all four fields
   * Controls filtering, sorting, display, and data extraction
   */
  @property({ attribute: false }) public config!: Config<T>;

  /**
   * Current expansion state of the filter panel
   * Controls whether the filter content is visible or collapsed
   */
  @property({ type: Boolean, reflect: true }) public expanded = false;

  /**
   * Layout mode indicator for responsive design
   * When true, adapts UI for mobile/narrow screen layouts
   */
  @property({ type: Boolean }) public narrow = false;

  /**
   * Controls whether selected items are automatically moved to the top
   * When enabled, checked items appear first in the list regardless of sort order
   */
  @property({ type: Boolean, attribute: "pin-selected-items" })
  public pinSelectedItems = true;

  /**
   * Custom title for the filter panel header
   * If not provided, uses a default localized title
   */
  @property({ type: String, attribute: "filter-title" })
  public filterTitle?: string;

  /**
   * Current search query for text-based filtering
   * Applied to all filterable fields to narrow down visible options
   */
  @property({ attribute: "filter-query" }) public filterQuery = "";

  /**
   * Active sort criterion determining which field is used for ordering
   * Must be one of the four configurable field types
   */
  @property({ attribute: "sort-criterion" }) public sortCriterion: SortCriterion = "primaryField";

  /**
   * Current sort direction for the active criterion
   * Controls whether items are sorted ascending or descending
   */
  @property({ attribute: "sort-direction" }) public sortDirection: SortDirection = "asc";

  // ============================================================================
  // Core Data Processing
  // ============================================================================

  /**
   * Main computation method that transforms, filters, and sorts the data
   *
   * Process flow:
   * 1. Transform raw data items into FilterOption objects using field mappers
   * 2. Apply text-based filtering using the current search query
   * 3. Sort using the selected criterion and direction
   * 4. Optionally pin selected items to the top
   *
   * @returns Processed and ready-to-render FilterOption array
   */
  private _computeFilterSortedOptions(): FilterOption[] {
    const {
      data,
      config: { idField, primaryField, secondaryField, badgeField },
      defaultComparators,
      sortCriterion,
      sortDirection,
      pinSelectedItems,
      selectedOptions = [],
    } = this;

    // Step 1: Transform raw data into standardized FilterOption format
    const mappedOptions = data.map((item: T) => {
      const id = idField.mapper(item);
      const primary = primaryField.mapper(item);

      if (!id || !primary) {
        throw new Error("Missing id or primary field on item: " + JSON.stringify(item));
      }

      return {
        idField: id,
        primaryField: primary,
        secondaryField: secondaryField.mapper(item),
        badgeField: badgeField.mapper(item),
        selected: selectedOptions.includes(id),
      } as FilterOption;
    });

    // Step 2: Apply search filtering across configured filterable fields
    const filtered = this._applyFilterToOptions(mappedOptions);

    // Step 3: Apply sorting with selected criterion and direction
    const comparator: Comparator<FilterOption> =
      this.config[sortCriterion]?.comparator ?? defaultComparators[sortCriterion];

    return this._sortOptions(filtered, comparator, sortDirection, pinSelectedItems);
  }

  /**
   * Default sorting comparators for each field type
   *
   * Each comparator includes intelligent tie-breaking by checking other fields
   * in a logical order to ensure consistent and predictable sorting behavior.
   * Uses KnxCollator for locale-aware string comparison.
   */
  defaultComparators: Record<SortCriterion, Comparator<FilterOption>> = {
    /** Sort by ID field with fallback hierarchy */
    idField: (a, b) => KnxCollator.compare(a.idField, b.idField),

    /** Sort by primary field, fall back to secondary, badge, then ID */
    primaryField: (a, b) =>
      KnxCollator.compare(a.primaryField ?? "", b.primaryField ?? "") ||
      KnxCollator.compare(a.secondaryField ?? "", b.secondaryField ?? "") ||
      KnxCollator.compare(a.badgeField ?? "", b.badgeField ?? "") ||
      KnxCollator.compare(a.idField, b.idField),

    /** Sort by secondary field, fall back to primary, badge, then ID */
    secondaryField: (a, b) =>
      KnxCollator.compare(a.secondaryField ?? "", b.secondaryField ?? "") ||
      KnxCollator.compare(a.primaryField ?? "", b.primaryField ?? "") ||
      KnxCollator.compare(a.badgeField ?? "", b.badgeField ?? "") ||
      KnxCollator.compare(a.idField, b.idField),

    /** Sort by badge field, fall back to primary, secondary, then ID */
    badgeField: (a, b) =>
      KnxCollator.compare(a.badgeField ?? "", b.badgeField ?? "") ||
      KnxCollator.compare(a.primaryField ?? "", b.primaryField ?? "") ||
      KnxCollator.compare(a.secondaryField ?? "", b.secondaryField ?? "") ||
      KnxCollator.compare(a.idField, b.idField),
  };

  // ============================================================================
  // Filtering and Sorting Helpers
  // ============================================================================

  /**
   * Applies text-based filtering to the options array
   *
   * Searches across all fields marked as filterable in the configuration.
   * Performs case-insensitive substring matching on string values.
   *
   * @param options - Array of FilterOption items to filter
   * @returns Filtered array containing only matching items
   */
  private _applyFilterToOptions(options: FilterOption[]): FilterOption[] {
    if (!this.filterQuery) {
      return options;
    }

    const query = this.filterQuery.toLowerCase();
    const { idField, primaryField, secondaryField, badgeField } = this.config;

    // Build list of field accessors for filterable fields only
    const accessors: ((opt: FilterOption) => string | undefined)[] = [];
    if (idField.filterable) accessors.push((opt) => opt.idField);
    if (primaryField.filterable) accessors.push((opt) => opt.primaryField);
    if (secondaryField.filterable) accessors.push((opt) => opt.secondaryField);
    if (badgeField.filterable) accessors.push((opt) => opt.badgeField);

    return options.filter((option) =>
      accessors.some((getField) => {
        const val = getField(option);
        return typeof val === "string" && val.toLowerCase().includes(query);
      }),
    );
  }

  /**
   * Sorts options using the provided comparator with direction and pinning support
   *
   * @param options - Array of FilterOption items to sort
   * @param comparator - Comparison function for determining sort order
   * @param direction - Sort direction ("asc" or "desc")
   * @param pinSelected - Whether to pin selected items at the top
   * @returns New sorted array (does not mutate input)
   */
  private _sortOptions(
    options: readonly FilterOption[],
    comparator: Comparator<FilterOption>,
    direction: SortDirection = SORT_ASC,
    pinSelected = false,
  ): FilterOption[] {
    const directionFactor = direction === SORT_ASC ? 1 : -1;

    const combinedComparator: Comparator<FilterOption> = (a, b) => {
      // Priority 1: Pin selected items to the top when enabled
      if (pinSelected && a.selected !== b.selected) {
        return a.selected ? -1 : 1;
      }
      // Priority 2: Apply configured comparator with direction
      return comparator(a, b) * directionFactor;
    };

    return [...options].sort(combinedComparator);
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Handles search input changes from the filter text field
   * Updates the filterQuery property which triggers re-filtering of options
   *
   * @param ev - Custom event containing the new search value
   */
  private _handleSearchChange(ev: CustomEvent<{ value: string }>): void {
    this.filterQuery = ev.detail.value;
  }

  /**
   * Handles sort button clicks to open the sort menu
   * Prevents event propagation and locates the sort menu component
   *
   * @param ev - Mouse event from the sort button
   */
  private _handleSortButtonClick(ev: MouseEvent): void {
    ev.stopPropagation();
    const sortMenu = this.shadowRoot?.querySelector("knx-sort-menu");
    if (sortMenu) {
      sortMenu.openMenu(ev.currentTarget as HTMLElement);
    }
  }

  /**
   * Handles sort configuration changes from the sort menu
   * Updates both the sort criterion and direction based on user selection
   *
   * @param ev - Custom event containing the new sort configuration
   */
  private _handleSortChanged(
    ev: CustomEvent<{ criterion: SortCriterion; direction: SortDirection }>,
  ): void {
    this.sortCriterion = ev.detail.criterion;
    this.sortDirection = ev.detail.direction;
  }

  /**
   * Handles pin button toggle clicks
   * Controls whether selected items are pinned to the top of the list
   *
   * @param ev - Mouse event from the pin toggle button
   */
  private _handlePinButtonClick(ev: MouseEvent): void {
    ev.stopPropagation();
    this.pinSelectedItems = !this.pinSelectedItems;
  }

  /**
   * Handles clear filters button clicks
   * Removes all current selections and notifies parent components
   *
   * @param ev - Mouse event from the clear button
   */
  private _handleClearFiltersButtonClick(ev: MouseEvent): void {
    ev.stopPropagation();
    ev.preventDefault();
    this._setSelectedOptions([]);
  }

  /**
   * Updates selected options and dispatches selection change event
   * Centralizes selection state management and event dispatching
   *
   * @param options - Array of option IDs that should be selected
   */
  private _setSelectedOptions(options: string[]) {
    this.selectedOptions = options;
    fireEvent(this, "selection-changed", { value: this.selectedOptions });
  }

  /**
   * Returns the appropriate sort icon based on the current sort direction.
   * @returns The path to the sort icon (ascending or descending)
   */
  private _getSortIcon(): string {
    return this.sortDirection === SORT_ASC ? mdiSortAscending : mdiSortDescending;
  }

  /**
   * Checks if any field is filterable or sortable, to determine whether to show filter controls.
   * @returns boolean True if at least one field is filterable or sortable
   */
  private _hasFilterableOrSortableFields(): boolean {
    if (!this.config) return false;

    return Object.values(this.config).some((field) => field.filterable || field.sortable);
  }

  /**
   * Checks if any field is filterable, to determine whether to show search input.
   * @returns boolean True if at least one field is filterable
   */
  private _hasFilterableFields(): boolean {
    if (!this.config) return false;

    return Object.values(this.config).some((field) => field.filterable);
  }

  /**
   * Checks if any field is sortable, to determine whether to show sort controls.
   * @returns boolean True if at least one field is sortable
   */
  private _hasSortableFields(): boolean {
    if (!this.config) return false;

    return Object.values(this.config).some((field) => field.sortable);
  }

  /**
   * Invoked after the expansion state changes. Updates the `expanded` property
   * and fires a custom event notifying parent components.
   * @param ev - The event indicating the new expansion state.
   */
  private _expandedChanged(ev: CustomEvent<{ expanded: boolean }>): void {
    this.expanded = ev.detail.expanded;
    fireEvent(this, "expanded-changed", { expanded: this.expanded });
  }

  private _handleOptionItemClick(ev: MouseEvent): void {
    const listItem = ev.currentTarget as HTMLElement;
    const value = listItem.getAttribute("data-value");
    if (!value) return;
    this._toggleOption(value);
  }

  /**
   * Toggles the selection state of a particular filter option.
   * @param optionId - The option's unique value.
   */
  private _toggleOption(optionId: string): void {
    if (this.selectedOptions?.includes(optionId) ?? false) {
      this._setSelectedOptions(this.selectedOptions?.filter((item) => item !== optionId) ?? []);
    } else {
      this._setSelectedOptions([...(this.selectedOptions ?? []), optionId]);
    }
  }

  // ============================================================================
  // Render Methods
  // ============================================================================

  /**
   * Renders the filter control toolbar containing search input and sort menu
   * Conditionally displays search and sort controls based on field configuration
   *
   * @returns Template result for the filter toolbar with search and sort controls
   */
  private _renderFilterControl() {
    return html`
      <div class="filter-toolbar">
        <div class="search">
          ${this._hasFilterableFields()
            ? html`
                <search-input-outlined
                  .hass=${this.hass}
                  .filter=${this.filterQuery}
                  @value-changed=${this._handleSearchChange}
                ></search-input-outlined>
              `
            : nothing}
        </div>
        ${this._hasSortableFields()
          ? html`
              <div class="buttons">
                <ha-icon-button
                  class="sort-button"
                  .path=${this._getSortIcon()}
                  title=${this.sortDirection === SORT_ASC
                    ? this.knx.localize("knx_list_filter_sort_ascending_tooltip")
                    : this.knx.localize("knx_list_filter_sort_descending_tooltip")}
                  @click=${this._handleSortButtonClick}
                ></ha-icon-button>

                <knx-sort-menu
                  .sortCriterion=${this.sortCriterion}
                  .sortDirection=${this.sortDirection}
                  @sort-changed=${this._handleSortChanged}
                >
                  <div slot="title">${this.knx.localize("knx_list_filter_sort_by")}</div>

                  <!-- Toolbar with additional controls like pin button -->
                  <div slot="toolbar">
                    <!-- Pin Button for keeping selected items at top -->
                    <ha-icon-button-toggle
                      .path=${mdiPin}
                      .selected=${this.pinSelectedItems}
                      @click=${this._handlePinButtonClick}
                      title=${this.knx.localize("knx_list_filter_selected_items_on_top")}
                    >
                    </ha-icon-button-toggle>
                  </div>
                  <!-- Sort menu items generated from sortable fields -->
                  ${Object.entries(this.config || {}).map(([key, field]) =>
                    field.sortable
                      ? html`
                          <knx-sort-menu-item
                            criterion=${key as SortCriterion}
                            display-name=${field.fieldName}
                            default-direction=${field.sortDefaultDirection ?? "asc"}
                            ascending-text=${field.sortAscendingText ??
                            this.knx.localize("knx_list_filter_sort_ascending")}
                            descending-text=${field.sortDescendingText ??
                            this.knx.localize("knx_list_filter_sort_descending")}
                          ></knx-sort-menu-item>
                        `
                      : nothing,
                  )}
                </knx-sort-menu>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  /**
   * Renders the main options list with filtered and sorted results
   * Uses guard() for performance optimization and repeat() for efficient updates
   *
   * @returns Template result for the scrollable options list
   */
  private _renderOptionsList(): TemplateResult {
    const emptyMsg = this.knx.localize("knx_list_filter_no_results");

    return html`
      ${guard(
        // Guard prevents re-rendering unless these specific values change
        [
          this.filterQuery,
          this.sortDirection,
          this.sortCriterion,
          this.data,
          this.selectedOptions,
          this.expanded,
          this.config,
          this.pinSelectedItems,
        ],
        () => {
          const options = this._computeFilterSortedOptions();

          if (options.length === 0) {
            return html`<div class="empty-message" role="alert">${emptyMsg}</div>`;
          }

          return html`
            <div class="options-list" tabindex="0">
              ${repeat(
                options,
                (opt) => opt.idField,
                (opt) => this._renderOptionItem(opt),
              )}
            </div>
          `;
        },
      )}
    `;
  }

  /**
   * Renders a single option item with checkbox and content
   * Displays primary text, optional secondary text, and badge
   *
   * @param option - The filter option data to render
   * @returns Template result for the individual option item
   */
  private _renderOptionItem(option: FilterOption): TemplateResult {
    const classes = {
      "option-item": true,
      selected: option.selected,
    };

    return html`
      <div
        class=${classMap(classes)}
        role="option"
        aria-selected=${option.selected}
        @click=${this._handleOptionItemClick}
        data-value=${option.idField}
      >
        <div class="option-content">
          <div class="option-primary">
            <span class="option-label" title=${option.primaryField}>${option.primaryField}</span>
            ${option.badgeField
              ? html`<span class="option-badge">${option.badgeField}</span>`
              : nothing}
          </div>

          ${option.secondaryField
            ? html`
                <div class="option-secondary" title=${option.secondaryField}>
                  ${option.secondaryField}
                </div>
              `
            : nothing}
        </div>

        <ha-checkbox
          .checked=${option.selected}
          .value=${option.idField}
          tabindex="-1"
          pointer-events="none"
        ></ha-checkbox>
      </div>
    `;
  }

  /**
   * Main render method that creates the complete filter component
   *
   * Structure:
   * - Expandable panel with header showing title and selection count
   * - Clear filters button when selections exist
   * - Filter controls (search, sort) when panel is expanded
   * - Options list with filtered/sorted results
   *
   * @returns Template result for the complete component
   */
  protected render() {
    const selectedCount = this.selectedOptions?.length ?? 0;
    const headerText = this.filterTitle || this.knx.localize("knx_list_filter_title");
    const clearText = this.knx.localize("knx_list_filter_clear");

    return html`
      <flex-content-expansion-panel
        leftChevron
        .expanded=${this.expanded}
        @expanded-changed=${this._expandedChanged}
      >
        <!-- Header with title and clear selection control -->
        <div slot="header" class="header">
          <span class="title">
            ${headerText}
            ${selectedCount ? html`<div class="badge">${selectedCount}</div>` : nothing}
          </span>
          <div class="controls">
            ${selectedCount
              ? html`
                  <ha-icon-button
                    .path=${mdiFilterVariantRemove}
                    @click=${this._handleClearFiltersButtonClick}
                    .title=${clearText}
                  ></ha-icon-button>
                `
              : nothing}
          </div>
        </div>

        <!-- Render filter content only when panel is expanded and visible -->
        ${this.expanded
          ? html`
              <div class="filter-content">
                ${this._hasFilterableOrSortableFields() ? this._renderFilterControl() : nothing}

                <!-- Filter options list -->
                <div class="options-list ha-scrollbar">${this._renderOptionsList()}</div>
              </div>
            `
          : nothing}
      </flex-content-expansion-panel>
    `;
  }
  // ============================================================================
  // Styles
  // ============================================================================

  /**
   * Component-specific styles.
   */
  static get styles() {
    return [
      haStyleScrollbar,
      css`
        :host {
          display: flex;
          flex-direction: column;
          border-bottom: 1px solid var(--divider-color);
        }
        :host([expanded]) {
          flex: 1;
          height: 0;
          overflow: hidden;
        }

        flex-content-expansion-panel {
          --ha-card-border-radius: 0;
          --expansion-panel-content-padding: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
        }

        .title {
          display: flex;
          align-items: center;
          font-weight: 500;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-left: 8px;
          min-width: 20px;
          height: 20px;
          box-sizing: border-box;
          border-radius: 50%;
          font-weight: 500;
          font-size: 12px;
          background-color: var(--primary-color);
          line-height: 1;
          text-align: center;
          padding: 0 4px;
          color: var(--text-primary-color);
        }

        .controls {
          display: flex;
          align-items: center;
          margin-left: auto;
        }

        .header ha-icon-button {
          margin-inline-end: 4px;
        }

        .filter-content {
          display: flex;
          flex-direction: column;
          flex: 1;
          overflow: hidden;
        }

        .filter-toolbar {
          display: flex;
          align-items: center;
          padding: 0px 8px;
          gap: 4px;
          border-bottom: 1px solid var(--divider-color);
        }

        .search {
          flex: 1;
        }

        .buttons:last-of-type {
          margin-right: -8px;
        }

        search-input-outlined {
          display: block;
          flex: 1;
          padding: 8px 0;
        }

        .options-list {
          overflow-y: auto;
          display: block;
          padding: 0;
        }

        .option-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-left: 16px;
          min-height: 48px;
          cursor: pointer;
          position: relative;
        }
        .option-item:hover {
          background-color: rgba(var(--rgb-primary-text-color), 0.04);
        }
        .option-item.selected {
          background-color: var(--mdc-theme-surface-variant, rgba(var(--rgb-primary-color), 0.06));
        }

        .option-content {
          display: flex;
          flex-direction: column;
          width: 100%;
          min-width: 0;
          height: 100%;
        }

        .option-primary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          margin-bottom: 4px;
        }

        .option-label {
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .option-secondary {
          color: var(--secondary-text-color);
          font-size: 0.85em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .option-badge {
          display: inline-flex;
          background-color: rgba(var(--rgb-primary-color), 0.15);
          color: var(--primary-color);
          font-weight: 500;
          font-size: 0.75em;
          padding: 1px 6px;
          border-radius: 10px;
          min-width: 20px;
          height: 16px;
          align-items: center;
          justify-content: center;
          margin-left: 8px;
          vertical-align: middle;
        }

        .empty-message {
          text-align: center;
          padding: 16px;
          color: var(--secondary-text-color);
        }

        /* Prevent checkbox from capturing clicks */
        ha-checkbox {
          pointer-events: none;
        }

        knx-sort-menu ha-icon-button-toggle {
          --mdc-icon-button-size: 36px; /* Default is 48px */
          --mdc-icon-size: 18px; /* Default is 24px */
          color: var(--secondary-text-color);
        }

        knx-sort-menu ha-icon-button-toggle[selected] {
          --primary-background-color: var(--primary-color);
          --primary-text-color: transparent;
        }
      `,
    ];
  }
}

// Add custom events to HASSDomEvents interface
// No need to re-declare the interface to avoid conflicts
declare global {
  interface HTMLElementTagNameMap {
    "knx-list-filter": KnxListFilter;
  }
}
