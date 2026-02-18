import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { HomeAssistant, Route } from "@ha/types";
import { navigate } from "@ha/common/navigate";
import { mainWindow } from "@ha/common/dom/get_main_window";
import { fireEvent } from "@ha/common/dom/fire_event";
import memoize from "memoize-one";
import type { SortingDirection } from "@ha/components/data-table/ha-data-table";

import { getGroupMonitorInfo } from "../../../services/websocket.service";
import { TelegramBufferService } from "../services/telegram-buffer-service";
import { ConnectionService } from "../services/connection-service";
import { KNXLogger } from "../../../tools/knx-logger";
import { TelegramRow, type OffsetMicros } from "../types/telegram-row";
import type { TelegramDict } from "../../../types/websocket";
import { extractMicrosecondsFromIso } from "../../../utils/format";

const logger = new KNXLogger("group_monitor_controller");

// Filter and distinct values types for type safety
export type FilterField = "source" | "destination" | "direction" | "telegramtype";

// All filter fields as a constant array
export const FILTER_FIELDS: readonly FilterField[] = [
  "source",
  "destination",
  "direction",
  "telegramtype",
] as const;

export type FilterMap = Record<FilterField, ReadonlySet<string>>;

export interface DistinctValueInfo {
  id: string;
  name: string;
  totalCount: number;
  filteredCount?: number;
}

export type DistinctValues = Record<FilterField, Record<string, DistinctValueInfo>>;

/**
 * Combined result of telegram filtering and distinct values calculation
 */
export interface FilteredTelegramsResult {
  filteredTelegrams: TelegramRow[];
  distinctValues: DistinctValues;
}

/**
 * GroupMonitor ReactiveController
 *
 * Manages all business logic for the KNX Group Monitor:
 * - WebSocket telegram subscriptions
 * - Telegram data management with array buffer
 * - Filter state and URL synchronization
 * - High-performance distinct values calculation for filters
 * - Connection state management
 */
export class GroupMonitorController implements ReactiveController {
  /** Minimum buffer size for telegram storage beyond recent telegrams length */
  private static readonly MIN_TELEGRAM_STORAGE_BUFFER = 1000;

  private host: ReactiveControllerHost;

  // Connection service for WebSocket telegram subscriptions
  private _connectionService = new ConnectionService();

  // Telegram buffer service
  private _telegramBuffer = new TelegramBufferService(2000);

  // UI state
  private _filters: Record<string, string[]> = {};

  private _sortColumn?: string = "timestampIso";

  private _sortDirection: SortingDirection = "desc";

  private _expandedFilter: string | null = "source";

  private _isReloadEnabled = false;

  private _isPaused = false;

  // undefined until initial info is fetched; then true/false
  private _isProjectLoaded: boolean | undefined = undefined;

  private _connectionError: string | null = null;

  // Filter data - only stores total counts, filtered counts computed on-the-fly
  private _distinctValues: DistinctValues = {
    source: {},
    destination: {},
    direction: {},
    telegramtype: {},
  };

  // Buffer version counter for memoization cache invalidation
  private _bufferVersion = 0;

