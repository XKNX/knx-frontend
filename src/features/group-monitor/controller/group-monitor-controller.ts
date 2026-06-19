import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { HomeAssistant, Route } from "@ha/types";
import { navigate } from "@ha/common/navigate";
import { mainWindow } from "@ha/common/dom/get_main_window";
import { fireEvent } from "@ha/common/dom/fire_event";
import memoize from "memoize-one";
import type { SortingDirection } from "@ha/components/data-table/ha-data-table";

import { getGroupMonitorInfo, queryTelegrams } from "../../../services/websocket.service";
import { TelegramBufferService } from "../services/telegram-buffer-service";
import { TelegramCoverageService } from "../services/telegram-coverage-service";
import { TelegramCacheService, MAX_CACHE_SIZE } from "../services/telegram-cache-service";
import { ConnectionService } from "../services/connection-service";
import { KNXLogger } from "../../../tools/knx-logger";
import { TelegramRow, type OffsetMicros } from "../types/telegram-row";
import type { TelegramDict } from "../../../types/websocket";
import { extractMicrosecondsFromIso } from "../../../utils/format";

const logger = new KNXLogger("group_monitor_controller");

// Filter and distinct values types for type safety
export type FilterField = "source" | "destination" | "direction" | "telegramtype" | "dpt";

// All filter fields as a constant array
export const FILTER_FIELDS: readonly FilterField[] = [
  "source",
  "destination",
  "direction",
  "telegramtype",
  "dpt",
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
  timeDeltaAddedCount: number;
}

/** Active time-range filter (epoch milliseconds). `endMs` undefined means open-ended/live. */
export interface TimeRangeFilter {
  startMs: number;
  endMs?: number;
}

