import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramDict } from "../../../types/websocket";
import { getGroupMonitorInfo, queryTelegrams } from "../../../services/websocket.service";
import { GroupMonitorController } from "./group-monitor-controller";

vi.mock("../../../services/websocket.service", () => ({
  getGroupMonitorInfo: vi.fn(),
  queryTelegrams: vi.fn(),
}));

const telegram = (timestamp: string, source: string, direction: string): TelegramDict => ({
  timestamp,
  source,
  source_name: source,
  destination: "1/1/1",
  destination_name: "Light",
  telegramtype: "GroupValueWrite",
  direction,
  payload: [1],
  dpt_main: 1,
  dpt_sub: 1,
  dpt_name: "Switch",
  unit: null,
  value: "On",
});

const createMockHost = () => ({
  addController: vi.fn(),
  requestUpdate: vi.fn(),
});

const createMockTelegramDict = (overrides?: Partial<TelegramDict>): TelegramDict => ({
  ...telegram("2024-01-01T10:00:00.000Z", "1.1.1", "Incoming"),
  ...overrides,
});

describe("GroupMonitorController cross-filtering", () => {
  let controller: GroupMonitorController;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T10:10:00.000Z"));
    vi.mocked(queryTelegrams).mockReset();
    controller = new GroupMonitorController({
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    } as any);
  });

  afterEach(() => vi.useRealTimers());

  it.each(["live", "historical"] as const)(
    "keeps duplicate %s arrivals idempotent through eviction",
    (arrival) => {
      const oldest = telegram("2024-01-01T10:00:00.000Z", "1.1.1", "Incoming");
      const middle = telegram("2024-01-01T10:00:01.000Z", "1.1.2", "Incoming");
      const newest = telegram("2024-01-01T10:00:02.000Z", "1.1.3", "Incoming");

      if (arrival === "live") {
        (controller as any)._telegramBuffer.setMaxSize(2);
        (controller as any)._handleIncomingTelegram(oldest);
        (controller as any)._handleIncomingTelegram({ ...oldest });
      } else {
        controller.addHistoricalTelegrams([oldest, { ...oldest }], false);
        (controller as any)._telegramBuffer.setMaxSize(2);
      }

      for (const [next, sources] of [
        [null, ["1.1.1"]],
        [middle, ["1.1.1", "1.1.2"]],
        [newest, ["1.1.2", "1.1.3"]],
      ] as const) {
        if (next) (controller as any)._handleIncomingTelegram(next);
        const result = controller.getFilteredTelegramsAndDistinctValues();
        expect.soft(controller.telegrams.map((row) => row.sourceAddress)).toEqual(sources);
        expect
          .soft(result.filteredTelegrams.map((row) => row.sourceAddress).sort())
          .toEqual(sources);
        expect.soft(Object.keys(result.distinctValues.source).sort()).toEqual(sources);
        for (const source of sources) {
          expect.soft(result.distinctValues.source[source]?.crossFilteredCount).toBe(1);
        }
        for (const values of Object.values(result.distinctValues)) {
          expect
            .soft(Object.values(values).reduce((sum, value) => sum + value.crossFilteredCount, 0))
            .toBe(sources.length);
        }
      }
    },
  );

  it("scopes cross-counts before adding time-delta context", async () => {
    const match = telegram("2024-01-01T10:00:00.000Z", "1.1.1", "Incoming");
    const contextAfter = telegram("2024-01-01T10:00:00.300Z", "1.1.2", "Outgoing");
    const contextBefore = telegram("2024-01-01T09:59:59.000Z", "1.1.3", "Incoming");
    const liveOutside = telegram("2024-01-01T10:02:00.000Z", "1.1.4", "Incoming");

    vi.mocked(getGroupMonitorInfo).mockResolvedValueOnce({
      project_loaded: true,
      recent_telegrams: [match, contextAfter],
    } as any);
    await controller.reload({} as any);
    controller.addHistoricalTelegrams([contextBefore], false);
    (controller as any)._handleIncomingTelegram(liveOutside);

    await controller.applyTimeRangeFilter(
      {} as any,
      new Date("2024-01-01T10:00:00.000Z").getTime(),
      new Date("2024-01-01T10:00:01.000Z").getTime(),
      null,
    );
    controller.setFilterFieldValue("source", ["1.1.1"]);
    controller.setFilterFieldValue("direction", ["Incoming"]);
    controller.setTimeDelta(1500, 500);

    const result = controller.getFilteredTelegramsAndDistinctValues();

    expect(result.filteredTelegrams.map((row) => row.sourceAddress).sort()).toEqual([
      "1.1.1",
      "1.1.2",
      "1.1.3",
    ]);
    expect(result.timeDeltaAddedCount).toBe(2);
    expect(result.distinctValues.source["1.1.1"].crossFilteredCount).toBe(1);
    expect(result.distinctValues.source["1.1.2"].crossFilteredCount).toBe(0);
    expect(result.distinctValues.source["1.1.3"].crossFilteredCount).toBe(0);
    expect(result.distinctValues.source["1.1.4"].crossFilteredCount).toBe(0);
    expect(result.distinctValues.direction.Incoming.crossFilteredCount).toBe(1);
    expect(result.distinctValues.direction.Outgoing.crossFilteredCount).toBe(0);
  });

  it("does not index an old live telegram evicted from a full buffer", async () => {
    const survivor = telegram("2024-01-01T10:00:00.000Z", "1.1.1", "Incoming");
    const evicted = telegram("2024-01-01T09:59:00.000Z", "1.1.2", "Incoming");

    vi.mocked(getGroupMonitorInfo).mockResolvedValueOnce({
      project_loaded: true,
      recent_telegrams: [survivor],
    } as any);
    await controller.reload({} as any);
    (controller as any)._telegramBuffer.setMaxSize(1);
    (controller as any)._handleIncomingTelegram(evicted);

    const result = controller.getFilteredTelegramsAndDistinctValues();

    expect(result.filteredTelegrams.map((row) => row.sourceAddress)).toEqual(["1.1.1"]);
    expect(result.distinctValues.source["1.1.1"].crossFilteredCount).toBe(1);
    expect(result.distinctValues.source["1.1.2"]).toBeUndefined();
  });

  it("ignores duplicate live telegrams without incrementing version or updating host", async () => {
    const host = createMockHost();
    const localController = new GroupMonitorController(host as any);
    const cacheStoreSpy = vi.spyOn(localController as any, "_cacheStore");
    (localController as any)._isPaused = false;
    const initialVersion = (localController as any)._bufferVersion;

    const rawTelegram = createMockTelegramDict({
      timestamp: "2024-01-01T10:00:00.000Z",
      source: "1.1.1",
      destination: "1/1/1",
    });

    (localController as any)._handleIncomingTelegram(rawTelegram);
    expect((localController as any)._bufferVersion).toBe(initialVersion + 1);
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
    expect(cacheStoreSpy).toHaveBeenCalledTimes(1);

    // Send duplicate
    (host.requestUpdate as any).mockClear();
    cacheStoreSpy.mockClear();
    (localController as any)._handleIncomingTelegram(rawTelegram);

    expect((localController as any)._bufferVersion).toBe(initialVersion + 1);
    expect(host.requestUpdate).not.toHaveBeenCalled();
    expect(cacheStoreSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["clearing rows", () => controller.clearTelegrams()],
    ["clearing the cache", () => controller.clearCache()],
  ])("preserves selected source and destination labels when %s", async (_action, clear) => {
    controller.addHistoricalTelegrams(
      [
        createMockTelegramDict({
          source: "1.1.10",
          source_name: "Kitchen switch",
          destination: "2/3/4",
          destination_name: "Kitchen light",
        }),
      ],
      false,
    );
    controller.setFilterFieldValue("source", ["1.1.10"]);
    controller.setFilterFieldValue("destination", ["2/3/4"]);

    await clear();

    const { filteredTelegrams, distinctValues } =
      controller.getFilteredTelegramsAndDistinctValues();
    expect(filteredTelegrams).toEqual([]);
    expect(distinctValues.source["1.1.10"]).toEqual({
      id: "1.1.10",
      name: "Kitchen switch",
      crossFilteredCount: 0,
    });
    expect(distinctValues.destination["2/3/4"]).toEqual({
      id: "2/3/4",
      name: "Kitchen light",
      crossFilteredCount: 0,
    });
  });
});
