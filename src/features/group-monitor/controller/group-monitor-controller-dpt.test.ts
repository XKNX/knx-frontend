import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TelegramDict } from "../../../types/websocket";
import { GroupMonitorController } from "./group-monitor-controller";
import { getGroupMonitorInfo } from "../../../services/websocket.service";

vi.mock("../../../services/websocket.service", () => ({
  getGroupMonitorInfo: vi.fn(),
}));

vi.mock("../../../tools/knx-logger", () => ({
  KNXLogger: class {
    debug = vi.fn();

    info = vi.fn();

    warn = vi.fn();

    error = vi.fn();
  },
}));

/**
 * Helper function to create mock telegram data for testing
 */
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
    dpt_main: null,
    dpt_sub: null,
    dpt_name: null,
    unit: null,
    value: "On",
    ...overrides,
  };
}

describe("GroupMonitorController - DPT Filtering & URL Syncing", () => {
  let controller: GroupMonitorController;

  beforeEach(() => {
    const mockHost = {
      addController: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
      removeController: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
      requestUpdate: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
      updateComplete: Promise.resolve(true),
    };
    controller = new GroupMonitorController(mockHost as any);
  });

  const injectTelegrams = async (telegrams: TelegramDict[]) => {
    vi.mocked(getGroupMonitorInfo).mockResolvedValueOnce({
      project_loaded: true,
      recent_telegrams: telegrams,
    } as any);
    await controller.reload({} as any);
  };

  const getFiltered = () => controller.getFilteredTelegramsAndDistinctValues().filteredTelegrams;

  describe("DPT Filtering", () => {
    it("should correctly match telegrams with specific DPT", async () => {
      await injectTelegrams([
        createMockTelegram({ dpt_main: 1, dpt_sub: 1, source: "1.1.1" }),
        createMockTelegram({ dpt_main: 5, dpt_sub: 1, source: "1.1.2" }),
        createMockTelegram({ dpt_main: 1, dpt_sub: 1, source: "1.1.3" }),
      ]);

      controller.setFilterFieldValue("dpt", ["1.001"]);

      const result = getFiltered();
      expect(result).toHaveLength(2);
      expect(result.every((t) => t.dptId === "1.001")).toBe(true);
      expect(result.map((t) => t.sourceAddress).sort()).toEqual(["1.1.1", "1.1.3"]);
    });

    it("should return empty array when no telegrams match DPT filter", async () => {
      await injectTelegrams([createMockTelegram({ dpt_main: 1, dpt_sub: 1 })]);

      controller.setFilterFieldValue("dpt", ["9.999"]);

      const result = getFiltered();
      expect(result).toHaveLength(0);
    });

    it("should combine DPT filter with other filters", async () => {
      await injectTelegrams([
        createMockTelegram({ dpt_main: 1, dpt_sub: 1, source: "1.1.1" }),
        createMockTelegram({ dpt_main: 1, dpt_sub: 1, source: "1.1.2" }),
        createMockTelegram({ dpt_main: 5, dpt_sub: 1, source: "1.1.1" }),
      ]);

      controller.setFilterFieldValue("dpt", ["1.001"]);
      controller.setFilterFieldValue("source", ["1.1.1"]);

      const result = getFiltered();
      expect(result).toHaveLength(1);
      expect(result[0].sourceAddress).toBe("1.1.1");
      expect(result[0].dptId).toBe("1.001");
    });
  });

  describe("URL Syncing with DPT", () => {
    it("should restore DPT filters from URL", () => {
      const mockSearch = "?dpt=1.001,5.001";
      const originalLocation = window.location;
      vi.stubGlobal("location", {
        ...originalLocation,
        search: mockSearch,
      });

      try {
        (controller as any)._setFiltersFromUrl();

        expect(controller.filters.dpt).toEqual(["1.001", "5.001"]);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("should restore both DPT and other filters from URL", () => {
      const mockSearch = "?dpt=1.001&source=1.1.1";
      const originalLocation = window.location;
      vi.stubGlobal("location", {
        ...originalLocation,
        search: mockSearch,
      });

      try {
        (controller as any)._setFiltersFromUrl();

        expect(controller.filters.dpt).toEqual(["1.001"]);
        expect(controller.filters.source).toEqual(["1.1.1"]);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("should restore DPT and timedelta values from URL", () => {
      const mockSearch = "?dpt=1.001&timedelta_before=100&timedelta_after=200";
      const originalLocation = window.location;
      vi.stubGlobal("location", {
        ...originalLocation,
        search: mockSearch,
      });

      try {
        (controller as any)._setFiltersFromUrl();

        expect(controller.filters.dpt).toEqual(["1.001"]);
        expect(controller.timeDeltaBefore).toBe(100);
        expect(controller.timeDeltaAfter).toBe(200);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