/** Non-fatal outcome of a history load, surfaced to the user. */
export type HistoryWarning = "retention_clamped" | "partial_load";

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

  /** Page size for paginated history queries. */
  private static readonly HISTORY_PAGE_SIZE = 10000;

  /** Safety cap on telegrams fetched for a single time-range request. */
  private static readonly MAX_HISTORY_ROWS = 100000;

  /** localStorage key for persisted coverage intervals. */
  private static readonly COVERAGE_KEY = "knx-group-monitor-coverage";

  private host: ReactiveControllerHost;

  // Connection service for WebSocket telegram subscriptions
  private _connectionService = new ConnectionService();

  // Telegram buffer service
  private _telegramBuffer = new TelegramBufferService(2000);

  // Tracks which time ranges are fully loaded into the buffer
  private _coverage = new TelegramCoverageService();

  // Persistent IndexedDB cache for raw telegram dicts
  private _cache = new TelegramCacheService();

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

  // Time-delta context filter (milliseconds)
  private _timeDeltaBefore = 0;

  private _timeDeltaAfter = 0;

  // Time-range display filter (epoch milliseconds); undefined end means open-ended/live
  private _filterStartMs?: number;

  private _filterEndMs?: number;

  // History loading state
  private _historyLoading = false;

  private _historyWarning: HistoryWarning | null = null;

  // Monotonic id to discard results of superseded history requests
  private _historyRequestId = 0;

  // Filter data - only stores total counts, filtered counts computed on-the-fly
  private _distinctValues: DistinctValues = {
    source: {},
    destination: {},
    direction: {},
    telegramtype: {},
    dpt: {},
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
   * Setup method to be called from the host's firstUpdated.
   *
   * @param retentionDays - Backend telegram retention in days; used to trim the
   *   coverage cache to the available window before restoring persisted data.
   */
  public async setup(hass: HomeAssistant, retentionDays: number | null = null): Promise<void> {
    if (this._connectionService.isConnected) return;

    await this._restoreFromCache(retentionDays);

    if (!(await this._loadRecentTelegrams(hass))) return;

    try {
      await this._connectionService.subscribe(hass);
    } catch (err) {
      logger.error("Failed to setup connection", err);
      this._connectionError = err instanceof Error ? err.message : String(err);
      this.host.requestUpdate();
    }
  }

  /**
   * Restores persisted coverage intervals and telegram dicts from local storage
   * and IndexedDB before the first server round-trip.  All operations are
   * advisory: errors are silently suppressed so a cache miss never breaks startup.
   */
  private async _restoreFromCache(retentionDays: number | null): Promise<void> {
    // --- 1. Restore coverage intervals ---
    try {
      const raw = localStorage.getItem(GroupMonitorController.COVERAGE_KEY);
      if (raw) {
        const intervals: [number, number][] = JSON.parse(raw);
        for (const [s, e] of intervals) {
          this._coverage.addCovered(s, e);
        }
      }
    } catch {
      // malformed JSON or unavailable storage — start with empty coverage
    }

    // --- 2. Apply retention trim to coverage (and evict old IDB entries) ---
    if (retentionDays != null) {
      const minMs = Date.now() - (retentionDays + 1) * 86400_000;
      this._coverage.trim(minMs);
      this._cache.evictBefore(minMs).catch((err) => logger.warn("Cache evict failed", err));
    }

    // --- 3. Restore cached telegram dicts ---
    try {
      const cached = await this._cache.loadAll();
      if (cached.length > 0) {
        const dicts = cached.map((e) => e.dict);
        this.addHistoricalTelegrams(dicts, false);
      }
    } catch {
      // IDB unavailable or corrupt — proceed without cached data
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

  public get timeDeltaBefore(): number {
    return this._timeDeltaBefore;
  }

  public get timeDeltaAfter(): number {
    return this._timeDeltaAfter;
  }

  /** The active time-range display filter, or null when none is set. */
  public get timeRangeFilter(): TimeRangeFilter | null {
    if (this._filterStartMs === undefined) return null;
    return { startMs: this._filterStartMs, endMs: this._filterEndMs };
  }

  public get hasTimeRangeFilter(): boolean {
    return this._filterStartMs !== undefined;
  }

  /** Whether the active range is an absolute (bounded) past range. */
  public get hasAbsoluteTimeRange(): boolean {
    return this._filterStartMs !== undefined && this._filterEndMs !== undefined;
  }

  public get historyLoading(): boolean {
    return this._historyLoading;
  }

  public get historyWarning(): HistoryWarning | null {
    return this._historyWarning;
  }

  /**
   * Whether any list-based filters are active
   * Used by the UI to decide whether to disable the time-delta inputs
   */
  public get hasActiveListFilters(): boolean {
    return Object.values(this._filters).some((f) => Array.isArray(f) && f.length > 0);
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
      this._timeDeltaBefore,
      this._timeDeltaAfter,
      this._filterStartMs,
      this._filterEndMs,
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
      timeDeltaBefore?: number,
      timeDeltaAfter?: number,
      filterStartMs?: number,
      filterEndMs?: number,
    ): FilteredTelegramsResult => {
      // Filter telegrams based on the active list filters and time range
      const matchingTelegrams = allTelegrams.filter((telegram) => {
        if (filterStartMs !== undefined || filterEndMs !== undefined) {
          const ts = telegram.timestamp.getTime();
          if (filterStartMs !== undefined && ts < filterStartMs) return false;
          if (filterEndMs !== undefined && ts > filterEndMs) return false;
        }
        return this.matchesActiveFilters(telegram);
      });

      // Apply time-delta expansion if active
      const filteredTelegrams = this._applyTimeDeltaExpansion(
        matchingTelegrams,
        allTelegrams,
        timeDeltaBefore || 0,
        timeDeltaAfter || 0,
      );

      const timeDeltaAddedCount = filteredTelegrams.length - matchingTelegrams.length;

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
        dpt: {},
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
          let previousTelegram: TelegramRow | null;

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
        timeDeltaAddedCount,
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

      const fieldMap: Record<string, string | null> = {
        source: telegram.sourceAddress,
        destination: telegram.destinationAddress,
        direction: telegram.direction,
        telegramtype: telegram.type,
        dpt: telegram.dptId,
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

    this._resetTimeDeltaIfNoListFilters();

    this._updateUrlFromFilters(route);
    this._cleanupUnusedFilterValues();

    this.host.requestUpdate();
  }

  /**
   * Updates filter values for a specific field
   */
  public setFilterFieldValue(field: string, value: string[], route?: Route): void {
    this._filters = { ...this._filters, [field]: value };

    this._resetTimeDeltaIfNoListFilters();

    this._updateUrlFromFilters(route);
    this._cleanupUnusedFilterValues();

    this.host.requestUpdate();
  }

  /**
   * Clears all active filters
   */
  public clearFilters(route?: Route): void {
    this._filters = {};
    this._timeDeltaBefore = 0;
    this._timeDeltaAfter = 0;
    this.clearTimeRangeFilter();
    this._updateUrlFromFilters(route);
    this._cleanupUnusedFilterValues();

    this.host.requestUpdate();
  }

  /**
   * Updates time-delta values and persists to URL
   */
  public setTimeDelta(before: number, after: number, route?: Route): void {
    const newBefore = Math.max(0, Math.floor(before));
    const newAfter = Math.max(0, Math.floor(after));

    if (this._timeDeltaBefore === newBefore && this._timeDeltaAfter === newAfter) {
      return;
    }

    this._timeDeltaBefore = newBefore;
    this._timeDeltaAfter = newAfter;
    this._bufferVersion++;
    this._updateUrlFromFilters(route);
    this.host.requestUpdate();
  }

  /**
   * Applies a time-range display filter and transparently loads any history that
   * is not yet covered.
   *
   * Open-ended ranges (`endMs` undefined, or in the future) keep the live stream
   * running and filter `timestamp >= start`. Absolute past ranges filter
   * `[start, end]` and switch to pause mode so newer telegrams don't appear on
   * top of the historical view.
   *
   * @param hass - Home Assistant instance for backend queries
   * @param startMs - Range start in epoch milliseconds
   * @param endMs - Range end in epoch milliseconds, or undefined for "until now"
   * @param retentionDays - Backend telegram retention in days (null = unknown)
   */
  public async applyTimeRangeFilter(
    hass: HomeAssistant,
    startMs: number,
    endMs: number | undefined,
    retentionDays: number | null,
  ): Promise<void> {
    const now = Date.now();
    this._historyWarning = null;

    // Clamp the start to the retention window (plus a day of slack) and warn.
    if (retentionDays != null) {
      const minMs = now - (retentionDays + 1) * 86400_000;
      this._coverage.trim(minMs);
      this._saveCoverage();
      if (startMs < minMs) {
        startMs = minMs;
        this._historyWarning = "retention_clamped";
      }
    }

    const live = endMs === undefined || endMs >= now;
    const queryEnd = live ? now : endMs;

    if (queryEnd < startMs) {
      // Nothing sensible to load or show.
      return;
    }

    const requestId = ++this._historyRequestId;
    this._historyLoading = true;
    this.host.requestUpdate();

    try {
      let fetchedTotal = 0;
      for (const [gapStart, gapEnd] of this._coverage.gaps(startMs, queryEnd)) {
        // eslint-disable-next-line no-await-in-loop
        const { complete, lastTs, fetched } = await this._loadGap(
          hass,
          gapStart,
          gapEnd,
          requestId,
          fetchedTotal,
        );
        if (requestId !== this._historyRequestId) return; // superseded
        fetchedTotal += fetched;

        if (complete) {
          this._coverage.addCovered(gapStart, gapEnd);
        } else {
          if (lastTs !== null) this._coverage.addCovered(gapStart, lastTs);
          this._historyWarning = "partial_load";
          break;
        }
        this._saveCoverage();
      }
    } catch (err) {
      logger.error("applyTimeRangeFilter failed", err);
    } finally {
      if (requestId === this._historyRequestId) {
        this._historyLoading = false;
      }
    }

    if (requestId !== this._historyRequestId) return; // superseded

    this._filterStartMs = startMs;
    this._filterEndMs = live ? undefined : endMs;
    if (!live) {
      this._isPaused = true;
      this._coverage.closeLive();
    }
    this._bufferVersion++;
    this.host.requestUpdate();
  }

  /**
   * Loads a single gap with paginated queries until it is fully fetched, the
   * backend stops returning rows, or the global safety cap is reached.
   */
  private async _loadGap(
    hass: HomeAssistant,
    gapStart: number,
    gapEnd: number,
    requestId: number,
    fetchedBefore: number,
  ): Promise<{ complete: boolean; lastTs: number | null; fetched: number }> {
    let offset = 0;
    let lastTs: number | null = null;
    let fetched = 0;

    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const result = await queryTelegrams(hass, {
        start_time: new Date(gapStart).toISOString(),
        end_time: new Date(gapEnd).toISOString(),
        order_descending: false,
        limit: GroupMonitorController.HISTORY_PAGE_SIZE,
        offset,
      });
      if (requestId !== this._historyRequestId) {
        return { complete: false, lastTs, fetched };
      }

      const batch = result.telegrams;
      if (batch.length > 0) {
        this.addHistoricalTelegrams(batch);
        lastTs = new Date(batch[batch.length - 1].timestamp).getTime();
        offset += batch.length;
        fetched += batch.length;
      }

      if (batch.length === 0 || offset >= result.total_count) {
        return { complete: true, lastTs, fetched };
      }
      if (fetchedBefore + fetched >= GroupMonitorController.MAX_HISTORY_ROWS) {
        return { complete: false, lastTs, fetched };
      }
    }
  }

  // ============================================================================
  // Persistence helpers
  // ============================================================================

  /**
   * Serialises the current covered intervals to localStorage.
   * Call after every `addCovered` / `trim` that should persist.
   */
  private _saveCoverage(): void {
    try {
      localStorage.setItem(
        GroupMonitorController.COVERAGE_KEY,
        JSON.stringify(this._coverage.covered),
      );
    } catch {
      // Ignore quota or unavailability.
    }
  }

  /**
   * Stores a batch of raw telegram dicts to IndexedDB and trims the cache to
   * the configured size cap.  Fire-and-forget — errors are logged but not thrown.
   */
  private _cacheStore(batch: { id: string; ts: number; dict: TelegramDict }[]): void {
    if (batch.length === 0) return;
    this._cache
      .store(batch)
      .then(() => this._cache.evictToSize(MAX_CACHE_SIZE))
      .catch((err) => logger.warn("Cache write failed", err));
  }

  /**
   * Clears the persistent cache (IndexedDB + coverage localStorage), resets
   * in-memory coverage, and wipes the telegram buffer.
   */
  public async clearCache(): Promise<void> {
    try {
      await this._cache.clear();
    } catch (err) {
      logger.warn("Cache clear failed", err);
    }
    this._coverage.clear();
    try {
      localStorage.removeItem(GroupMonitorController.COVERAGE_KEY);
    } catch {
      // ignore
    }
    const cleared = this._telegramBuffer.clear();
    if (cleared.length > 0) {
      this._resetDistinctValues();
    }
    this._isReloadEnabled = true;
    this._bufferVersion++;
    this.host.requestUpdate();
  }

  /**
   * Releases the time-range display filter and resumes the live view.
   * The already-loaded telegrams remain in the buffer.
   */
  public clearTimeRangeFilter(): void {
    if (this._filterStartMs === undefined && !this._historyWarning) return;
    this._filterStartMs = undefined;
    this._filterEndMs = undefined;
    this._historyWarning = null;
    this._isPaused = false;
    this._bufferVersion++;
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
    // A pause window has no data; close the live interval so it becomes a gap.
    if (this._isPaused) {
      this._coverage.closeLive();
    }
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
   * Adds historical telegrams fetched from the backend.
   * Merges them with existing telegrams and updates the buffer size.
   */
  /**
   * Adds historical telegrams fetched from the backend (or restored from the
   * persistent cache) into the in-memory buffer.
   *
   * @param telegrams - Raw telegram dicts to merge.
   * @param persist - When `true` (default) the dicts are also written to the
   *   IndexedDB cache so they survive a page reload.  Pass `false` when the
   *   dicts already came *from* the cache to avoid a pointless round-trip.
   */
  public addHistoricalTelegrams(telegrams: TelegramDict[], persist = true): void {
    if (telegrams.length === 0) return;

    // Calculate dynamic telegram storage limit
    const telegramsLength = this._telegramBuffer.length + telegrams.length;
    const buffer = this._calculateTelegramStorageBuffer(telegramsLength);
    const telegramStorageLimit = Math.max(this._telegramBuffer.maxSize, telegramsLength + buffer);

    // Update max telegram count if needed
    if (this._telegramBuffer.maxSize !== telegramStorageLimit) {
      const removedTelegrams = this._telegramBuffer.setMaxSize(telegramStorageLimit);
      if (removedTelegrams.length > 0) {
        this._removeFromDistinctValues(removedTelegrams);
      }
    }

    // Merge new telegrams with existing ones, avoiding duplicates
    const newTelegramRows = telegrams.map((t) => new TelegramRow(t));
    const { added, removed } = this._telegramBuffer.merge(newTelegramRows);

    // Update distinct values incrementally
    if (removed.length > 0) {
      this._removeFromDistinctValues(removed);
    }

    if (added.length > 0) {
      for (const telegram of added) {
        this._addToDistinctValues(telegram);
      }

      // Persist newly-added dicts (skip when caller is the cache restore path).
      if (persist) {
        const addedIds = new Set(added.map((r) => r.id));
        const batch = telegrams
          .map((dict) => {
            const row = newTelegramRows.find((r) => addedIds.has(r.id));
            return row ? { id: row.id, ts: row.timestamp.getTime(), dict } : null;
          })
          .filter((x): x is { id: string; ts: number; dict: TelegramDict } => x !== null);
        this._cacheStore(batch);
      }
    }

    this.host.requestUpdate();
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
      case "dpt":
        if (!telegram.dptId) return null;
        return { id: telegram.dptId, name: telegram.dpt || telegram.dptId };
      default:
        return null;
    }
  }

  /**
   * Applies time-delta expansion to include context telegrams around matching ones.
   * Uses binary search on the already-sorted allTelegrams array for O(n log n) performance.
   *
   * @param matchingTelegrams - Telegrams that match the active list filters
   * @param allTelegrams - All telegrams in the buffer (sorted chronologically by timestamp)
   * @param deltaBefore - Milliseconds before a matching telegram to include
   * @param deltaAfter - Milliseconds after a matching telegram to include
   * @returns Expanded array of telegrams (deduplicated, preserving original order)
   */
  private _applyTimeDeltaExpansion(
    matchingTelegrams: TelegramRow[],
    allTelegrams: readonly TelegramRow[],
    deltaBefore: number,
    deltaAfter: number,
  ): TelegramRow[] {
    // No delta active or no matching telegrams → return as-is
    if ((deltaBefore <= 0 && deltaAfter <= 0) || matchingTelegrams.length === 0) {
      return matchingTelegrams;
    }

    // If all telegrams match, no expansion needed
    if (matchingTelegrams.length === allTelegrams.length) {
      return matchingTelegrams;
    }

    const result: TelegramRow[] = [];
    let lastIncludedIdx = -1;

    for (const match of matchingTelegrams) {
      const matchTime = match.timestamp.getTime();
      const windowStart = matchTime - deltaBefore;
      const windowEnd = matchTime + deltaAfter;

      // Binary search for startIdx (first telegram >= windowStart)
      // Since windowStart is monotonically increasing, we can start from the previous end
      let lo = Math.max(0, lastIncludedIdx + 1);
      let hi = allTelegrams.length;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (allTelegrams[mid].timestamp.getTime() < windowStart) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      const startIdx = lo;

      // Binary search for endIdx (first telegram > windowEnd)
      lo = startIdx;
      hi = allTelegrams.length;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (allTelegrams[mid].timestamp.getTime() <= windowEnd) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      const endIdx = lo;

      // Add telegrams that haven't been added yet (merging overlapping windows)
      const actualStart = Math.max(startIdx, lastIncludedIdx + 1);
      for (let i = actualStart; i < endIdx; i++) {
        result.push(allTelegrams[i]);
      }
      lastIncludedIdx = Math.max(lastIncludedIdx, endIdx - 1);
    }

    return result;
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
      dpt: {},
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
        dpt: { ...preserveValues.dpt },
      };
    } else {
      // Reset to empty
      this._distinctValues = {
        source: {},
        destination: {},
        direction: {},
        telegramtype: {},
        dpt: {},
      };
    }

    // Increment buffer version to invalidate memoization cache
    this._bufferVersion++;
  }

  /**
   * Resets time-delta values to 0 if no list filters are active
   */
  private _resetTimeDeltaIfNoListFilters(): void {
    if (!this.hasActiveListFilters) {
      if (this._timeDeltaBefore > 0 || this._timeDeltaAfter > 0) {
        this._timeDeltaBefore = 0;
        this._timeDeltaAfter = 0;
        this._bufferVersion++;
      }
    }
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

      // Seed coverage for the recent window: the backend returns every telegram
      // since the recent-load horizon, so `[oldestRecent, now]` is fully loaded.
      const nowMs = Date.now();
      if (newTelegramRows.length > 0) {
        const oldestMs = newTelegramRows.reduce(
          (min, t) => Math.min(min, t.timestamp.getTime()),
          nowMs,
        );
        this._coverage.addCovered(oldestMs, nowMs);
        this._saveCoverage();
      }
      if (!this._isPaused) {
        // Anchor the live interval so streaming telegrams extend from now on.
        this._coverage.extendLive(nowMs);
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

      // Extend live coverage up to this telegram's timestamp
      this._coverage.extendLive(telegramRow.timestamp.getTime());

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

    if (this.hasActiveListFilters) {
      if (this._timeDeltaBefore > 0) {
        params.set("timedelta_before", this._timeDeltaBefore.toString());
      }
      if (this._timeDeltaAfter > 0) {
        params.set("timedelta_after", this._timeDeltaAfter.toString());
      }
    }

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
    const dpt = searchParams.get("dpt");
    const timeDeltaBefore = searchParams.get("timedelta_before");
    const timeDeltaAfter = searchParams.get("timedelta_after");

    if (!source && !destination && !direction && !telegramtype && !dpt) {
      this._timeDeltaBefore = 0;
      this._timeDeltaAfter = 0;
      return;
    }

    // Restore time-delta values from URL when list filters exist.
    // Missing or invalid query params must reset to 0 so the URL remains
    // the single source of truth for the controller state.
    this._timeDeltaBefore = Math.max(0, Math.floor(Number(timeDeltaBefore) || 0));
    this._timeDeltaAfter = Math.max(0, Math.floor(Number(timeDeltaAfter) || 0));

    this._filters = {
      source: source ? source.split(",") : [],
      destination: destination ? destination.split(",") : [],
      direction: direction ? direction.split(",") : [],
      telegramtype: telegramtype ? telegramtype.split(",") : [],
      dpt: dpt ? dpt.split(",") : [],
    };

    const preserveValues = this._createFilteredDistinctValues();
    this._resetDistinctValues(preserveValues);

    this.host.requestUpdate();
  }
}
