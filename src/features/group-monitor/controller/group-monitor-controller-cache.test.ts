import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { TelegramDict } from "../../../types/websocket";
import { GroupMonitorController } from "./group-monitor-controller";
import { getGroupMonitorInfo, queryTelegrams } from "../../../services/websocket.service";

// In-memory IDB stand-in shared across the mock.
const _idbStore = new Map<string, any>();
// When set, writes fail the way a full or unavailable IndexedDB does.
let _failWrites = false;

vi.mock("idb-keyval", () => ({
  createStore: () => "mock-store",
  setMany: async (pairs: [string, any][]) => {
    if (_failWrites) throw new Error("QuotaExceededError");
    for (const [k, v] of pairs) _idbStore.set(k, v);
  },
  entries: async () => Array.from(_idbStore.entries()),
  delMany: async (keys: string[]) => {
    for (const k of keys) _idbStore.delete(k);
  },
  clear: async () => _idbStore.clear(),
}));

vi.mock("../../../services/websocket.service", () => ({
  getGroupMonitorInfo: vi.fn(),
  queryTelegrams: vi.fn(),
}));

vi.mock("../services/connection-service", () => ({
  ConnectionService: class {
    isConnected = false;

    onTelegram = vi.fn();

    onConnectionChange = vi.fn();

    subscribe = vi.fn();

    disconnect = vi.fn();
  },
}));

vi.mock("../../../tools/knx-logger", () => ({
  KNXLogger: class {
    debug = vi.fn();

    info = vi.fn();

    warn = vi.fn();

    error = vi.fn();
  },
}));

function makeTelegram(overrides: Partial<TelegramDict> = {}): TelegramDict {
  return {
    timestamp: "2024-01-01T10:00:00.000Z",
    source: "1.2.3",
    source_name: "",
    destination: "1/2/3",
    destination_name: "",
    telegramtype: "GroupValueWrite",
    direction: "Outgoing",
    payload: [1],
    dpt_main: 1,
    dpt_sub: 1,
    dpt_name: "1.001",
    unit: null,
    value: "On",
    data_secure: false,
    ...overrides,
  };
}

const NOW = new Date("2024-01-01T12:30:00.000Z");
const COVERAGE_KEY = "knx-group-monitor-coverage";

const ms = (iso: string) => new Date(iso).getTime();