  // Last filtered telegrams for change detection
  private _lastFilteredTelegrams: readonly TelegramRow[] = [];

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);

    // Set up connection service callbacks
    this._connectionService.onTelegram((telegram) => this._handleIncomingTelegram(telegram));
    this._connectionService.onConnectionChange((_connected, error) => {
      this._connectionError = error || null;
      this.host.requestUpdate();
    });
  }

  // ============================================================================
  // ReactiveController interface
  // ============================================================================

  hostConnected(): void {
    // Initialize filters from URL when controller is connected
    this._setFiltersFromUrl();
  }

  hostDisconnected(): void {
    this._connectionService.disconnect();
  }

  // ============================================================================
  // Public API for the host component
  // ============================================================================

  /**
   * Setup method to be called from the host's firstUpdated
   */
  public async setup(hass: HomeAssistant): Promise<void> {
    if (this._connectionService.isConnected) return;

    if (!(await this._loadRecentTelegrams(hass))) return;

    try {
      await this._connectionService.subscribe(hass);
    } catch (err) {
      logger.error("Failed to setup connection", err);
      this._connectionError = err instanceof Error ? err.message : String(err);
      this.host.requestUpdate();
    }
  }

  // ============================================================================
  // Getters for component state
  // ============================================================================

  public get telegrams(): readonly TelegramRow[] {
    return this._telegramBuffer.snapshot;
  }

  public get filters(): Record<string, string[]> {
    return this._filters;
  }

  public get sortColumn(): string | undefined {
    return this._sortColumn;
  }

  public set sortColumn(value: string | undefined) {
    this._sortColumn = value;
    this.host.requestUpdate();
  }

  public get sortDirection(): SortingDirection | undefined {
    return this._sortDirection;
  }

  public set sortDirection(value: SortingDirection | undefined) {
    this._sortDirection = value || "desc";
    this.host.requestUpdate();
  }

  public get expandedFilter(): string | null {
    return this._expandedFilter;
  }

  public get isReloadEnabled(): boolean {
    return this._isReloadEnabled;
  }

  public get isPaused(): boolean {
    return this._isPaused;
  }

  public get isProjectLoaded(): boolean | undefined {
    return this._isProjectLoaded;
  }

  public get connectionError(): string | null {
    return this._connectionError;
  }

  /**
   * Gets both filtered telegrams and distinct values in a single synchronized call
   */
  public getFilteredTelegramsAndDistinctValues(): FilteredTelegramsResult {
    const result = this._getFilteredTelegramsAndDistinctValues(
      this._bufferVersion,
      JSON.stringify(this._filters),
      this._telegramBuffer.snapshot,
      this._distinctValues,
      this._sortColumn,
      this._sortDirection,
    );

    // Check if filtered telegrams have changed and emit event if so
    if (result.filteredTelegrams !== this._lastFilteredTelegrams) {
      this._lastFilteredTelegrams = result.filteredTelegrams;
      // Emit event to notify dialog about list changes
      if (this.host instanceof HTMLElement) {
        fireEvent(
          this.host,
          "knx-telegram-list-updated",
          { filteredTelegrams: result.filteredTelegrams },
          { bubbles: true },
        );
      }
    }

    return result;
  }

  /**
   * Combined computation of filtered telegrams and distinct values with filtered counts
   * Ensures both states are always synchronized and computed together
   */
  private _getFilteredTelegramsAndDistinctValues = memoize(
    (
      _bufferVersion: number,
      _filtersJson: string,
      allTelegrams: readonly TelegramRow[],
      distinctValues: DistinctValues,
      sortColumn?: string,
      sortDirection?: SortingDirection,
    ): FilteredTelegramsResult => {
      // Filter telegrams based on current filters
      const filteredTelegrams = allTelegrams.filter((telegram) =>
        this.matchesActiveFilters(telegram),
      );

      // Sort telegrams if a sort column and direction are specified
      if (sortColumn && sortDirection) {
        filteredTelegrams.sort((a, b) => {
          let aValue: any;
          let bValue: any;

          switch (sortColumn) {
            case "timestampIso":
              // Sort by ISO timestamp string directly to preserve microsecond precision
              aValue = a.timestampIso;
              bValue = b.timestampIso;
              break;
            case "sourceAddress":
              aValue = a.sourceAddress;
              bValue = b.sourceAddress;
              break;
            case "destinationAddress":
              aValue = a.destinationAddress;
              bValue = b.destinationAddress;
              break;
            case "sourceText":
              aValue = a.sourceText || "";
              bValue = b.sourceText || "";
              break;
            case "destinationText":
              aValue = a.destinationText || "";
              bValue = b.destinationText || "";
              break;
            default:
              // For other columns, use string comparison on the property
              aValue = (a as any)[sortColumn] || "";
              bValue = (b as any)[sortColumn] || "";
          }

          let result: number;
          if (typeof aValue === "string" && typeof bValue === "string") {
            result = aValue.localeCompare(bValue);
          } else {
            result = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
          }

          return sortDirection === "asc" ? result : -result;
        });
      }

      // Create a deep copy of distinct values with filtered counts initialized to 0
      const distinctValuesWithFilteredCounts: DistinctValues = {
        source: {},
        destination: {},
        direction: {},
        telegramtype: {},
      };

      // Initialize all distinct values with filteredCount = 0
      const fields = Object.keys(distinctValues) as FilterField[];
      for (const field of fields) {
        for (const [id, info] of Object.entries(distinctValues[field])) {
          distinctValuesWithFilteredCounts[field][id] = {
            id: info.id,
            name: info.name,
            totalCount: info.totalCount,
            filteredCount: 0,
          };
        }
      }

      // Count filtered occurrences and calculate offsets in the same loop
      for (let i = 0; i < filteredTelegrams.length; i++) {
        const telegram = filteredTelegrams[i];

        // Calculate relative time offset only when sorting by timestamp or natrural order
        if ((sortColumn === "timestampIso" && sortDirection) || !sortColumn) {
          // For timestamp sorting, we want to show the time difference since the chronologically previous telegram
          let previousTelegram: TelegramRow | null = null;

          if (sortDirection === "desc" && sortColumn) {
            // In descending order (newest first): [10:30, 10:25, 10:20]
            // The chronologically previous telegram is at i+1 (older timestamp)
            previousTelegram = i < filteredTelegrams.length - 1 ? filteredTelegrams[i + 1] : null;
          } else {
            // In ascending order (oldest first): [10:20, 10:25, 10:30]
            // The chronologically previous telegram is at i-1 (earlier timestamp)
            previousTelegram = i > 0 ? filteredTelegrams[i - 1] : null;
          }

          telegram.offset = this._calculateTelegramOffset(telegram, previousTelegram);
        } else {
          // For non-timestamp sorting, reset offset to null
          telegram.offset = null;
        }

        // Count distinct values
        for (const field of fields) {
          const extracted = this._extractTelegramField(telegram, field);
          if (!extracted) continue;

          const { id } = extracted;
          const distinctValue = distinctValuesWithFilteredCounts[field][id];
          if (distinctValue) {
            distinctValue.filteredCount = (distinctValue.filteredCount || 0) + 1;
          }
        }
      }

      return {
        filteredTelegrams,
        distinctValues: distinctValuesWithFilteredCounts,
      };
    },
  );

  // ============================================================================
  // Filter methods
  // ============================================================================

  /**
   * Determines if a telegram matches the currently active filters
   */
  public matchesActiveFilters(telegram: TelegramRow): boolean {
    return Object.entries(this._filters).every(([field, values]) => {
      if (!values?.length) return true;

      const fieldMap: Record<string, string> = {
        source: telegram.sourceAddress,
        destination: telegram.destinationAddress,
        direction: telegram.direction,
        telegramtype: telegram.type,
      };

      return values.includes(fieldMap[field] || "");
    });
  }

  /**
   * Toggles a filter value on/off for a specific field
   */
  public toggleFilterValue(field: string, value: string, route?: Route): void {
    const currentFilters = this._filters[field] ?? [];
    if (currentFilters.includes(value)) {
      this._filters = {
        ...this._filters,
        [field]: currentFilters.filter((item) => item !== value),
      };
    } else {
      this._filters = { ...this._filters, [field]: [...currentFilters, value] };
    }

    this._updateUrlFromFilters(route);
    this._cleanupUnusedFilterValues();

    this.host.requestUpdate();
  }

  /**
   * Updates filter values for a specific field
   */
  public setFilterFieldValue(field: string, value: string[], route?: Route): void {
    this._filters = { ...this._filters, [field]: value };
    this._updateUrlFromFilters(route);
    this._cleanupUnusedFilterValues();

    this.host.requestUpdate();
  }

  /**
   * Clears all active filters
   */
  public clearFilters(route?: Route): void {
    this._filters = {};
    this._updateUrlFromFilters(route);
    this._cleanupUnusedFilterValues();

    this.host.requestUpdate();
  }

  /**
   * Updates which filter panel is currently expanded
   */
  public updateExpandedFilter(id: string, expanded: boolean): void {
    this._expandedFilter = expanded
      ? id
      : this._expandedFilter === id
        ? null
        : this._expandedFilter;
    this.host.requestUpdate();
  }

  // ============================================================================
  // Control methods
  // ============================================================================

  /**
   * Toggles the pause state of telegram monitoring
   */
  public async togglePause(): Promise<void> {
    this._isPaused = !this._isPaused;
    this.host.requestUpdate();
  }

  /**
   * Reloads recent telegrams from the server
   */
  public async reload(hass: HomeAssistant): Promise<void> {
    await this._loadRecentTelegrams(hass);
  }

  /**
   * Attempts to reconnect after a connection error
   */
  public async retryConnection(hass: HomeAssistant): Promise<void> {
    await this._connectionService.reconnect(hass);
  }

  /**
   * Clears all telegrams from the display and resets filter data
   */
  public clearTelegrams(): void {
    // Create filtered distinct values to preserve selected filter names
    const preserveValues = this._createFilteredDistinctValues();

    this._telegramBuffer.clear();
    this._resetDistinctValues(preserveValues);
    this._isReloadEnabled = true;
    this.host.requestUpdate();
  }

  // ============================================================================
  // Distinct values management
  // ============================================================================

  /**
   * Calculates the relative time offset between two telegrams in microseconds
   * @param currentTelegram - The telegram to calculate offset for
   * @param previousTelegram - The previous telegram to calculate offset from (null for first telegram)
   * @returns The calculated offset in microseconds (null for first telegram)
   */
  private _calculateTelegramOffset(
    currentTelegram: TelegramRow,
    previousTelegram: TelegramRow | null,
  ): OffsetMicros {
    if (!previousTelegram) {
      // First telegram gets null to indicate no previous telegram
      return null;
    }

    const currentMicros = extractMicrosecondsFromIso(currentTelegram.timestampIso);
    const previousMicros = extractMicrosecondsFromIso(previousTelegram.timestampIso);

    // Always calculate the time difference to get positive values
    // For both sort directions, we now pass the chronologically earlier telegram as "previous"
    return currentMicros - previousMicros;
  }

  /**
   * Extracts field value for distinct value tracking
   */
  private _extractTelegramField(
    telegram: TelegramRow,
    field: FilterField,
  ): { id: string; name: string } | null {
    switch (field) {
      case "source":
        return { id: telegram.sourceAddress, name: telegram.sourceText || "" };
      case "destination":
        return { id: telegram.destinationAddress, name: telegram.destinationText || "" };
      case "direction":
        return { id: telegram.direction, name: "" };
      case "telegramtype":
        return { id: telegram.type, name: "" };
      default:
        return null;
    }
  }

  /**
   * Adds a telegram to distinct values tracking (total counts only)
   */
  private _addToDistinctValues(telegram: TelegramRow): void {
    for (const field of FILTER_FIELDS) {
      const extracted = this._extractTelegramField(telegram, field);
      if (!extracted) {
        logger.warn(`Unknown field for distinct values: ${field}`);
        continue;
      }

      const { id, name } = extracted;
      if (!this._distinctValues[field][id]) {
        this._distinctValues[field][id] = {
          id,
          name,
          totalCount: 0,
        };
      }

      this._distinctValues[field][id].totalCount++;

      // Update name if it was empty and we have a name
      if (this._distinctValues[field][id].name === "" && name) {
        this._distinctValues[field][id].name = name;
      }
    }

    // Increment buffer version to invalidate memoization cache
    this._bufferVersion++;
  }

  /**
   * Removes telegrams from distinct values tracking (total counts only)
   */
  private _removeFromDistinctValues(telegrams: TelegramRow[]): void {
    if (telegrams.length === 0) return;

    for (const telegram of telegrams) {
      for (const field of FILTER_FIELDS) {
        const extracted = this._extractTelegramField(telegram, field);
        if (!extracted) continue;

        const { id } = extracted;
        const distinctValue = this._distinctValues[field][id];
        if (!distinctValue) continue;

        distinctValue.totalCount--;

        // Remove entry if total count reaches zero
        if (distinctValue.totalCount <= 0) {
          delete this._distinctValues[field][id];
        }
      }
    }

    // Increment buffer version to invalidate memoization cache
    this._bufferVersion++;
  }

  /**
   * Creates a TelegramDistinctValues object with selected filter values and their names
   * All counts are initialized to 0
   */
  private _createFilteredDistinctValues(): DistinctValues {
    const result: DistinctValues = {
      source: {},
      destination: {},
      direction: {},
      telegramtype: {},
    };

    for (const field of FILTER_FIELDS) {
      const filterValues = this._filters[field];
      if (!filterValues?.length) continue;

      for (const value of filterValues) {
        const existingInfo = this._distinctValues[field][value];
        result[field][value] = {
          id: value,
          name: existingInfo?.name || "",
          totalCount: 0,
        };
      }
    }

    return result;
  }

  /**
   * Removes distinct values with totalCount 0 that are no longer in active filters
   * This cleans up filter values that were preserved but are no longer selected
   */
  private _cleanupUnusedFilterValues(): void {
    let hasChanges = false;

    for (const field of FILTER_FIELDS) {
      const activeFilterValues = this._filters[field] || [];
      const fieldValues = this._distinctValues[field];

      for (const [value, info] of Object.entries(fieldValues)) {
        // Remove if totalCount is 0 and value is not in active filters
        if (info.totalCount === 0 && !activeFilterValues.includes(value)) {
          delete this._distinctValues[field][value];
          hasChanges = true;
        }
      }
    }

    // Increment buffer version if we made changes
    if (hasChanges) {
      this._bufferVersion++;
    }
  }

  /**
   * Resets all distinct values
   * @param preserveValues - Optional DistinctValues to preserve with their names
   */
  private _resetDistinctValues(preserveValues?: DistinctValues): void {
    if (preserveValues) {
      // Start with the preserved values
      this._distinctValues = {
        source: { ...preserveValues.source },
        destination: { ...preserveValues.destination },
        direction: { ...preserveValues.direction },
        telegramtype: { ...preserveValues.telegramtype },
      };
    } else {
      // Reset to empty
      this._distinctValues = {
        source: {},
        destination: {},
        direction: {},
        telegramtype: {},
      };
    }

    // Increment buffer version to invalidate memoization cache
    this._bufferVersion++;
  }

  // ============================================================================
  // Private methods
  // ============================================================================

  /**
   * Calculates the buffer size for telegram storage
   */
  private _calculateTelegramStorageBuffer(recentTelegramsLength: number): number {
    const tenPercentBuffer = Math.ceil(recentTelegramsLength * 0.1);
    const roundedBuffer = Math.ceil(tenPercentBuffer / 100) * 100;
    return Math.max(roundedBuffer, GroupMonitorController.MIN_TELEGRAM_STORAGE_BUFFER);
  }

  /**
   * Loads recent telegrams from the server
   */
  private async _loadRecentTelegrams(hass: HomeAssistant): Promise<boolean> {
    try {
      const info = await getGroupMonitorInfo(hass);
      this._isProjectLoaded = info.project_loaded;

      // Calculate dynamic telegram storage limit
      const telegramsLength = info.recent_telegrams.length;
      const buffer = this._calculateTelegramStorageBuffer(telegramsLength);
      const telegramStorageLimit = telegramsLength + buffer;

      // Update max telegram count if needed
      if (this._telegramBuffer.maxSize !== telegramStorageLimit) {
        const removedTelegrams = this._telegramBuffer.setMaxSize(telegramStorageLimit);

        // Update distinct values by removing counts for removed telegrams
        if (removedTelegrams.length > 0) {
          this._removeFromDistinctValues(removedTelegrams);
        }
      }

      // Merge new telegrams with existing ones, avoiding duplicates
      const newTelegramRows = info.recent_telegrams.map((t) => new TelegramRow(t));
      const { added, removed } = this._telegramBuffer.merge(newTelegramRows);

      // Update distinct values incrementally
      if (removed.length > 0) {
        this._removeFromDistinctValues(removed);
      }

      if (added.length > 0) {
        // Add new telegrams to distinct values incrementally
        for (const telegram of added) {
          this._addToDistinctValues(telegram);
        }
      }

      if (this._connectionError !== null) {
        this._connectionError = null;
      }

      this._isReloadEnabled = false;

      // Trigger re-render if new telegrams were added or if we're recovering from an error
      if (added.length > 0 || this._connectionError === null) {
        this.host.requestUpdate();
      }
      return true;
    } catch (err) {
      logger.error("getGroupMonitorInfo failed", err);
      this._connectionError = err instanceof Error ? err.message : String(err);
      this.host.requestUpdate();
      return false;
    }
  }

  /**
   * Handles new telegram data from WebSocket subscription
   */
  private _handleIncomingTelegram(telegram: TelegramDict): void {
    const telegramRow = new TelegramRow(telegram);

    if (!this._isPaused) {
      const removedTelegrams = this._telegramBuffer.add(telegramRow);
      if (removedTelegrams.length > 0) {
        this._removeFromDistinctValues(removedTelegrams);
      }

      // Add new telegram to distinct values
      this._addToDistinctValues(telegramRow);

      this.host.requestUpdate();
    } else if (!this._isReloadEnabled) {
      this._isReloadEnabled = true;
      this.host.requestUpdate();
    }
  }

  /**
   * Updates the URL with current filter state
   */
  private _updateUrlFromFilters(route?: Route): void {
    if (!route) {
      logger.warn("Route not available, cannot update URL");
      return;
    }

    const params = new URLSearchParams();

    Object.entries(this._filters).forEach(([key, values]) => {
      if (Array.isArray(values) && values.length > 0) {
        params.set(key, values.join(","));
      }
    });

    const newPath = params.toString()
      ? `${route.prefix}${route.path}?${params.toString()}`
      : `${route.prefix}${route.path}`;

    navigate(decodeURIComponent(newPath), { replace: true });
  }

  /**
   * Sets filters from URL query parameters
   */
  private _setFiltersFromUrl(): void {
    const searchParams = new URLSearchParams(mainWindow.location.search);
    const source = searchParams.get("source");
    const destination = searchParams.get("destination");
    const direction = searchParams.get("direction");
    const telegramtype = searchParams.get("telegramtype");

    if (!source && !destination && !direction && !telegramtype) {
      return;
    }

    this._filters = {
      source: source ? source.split(",") : [],
      destination: destination ? destination.split(",") : [],
      direction: direction ? direction.split(",") : [],
      telegramtype: telegramtype ? telegramtype.split(",") : [],
    };

    const preserveValues = this._createFilteredDistinctValues();
    this._resetDistinctValues(preserveValues);

    this.host.requestUpdate();
  }
}
