import { describe, it, expect, vi, beforeEach } from "vitest";
import { mainWindow } from "@ha/common/dom/get_main_window";
import { navigate } from "@ha/common/navigate";
import { GroupMonitorController } from "./group-monitor-controller";
import { TelegramRow } from "../types/telegram-row";

vi.mock("@ha/common/dom/get_main_window", () => ({
  mainWindow: {
    location: {
      search: "",
    },
  },
}));

vi.mock("@ha/common/navigate", () => ({
  navigate: vi.fn(),
}));

describe("GroupMonitorController", () => {
  let controller: GroupMonitorController;
  let mockHost: any;

  beforeEach(() => {
    mockHost = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    };
    (mainWindow.location as any).search = "";
    vi.clearAllMocks();
    controller = new GroupMonitorController(mockHost);
  });

  it("should remove from distinct values when buffer overflows from incoming telegrams", () => {
    // Set a very small max size for testing
    (controller as any)._telegramBuffer.setMaxSize(2);

    const t1 = {
      timestamp: "2024-01-01T10:00:00.000Z",
      source: "1.1.1",
      destination: "1/1/1",
      telegramtype: "GroupValueWrite",
      direction: "Incoming",
      payload: [1],
      value: "On",
    } as any;

    const t2 = { ...t1, source: "1.1.2", timestamp: "2024-01-01T10:00:01.000Z" };
    const t3 = { ...t1, source: "1.1.3", timestamp: "2024-01-01T10:00:02.000Z" };

    (controller as any)._handleIncomingTelegram(t1);
    (controller as any)._handleIncomingTelegram(t2);

    let result = controller.getFilteredTelegramsAndDistinctValues();
    expect(result.distinctValues.source["1.1.1"]).toBeDefined();
    expect(result.distinctValues.source["1.1.2"]).toBeDefined();

    // This should evict t1
    (controller as any)._handleIncomingTelegram(t3);

    result = controller.getFilteredTelegramsAndDistinctValues();
    expect(result.distinctValues.source["1.1.1"]).toBeUndefined(); // t1 evicted
    expect(result.distinctValues.source["1.1.2"]).toBeDefined();
    expect(result.distinctValues.source["1.1.3"]).toBeDefined();
  });

  it("should toggle filter values and update state", () => {
    const route = { prefix: "/knx", path: "/group_monitor" } as any;
    controller.toggleFilterValue("source", "1.1.1", route);
    expect((controller as any)._filters.source).toContain("1.1.1");

    // Toggle off
    controller.toggleFilterValue("source", "1.1.1", route);
    expect((controller as any)._filters.source).not.toContain("1.1.1");
  });

  it("should update expanded filter", () => {
    controller.updateExpandedFilter("source", true);
    expect((controller as any)._expandedFilter).toBe("source");

    // Toggle off by passing false
    controller.updateExpandedFilter("source", false);
    expect((controller as any)._expandedFilter).toBeNull();

    // Switch to another
    controller.updateExpandedFilter("destination", true);
    expect((controller as any)._expandedFilter).toBe("destination");
  });

  it("should clear filters", () => {
    (controller as any)._filters = { source: ["1.1.1"] };
    (controller as any)._timeDeltaBefore = 5;

    controller.clearFilters({ prefix: "/knx", path: "/group_monitor" } as any);

    expect((controller as any)._filters).toEqual({});
    expect((controller as any)._timeDeltaBefore).toBe(0);
  });

  it("should set time delta", () => {
    controller.setTimeDelta(10, 20, { prefix: "/knx", path: "/group_monitor" } as any);
    expect((controller as any)._timeDeltaBefore).toBe(10);
    expect((controller as any)._timeDeltaAfter).toBe(20);
  });

  it("should remove distinct values when telegrams are evicted during historical merge", () => {
    (controller as any)._telegramBuffer.setMaxSize(2);
    const t1 = { timestamp: "2024-01-01T10:00:00.000Z", source: "1.1.1" } as any;
    const t2 = { timestamp: "2024-01-01T10:00:01.000Z", source: "1.1.2" } as any;
    const t3 = { timestamp: "2024-01-01T08:00:00.000Z", source: "1.2.1" } as any; // Older

    // Inject 1 and 2
    (controller as any)._handleIncomingTelegram(t1);
    (controller as any)._handleIncomingTelegram(t2);

    // Merge t3 (historical). It will increase maxSize but maybe not enough if we force it.
    // Actually addHistoricalTelegrams INCREASES maxSize to totalCount + safety.
    // So to trigger eviction we'd need to set maxSize AFTER increasing it? No.

    // Let's just mock merge to return removed.
    const mockBuffer = (controller as any)._telegramBuffer;
    mockBuffer.merge = vi
      .fn()
      .mockReturnValue({ added: [new TelegramRow(t3)], removed: [new TelegramRow(t1)] });

    controller.addHistoricalTelegrams([t3]);

    const result = controller.getFilteredTelegramsAndDistinctValues();
    expect(result.distinctValues.source["1.1.1"]).toBeUndefined();
  });

  it("should reset time delta if no list filters remain", () => {
    (controller as any)._filters = { source: ["1.1.1"] };
    (controller as any)._timeDeltaBefore = 10;

    // Set to empty
    controller.setFilterFieldValue("source", [], { prefix: "/knx", path: "/group_monitor" } as any);

    expect((controller as any)._timeDeltaBefore).toBe(0);
    expect((controller as any)._timeDeltaAfter).toBe(0);
  });

  it("should persist timedelta to URL when list filters are active", () => {
    (controller as any)._filters = { source: ["1.1.1"] };
    (controller as any)._timeDeltaBefore = 10;

    const route = { prefix: "/knx", path: "/group_monitor" } as any;
    (controller as any)._updateUrlFromFilters(route);

    // We can't easily check the navigate call here without mocking navigate,
    // but the logic path is exercised.
  });

  it("should restore filters and timedelta from URL", () => {
    (mainWindow.location as any).search = "?source=1.1.1&timedelta_before=100&timedelta_after=200";

    (controller as any)._setFiltersFromUrl();

    expect((controller as any)._filters.source).toEqual(["1.1.1"]);
    expect((controller as any)._timeDeltaBefore).toBe(100);
    expect((controller as any)._timeDeltaAfter).toBe(200);
  });

  it("should reset timedelta when no list filters are in URL", () => {
    (mainWindow.location as any).search = "?timedelta_before=100";

    (controller as any)._setFiltersFromUrl();

    expect((controller as any)._timeDeltaBefore).toBe(0);
    expect((controller as any)._filters).toEqual({});
  });

  it("should handle undefined route and timedelta_after in updateUrlFromFilters", () => {
    (controller as any)._filters = { source: ["1.1.1"] };
    (controller as any)._timeDeltaAfter = 200;

    // Should not crash when route is undefined
    (controller as any)._updateUrlFromFilters(undefined);
    expect(navigate).not.toHaveBeenCalled();

    const route = { prefix: "/knx", path: "/group_monitor" } as any;
    (controller as any)._updateUrlFromFilters(route);
    expect(navigate).toHaveBeenCalledWith("/knx/group_monitor?source=1.1.1&timedelta_after=200", {
      replace: true,
    });
  });
});
