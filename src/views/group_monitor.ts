import { css, html, LitElement, nothing } from "lit";
import type { CSSResultGroup, TemplateResult } from "lit";

import memoize from "memoize-one";

import "@ha/layouts/hass-loading-screen";
import "@ha/layouts/hass-tabs-subpage-data-table";
import "@ha/components/ha-alert";
import "@material/mwc-button";
import type { HASSDomEvent } from "@ha/common/dom/fire_event";
import type {
  DataTableColumnContainer,
  RowClickedEvent,
  SortingChangedEvent,
} from "@ha/components/data-table/ha-data-table";
import "@ha/components/ha-icon-button";
import { haStyle } from "@ha/resources/styles";
import type { HomeAssistant, Route } from "@ha/types";
import type { PageNavigation } from "@ha/layouts/hass-tabs-subpage";
import { navigate } from "@ha/common/navigate";
import { mainWindow } from "@ha/common/dom/get_main_window";

import "../components/data-table/cell/knx-table-cell";
import "../components/data-table/cell/knx-table-cell-filterable";
import "../dialogs/knx-telegram-info-dialog";
import "../components/data-table/filter/knx-list-filter";

import { customElement, property, state } from "lit/decorators";
import { mdiDeleteSweep, mdiFastForward, mdiPause, mdiRefresh } from "@mdi/js";
import { formatTimeWithMilliseconds, formatOffset } from "utils/format";
import { subscribeKnxTelegrams, getGroupMonitorInfo } from "../services/websocket.service";
import { KNXLogger } from "../tools/knx-logger";
import { TelegramRow } from "../types/telegram-row";
import type { ToggleFilterEvent } from "../components/data-table/cell/knx-table-cell-filterable";

import type { KNX } from "../types/knx";
import type { TelegramDict } from "../types/websocket";
import type {
  SelectionChangedEvent as ListFilterSelectionChangedEvent,
  ExpandedChangedEvent as ListFilterExpandedChangedEvent,
  Config as ListFilterConfig,
} from "../components/data-table/filter/knx-list-filter";

// Extend TelegramDict to include cached row
interface TelegramDictWithCache extends TelegramDict {
  cachedRow?: TelegramRow;
}

interface DistinctValueInfo {
  id: string;
  name: string;
  count: number;
}

interface DistinctValuesMap extends Record<string, DistinctValueInfo> {}

interface TelegramDistinctValues {
  source: DistinctValuesMap;
  destination: DistinctValuesMap;
  direction: DistinctValuesMap;
  telegramtype: DistinctValuesMap;
}

const logger = new KNXLogger("group_monitor");

// Maximum number of telegrams to keep in local storage (ring buffer)
const MAX_TELEGRAM_STORAGE = 5000;

/**
 * KNX Group Monitor Component
 *
 * A real-time monitoring interface for KNX telegrams that provides:
 * - Live telegram streaming with pause/resume functionality
 * - Advanced filtering by source, destination, direction, and telegram type
 * - Sortable data table with detailed telegram information
 * - Navigation between telegrams with detailed view dialog
 * - Historical telegram loading and management
 * - Ring buffer storage with 5,000 telegram limit for performance optimization
 * - Smart refresh that merges new telegrams with existing cache (no data loss)
 * - URL-based filtering for deep linking and to persist filter combinations
 *
 * ## URL Filter Parameters
 *
 * The component supports URL-based filtering:
 *
 * - `?source=1.2.3,4.5.6` - Filter by source addresses (comma-separated)
 * - `?destination=1/2/3,4/5/6` - Filter by destination addresses (comma-separated)
 * - `?direction=Incoming` - Filter by telegram direction (comma-separated)
 * - `?telegramtype=GroupValueWrite,GroupValueRead` - Filter by telegram types (comma-separated)
 *
 * **Examples:**
 * ```
 * /knx/group_monitor?source=1.1.1&destination=2/3/4
 * /knx/group_monitor?direction=Incoming&telegramtype=GroupValueWrite
 * /knx/group_monitor?source=1.2.3,1.2.4&destination=5/6/7
 * ```
 */
