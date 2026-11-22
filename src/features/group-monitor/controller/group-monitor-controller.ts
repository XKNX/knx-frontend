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
import { TelegramCacheService } from "../services/telegram-cache-service";
import { ConnectionService } from "../services/connection-service";
import {
  FacetIndex,
  FILTER_FIELDS,
  UNKNOWN_DPT_ID,
  type DistinctValues,
  type FilterField,
  type FilterMap,
  type DistinctValueInfo,
} from "../services/facet-index";
import { KNXLogger } from "../../../tools/knx-logger";
import { TelegramRow, type OffsetMicros } from "../types/telegram-row";
import { ERR_TELEGRAM_STORE_INITIALIZING, type TelegramDict } from "../../../types/websocket";
import { extractMicrosecondsFromIso } from "../../../utils/format";

const logger = new KNXLogger("group_monitor_controller");

export { FILTER_FIELDS, UNKNOWN_DPT_ID };
export type { DistinctValues, FilterField, FilterMap, DistinctValueInfo };

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
export type HistoryWarning = "retention_clamped" | "partial_load" | "store_initializing";

/** Delays between polls of the backend while its telegram store initializes (ms). */
const STORE_INITIALIZING_RETRY_DELAYS_MS = [2_000, 5_000, 10_000];

/** Live telegrams are written to the cache in batches collected over this long (ms). */
const LIVE_CACHE_FLUSH_DELAY_MS = 1_000;

/**
 * Cached telegrams shown while the first recent load is in flight. The recent
 * load then sizes the buffer to its own window, so more would be built only to
 * be dropped again.
 */
const STARTUP_CACHE_ROWS = 2_000;

/** A persisted coverage interval: two finite epoch-millisecond timestamps in order. */
const isInterval = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1]) &&
  value[0] <= value[1];

/** A telegram as written to the IndexedDB cache. */
interface CacheEntry {
  id: string;
  ts: number;
  dict: TelegramDict;
}

