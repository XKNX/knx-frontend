import { describe, it, expect, vi, beforeEach } from "vitest";
import { KNXGroupMonitor } from "./group-monitor-view";
import { showLoadTelegramsDialog } from "../dialogs/show-load-telegrams-dialog";

vi.mock("../dialogs/show-load-telegrams-dialog", () => ({
  showLoadTelegramsDialog: vi.fn(),
}));

vi.mock("@lit-labs/virtualizer", () => ({}));

describe("KNXGroupMonitor", () => {
  let element: KNXGroupMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    element = new KNXGroupMonitor();
    element.knx = {
      localize: vi.fn((key) => key),
    } as any;
    element.hass = {
      callWS: vi.fn(),
      connected: true,
    } as any;
  });

  it("should show load telegrams dialog when _handleLoadHistory is called", () => {
    (element as any)._handleLoadHistory();
    expect(showLoadTelegramsDialog).toHaveBeenCalledWith(
      element,
      expect.objectContaining({
        knx: element.knx,
        onLoad: expect.any(Function),
      }),
    );
  });

  it("should add historical telegrams when dialog calls onLoad", () => {
    const mockController = {
      addHistoricalTelegrams: vi.fn(),
    };
    (element as any).controller = mockController;

    (element as any)._handleLoadHistory();
    const onLoad = vi.mocked(showLoadTelegramsDialog).mock.calls[0][1].onLoad;

    const telegrams = [{ source: "1.1.1" }] as any;
    onLoad(telegrams, false);

    expect(mockController.addHistoricalTelegrams).toHaveBeenCalledWith(telegrams);
  });
});