@customElement("knx-group-monitor")
export class KNXGroupMonitor extends LitElement {
  // Static definitions
  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          --table-row-alternative-background-color: var(--primary-background-color);
        }

        ha-icon-button.active {
          color: var(--primary-color);
        }

        .table-header {
          border-bottom: 1px solid var(--divider-color);
          padding-bottom: 12px;
        }

        :host {
          --ha-data-table-row-style: {
            font-size: 0.9em;
            padding: 8px 0;
          };
        }

        .filter-wrapper {
          display: flex;
          flex-direction: column;
        }

        .toolbar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
      `,
    ];
  }

  /** Home Assistant instance for API communication */
  @property({ type: Object }) public hass!: HomeAssistant;

  /** KNX integration instance providing localization and configuration */
  @property({ attribute: false }) public knx!: KNX;

  /** Whether the UI is in narrow/mobile layout mode */
  @property({ type: Boolean, reflect: true }) public narrow!: boolean;

  /** Current route information */
  @property({ type: Object }) public route?: Route;

  /** Navigation tabs configuration */
  @property({ type: Array, reflect: false }) public tabs!: PageNavigation[];

  /** WebSocket subscription cleanup function */
  @state() private _subscribed?: () => void;

  /** Array of telegram data received from the KNX bus */
  @state() private _telegrams: TelegramDictWithCache[] = [];

  /** ID of the currently selected telegram for detailed view */
  @state() private _selectedTelegramId: string | null = null;

  /** Active filter values grouped by filter type (source, destination, etc.) */
  @state() private _filters: Record<string, string[]> = {};

  /** Currently active sort column identifier */
  @state() private _sortColumn?: string;

  /** Which filter panel is currently expanded (null if none) */
  @state() private _expandedFilter: string | null = "source";

  /** Whether the reload button should be enabled (true when paused with new data) */
  @state() private _isReloadEnabled = false;

  /** Whether telegram monitoring is currently paused */
  @state() private _isPaused = false;

  /** Whether a KNX project is loaded (affects column visibility) */
  @state() private _isProjectLoaded = false;

  /** Current connection error message, if any */
  @state() private _connectionError: string | null = null;

  /**
   * Distinct values for filter dropdowns with counts
   * Updated incrementally as new telegrams arrive
   */
  @state() private _distinctValues: TelegramDistinctValues = {
    source: {},
    destination: {},
    direction: {},
    telegramtype: {},
  };

  /**
   * Memoized filtered rows calculation
   * Only recalculates when telegrams, filters (serialized), or sort column changes
   */
  private _getFilteredRows = memoize(
    (
      telegrams: TelegramDictWithCache[],
      _filtersJson: string,
      sortColumn?: string,
    ): TelegramRow[] => {
      const rows = telegrams
        .filter((telegram) => this._shouldDisplayTelegram(telegram))
        .map((telegram) => {
          if (!telegram.cachedRow) {
            telegram.cachedRow = new TelegramRow(telegram);
          }
          return telegram.cachedRow;
        });

      if (sortColumn === "timestamp") {
        this._calculateRelativeTimeOffsets(rows);
      }

      return rows;
    },
  );

  /**
   * Filtered and processed telegram rows for display in the data table
   * Uses memoization to avoid recalculating when data hasn't changed
   * Serializes filters to ensure memoization works correctly when filters change
   */
  private get filteredRows(): TelegramRow[] {
    return this._getFilteredRows(this._telegrams, JSON.stringify(this._filters), this._sortColumn);
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Called before each update to check if filters need to be initialized from URL
   * Sets filters from URL parameters whenever the route changes
   */
  public willUpdate(changedProperties: Map<string | number | symbol, unknown>): void {
    // Initialize filters from URL when route changes
    if (changedProperties.has("route") && this.route) {
      this._setFiltersFromUrl();
    }
  }

  /**
   * Component initialization - loads recent telegrams and establishes WebSocket connection
   * Called once when the component is first rendered
   */
  public async firstUpdated(): Promise<void> {
    if (this._subscribed) return;

    if (!(await this._loadRecentTelegrams())) return;

    try {
      this._subscribed = await subscribeKnxTelegrams(this.hass, (telegram) =>
        this._handleIncomingTelegram(telegram),
      );
      // Clear any previous connection error if subscription succeeds
      this._connectionError = null;
    } catch (err) {
      logger.error("Failed to subscribe to telegrams", err);
      this._connectionError = err instanceof Error ? err.message : String(err);
    }
  }

  /**
   * Cleanup when component is removed from DOM
   * Ensures WebSocket subscription is properly closed
   */
  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe();
  }

  /**
   * Localized search label showing telegram count
   * Adapts based on narrow layout and singular/plural forms
   */
  private get searchLabel(): string {
    if (this.narrow) {
      return this.knx.localize("group_monitor_search_label_narrow");
    }
    const count = this.filteredRows.length;
    const key = count === 1 ? "group_monitor_search_label_singular" : "group_monitor_search_label";
    return this.knx.localize(key, { count });
  }

  // Filter dropdown data arrays (converted from objects for knx-list-filter components)

  /** Source addresses available for filtering */
  private get sourceDistinctValuesArray(): DistinctValueInfo[] {
    return Object.values(this._distinctValues.source);
  }

  /** Destination addresses available for filtering */
  private get destinationDistinctValuesArray(): DistinctValueInfo[] {
    return Object.values(this._distinctValues.destination);
  }

  /** Telegram directions available for filtering (Incoming/Outgoing) */
  private get directionDistinctValuesArray(): DistinctValueInfo[] {
    return Object.values(this._distinctValues.direction);
  }

  /** Telegram types available for filtering */
  private get telegramTypeDistinctValuesArray(): DistinctValueInfo[] {
    return Object.values(this._distinctValues.telegramtype);
  }

  // ============================================================================
  // Filter Configurations
  // ============================================================================

  /**
   * Configuration for source address filter
   */
  private get _sourceFilterConfig(): ListFilterConfig<DistinctValueInfo> {
    return {
      idField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.id,
      },
      primaryField: {
        fieldName: this.knx.localize("telegram_filter_source_sort_by_primaryText"),
        filterable: true,
        sortable: true,
        sortAscendingText: this.knx.localize("telegram_filter_sort_ascending"),
        sortDescendingText: this.knx.localize("telegram_filter_sort_descending"),
        sortDefaultDirection: "asc",
        mapper: (item: DistinctValueInfo) => item.id,
      },
      secondaryField: {
        fieldName: this.knx.localize("telegram_filter_source_sort_by_secondaryText"),
        filterable: true,
        sortable: true,
        sortAscendingText: this.knx.localize("telegram_filter_sort_ascending"),
        sortDescendingText: this.knx.localize("telegram_filter_sort_descending"),
        sortDefaultDirection: "asc",
        mapper: (item: DistinctValueInfo) => item.name,
      },
      badgeField: {
        fieldName: this.knx.localize("telegram_filter_source_sort_by_badge"),
        filterable: false,
        sortable: true,
        sortAscendingText: this.knx.localize("telegram_filter_sort_ascending"),
        sortDescendingText: this.knx.localize("telegram_filter_sort_descending"),
        sortDefaultDirection: "desc",
        mapper: (item: DistinctValueInfo) => item.count.toString(),
      },
    };
  }

  /**
   * Configuration for destination address filter
   */
  private get _destinationFilterConfig(): ListFilterConfig<DistinctValueInfo> {
    return {
      idField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.id,
      },
      primaryField: {
        fieldName: this.knx.localize("telegram_filter_destination_sort_by_primaryText"),
        filterable: true,
        sortable: true,
        sortAscendingText: this.knx.localize("telegram_filter_sort_ascending"),
        sortDescendingText: this.knx.localize("telegram_filter_sort_descending"),
        sortDefaultDirection: "asc",
        mapper: (item: DistinctValueInfo) => item.id,
      },
      secondaryField: {
        fieldName: this.knx.localize("telegram_filter_destination_sort_by_secondaryText"),
        filterable: true,
        sortable: true,
        sortAscendingText: this.knx.localize("telegram_filter_sort_ascending"),
        sortDescendingText: this.knx.localize("telegram_filter_sort_descending"),
        sortDefaultDirection: "asc",
        mapper: (item: DistinctValueInfo) => item.name,
      },
      badgeField: {
        fieldName: this.knx.localize("telegram_filter_destination_sort_by_badge"),
        filterable: false,
        sortable: true,
        sortAscendingText: this.knx.localize("telegram_filter_sort_ascending"),
        sortDescendingText: this.knx.localize("telegram_filter_sort_descending"),
        sortDefaultDirection: "desc",
        mapper: (item: DistinctValueInfo) => item.count.toString(),
      },
    };
  }

  /**
   * Configuration for direction filter (Incoming/Outgoing)
   */
  private get _directionFilterConfig(): ListFilterConfig<DistinctValueInfo> {
    return {
      idField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.id,
      },
      primaryField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.id,
      },
      secondaryField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.name,
      },
      badgeField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.count.toString(),
      },
    };
  }

  /**
   * Configuration for telegram type filter
   */
  private get _telegramTypeFilterConfig(): ListFilterConfig<DistinctValueInfo> {
    return {
      idField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.id,
      },
      primaryField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.id,
      },
      secondaryField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.name,
      },
      badgeField: {
        filterable: false,
        sortable: false,
        mapper: (item: DistinctValueInfo) => item.count.toString(),
      },
    };
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Handles data table sorting changes
   * Updates the active sort column for relative time calculation
   */
  private _handleSortingChanged(ev: HASSDomEvent<SortingChangedEvent>): void {
    this._sortColumn = ev.detail.column;
  }

  /**
   * Handles telegram row selection in the data table
   * Opens the detailed telegram information dialog
   */
  private _handleRowClick(ev: HASSDomEvent<RowClickedEvent>): void {
    this._selectedTelegramId = ev.detail.id;
  }

  /** Closes the telegram detail dialog */
  private _handleDialogClosed(): void {
    this._selectedTelegramId = null;
  }

  /** Toggles the pause state of telegram monitoring */
  private async _handlePauseToggle(): Promise<void> {
    this._isPaused = !this._isPaused;
  }

  /** Reloads recent telegrams from the server */
  private async _handleReload(): Promise<void> {
    await this._loadRecentTelegrams();
  }

  /** Attempts to reconnect after a connection error */
  private async _retryConnection(): Promise<void> {
    this._connectionError = null;
    await this.firstUpdated();
  }

  /** Clears all active filters */
  private _handleClearFilters(): void {
    this._filters = {};
  }

  /**
   * Clears all telegrams from the display and resets filter data
   * Enables the reload button to fetch fresh data
   */
  private _handleClearRows(): void {
    this._telegrams = [];
    this._resetDistinctValues();
    this._isReloadEnabled = true;
  }

  // ============================================================================
  // Filter Event Handlers
  // ============================================================================

  /** Generic handler for filter selection changes */
  private _onFilterSelectionChange = (filterType: string, value: string[]): void => {
    this._setFilterFieldValue(filterType, value);
  };

  /** Generic handler for filter panel expansion state changes */
  private _onFilterExpansionChange = (id: string, expanded: boolean): void => {
    this._updateExpandedFilter(id, expanded);
  };

  // knx-list-filter component event handlers

  /** Handles source filter selection changes */
  private _handleSourceFilterChange = (ev: HASSDomEvent<ListFilterSelectionChangedEvent>): void => {
    this._onFilterSelectionChange("source", ev.detail.value);
  };

  /** Handles source filter panel expansion */
  private _handleSourceFilterExpanded = (
    ev: HASSDomEvent<ListFilterExpandedChangedEvent>,
  ): void => {
    this._onFilterExpansionChange("source", ev.detail.expanded);
  };

  /** Handles destination filter selection changes */
  private _handleDestinationFilterChange = (
    ev: HASSDomEvent<ListFilterSelectionChangedEvent>,
  ): void => {
    this._onFilterSelectionChange("destination", ev.detail.value);
  };

  /** Handles destination filter panel expansion */
  private _handleDestinationFilterExpanded = (
    ev: HASSDomEvent<ListFilterExpandedChangedEvent>,
  ): void => {
    this._onFilterExpansionChange("destination", ev.detail.expanded);
  };

  /** Handles direction filter selection changes */
  private _handleDirectionFilterChange = (
    ev: HASSDomEvent<ListFilterSelectionChangedEvent>,
  ): void => {
    this._onFilterSelectionChange("direction", ev.detail.value);
  };

  /** Handles direction filter panel expansion */
  private _handleDirectionFilterExpanded = (
    ev: HASSDomEvent<ListFilterExpandedChangedEvent>,
  ): void => {
    this._onFilterExpansionChange("direction", ev.detail.expanded);
  };

  /** Handles telegram type filter selection changes */
  private _handleTelegramTypeFilterChange = (
    ev: HASSDomEvent<ListFilterSelectionChangedEvent>,
  ): void => {
    this._onFilterSelectionChange("telegramtype", ev.detail.value);
  };

  /** Handles telegram type filter panel expansion */
  private _handleTelegramTypeFilterExpanded = (
    ev: HASSDomEvent<ListFilterExpandedChangedEvent>,
  ): void => {
    this._onFilterExpansionChange("telegramtype", ev.detail.expanded);
  };

  // Table cell filter toggle handlers (for quick filtering from table cells)

  /** Toggles source address filter from table cell click */
  private _handleSourceFilterToggle = (ev: HASSDomEvent<ToggleFilterEvent>): void => {
    this._toggleFilterValue("source", ev.detail.value);
  };

  /** Toggles destination address filter from table cell click */
  private _handleDestinationFilterToggle = (ev: HASSDomEvent<ToggleFilterEvent>): void => {
    this._toggleFilterValue("destination", ev.detail.value);
  };

  /** Toggles telegram type filter from table cell click */
  private _handleTelegramTypeFilterToggle = (ev: HASSDomEvent<ToggleFilterEvent>): void => {
    this._toggleFilterValue("telegramtype", ev.detail.value);
  };

  // ============================================================================
  // Telegram Data Management
  // ============================================================================

  /**
   * Enforces the ring buffer limit on telegram storage
   * Removes oldest telegrams when limit is exceeded
   * @param telegrams - Array of telegrams to limit
   * @returns Limited array with at most MAX_TELEGRAM_STORAGE entries
   */
  private _enforceRingBufferLimit(telegrams: TelegramDictWithCache[]): TelegramDictWithCache[] {
    if (telegrams.length <= MAX_TELEGRAM_STORAGE) {
      return telegrams;
    }
    // Keep the newest telegrams, remove the oldest ones
    return telegrams.slice(-MAX_TELEGRAM_STORAGE);
  }

  /**
   * Merges new telegrams with existing ones, avoiding duplicates
   * Maintains chronological order and applies ring buffer limit
   * @param existingTelegrams - Current telegram array
   * @param newTelegrams - New telegrams to merge
   * @returns Merged and deduplicated telegram array
   */
  private _mergeTelegrams(
    existingTelegrams: TelegramDictWithCache[],
    newTelegrams: TelegramDictWithCache[],
  ): TelegramDictWithCache[] {
    // Create a Set of existing telegram IDs using TelegramRow ID generation
    const existingIds = new Set(
      existingTelegrams.map((t) => {
        if (!t.cachedRow) {
          t.cachedRow = new TelegramRow(t);
        }
        return t.cachedRow.id;
      }),
    );

    // Filter out duplicates from new telegrams
    const uniqueNewTelegrams = newTelegrams.filter((telegram) => {
      if (!telegram.cachedRow) {
        telegram.cachedRow = new TelegramRow(telegram);
      }
      return !existingIds.has(telegram.cachedRow.id);
    });

    // Combine existing and new telegrams
    const combinedTelegrams = [...existingTelegrams, ...uniqueNewTelegrams];

    // Sort by timestamp to maintain chronological order
    combinedTelegrams.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    // Apply ring buffer limit
    return this._enforceRingBufferLimit(combinedTelegrams);
  }

  /**
   * Loads recent telegrams from the server
   * Initializes project status and distinct values for filtering
   * Merges with existing telegrams
   * @returns Promise<boolean> - true if successful, false on error
   */
  private async _loadRecentTelegrams(): Promise<boolean> {
    try {
      const info = await getGroupMonitorInfo(this.hass);
      this._isProjectLoaded = info.project_loaded;

      // Merge new telegrams with existing ones
      this._telegrams = this._mergeTelegrams(this._telegrams, info.recent_telegrams);

      if (this._connectionError !== null) this._connectionError = null;

      // Initialize distinct values from full dataset
      this._initializeDistinctValues(this._telegrams, this._filters);

      this._isReloadEnabled = false;
      return true;
    } catch (err) {
      logger.error("getGroupMonitorInfo failed", err);
      this._connectionError = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * Handles new telegram data from WebSocket subscription
   * Updates telegram list with ring buffer limit and distinct values when not paused
   */
  private _handleIncomingTelegram(telegram: TelegramDictWithCache): void {
    if (!this._isPaused) {
      // Add new telegram and enforce ring buffer limit
      const updatedTelegrams = [...this._telegrams, telegram];
      this._telegrams = this._enforceRingBufferLimit(updatedTelegrams);

      // Incrementally update distinct values for performance
      this._updateDistinctValues(telegram);
    } else if (!this._isReloadEnabled) {
      this._isReloadEnabled = true;
    }
  }

  /** Unsubscribes from the WebSocket telegram stream */
  private _unsubscribe(): void {
    if (this._subscribed) {
      this._subscribed();
      this._subscribed = undefined;
    }
  }

  // ============================================================================
  // Telegram Navigation
  // ============================================================================

  /**
   * Navigates through the filtered telegram list
   * @param step - Number of steps to move (positive for forward, negative for backward)
   */
  private _navigateTelegram(step: number): void {
    if (!this._selectedTelegramId) return;

    const currentIndex = this.filteredRows.findIndex((row) => row.id === this._selectedTelegramId);
    const targetIndex = currentIndex + step;

    if (targetIndex >= 0 && targetIndex < this.filteredRows.length) {
      this._selectedTelegramId = this.filteredRows[targetIndex].id;
    }
  }

  /** Selects the next telegram in the filtered list */
  private _selectNextTelegram(): void {
    this._navigateTelegram(1);
  }

  /** Selects the previous telegram in the filtered list */
  private _selectPreviousTelegram(): void {
    this._navigateTelegram(-1);
  }

  // ============================================================================
  // Filter Helper Methods
  // ============================================================================

  /**
   * URL parameter event handlers and management methods
   */

  /** Updates the URL with current filter state without triggering navigation */
  private _updateUrlFromFilters(): void {
    if (!this.route) {
      logger.warn("Route not available, cannot update URL");
      return;
    }

    const params = new URLSearchParams();

    // Add filter parameters to URL
    Object.entries(this._filters).forEach(([key, values]) => {
      if (Array.isArray(values) && values.length > 0) {
        params.set(key, values.join(","));
      }
    });

    // Build new URL
    const newPath = params.toString()
      ? `${this.route.prefix}${this.route.path}?${params.toString()}`
      : `${this.route.prefix}${this.route.path}`;

    // Update URL without triggering navigation
    navigate(newPath, { replace: true });
  }

  /** Sets filters from URL query parameters */
  private _setFiltersFromUrl(): void {
    const searchParams = new URLSearchParams(mainWindow.location.search);
    const source = searchParams.get("source");
    const destination = searchParams.get("destination");
    const direction = searchParams.get("direction");
    const telegramtype = searchParams.get("telegramtype");

    if (!source && !destination && !direction && !telegramtype) {
      return;
    }

    // Parse comma-separated values from URL parameters
    this._filters = {
      source: source ? source.split(",") : [],
      destination: destination ? destination.split(",") : [],
      direction: direction ? direction.split(",") : [],
      telegramtype: telegramtype ? telegramtype.split(",") : [],
    };
  }

  /**
   * Determines if a telegram should be displayed based on current filters
   * @param telegram - The telegram to check against filters
   * @returns boolean - true if telegram matches all active filters
   */
  private _shouldDisplayTelegram(telegram: TelegramDictWithCache): boolean {
    return Object.entries(this._filters).every(([field, values]) => {
      if (!values?.length) return true;

      const fieldMap: Record<string, string> = {
        source: telegram.source,
        destination: telegram.destination,
        direction: telegram.direction,
        telegramtype: telegram.telegramtype,
      };

      return values.includes(fieldMap[field] || "");
    });
  }

  /**
   * Toggles a filter value on/off for a specific field
   * @param field - The filter field name
   * @param value - The value to toggle
   */
  private _toggleFilterValue(field: string, value: string): void {
    const currentFilters = this._filters[field] ?? [];
    if (currentFilters.includes(value)) {
      this._filters = {
        ...this._filters,
        [field]: currentFilters.filter((item) => item !== value),
      };
    } else {
      this._filters = { ...this._filters, [field]: [...currentFilters, value] };
    }

    // Update URL with new filter state
    this._updateUrlFromFilters();
  }

  /**
   * Updates filter values for a specific field
   * Cleans up distinct values for deselected items if they have zero count
   * @param field - The filter field name
   * @param value - The new filter values array
   */
  private _setFilterFieldValue(field: string, value: string[]): void {
    const oldFilterValues = this._filters[field] || [];
    this._filters = { ...this._filters, [field]: value };

    // Update URL with new filter state
    this._updateUrlFromFilters();

    // Remove deselected items from distinct values if they have count = 0
    // (items that were preserved only for filter state but have no actual telegram matches)
    const deselectedValues = oldFilterValues.filter((item) => !value.includes(item));
    if (deselectedValues.length > 0) {
      this._cleanupDistinctValuesForDeselectedItems(field, deselectedValues);
    }
  }

  /**
   * Updates which filter panel is currently expanded
   * @param id - The filter panel ID
   * @param expanded - Whether the panel should be expanded
   */
  private _updateExpandedFilter(id: string, expanded: boolean): void {
    this._expandedFilter = expanded
      ? id
      : this._expandedFilter === id
        ? null
        : this._expandedFilter;
  }

  // ============================================================================
  // Utility Functions
  // ============================================================================

  /**
   * Calculates relative time offsets between consecutive telegrams
   * Used to show time differences when sorting by timestamp
   * @param rows - Array of telegram rows to process
   */
  private _calculateRelativeTimeOffsets(rows: TelegramRow[]): void {
    if (!rows.length) return;

    // Mark first row with -1 to distinguish from real 0 offset
    rows[0].offset = new Date(-1);
    for (let i = 1; i < rows.length; i++) {
      rows[i].offset = new Date(rows[i].timestamp.getTime() - rows[i - 1].timestamp.getTime());
    }
  }

  // ============================================================================
  // Data Table Column Definitions
  // ============================================================================

  /**
   * Memoized column configuration for the data table
   * Adapts column visibility and behavior based on layout and project status
   * @param narrow - Whether the UI is in narrow/mobile layout
   * @param projectLoaded - Whether a KNX project is loaded (affects column visibility)
   * @param _language - Current language (triggers re-memoization for localization)
   */
  private _columns = memoize(
    (
      narrow: boolean,
      projectLoaded: boolean,
      _language: string,
    ): DataTableColumnContainer<TelegramRow> => ({
      // Timestamp column with relative time offsets when sorting by time
      timestamp: {
        showNarrow: false,
        filterable: true,
        sortable: true,
        direction: "desc",
        title: this.knx.localize("group_monitor_time"),
        minWidth: "110px",
        maxWidth: "120px",
        template: (row) => html`
          <knx-table-cell>
            <div class="primary" slot="primary">${formatTimeWithMilliseconds(row.timestamp)}</div>
            ${row.offset.getTime() >= 0 && this._sortColumn === "timestamp"
              ? html`
                  <div class="secondary" slot="secondary">
                    <span style="margin-right: 2px;">+</span>
                    <span>${formatOffset(row.offset)}</span>
                  </div>
                `
              : nothing}
          </knx-table-cell>
        `,
      },

      // Main source address column with filterable cell
      sourceAddress: {
        showNarrow: true,
        filterable: true,
        sortable: false,
        title: this.knx.localize("group_monitor_source"),
        flex: 2,
        minWidth: "0",
        template: (row) => html`
          <knx-table-cell-filterable
            .knx=${this.knx}
            .filterValue=${row.sourceAddress}
            .filterDisplayText=${row.sourceAddress}
            .filterActive=${(this._filters.source || []).includes(row.sourceAddress as string)}
            @toggle-filter=${this._handleSourceFilterToggle}
          >
            <div class="primary" slot="primary">${row.sourceAddress}</div>
            ${row.sourceText
              ? html`
                  <div class="secondary" slot="secondary" title=${row.sourceText || ""}>
                    ${row.sourceText}
                  </div>
                `
              : nothing}
          </knx-table-cell-filterable>
        `,
      },

      // Hidden column for numeric source address sorting
      sourceAddressNumeric: {
        hidden: true,
        filterable: false,
        sortable: true,
        title: this.knx.localize("group_monitor_source"),
      },

      // Hidden column for source text/name filtering
      sourceText: {
        hidden: true,
        filterable: true,
        sortable: true,
        title: this.knx.localize("group_monitor_source_name"),
      },

      // Hidden groupable source name column
      sourceName: {
        showNarrow: true,
        hidden: true,
        sortable: false,
        groupable: true,
        filterable: false,
        title: this.knx.localize("group_monitor_source"),
      },

      // Main destination address column with filterable cell
      destinationAddress: {
        showNarrow: true,
        sortable: false,
        filterable: true,
        title: this.knx.localize("group_monitor_destination"),
        flex: 2,
        minWidth: "0",
        template: (row) => html`
          <knx-table-cell-filterable
            .knx=${this.knx}
            .filterValue=${row.destinationAddress}
            .filterDisplayText=${row.destinationAddress}
            .filterActive=${(this._filters.destination || []).includes(
              row.destinationAddress as string,
            )}
            @toggle-filter=${this._handleDestinationFilterToggle}
          >
            <div class="primary" slot="primary">${row.destinationAddress}</div>
            ${row.destinationText
              ? html`
                  <div class="secondary" slot="secondary" title=${row.destinationText || ""}>
                    ${row.destinationText}
                  </div>
                `
              : nothing}
          </knx-table-cell-filterable>
        `,
      },

      // Hidden column for numeric destination address sorting
      destinationAddressNumeric: {
        hidden: true,
        filterable: false,
        sortable: true,
        title: this.knx.localize("group_monitor_destination"),
      },

      // Hidden column for destination text/name filtering
      destinationText: {
        showNarrow: true,
        hidden: true,
        sortable: true,
        filterable: true,
        title: this.knx.localize("group_monitor_destination_name"),
      },

      // Hidden groupable destination name column
      destinationName: {
        showNarrow: true,
        hidden: true,
        sortable: false,
        groupable: true,
        filterable: false,
        title: this.knx.localize("group_monitor_destination"),
      },

      // Telegram type column with direction indicator and filterable cell
      type: {
        showNarrow: false,
        title: this.knx.localize("group_monitor_type"),
        filterable: true,
        groupable: true,
        minWidth: "155px",
        maxWidth: "155px",
        template: (row) => html`
          <knx-table-cell-filterable
            .knx=${this.knx}
            .filterValue=${row.type}
            .filterDisplayText=${row.type}
            .filterActive=${(this._filters.telegramtype || []).includes(row.type as string)}
            @toggle-filter=${this._handleTelegramTypeFilterToggle}
          >
            <div class="primary" slot="primary" title=${row.type}>${row.type}</div>
            <div
              class="secondary"
              slot="secondary"
              style="color: ${row.direction === "Outgoing"
                ? "var(--knx-blue)"
                : "var(--knx-green)"}"
            >
              ${row.direction}
            </div>
          </knx-table-cell-filterable>
        `,
      },

      // Hidden direction column for separate filtering
      direction: {
        hidden: true,
        title: this.knx.localize("group_monitor_direction"),
        filterable: true,
        groupable: true,
      },

      // Raw payload data column (hidden on narrow when project loaded)
      payload: {
        showNarrow: false,
        hidden: narrow && projectLoaded,
        title: this.knx.localize("group_monitor_payload"),
        filterable: true,
        type: "numeric",
        minWidth: "105px",
        maxWidth: "105px",
        template: (row) => {
          if (!row.payload) return nothing;
          return html`
            <code
              style="
                display: inline-block;
                box-sizing: border-box;
                max-width: 100%;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                font-size: 0.9em;
                background: var(--secondary-background-color);
                padding: 2px 4px;
                border-radius: 4px;
              "
              title=${row.payload}
            >
              ${row.payload}
            </code>
          `;
        },
      },

      // Decoded value column (only shown when project is loaded)
      value: {
        showNarrow: true,
        hidden: !projectLoaded,
        title: this.knx.localize("group_monitor_value"),
        filterable: true,
        flex: 1,
        minWidth: "0",
        template: (row) => {
          const value = row.value;
          if (!value) return "";
          return html`
            <knx-table-cell>
              <span
                class="primary"
                slot="primary"
                style="font-weight: 500; color: var(--primary-color);"
                title=${value}
              >
                ${value}
              </span>
            </knx-table-cell>
          `;
        },
      },
    }),
  );

  // ============================================================================
  // Distinct Values Management
  // ============================================================================

  /**
   * Factory function to create a fresh empty distinct values object
   * @returns Clean distinct values object with empty collections for each filter type
   */
  private _createEmptyDistinctValues(): TelegramDistinctValues {
    return {
      source: {},
      destination: {},
      direction: {},
      telegramtype: {},
    };
  }

  /**
   * Helper method to reset all distinct values to empty state
   * Preserves currently selected filter values and their descriptions to maintain filter dropdown state
   */
  private _resetDistinctValues(): void {
    this._initializeDistinctValues([], this._filters);
  }

  /**
   * Initialize distinct values from full dataset (used when loading recent telegrams)
   * Optimized to cause only one state change at the end
   * @param telegrams - Array of telegrams to process
   * @param filters - Optional filter values to ensure they exist in distinct values even if no telegrams match
   */
  private _initializeDistinctValues(
    telegrams: TelegramDictWithCache[],
    filters?: Record<string, string[]>,
  ): void {
    // Create fresh local copies to avoid triggering state changes during computation
    const localDistinctValues: TelegramDistinctValues = this._createEmptyDistinctValues();

    // First, add filter values with count 0 if provided
    if (filters) {
      Object.entries(filters).forEach(([filterType, values]) => {
        if (Array.isArray(values) && values.length > 0) {
          const distinctValuesProperty = filterType as keyof TelegramDistinctValues;
          values.forEach((value) => {
            if (localDistinctValues[distinctValuesProperty]) {
              // Try to preserve existing name/description from current distinct values
              const existingEntry = this._distinctValues[distinctValuesProperty]?.[value];
              localDistinctValues[distinctValuesProperty][value] = {
                id: value,
                name: existingEntry?.name || "", // Preserve existing name if available
                count: 0, // Zero count indicates no matching telegrams yet
              };
            }
          });
        }
      });
    }

    // Process all telegrams to build distinct values in local variables
    for (const telegram of telegrams) {
      this._updateDistinctValueEntryLocal(
        localDistinctValues,
        "source",
        telegram.source,
        telegram.source_name || "",
      );
      this._updateDistinctValueEntryLocal(
        localDistinctValues,
        "destination",
        telegram.destination,
        telegram.destination_name || "",
      );
      this._updateDistinctValueEntryLocal(localDistinctValues, "direction", telegram.direction, "");
      this._updateDistinctValueEntryLocal(
        localDistinctValues,
        "telegramtype",
        telegram.telegramtype,
        "",
      );
    }

    // Single state update
    this._distinctValues = localDistinctValues;
  }

  /**
   * Helper method to update a single distinct value entry in a local object
   * Does not trigger state changes - used for batch operations
   * @param distinctValues - Local distinct values object to update
   * @param propertyKey - The property type (source, destination, etc.)
   * @param id - The unique identifier for the value
   * @param name - The display name/description for the value
   */
  private _updateDistinctValueEntryLocal(
    distinctValues: TelegramDistinctValues,
    propertyKey: keyof TelegramDistinctValues,
    id: string | undefined,
    name: string,
  ): void {
    if (!id) return;

    if (distinctValues[propertyKey][id]) {
      distinctValues[propertyKey][id].count++;
      if (distinctValues[propertyKey][id].name === "") {
        // Preserve the name if it was empty before
        distinctValues[propertyKey][id].name = name;
      }
    } else {
      distinctValues[propertyKey][id] = {
        id,
        name,
        count: 1,
      };
    }
  }

  /**
   * Update distinct values for a single telegram (used for incremental updates)
   * Optimized to cause only one state change per telegram
   * @param telegram - The telegram data to process
   */
  private _updateDistinctValues(telegram: TelegramDictWithCache): void {
    // Create a copy of current state to work with
    const updatedDistinctValues: TelegramDistinctValues = {
      source: { ...this._distinctValues.source },
      destination: { ...this._distinctValues.destination },
      direction: { ...this._distinctValues.direction },
      telegramtype: { ...this._distinctValues.telegramtype },
    };

    // Update all fields in the local copy
    this._updateDistinctValueEntryLocal(
      updatedDistinctValues,
      "source",
      telegram.source,
      telegram.source_name || "",
    );
    this._updateDistinctValueEntryLocal(
      updatedDistinctValues,
      "destination",
      telegram.destination,
      telegram.destination_name || "",
    );
    this._updateDistinctValueEntryLocal(updatedDistinctValues, "direction", telegram.direction, "");
    this._updateDistinctValueEntryLocal(
      updatedDistinctValues,
      "telegramtype",
      telegram.telegramtype,
      "",
    );

    // Single state update for all changes
    this._distinctValues = updatedDistinctValues;
  }

  /**
   * Remove deselected filter items from distinct values if they have count = 0
   * Items that were preserved only for filter state but have no actual telegram matches
   * @param field - The filter field name
   * @param deselectedValues - Array of values that were deselected
   */
  private _cleanupDistinctValuesForDeselectedItems(
    field: string,
    deselectedValues: string[],
  ): void {
    const distinctValuesProperty = field as keyof TelegramDistinctValues;
    const currentDistinctValues = this._distinctValues[distinctValuesProperty];

    let hasChanges = false;
    const updatedDistinctValues = { ...currentDistinctValues };

    deselectedValues.forEach((value) => {
      // Remove items that have count = 0 (were preserved only for filter state)
      if (currentDistinctValues[value]?.count === 0) {
        delete updatedDistinctValues[value];
        hasChanges = true;
      }
    });

    // Only update state if there were actual changes
    if (hasChanges) {
      this._distinctValues = {
        ...this._distinctValues,
        [distinctValuesProperty]: updatedDistinctValues,
      };
    }
  }

  // ============================================================================
  // Render Helper Methods
  // ============================================================================

  /**
   * Renders the telegram information dialog for detailed view
   * @param id - The telegram ID to display
   * @returns Template for the dialog component
   */
  private _renderTelegramInfoDialog(id: string): TemplateResult {
    const arrayIndex = this.filteredRows.findIndex((row) => row.id === id);
    const telegramRow = this.filteredRows[arrayIndex];

    return html`
      <knx-telegram-info-dialog
        .hass=${this.hass}
        .knx=${this.knx}
        .telegram=${telegramRow}
        .disableNext=${arrayIndex + 1 >= this.filteredRows.length}
        .disablePrevious=${arrayIndex <= 0}
        @next-telegram=${this._selectNextTelegram}
        @previous-telegram=${this._selectPreviousTelegram}
        @dialog-closed=${this._handleDialogClosed}
      >
      </knx-telegram-info-dialog>
    `;
  }

  // ============================================================================
  // Main Render Method
  // ============================================================================

  /**
   * Main render method that builds the complete UI
   * Combines data table, filters, toolbar actions, and dialogs
   * @returns The complete template for the group monitor interface
   */
  protected render(): TemplateResult {
    const activeFilters = Object.values(this._filters).filter(
      (f) => Array.isArray(f) && f.length,
    ).length;

    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .narrow=${this.narrow!}
        .route=${this.route!}
        .tabs=${this.tabs}
        .columns=${this._columns(this.narrow, this._isProjectLoaded, this.hass.language)}
        .noDataText=${this.knx.localize("group_monitor_waiting_message")}
        .data=${this.filteredRows}
        .hasFab=${false}
        .searchLabel=${this.searchLabel}
        .localizeFunc=${this.knx.localize}
        id="id"
        .clickable=${true}
        @row-click=${this._handleRowClick}
        @sorting-changed=${this._handleSortingChanged}
        has-filters
        .filters=${activeFilters}
        @clear-filter=${this._handleClearFilters}
      >
        <!-- Top header -->
        ${this._connectionError
          ? html`
              <ha-alert
                slot="top-header"
                .alertType=${"error"}
                .title=${this.knx.localize("group_monitor_connection_error_title")}
              >
                ${this._connectionError}
                <mwc-button
                  slot="action"
                  @click=${this._retryConnection}
                  .label=${this.knx.localize("group_monitor_retry_connection")}
                ></mwc-button>
              </ha-alert>
            `
          : nothing}
        ${this._isPaused
          ? html`
              <ha-alert
                slot="top-header"
                .alertType=${"info"}
                .dismissable=${false}
                .title=${this.knx.localize("group_monitor_paused_title")}
              >
                ${this.knx.localize("group_monitor_paused_message")}
                <mwc-button
                  slot="action"
                  @click=${this._handlePauseToggle}
                  .label=${this.knx.localize("group_monitor_resume")}
                ></mwc-button>
              </ha-alert>
            `
          : ""}

        <!-- Toolbar actions -->
        <div slot="toolbar-icon" class="toolbar-actions">
          <ha-icon-button
            .label=${this._isPaused
              ? this.knx.localize("group_monitor_resume")
              : this.knx.localize("group_monitor_pause")}
            .path=${this._isPaused ? mdiFastForward : mdiPause}
            class=${this._isPaused ? "active" : ""}
            @click=${this._handlePauseToggle}
            data-testid="pause-button"
            .title=${this._isPaused
              ? this.knx.localize("group_monitor_resume")
              : this.knx.localize("group_monitor_pause")}
          >
          </ha-icon-button>
          <ha-icon-button
            .label=${this.knx.localize("group_monitor_clear")}
            .path=${mdiDeleteSweep}
            @click=${this._handleClearRows}
            ?disabled=${this._telegrams.length === 0}
            data-testid="clean-button"
            .title=${this.knx.localize("group_monitor_clear")}
          >
          </ha-icon-button>
          <ha-icon-button
            .label=${this.knx.localize("group_monitor_reload")}
            .path=${mdiRefresh}
            @click=${this._handleReload}
            ?disabled=${!this._isReloadEnabled}
            data-testid="reload-button"
            .title=${this.knx.localize("group_monitor_reload")}
          >
          </ha-icon-button>
        </div>

        <!-- Filter for Source Address -->
        <knx-list-filter
          slot="filter-pane"
          .hass=${this.hass}
          .knx=${this.knx}
          .data=${this.sourceDistinctValuesArray}
          .config=${this._sourceFilterConfig}
          .selectedOptions=${this._filters.source}
          .expanded=${this._expandedFilter === "source"}
          .narrow=${this.narrow}
          .filterTitle=${this.knx.localize("group_monitor_source")}
          @selection-changed=${this._handleSourceFilterChange}
          @expanded-changed=${this._handleSourceFilterExpanded}
        ></knx-list-filter>

        <!-- Filter for Destination Address -->
        <knx-list-filter
          slot="filter-pane"
          .hass=${this.hass}
          .knx=${this.knx}
          .data=${this.destinationDistinctValuesArray}
          .config=${this._destinationFilterConfig}
          .selectedOptions=${this._filters.destination}
          .expanded=${this._expandedFilter === "destination"}
          .narrow=${this.narrow}
          .filterTitle=${this.knx.localize("group_monitor_destination")}
          @selection-changed=${this._handleDestinationFilterChange}
          @expanded-changed=${this._handleDestinationFilterExpanded}
        ></knx-list-filter>

        <!-- Filter for Direction -->
        <knx-list-filter
          slot="filter-pane"
          .hass=${this.hass}
          .knx=${this.knx}
          .data=${this.directionDistinctValuesArray}
          .config=${this._directionFilterConfig}
          .selectedOptions=${this._filters.direction}
          .pinSelectedItems=${false}
          .expanded=${this._expandedFilter === "direction"}
          .narrow=${this.narrow}
          .filterTitle=${this.knx.localize("group_monitor_direction")}
          @selection-changed=${this._handleDirectionFilterChange}
          @expanded-changed=${this._handleDirectionFilterExpanded}
        ></knx-list-filter>

        <!-- Filter for Telegram Type -->
        <knx-list-filter
          slot="filter-pane"
          .hass=${this.hass}
          .knx=${this.knx}
          .data=${this.telegramTypeDistinctValuesArray}
          .config=${this._telegramTypeFilterConfig}
          .selectedOptions=${this._filters.telegramtype}
          .pinSelectedItems=${false}
          .expanded=${this._expandedFilter === "telegramtype"}
          .narrow=${this.narrow}
          .filterTitle=${this.knx.localize("group_monitor_type")}
          @selection-changed=${this._handleTelegramTypeFilterChange}
          @expanded-changed=${this._handleTelegramTypeFilterExpanded}
        ></knx-list-filter>
      </hass-tabs-subpage-data-table>

      <!-- Telegram detail dialog -->
      ${this._selectedTelegramId !== null
        ? this._renderTelegramInfoDialog(this._selectedTelegramId)
        : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-group-monitor": KNXGroupMonitor;
  }
}
