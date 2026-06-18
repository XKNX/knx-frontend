import { describe, it, expect, vi, beforeEach } from "vitest";
import { KNXGroupMonitor } from "./group-monitor-view";

vi.mock("@lit-labs/virtualizer", () => ({}));

describe("KNXGroupMonitor", () => {
  let element: KNXGroupMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    element = new KNXGroupMonitor();
    element.knx = {
      localize: vi.fn((key) => key),
      connectionInfo: { telegram_retention: 10 },
    } as any;
    element.hass = {
      callWS: vi.fn(),
      connected: true,
    } as any;
  });

  it("applies a selected time range with the configured retention", () => {
    const mockController = { applyTimeRangeFilter: vi.fn() };
    (element as any).controller = mockController;

    (element as any)._handleTimeRangeChanged({ detail: { startMs: 1000, endMs: 2000 } });

    expect(mockController.applyTimeRangeFilter).toHaveBeenCalledWith(element.hass, 1000, 2000, 10);
  });

  it("releases the time-range filter when cleared", () => {
    const mockController = { clearTimeRangeFilter: vi.fn() };
    (element as any).controller = mockController;

    (element as any)._handleTimeRangeCleared();

    expect(mockController.clearTimeRangeFilter).toHaveBeenCalled();
  });

  it("pause button clears the absolute time range instead of toggling pause", async () => {
    const mockController = {
      hasAbsoluteTimeRange: true,
      clearTimeRangeFilter: vi.fn(),
      togglePause: vi.fn(),
    };
    (element as any).controller = mockController;

    await (element as any)._handlePauseToggle();

    expect(mockController.clearTimeRangeFilter).toHaveBeenCalled();
    expect(mockController.togglePause).not.toHaveBeenCalled();
  });

  it("pause button toggles pause normally without an absolute range", async () => {
    const mockController = {
      hasAbsoluteTimeRange: false,
      clearTimeRangeFilter: vi.fn(),
      togglePause: vi.fn(),
    };
    (element as any).controller = mockController;

    await (element as any)._handlePauseToggle();

    expect(mockController.togglePause).toHaveBeenCalled();
    expect(mockController.clearTimeRangeFilter).not.toHaveBeenCalled();
  });

  it("maps history warning codes to localized text", () => {
    expect((element as any)._historyWarningText("retention_clamped")).toBe(
      "group_monitor_time_range_retention_clamped",
    );
    expect((element as any)._historyWarningText("partial_load")).toBe(
      "group_monitor_time_range_partial",
    );
    expect((element as any)._historyWarningText(null)).toBeUndefined();
  });

  it("should clear telegrams when _handleClearRows is called", () => {
    const mockController = {
      clearTelegrams: vi.fn(),
    };
    (element as any).controller = mockController;

    (element as any)._handleClearRows();

    expect(mockController.clearTelegrams).toHaveBeenCalled();
  });
});