/** Whether a rejected websocket call reported the telegram store as still initializing. */
const isStoreInitializingError = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  (err as { code?: unknown }).code === ERR_TELEGRAM_STORE_INITIALIZING;

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

  // The hass of the last backend call, for loads the controller starts itself
  private _hass: HomeAssistant | null = null;

  // Telegram buffer service
  private _telegramBuffer = new TelegramBufferService(2000);

  // Tracks which time ranges are fully loaded into the buffer
  private _coverage = new TelegramCoverageService();

  // Persistent IndexedDB cache for raw telegram dicts
  private _cache = new TelegramCacheService();

  // Timestamps (epoch ms) of the telegrams known to be committed to the cache, by id
  private _cachedIds = new Map<string, number>();

  // Oldest timestamp the cache may still hold after evictions; coverage never reaches below it
  private _cacheFloorMs: number | null = null;

  // Settles once the cache index is known; writes wait for it so cached rows are not rewritten
  private _cacheRestored: Promise<void> = Promise.resolve();

  // Live telegrams waiting to be written to the cache in one batch
  private _pendingCacheWrites: CacheEntry[] = [];

  private _pendingCacheFlushTimer: ReturnType<typeof setTimeout> | null = null;

  // UI state
  private _filters: Record<string, string[]> = {};

  private _sortColumn?: string = "timestampIso";

  private _sortDirection: SortingDirection = "desc";

  private _expandedFilter: string | null = "source";

  private _isReloadEnabled = false;

  private _isPaused = false;

  private _connectionError: string | null = null;

  // Backend telegram store still initializing; recent history is polled for until ready
  private _storeInitializing = false;

  private _storeInitializingRetryCount = 0;

  private _storeInitializingTimer: ReturnType<typeof setTimeout> | null = null;

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

  /** Bitset-backed filter index kept in sync with the telegram buffer. */
  private _facetIndex = new FacetIndex();

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
    this._connectionService.onConnectionLost(() => {
      // Telegrams sent during the outage never arrive, so the live interval
      // must not bridge it. Telegrams received before are written and covered
      // first; closing earlier would let their coverage reopen the interval.
      this._flushPendingCacheWrites().then(() => this._coverage.closeLive());
    });
    this._connectionService.onReconnected(() => {
      // The recent load fills the outage from the backend and reopens the live interval.
      if (this._hass !== null) this._loadRecentTelegrams(this._hass);
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
    this._clearStoreInitializingRetry();
    this._flushPendingCacheWrites();
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
    this._hass = hass;
    if (this._connectionService.isConnected) return;

    await this._restoreFromCache(retentionDays);

    // Live telegrams never depend on the history store, so subscribe first.
    try {
      await this._connectionService.subscribe(hass);
    } catch (err) {
      logger.error("Failed to setup connection", err);
      this._connectionError = err instanceof Error ? err.message : String(err);
      this.host.requestUpdate();
      return;
    }

    await this._loadRecentTelegrams(hass);
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
        const intervals: unknown = JSON.parse(raw);
        if (Array.isArray(intervals)) {
          for (const interval of intervals) {
            if (isInterval(interval)) this._coverage.addCovered(interval[0], interval[1]);
          }
        }
      }
    } catch {
      // malformed JSON or unavailable storage — start with empty coverage
    }

    // --- 2. Apply retention trim to coverage (and evict old IDB entries) ---
    if (retentionDays != null) {
      const minMs = Date.now() - (retentionDays + 1) * 86400_000;
      this._applyCacheFloor(minMs);
      this._cache.evictBefore(minMs).catch((err) => logger.warn("Cache evict failed", err));
    }

    // --- 3. Show the newest cached telegrams while the recent load is in flight ---
    // Not awaited here: the subscription and the recent load must not wait for
    // it. Older cached ranges are loaded on demand by the time-range filter.
    this._cacheRestored = this._restoreCachedRows().catch((err) =>
      logger.warn("Startup cache load failed", err),
    );
  }

  /**
   * Reads the cache once: registers every entry as committed, so the recent
   * load does not write it again, and shows the newest ones.
   */
  private async _restoreCachedRows(): Promise<void> {
    const { index, newest } = await this._cache.loadStartup(STARTUP_CACHE_ROWS);
    const floor = this._cacheFloorMs;
    for (const { id, ts } of index) {
      if (floor === null || ts >= floor) this._cachedIds.set(id, ts);
    }
    if (newest.length > 0) {
      this.addHistoricalTelegrams(
        newest.map((e) => e.dict),
        false,
      );
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

  public get connectionError(): string | null {
    return this._connectionError;
  }

  /** Whether the backend telegram store is still initializing (live telegrams still flow). */
  public get storeInitializing(): boolean {
    return this._storeInitializing;
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

  /** Converts the mutable UI filter state into the FacetIndex query contract. */
  private _createFilterMap(): FilterMap {
    return {
      source: new Set(this._filters.source ?? []),
      destination: new Set(this._filters.destination ?? []),
      direction: new Set(this._filters.direction ?? []),
      telegramtype: new Set(this._filters.telegramtype ?? []),
      dpt: new Set(this._filters.dpt ?? []),
    };
  }

  private _getFilteredTelegramsAndDistinctValues = memoize(
    (
      _bufferVersion: number,
      _filtersJson: string,
      allTelegrams: readonly TelegramRow[],
      sortColumn?: string,
      sortDirection?: SortingDirection,
      timeDeltaBefore?: number,
      timeDeltaAfter?: number,
      filterStartMs?: number,
      filterEndMs?: number,
    ): FilteredTelegramsResult => {
      const scope = allTelegrams.filter((telegram) => {
        const ts = telegram.timestamp.getTime();
        return !(
          (filterStartMs !== undefined && ts < filterStartMs) ||
          (filterEndMs !== undefined && ts > filterEndMs)
        );
      });

      const filtersMap = this._createFilterMap();

      const isFullScope =
        filterStartMs === undefined &&
        filterEndMs === undefined &&
        scope.length === allTelegrams.length;

      // Derive the visible rows and all cross-filter counts from the same index snapshot.
      const { matchingTelegrams, distinctValues } = this._facetIndex.query(
        scope,
        filtersMap,
        isFullScope,
      );

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

      // Calculate offsets in the same loop.
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
      }

      return {
        filteredTelegrams,
        distinctValues,
        timeDeltaAddedCount,
      };
    },
  );

  // ============================================================================
  // Filter methods
  // ============================================================================

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

    this.host.requestUpdate();
  }

  /**
   * Updates filter values for a specific field
   */
  public setFilterFieldValue(field: string, value: string[], route?: Route): void {
    this._filters = { ...this._filters, [field]: value };

    this._resetTimeDeltaIfNoListFilters();

    this._updateUrlFromFilters(route);

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
      this._applyCacheFloor(minMs);
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

    // Load already-covered sub-ranges from IDB immediately so the user sees
    // cached data while server queries fill in the remaining gaps.
    try {
      await this._cacheRestored;
      const gaps = this._coverage.gaps(startMs, queryEnd);
      const coveredSubRanges = this._coveredSubRanges(startMs, queryEnd, gaps);
      const cached = await this._cache.loadRanges(coveredSubRanges);
      if (cached.length > 0) {
        this.addHistoricalTelegrams(
          cached.map((e) => e.dict),
          false,
        );
      }
      if (coveredSubRanges.length > 0) {
        this._filterStartMs = startMs;
        this._filterEndMs = live ? undefined : endMs;
        this.host.requestUpdate();
      }
    } catch (err) {
      logger.warn("Cache range load failed", err);
    }

    try {
      let fetchedTotal = 0;
      for (const [gapStart, gapEnd] of this._coverage.gaps(startMs, queryEnd)) {
        // eslint-disable-next-line no-await-in-loop
        const { complete, lastTs, fetched, cached } = await this._loadGap(
          hass,
          gapStart,
          gapEnd,
          requestId,
          fetchedTotal,
        );
        if (requestId !== this._historyRequestId) return; // superseded
        fetchedTotal += fetched;

        // A range only counts as loaded once its rows are in the cache; the
        // buffer alone does not survive a reload.
        if (cached) {
          if (complete) {
            this._markCovered(gapStart, gapEnd);
          } else if (lastTs !== null) {
            this._markCovered(gapStart, lastTs);
          }
        }
        if (!complete) {
          this._historyWarning = "partial_load";
          break;
        }
      }
    } catch (err) {
      if (isStoreInitializingError(err)) {
        this._historyWarning = "store_initializing";
      } else {
        logger.error("applyTimeRangeFilter failed", err);
      }
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
   * Returns the sub-ranges within [startMs, endMs] that are NOT gaps —
   * i.e. the portions already covered that can be served from IDB.
   */
  private _coveredSubRanges(
    startMs: number,
    endMs: number,
    gaps: [number, number][],
  ): [number, number][] {
    const result: [number, number][] = [];
    let cursor = startMs;
    for (const [gapStart, gapEnd] of gaps) {
      if (cursor < gapStart) result.push([cursor, gapStart]);
      cursor = gapEnd;
    }
    if (cursor < endMs) result.push([cursor, endMs]);
    return result;
  }

  /**
   * Loads a single gap with paginated queries until it is fully fetched, the
   * backend stops returning rows, or the global safety cap is reached.
   * `cached` is true once every fetched row is committed to the cache.
   */
  private async _loadGap(
    hass: HomeAssistant,
    gapStart: number,
    gapEnd: number,
    requestId: number,
    fetchedBefore: number,
  ): Promise<{ complete: boolean; lastTs: number | null; fetched: number; cached: boolean }> {
    let offset = 0;
    let lastTs: number | null = null;
    let fetched = 0;
    let complete = false;
    const writes: Promise<boolean>[] = [];

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
        return { complete: false, lastTs, fetched, cached: false };
      }

      const batch = result.telegrams;
      if (batch.length > 0) {
        writes.push(this.addHistoricalTelegrams(batch));
        lastTs = new Date(batch[batch.length - 1].timestamp).getTime();
        offset += batch.length;
        fetched += batch.length;
      }

      if (batch.length === 0 || offset >= result.total_count) {
        complete = true;
        break;
      }
      if (fetchedBefore + fetched >= GroupMonitorController.MAX_HISTORY_ROWS) {
        break;
      }
    }

    const cached = (await Promise.all(writes)).every(Boolean);
    return { complete, lastTs, fetched, cached };
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
   * Marks `[startMs, endMs]` as loaded and persists the coverage. Only call
   * this for rows that are committed to the cache: after a reload the range is
   * served from the cache alone. Evicted ranges are never claimed.
   */
  private _markCovered(startMs: number, endMs: number): void {
    const start = this._cacheFloorMs === null ? startMs : Math.max(startMs, this._cacheFloorMs);
    this._coverage.addCovered(start, endMs);
    this._saveCoverage();
  }

  /**
   * Records that the cache holds nothing before `minMs` any more and drops the
   * coverage and the committed ids of that range. The floor only ever rises.
   */
  private _applyCacheFloor(minMs: number): void {
    if (this._cacheFloorMs !== null && minMs <= this._cacheFloorMs) return;
    this._cacheFloorMs = minMs;
    for (const [id, ts] of this._cachedIds) {
      if (ts < minMs) this._cachedIds.delete(id);
    }
    this._coverage.trim(minMs);
    this._saveCoverage();
  }

  /**
   * Writes a batch of raw telegram dicts to IndexedDB and keeps the cache within
   * its size cap. Resolves to true once the rows are committed; errors are
   * logged and resolve to false, never thrown.
   */
  private async _cacheStore(batch: CacheEntry[]): Promise<boolean> {
    if (batch.length === 0) return true;
    try {
      await this._cache.store(batch);
    } catch (err) {
      logger.warn("Cache write failed", err);
      return false;
    }
    for (const { id, ts } of batch) {
      this._cachedIds.set(id, ts);
    }
    try {
      const oldestSurviving = await this._cache.evictIfOverCap();
      if (oldestSurviving !== null) this._applyCacheFloor(oldestSurviving);
    } catch (err) {
      logger.warn("Cache evict failed", err);
    }
    return true;
  }

  /** Queues a live telegram for the next batched cache write. */
  private _queueCacheWrite(entry: CacheEntry): void {
    this._pendingCacheWrites.push(entry);
    if (this._pendingCacheFlushTimer === null) {
      this._pendingCacheFlushTimer = setTimeout(
        () => this._flushPendingCacheWrites(),
        LIVE_CACHE_FLUSH_DELAY_MS,
      );
    }
  }

  /**
   * Writes the queued live telegrams and extends the live coverage over them
   * once they are committed. A failed write closes the live interval instead,
   * so the window of those telegrams is queried from the backend next time.
   */
  private async _flushPendingCacheWrites(): Promise<void> {
    if (this._pendingCacheFlushTimer !== null) {
      clearTimeout(this._pendingCacheFlushTimer);
      this._pendingCacheFlushTimer = null;
    }
    const batch = this._pendingCacheWrites;
    if (batch.length === 0) return;
    this._pendingCacheWrites = [];
    if (!(await this._cacheStore(batch))) {
      this._coverage.closeLive();
      return;
    }
    for (const { ts } of batch) {
      this._coverage.extendLive(ts);
    }
    this._saveCoverage();
  }

  /**
   * Clears the persistent cache (IndexedDB + coverage localStorage), resets
   * in-memory coverage, and wipes the telegram buffer.
   */
  public async clearCache(): Promise<void> {
    if (this._pendingCacheFlushTimer !== null) {
      clearTimeout(this._pendingCacheFlushTimer);
      this._pendingCacheFlushTimer = null;
    }
    this._pendingCacheWrites = [];
    try {
      await this._cache.clear();
    } catch (err) {
      logger.warn("Cache clear failed", err);
    }
    this._cachedIds.clear();
    this._cacheFloorMs = null;
    this._coverage.clear();
    try {
      localStorage.removeItem(GroupMonitorController.COVERAGE_KEY);
    } catch {
      // ignore
    }
    if (this._telegramBuffer.clear().length > 0) {
      this._facetIndex.clear(this._createFilterMap());
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
   * Attempts to reconnect after a connection error and reloads the recent history
   */
  public async retryConnection(hass: HomeAssistant): Promise<void> {
    if (!this._connectionService.isConnected) {
      try {
        await this._connectionService.reconnect(hass);
      } catch (err) {
        logger.error("Failed to reconnect", err);
        return;
      }
    }
    await this._loadRecentTelegrams(hass);
  }

  /**
   * Adds historical telegrams fetched from the backend (or restored from the
   * persistent cache) into the in-memory buffer.
   *
   * @param telegrams - Raw telegram dicts to merge.
   * @param persist - When `true` (default) the dicts are also written to the
   *   IndexedDB cache so they survive a page reload.  Pass `false` when the
   *   dicts already came *from* the cache to avoid a pointless round-trip.
   * @returns Whether every dict is committed to the cache afterwards.
   */
  public async addHistoricalTelegrams(telegrams: TelegramDict[], persist = true): Promise<boolean> {
    if (telegrams.length === 0) return true;

    // Calculate dynamic telegram storage limit
    const telegramsLength = this._telegramBuffer.length + telegrams.length;
    const buffer = this._calculateTelegramStorageBuffer(telegramsLength);
    const telegramStorageLimit = Math.max(this._telegramBuffer.maxSize, telegramsLength + buffer);

    let resizedOut: TelegramRow[] = [];
    if (this._telegramBuffer.maxSize !== telegramStorageLimit) {
      resizedOut = this._telegramBuffer.setMaxSize(telegramStorageLimit);
    }

    // Merge new telegrams with existing ones, avoiding duplicates
    const newTelegramRows = telegrams.map((t) => new TelegramRow(t));
    const { added, removed } = this._telegramBuffer.merge(newTelegramRows);

    // Keep the index aligned with both size-driven and merge-driven buffer removals.
    const allRemoved = [...resizedOut, ...removed];
    if (added.length > 0 || allRemoved.length > 0) {
      this._facetIndex.update(added, allRemoved);
      this._bufferVersion++;
    }

    this.host.requestUpdate();

    if (!persist) {
      for (const row of newTelegramRows) {
        this._cachedIds.set(row.id, row.timestamp.getTime());
      }
      return true;
    }
    return this._cacheStore(this._uncachedEntries(newTelegramRows, telegrams));
  }

  /**
   * Pairs rows with their dicts (same index) and keeps those the cache does not
   * hold yet. Rows already in the buffer are not skipped: an earlier write of
   * theirs may have failed.
   */
  private _uncachedEntries(rows: TelegramRow[], dicts: TelegramDict[]): CacheEntry[] {
    const batch: CacheEntry[] = [];
    rows.forEach((row, i) => {
      if (!this._cachedIds.has(row.id)) {
        batch.push({ id: row.id, ts: row.timestamp.getTime(), dict: dicts[i] });
      }
    });
    return batch;
  }

  /** Clears all telegrams from the display. */
  public clearTelegrams(): void {
    if (this._telegramBuffer.clear().length > 0) {
      this._facetIndex.clear(this._createFilterMap());
      this._bufferVersion++;
    }
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
    this._hass = hass;
    try {
      const requestedAt = Date.now();
      const info = await getGroupMonitorInfo(hass);

      if (info.telegram_store_status === "initializing") {
        // The backend keeps the telegrams received meanwhile in its write
        // buffer, so the history is complete once the store is ready.
        this._storeInitializing = true;
        this._connectionError = null;
        this._scheduleStoreInitializingRetry(hass);
        this.host.requestUpdate();
        return false;
      }
      this._clearStoreInitializingRetry();
      this._storeInitializingRetryCount = 0;
      this._storeInitializing = false;

      // Calculate dynamic telegram storage limit
      const telegramsLength = info.recent_telegrams.length;
      const buffer = this._calculateTelegramStorageBuffer(telegramsLength);
      const telegramStorageLimit = telegramsLength + buffer;

      let resizedOut: TelegramRow[] = [];
      if (this._telegramBuffer.maxSize !== telegramStorageLimit) {
        resizedOut = this._telegramBuffer.setMaxSize(telegramStorageLimit);
      }

      // Merge new telegrams with existing ones, avoiding duplicates
      const newTelegramRows = info.recent_telegrams.map((t) => new TelegramRow(t));
      const { added, removed } = this._telegramBuffer.merge(newTelegramRows);

      // Keep the index aligned with both size-driven and merge-driven buffer removals.
      const allRemoved = [...resizedOut, ...removed];
      if (added.length > 0 || allRemoved.length > 0) {
        this._facetIndex.update(added, allRemoved);
        this._bufferVersion++;
      }

      this._connectionError = null;
      this._isReloadEnabled = false;
      this.host.requestUpdate();

      await this._cacheRestored;
      const cached = await this._cacheStore(
        this._uncachedEntries(newTelegramRows, info.recent_telegrams),
      );

      if (!cached) return true;

      // The backend returns every telegram from the recent-load horizon up to
      // the request, so once they are cached that window is loaded. Telegrams
      // since then arrive through the live subscription and are covered as
      // their own writes commit, continuing from the request time.
      if (newTelegramRows.length > 0) {
        let oldestMs = Infinity;
        let newestMs = -Infinity;
        for (const row of newTelegramRows) {
          const ts = row.timestamp.getTime();
          if (ts < oldestMs) oldestMs = ts;
          if (ts > newestMs) newestMs = ts;
        }
        this._markCovered(oldestMs, Math.max(newestMs, requestedAt));
      }
      if (!this._isPaused) {
        this._coverage.anchorLive(requestedAt);
      }
      return true;
    } catch (err) {
      logger.error("getGroupMonitorInfo failed", err);
      this._clearStoreInitializingRetry();
      this._storeInitializing = false;
      this._connectionError = err instanceof Error ? err.message : String(err);
      this.host.requestUpdate();
      return false;
    }
  }

  /** Polls the backend again with a growing delay while its store initializes. */
  private _scheduleStoreInitializingRetry(hass: HomeAssistant): void {
    this._clearStoreInitializingRetry();
    const delays = STORE_INITIALIZING_RETRY_DELAYS_MS;
    const delay = delays[Math.min(this._storeInitializingRetryCount, delays.length - 1)];
    this._storeInitializingRetryCount++;
    this._storeInitializingTimer = setTimeout(() => {
      this._storeInitializingTimer = null;
      this._loadRecentTelegrams(hass);
    }, delay);
  }

  private _clearStoreInitializingRetry(): void {
    if (this._storeInitializingTimer !== null) {
      clearTimeout(this._storeInitializingTimer);
      this._storeInitializingTimer = null;
    }
  }

  /**
   * Handles new telegram data from WebSocket subscription
   */
  private _handleIncomingTelegram(telegram: TelegramDict): void {
    const telegramRow = new TelegramRow(telegram);

    if (!this._isPaused) {
      const { added, removed } = this._telegramBuffer.merge([telegramRow]);
      // A duplicate is already buffered, cached and covered, so there is nothing to update.
      if (added.length === 0 && removed.length === 0) {
        return;
      }

      // A just-added telegram can also overflow immediately when the buffer is full.
      this._facetIndex.update(added, removed);
      this._bufferVersion++;

      // Cached in a batch; the live coverage follows once the write commits.
      this._queueCacheWrite({
        id: telegramRow.id,
        ts: telegramRow.timestamp.getTime(),
        dict: telegram,
      });

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

    this.host.requestUpdate();
  }
}
