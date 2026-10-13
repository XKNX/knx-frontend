import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import type { TelegramDict } from "../../../types/websocket";
import { ERR_TELEGRAM_STORE_INITIALIZING } from "../../../types/websocket";
import { GroupMonitorController } from "./group-monitor-controller";
import {
  getGroupMonitorInfo,
  queryTelegrams,
  subscribeKnxTelegrams,
} from "../../../services/websocket.service";

vi.mock("../../../services/websocket.service", () => ({
  getGroupMonitorInfo: vi.fn(),
  queryTelegrams: vi.fn(),
  subscribeKnxTelegrams: vi.fn(),
}));

vi.mock("../../../tools/knx-logger", () => ({
  KNXLogger: class {
    debug = vi.fn();

    info = vi.fn();

    warn = vi.fn();

    error = vi.fn();
  },
}));

function createMockTelegram(overrides: Partial<TelegramDict> = {}): TelegramDict {
  return {
    timestamp: "2024-01-01T10:00:00.000Z",
    source: "1.2.3",
    source_name: "Test Source",
    destination: "1/2/3",
    destination_name: "Test Light",
    telegramtype: "GroupValueWrite",
    direction: "Incoming",
    payload: [1],
    dpt_main: 1,
    dpt_sub: 1,
    dpt_name: "1.001",
    unit: null,
    value: "On",
    ...overrides,
  };
}

describe("GroupMonitorController - telegram store initializing", () => {
  let controller: GroupMonitorController;
  let mockHost: any;
  let unsubscribe: Mock<() => Promise<void>>;
  const hass = {} as any;

  beforeEach(() => {
    vi.useFakeTimers();
    // Coverage persisted by an earlier test would mark the queried range as loaded.
    localStorage.clear();
    mockHost = {
      addController: vi.fn(),
      removeController: vi.fn(),
      requestUpdate: vi.fn(),
      updateComplete: Promise.resolve(true),
    };
    unsubscribe = vi.fn(() => Promise.resolve());
    vi.mocked(subscribeKnxTelegrams).mockReset();
    vi.mocked(subscribeKnxTelegrams).mockResolvedValue(unsubscribe);
    vi.mocked(getGroupMonitorInfo).mockReset();
    vi.mocked(queryTelegrams).mockReset();
    controller = new GroupMonitorController(mockHost);
  });

  afterEach(() => {
    controller.hostDisconnected();
    vi.useRealTimers();
  });

  it("subscribes to live telegrams before loading the history", async () => {
    const order: string[] = [];
    vi.mocked(subscribeKnxTelegrams).mockImplementation(async () => {
      order.push("subscribe");
      return unsubscribe;
    });
    vi.mocked(getGroupMonitorInfo).mockImplementation(async () => {
      order.push("history");
      return { project_loaded: true, recent_telegrams: [], telegram_store_status: "ready" };
    });

    await controller.setup(hass);

    expect(order).toEqual(["subscribe", "history"]);
    expect(controller.storeInitializing).toBe(false);
    expect(controller.connectionError).toBeNull();
  });

  it("keeps the live subscription when the history load fails", async () => {
    vi.mocked(getGroupMonitorInfo).mockRejectedValue(new Error("Database error: boom"));

    await controller.setup(hass);

    expect(subscribeKnxTelegrams).toHaveBeenCalledTimes(1);
    expect(controller.connectionError).toBe("Database error: boom");
    expect(controller.storeInitializing).toBe(false);
  });

  it("polls the backend while the store initializes and loads the history once ready", async () => {
    vi.mocked(getGroupMonitorInfo)
      .mockResolvedValueOnce({
        project_loaded: true,
        recent_telegrams: [],
        telegram_store_status: "initializing",
      })
      .mockResolvedValueOnce({
        project_loaded: true,
        recent_telegrams: [],
        telegram_store_status: "initializing",
      })
      .mockResolvedValueOnce({
        project_loaded: true,
        recent_telegrams: [createMockTelegram()],
        telegram_store_status: "ready",
      });

    await controller.setup(hass);

    expect(controller.storeInitializing).toBe(true);
    expect(controller.connectionError).toBeNull();
    expect(controller.telegrams).toHaveLength(0);
    expect(getGroupMonitorInfo).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(getGroupMonitorInfo).toHaveBeenCalledTimes(2);
    expect(controller.storeInitializing).toBe(true);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(getGroupMonitorInfo).toHaveBeenCalledTimes(3);
    expect(controller.storeInitializing).toBe(false);
    expect(controller.telegrams).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(getGroupMonitorInfo).toHaveBeenCalledTimes(3);
  });

  it("stops polling when the host disconnects", async () => {
    vi.mocked(getGroupMonitorInfo).mockResolvedValue({
      project_loaded: true,
      recent_telegrams: [],
      telegram_store_status: "initializing",
    });

    await controller.setup(hass);
    expect(controller.storeInitializing).toBe(true);

    controller.hostDisconnected();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(getGroupMonitorInfo).toHaveBeenCalledTimes(1);
  });

  it("treats a backend without the status field as ready", async () => {
    vi.mocked(getGroupMonitorInfo).mockResolvedValue({
      project_loaded: true,
      recent_telegrams: [createMockTelegram()],
    });

    await controller.setup(hass);

    expect(controller.storeInitializing).toBe(false);
    expect(controller.telegrams).toHaveLength(1);
  });

  it("reloads the history on retry after a failed load", async () => {
    vi.mocked(getGroupMonitorInfo)
      .mockRejectedValueOnce(new Error("Database error: boom"))
      .mockResolvedValueOnce({
        project_loaded: true,
        recent_telegrams: [createMockTelegram()],
        telegram_store_status: "ready",
      });

    await controller.setup(hass);
    expect(controller.connectionError).toBe("Database error: boom");

    await controller.retryConnection(hass);

    expect(subscribeKnxTelegrams).toHaveBeenCalledTimes(1);
    expect(getGroupMonitorInfo).toHaveBeenCalledTimes(2);
    expect(controller.connectionError).toBeNull();
    expect(controller.telegrams).toHaveLength(1);
  });

  it("reports a history warning when a range query hits the initializing store", async () => {
    vi.mocked(getGroupMonitorInfo).mockResolvedValue({
      project_loaded: true,
      recent_telegrams: [],
      telegram_store_status: "ready",
    });
    vi.mocked(queryTelegrams).mockRejectedValue({
      code: ERR_TELEGRAM_STORE_INITIALIZING,
      message: "Telegram storage backend is still initializing.",
    });
    await controller.setup(hass);

    const now = Date.now();
    await controller.applyTimeRangeFilter(hass, now - 3_600_000, now, null);

    expect(controller.historyWarning).toBe("store_initializing");
    expect(controller.historyLoading).toBe(false);
  });
});