describe("GroupMonitorController - cache persistence", () => {
  let controller: GroupMonitorController;
  let mockHost: any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    _idbStore.clear();
    _failWrites = false;
    localStorage.clear();
    mockHost = {
      addController: vi.fn(),
      removeController: vi.fn(),
      requestUpdate: vi.fn(),
    };
    vi.clearAllMocks();
    controller = new GroupMonitorController(mockHost);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Flush all pending microtasks/promises so fire-and-forget cache writes land.
  const flush = () => vi.advanceTimersByTimeAsync(0);

  // Let the batched live cache write run and its coverage update land.
  const flushLive = () => vi.advanceTimersByTimeAsync(1000);

  const covered = () => (controller as any)._coverage.covered as [number, number][];

  const persistedCoverage = (): [number, number][] | null => {
    const raw = localStorage.getItem(COVERAGE_KEY);
    return raw === null ? null : JSON.parse(raw);
  };

  describe("_loadRecentTelegrams (via setup / reload)", () => {
    it("stores recent telegrams in IDB after initial load", async () => {
      vi.mocked(getGroupMonitorInfo).mockResolvedValueOnce({
        project_loaded: true,
        recent_telegrams: [
          makeTelegram({ timestamp: "2024-01-01T10:00:00.000Z", source: "1.1.1" }),
          makeTelegram({ timestamp: "2024-01-01T10:00:01.000Z", source: "1.1.2" }),
        ],
      } as any);

      await controller.reload({} as any);
      await flush();

      expect(_idbStore.size).toBe(2);
    });

    it("does not re-store telegrams that were already in cache", async () => {
      // Pre-populate IDB with one telegram.
      const existing = makeTelegram({ timestamp: "2024-01-01T10:00:00.000Z", source: "1.1.1" });
      vi.mocked(getGroupMonitorInfo).mockResolvedValueOnce({
        project_loaded: true,
        recent_telegrams: [existing],
      } as any);
      await controller.reload({} as any);
      await flush();
      expect(_idbStore.size).toBe(1);

      // Reload again with same telegram — should still be 1, not re-written redundantly.
      // (setMany is idempotent but we can verify the store size stays 1.)
      vi.mocked(getGroupMonitorInfo).mockResolvedValueOnce({
        project_loaded: true,
        recent_telegrams: [
          existing,
          makeTelegram({ timestamp: "2024-01-01T10:00:01.000Z", source: "1.1.2" }),
        ],
      } as any);
      await controller.reload({} as any);
      await flush();

      expect(_idbStore.size).toBe(2);
    });

    it("stores each telegram under a distinct IDB key", async () => {
      const telegrams = [
        makeTelegram({ timestamp: "2024-01-01T10:00:00.000Z", source: "1.1.1" }),
        makeTelegram({ timestamp: "2024-01-01T10:00:01.000Z", source: "1.1.2" }),
        makeTelegram({ timestamp: "2024-01-01T10:00:02.000Z", source: "1.1.3" }),
      ];
      vi.mocked(getGroupMonitorInfo).mockResolvedValueOnce({
        project_loaded: true,
        recent_telegrams: telegrams,
      } as any);

      await controller.reload({} as any);
      await flush();

      // All three must be stored under different keys.
      expect(_idbStore.size).toBe(3);
      const stored = Array.from(_idbStore.values()).map((e) => e.dict.source);
      expect(stored.sort()).toEqual(["1.1.1", "1.1.2", "1.1.3"]);
    });

    it("covers the recent window up to the request once the rows are cached", async () => {
      vi.mocked(getGroupMonitorInfo).mockResolvedValueOnce({
        project_loaded: true,
        recent_telegrams: [
          makeTelegram({ timestamp: "2024-01-01T10:00:00.000Z", source: "1.1.1" }),
          makeTelegram({ timestamp: "2024-01-01T11:00:00.000Z", source: "1.1.2" }),
        ],
      } as any);

      await controller.reload({} as any);

      const expected = [[ms("2024-01-01T10:00:00.000Z"), NOW.getTime()]];
      expect(covered()).toEqual(expected);
      expect(persistedCoverage()).toEqual(expected);
    });

    it("does not cover the recent window when its cache write fails", async () => {
      _failWrites = true;
      vi.mocked(getGroupMonitorInfo).mockResolvedValueOnce({
        project_loaded: true,
        recent_telegrams: [
          makeTelegram({ timestamp: "2024-01-01T10:00:00.000Z", source: "1.1.1" }),
        ],
      } as any);

      await controller.reload({} as any);

      expect(controller.telegrams).toHaveLength(1);
      expect(_idbStore.size).toBe(0);
      expect(covered()).toEqual([]);
      expect(persistedCoverage()).toBeNull();
    });

    it("re-writes a buffered telegram whose earlier cache write failed", async () => {
      const telegram = makeTelegram({ timestamp: "2024-01-01T12:00:00.000Z", source: "2.2.2" });
      _failWrites = true;
      (controller as any)._handleIncomingTelegram(telegram);
      await flushLive();
      expect(_idbStore.size).toBe(0);

      _failWrites = false;
      vi.mocked(getGroupMonitorInfo).mockResolvedValueOnce({
        project_loaded: true,
        recent_telegrams: [telegram],
      } as any);
      const requestedAt = Date.now();
      await controller.reload({} as any);

      expect(controller.telegrams).toHaveLength(1);
      expect(_idbStore.size).toBe(1);
      expect(covered()).toEqual([[ms("2024-01-01T12:00:00.000Z"), requestedAt]]);
    });
  });

  describe("_handleIncomingTelegram", () => {
    it("stores live telegrams in IDB in one batch and covers them once committed", async () => {
      const first = makeTelegram({ timestamp: "2024-01-01T12:00:00.000Z", source: "2.2.2" });
      const second = makeTelegram({ timestamp: "2024-01-01T12:00:01.000Z", source: "2.2.3" });
      (controller as any)._handleIncomingTelegram(first);
      (controller as any)._handleIncomingTelegram(second);
      await flush();

      expect(controller.telegrams).toHaveLength(2);
      expect(_idbStore.size).toBe(0);
      expect(covered()).toEqual([]);

      await flushLive();

      expect(_idbStore.size).toBe(2);
      const stored = Array.from(_idbStore.values()).map((e) => e.dict.source);
      expect(stored.sort()).toEqual(["2.2.2", "2.2.3"]);
      const expected = [[ms("2024-01-01T12:00:00.000Z"), ms("2024-01-01T12:00:01.000Z")]];
      expect(covered()).toEqual(expected);
      expect(persistedCoverage()).toEqual(expected);
    });

    it("leaves the window of a failed cache write uncovered", async () => {
      _failWrites = true;
      (controller as any)._handleIncomingTelegram(
        makeTelegram({ timestamp: "2024-01-01T12:00:00.000Z", source: "2.2.2" }),
      );
      await flushLive();

      expect(controller.telegrams).toHaveLength(1);
      expect(covered()).toEqual([]);

      _failWrites = false;
      (controller as any)._handleIncomingTelegram(
        makeTelegram({ timestamp: "2024-01-01T12:00:05.000Z", source: "2.2.3" }),
      );
      await flushLive();

      expect(_idbStore.size).toBe(1);
      expect(covered()).toEqual([[ms("2024-01-01T12:00:05.000Z"), ms("2024-01-01T12:00:05.000Z")]]);
    });

    it("does not store a telegram when paused", async () => {
      await controller.togglePause();
      const telegram = makeTelegram({ timestamp: "2024-01-01T12:00:00.000Z", source: "2.2.2" });
      (controller as any)._handleIncomingTelegram(telegram);
      await flushLive();

      expect(_idbStore.size).toBe(0);
    });

    it("writes the pending batch when the host disconnects", async () => {
      (controller as any)._handleIncomingTelegram(
        makeTelegram({ timestamp: "2024-01-01T12:00:00.000Z", source: "2.2.2" }),
      );
      controller.hostDisconnected();
      await flush();

      expect(_idbStore.size).toBe(1);
    });
  });

  describe("addHistoricalTelegrams", () => {
    it("stores history-query telegrams in IDB", async () => {
      const telegrams = [
        makeTelegram({ timestamp: "2024-01-01T08:00:00.000Z", source: "3.3.1" }),
        makeTelegram({ timestamp: "2024-01-01T08:00:01.000Z", source: "3.3.2" }),
      ];
      await expect(controller.addHistoricalTelegrams(telegrams)).resolves.toBe(true);

      expect(_idbStore.size).toBe(2);
    });

    it("resolves to false and keeps the rows when the cache write fails", async () => {
      _failWrites = true;
      const telegrams = [makeTelegram({ timestamp: "2024-01-01T08:00:00.000Z", source: "3.3.1" })];
      await expect(controller.addHistoricalTelegrams(telegrams)).resolves.toBe(false);

      expect(controller.telegrams).toHaveLength(1);
      expect(_idbStore.size).toBe(0);
    });

    it("treats telegrams restored from the cache as cached (persist=false)", async () => {
      const telegram = makeTelegram({ timestamp: "2024-01-01T08:00:00.000Z", source: "3.3.1" });
      await controller.addHistoricalTelegrams([telegram], false);
      expect(_idbStore.size).toBe(0);

      vi.mocked(getGroupMonitorInfo).mockResolvedValueOnce({
        project_loaded: true,
        recent_telegrams: [telegram],
      } as any);
      await controller.reload({} as any);

      expect(_idbStore.size).toBe(0);
    });
  });

  describe("time-range loads", () => {
    const START = ms("2024-01-01T08:00:00.000Z");
    const END = ms("2024-01-01T09:00:00.000Z");
    const rows = [
      makeTelegram({ timestamp: "2024-01-01T08:10:00.000Z", source: "4.4.1" }),
      makeTelegram({ timestamp: "2024-01-01T08:20:00.000Z", source: "4.4.2" }),
    ];

    beforeEach(() => {
      vi.mocked(queryTelegrams).mockReset();
      vi.mocked(queryTelegrams).mockResolvedValue({
        telegrams: rows,
        total_count: rows.length,
        limit_reached: false,
      });
    });

    it("caches gap-loaded rows and serves the range from the cache after a reload", async () => {
      await controller.applyTimeRangeFilter({} as any, START, END, null);

      expect(queryTelegrams).toHaveBeenCalledTimes(1);
      expect(_idbStore.size).toBe(2);
      expect(persistedCoverage()).toEqual([[START, END]]);

      // A new controller, as after a page reload, sees the same IDB and localStorage.
      const reloaded = new GroupMonitorController(mockHost);
      vi.mocked(getGroupMonitorInfo).mockResolvedValueOnce({
        project_loaded: true,
        recent_telegrams: [],
      } as any);
      await reloaded.setup({} as any, null);
      vi.mocked(queryTelegrams).mockClear();

      await reloaded.applyTimeRangeFilter({} as any, START, END, null);

      expect(queryTelegrams).not.toHaveBeenCalled();
      expect(reloaded.telegrams.map((r) => r.sourceAddress).sort()).toEqual(["4.4.1", "4.4.2"]);
    });

    it("queries a range again when its cache write failed", async () => {
      _failWrites = true;
      await controller.applyTimeRangeFilter({} as any, START, END, null);

      expect(controller.telegrams).toHaveLength(2);
      expect(covered()).toEqual([]);
      expect(persistedCoverage()).toBeNull();

      _failWrites = false;
      await controller.applyTimeRangeFilter({} as any, START, END, null);

      expect(queryTelegrams).toHaveBeenCalledTimes(2);
      expect(covered()).toEqual([[START, END]]);
    });

    it("never claims a range the cache has evicted", async () => {
      const floor = ms("2024-01-01T08:15:00.000Z");
      vi.spyOn((controller as any)._cache, "evictIfOverCap").mockResolvedValue(floor);

      await controller.applyTimeRangeFilter({} as any, START, END, null);

      expect(covered()).toEqual([[floor, END]]);
      expect(persistedCoverage()).toEqual([[floor, END]]);
      expect((controller as any)._cachedIds.has(controller.telegrams[0].id)).toBe(false);
    });
  });
});
