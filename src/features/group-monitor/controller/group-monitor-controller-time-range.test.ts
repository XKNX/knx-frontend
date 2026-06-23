import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { TelegramDict } from "../../../types/websocket";
import { GroupMonitorController } from "./group-monitor-controller";
import { getGroupMonitorInfo, queryTelegrams } from "../../../services/websocket.service";

vi.mock("../../../services/websocket.service", () => ({
  getGroupMonitorInfo: vi.fn(),
  queryTelegrams: vi.fn(),
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
    direction: "Outgoing",
    payload: [1],
    dpt_main: 1,
    dpt_sub: 1,
    dpt_name: "1.001",
    unit: null,
    value: "On",
    ...overrides,
  };
}

const NOW = new Date("2024-01-02T00:00:00.000Z");
const DAY = 86400_000;

describe("GroupMonitorController - time-range filter", () => {
  let controller: GroupMonitorController;
  let mockHost: any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.mocked(queryTelegrams).mockReset();
    mockHost = {
      addController: vi.fn(),
      removeController: vi.fn(),
      requestUpdate: vi.fn(),
      updateComplete: Promise.resolve(true),
    };
    controller = new GroupMonitorController(mockHost);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const seedRecent = async (telegrams: TelegramDict[]) => {
    vi.mocked(getGroupMonitorInfo).mockResolvedValueOnce({
      project_loaded: true,
      recent_telegrams: telegrams,
    } as any);
    await controller.reload({} as any);
  };

  const ms = (iso: string) => new Date(iso).getTime();

  it("queries the backend for an uncovered range and applies the filter", async () => {
    vi.mocked(queryTelegrams).mockResolvedValue({
      telegrams: [createMockTelegram({ timestamp: "2024-01-01T12:30:00.000Z", source: "1.1.1" })],
      total_count: 1,
      limit_reached: false,
    });

    await controller.applyTimeRangeFilter(
      {} as any,
      ms("2024-01-01T12:00:00.000Z"),
      ms("2024-01-01T13:00:00.000Z"),
      null,
    );

    expect(queryTelegrams).toHaveBeenCalledTimes(1);
    expect(controller.telegrams).toHaveLength(1);
    expect(controller.hasTimeRangeFilter).toBe(true);
    expect(controller.hasAbsoluteTimeRange).toBe(true);
    expect(controller.isPaused).toBe(true);
    expect(controller.timeRangeFilter).toEqual({
      startMs: ms("2024-01-01T12:00:00.000Z"),
      endMs: ms("2024-01-01T13:00:00.000Z"),
    });
  });

  it("does not query when the range is already covered by the recent window", async () => {
    await seedRecent([
      createMockTelegram({ timestamp: "2024-01-01T23:00:00.000Z", source: "1.1.1" }),
    ]);

    await controller.applyTimeRangeFilter(
      {} as any,
      ms("2024-01-01T23:15:00.000Z"),
      ms("2024-01-01T23:45:00.000Z"),
      null,
    );

    expect(queryTelegrams).not.toHaveBeenCalled();
    expect(controller.hasAbsoluteTimeRange).toBe(true);
  });

  it("keeps the live stream running for an open-ended range", async () => {
    vi.mocked(queryTelegrams).mockResolvedValue({
      telegrams: [],
      total_count: 0,
      limit_reached: false,
    });

    await controller.applyTimeRangeFilter(
      {} as any,
      ms("2024-01-01T23:00:00.000Z"),
      undefined,
      null,
    );

    expect(controller.hasTimeRangeFilter).toBe(true);
    expect(controller.hasAbsoluteTimeRange).toBe(false);
    expect(controller.isPaused).toBe(false);
    expect(controller.timeRangeFilter).toEqual({ startMs: ms("2024-01-01T23:00:00.000Z") });
  });

  it("paginates until total_count is reached", async () => {
    const all = [
      createMockTelegram({ timestamp: "2024-01-01T12:00:00.000Z", source: "1.1.1" }),
      createMockTelegram({ timestamp: "2024-01-01T12:10:00.000Z", source: "1.1.2" }),
      createMockTelegram({ timestamp: "2024-01-01T12:20:00.000Z", source: "1.1.3" }),
    ];
    vi.mocked(queryTelegrams).mockImplementation((_hass, params: any) => {
      const offset = params.offset ?? 0;
      // Return at most 2 per page to force a second request.
      const batch = all.slice(offset, offset + 2);
      return Promise.resolve({ telegrams: batch, total_count: all.length, limit_reached: false });
    });

    await controller.applyTimeRangeFilter(
      {} as any,
      ms("2024-01-01T11:00:00.000Z"),
      ms("2024-01-01T13:00:00.000Z"),
      null,
    );

    expect(queryTelegrams).toHaveBeenCalledTimes(2);
    expect(controller.telegrams).toHaveLength(3);
  });

  it("clamps the start to the retention window and warns", async () => {
    vi.mocked(queryTelegrams).mockResolvedValue({
      telegrams: [],
      total_count: 0,
      limit_reached: false,
    });

    // retention 10 days -> minMs = now - 11 days. Request from 30 days back to 5 days back.
    await controller.applyTimeRangeFilter(
      {} as any,
      NOW.getTime() - 30 * DAY,
      NOW.getTime() - 5 * DAY,
      10,
    );

    expect(controller.historyWarning).toBe("retention_clamped");
    expect(controller.timeRangeFilter?.startMs).toBe(NOW.getTime() - 11 * DAY);
  });

  it("only shows telegrams within the active range", async () => {
    vi.mocked(queryTelegrams).mockResolvedValue({
      telegrams: [
        createMockTelegram({ timestamp: "2024-01-01T11:00:00.000Z", source: "1.1.1" }),
        createMockTelegram({ timestamp: "2024-01-01T12:30:00.000Z", source: "1.1.2" }),
        createMockTelegram({ timestamp: "2024-01-01T14:00:00.000Z", source: "1.1.3" }),
      ],
      total_count: 3,
      limit_reached: false,
    });

    await controller.applyTimeRangeFilter(
      {} as any,
      ms("2024-01-01T12:00:00.000Z"),
      ms("2024-01-01T13:00:00.000Z"),
      null,
    );

    // All three were merged into the buffer...
    expect(controller.telegrams).toHaveLength(3);
    // ...but only the in-range one is displayed.
    const { filteredTelegrams } = controller.getFilteredTelegramsAndDistinctValues();
    expect(filteredTelegrams).toHaveLength(1);
    expect(filteredTelegrams[0].sourceAddress).toBe("1.1.2");
  });

  it("clearTimeRangeFilter releases the filter, resumes live and keeps data", async () => {
    vi.mocked(queryTelegrams).mockResolvedValue({
      telegrams: [createMockTelegram({ timestamp: "2024-01-01T12:30:00.000Z", source: "1.1.1" })],
      total_count: 1,
      limit_reached: false,
    });
    await controller.applyTimeRangeFilter(
      {} as any,
      ms("2024-01-01T12:00:00.000Z"),
      ms("2024-01-01T13:00:00.000Z"),
      null,
    );
    expect(controller.isPaused).toBe(true);

    controller.clearTimeRangeFilter();

    expect(controller.hasTimeRangeFilter).toBe(false);
    expect(controller.isPaused).toBe(false);
    expect(controller.historyWarning).toBeNull();
    // Data is retained.
    expect(controller.telegrams).toHaveLength(1);
  });

  it("clearFilters also clears the time-range filter", async () => {
    vi.mocked(queryTelegrams).mockResolvedValue({
      telegrams: [],
      total_count: 0,
      limit_reached: false,
    });
    await controller.applyTimeRangeFilter(
      {} as any,
      ms("2024-01-01T12:00:00.000Z"),
      ms("2024-01-01T13:00:00.000Z"),
      null,
    );

    controller.clearFilters();

    expect(controller.hasTimeRangeFilter).toBe(false);
  });
});
