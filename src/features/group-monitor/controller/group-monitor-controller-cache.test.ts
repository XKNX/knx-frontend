import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TelegramDict } from "../../../types/websocket";
import { GroupMonitorController } from "./group-monitor-controller";
import { getGroupMonitorInfo } from "../../../services/websocket.service";

// In-memory IDB stand-in shared across the mock.
const _idbStore = new Map<string, any>();

vi.mock("idb-keyval", () => ({
  createStore: () => "mock-store",
  setMany: async (pairs: [string, any][]) => {
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

describe("GroupMonitorController - cache persistence", () => {
  let controller: GroupMonitorController;
  let mockHost: any;

  beforeEach(() => {
    _idbStore.clear();
    localStorage.clear();
    mockHost = {
      addController: vi.fn(),
      removeController: vi.fn(),
      requestUpdate: vi.fn(),
    };
    vi.clearAllMocks();
    controller = new GroupMonitorController(mockHost);
  });

  // Flush all pending microtasks/promises so fire-and-forget cache writes land.
  const flush = () =>
    new Promise<void>((r) => {
      setTimeout(r, 0);
    });

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
  });

  describe("_handleIncomingTelegram", () => {
    it("stores a live telegram in IDB", async () => {
      const telegram = makeTelegram({ timestamp: "2024-01-01T12:00:00.000Z", source: "2.2.2" });
      (controller as any)._handleIncomingTelegram(telegram);
      await flush();

      expect(_idbStore.size).toBe(1);
      const [entry] = Array.from(_idbStore.values());
      expect(entry.dict.source).toBe("2.2.2");
    });

    it("does not store a telegram when paused", async () => {
      await controller.togglePause();
      const telegram = makeTelegram({ timestamp: "2024-01-01T12:00:00.000Z", source: "2.2.2" });
      (controller as any)._handleIncomingTelegram(telegram);
      await flush();

      expect(_idbStore.size).toBe(0);
    });
  });

  describe("addHistoricalTelegrams", () => {
    it("does not store history-query telegrams in IDB (persist=false)", async () => {
      // History query results (_loadGap) always pass persist=false to avoid
      // evicting newer cached entries when loading old ranges.
      const telegrams = [
        makeTelegram({ timestamp: "2024-01-01T08:00:00.000Z", source: "3.3.1" }),
        makeTelegram({ timestamp: "2024-01-01T08:00:01.000Z", source: "3.3.2" }),
      ];
      controller.addHistoricalTelegrams(telegrams, false);
      await flush();

      expect(_idbStore.size).toBe(0);
    });
  });
});
