import { describe, it, expect, vi, beforeEach } from "vitest";
import { LoadTelegramsDialog } from "./load-telegrams-dialog";
import { queryTelegrams } from "../../../services/websocket.service";

vi.mock("../../../services/websocket.service", () => ({
  queryTelegrams: vi.fn(),
}));

describe("LoadTelegramsDialog", () => {
  let dialog: LoadTelegramsDialog;
  let mockKnx: any;
  let mockHass: any;
  let onLoadMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    dialog = new LoadTelegramsDialog();
    mockKnx = {
      localize: vi.fn().mockImplementation((key) => key),
    };
    mockHass = { localize: vi.fn().mockImplementation((key) => key) };
    onLoadMock = vi.fn();
    dialog.hass = mockHass;
  });

  it("shows and closes dialog", async () => {
    await dialog.showDialog({ knx: mockKnx, onLoad: onLoadMock });
    expect((dialog as any)._open).toBe(true);

    dialog.closeDialog();
    expect((dialog as any)._open).toBe(false);
  });

  it("handles quick ranges", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));

    await dialog.showDialog({ knx: mockKnx, onLoad: onLoadMock });

    const mockedQuery = vi.mocked(queryTelegrams).mockResolvedValue({
      telegrams: [],
      total_count: 0,
      limit_reached: false,
    });

    await (dialog as any)._handleQuickRange5m();
    expect(mockedQuery).toHaveBeenCalledWith(mockHass, {
      start_time: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    });

    await (dialog as any)._handleQuickRange30m();
    expect(mockedQuery).toHaveBeenCalledWith(mockHass, {
      start_time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    });

    await (dialog as any)._handleQuickRange1h();
    expect(mockedQuery).toHaveBeenCalledWith(mockHass, {
      start_time: new Date(Date.now() - 3600 * 1000).toISOString(),
    });

    await (dialog as any)._handleQuickRange6h();
    expect(mockedQuery).toHaveBeenCalledWith(mockHass, {
      start_time: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    });

    await (dialog as any)._handleQuickRange1d();
    expect(mockedQuery).toHaveBeenCalledWith(mockHass, {
      start_time: new Date(Date.now() - 86400 * 1000).toISOString(),
    });

    await (dialog as any)._handleQuickRange1w();
    expect(mockedQuery).toHaveBeenCalledWith(mockHass, {
      start_time: new Date(Date.now() - 7 * 86400 * 1000).toISOString(),
    });

    vi.useRealTimers();
  });

  it("handles custom relative queries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
    await dialog.showDialog({ knx: mockKnx, onLoad: onLoadMock });

    const mockedQuery = vi.mocked(queryTelegrams).mockResolvedValue({
      telegrams: [],
      total_count: 0,
      limit_reached: false,
    });

    (dialog as any)._relValue = 2;
    (dialog as any)._relUnit = "minutes";
    await (dialog as any)._handleCustomRelative();
    expect(mockedQuery).toHaveBeenCalledWith(mockHass, {
      start_time: new Date(Date.now() - 120 * 1000).toISOString(),
    });

    (dialog as any)._relValue = 3;
    (dialog as any)._relUnit = "hours";
    await (dialog as any)._handleCustomRelative();
    expect(mockedQuery).toHaveBeenCalledWith(mockHass, {
      start_time: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    });

    (dialog as any)._relValue = 4;
    (dialog as any)._relUnit = "days";
    await (dialog as any)._handleCustomRelative();
    expect(mockedQuery).toHaveBeenCalledWith(mockHass, {
      start_time: new Date(Date.now() - 4 * 86400 * 1000).toISOString(),
    });

    vi.useRealTimers();
  });

  it("handles custom absolute queries", async () => {
    await dialog.showDialog({ knx: mockKnx, onLoad: onLoadMock });

    const mockedQuery = vi.mocked(queryTelegrams).mockResolvedValue({
      telegrams: [],
      total_count: 0,
      limit_reached: false,
    });

    // Test missing start date
    await (dialog as any)._handleCustomAbsolute();
    expect((dialog as any)._error).toBe("group_monitor_error_start_date_required");

    // Test with start date only
    (dialog as any)._startDate = "2026-05-01";
    (dialog as any)._startTime = "10:00:00";
    await (dialog as any)._handleCustomAbsolute();
    expect(mockedQuery).toHaveBeenCalledWith(mockHass, {
      start_time: new Date("2026-05-01T10:00:00").toISOString(),
      end_time: undefined,
    });

    // Test with start and end date
    (dialog as any)._endDate = "2026-05-02";
    (dialog as any)._endTime = "11:00:00";
    await (dialog as any)._handleCustomAbsolute();
    expect(mockedQuery).toHaveBeenCalledWith(mockHass, {
      start_time: new Date("2026-05-01T10:00:00").toISOString(),
      end_time: new Date("2026-05-02T11:00:00").toISOString(),
    });
  });

  it("handles input handlers", () => {
    (dialog as any)._handleRelValueInput({ target: { value: "5" } });
    expect((dialog as any)._relValue).toBe(5);

    (dialog as any)._handleRelUnitSelected({ target: { value: "days" } });
    expect((dialog as any)._relUnit).toBe("days");

    (dialog as any)._handleStartDateChanged({ detail: { value: "2026-01-01" } });
    expect((dialog as any)._startDate).toBe("2026-01-01");

    (dialog as any)._handleStartTimeChanged({ detail: { value: "12:00:00" } });
    expect((dialog as any)._startTime).toBe("12:00:00");

    (dialog as any)._handleEndDateChanged({ detail: { value: "2026-01-02" } });
    expect((dialog as any)._endDate).toBe("2026-01-02");

    (dialog as any)._handleEndTimeChanged({ detail: { value: "13:00:00" } });
    expect((dialog as any)._endTime).toBe("13:00:00");
  });

  it("handles fetch errors and limits", async () => {
    await dialog.showDialog({ knx: mockKnx, onLoad: onLoadMock });

    // Simulate error
    const mockedQuery = vi.mocked(queryTelegrams).mockRejectedValue(new Error("Network Error"));
    await (dialog as any)._loadTelegrams({});
    expect((dialog as any)._error).toBe("group_monitor_error_fetch");
    expect((dialog as any)._open).toBe(true);

    // Simulate limit reached
    mockedQuery.mockResolvedValue({
      telegrams: [{} as any],
      total_count: 1,
      limit_reached: true,
    });
    await (dialog as any)._loadTelegrams({});
    expect((dialog as any)._limitReached).toBe(true);
    expect((dialog as any)._open).toBe(true); // Should not close
    expect(onLoadMock).toHaveBeenCalledWith([{}], true);
  });

  it("renders correctly", async () => {
    // Just for branch coverage of render method
    expect((dialog as any).render()).not.toBeNull();

    await dialog.showDialog({ knx: mockKnx, onLoad: onLoadMock });
    expect((dialog as any).render()).not.toBeNull();

    (dialog as any)._error = "some error";
    (dialog as any)._limitReached = true;
    (dialog as any)._loading = true;
    expect((dialog as any).render()).not.toBeNull();
  });

  it("should clamp relValue input to at least 1", () => {
    (dialog as any)._handleRelValueInput({ target: { value: "0" } } as any);
    expect((dialog as any)._relValue).toBe(1);

    (dialog as any)._handleRelValueInput({ target: { value: "abc" } } as any);
    expect((dialog as any)._relValue).toBe(1);

    (dialog as any)._handleRelValueInput({ target: { value: "10" } } as any);
    expect((dialog as any)._relValue).toBe(10);
  });
});
