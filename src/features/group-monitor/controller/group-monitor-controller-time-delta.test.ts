import { describe, it, expect, beforeEach } from "vitest";
import type { TelegramDict } from "../../../types/websocket";
import { GroupMonitorController } from "./group-monitor-controller";

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
    dpt_main: 1,
    dpt_sub: 1,
    dpt_name: "1.001",
    unit: null,
    value: "On",
    ...overrides,
  };
}

describe("GroupMonitorController - Time-Delta Expansion", () => {
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

  const injectTelegrams = (telegrams: TelegramDict[]) => {
    for (const t of telegrams) {
      // We simulate incoming websocket messages. While this uses 'as any',
      // it avoids coupling the tests to the private expansion algorithm signature.
      (controller as any)._handleIncomingTelegram(t);
    }
  };

  const getFiltered = () => controller.getFilteredTelegramsAndDistinctValues().filteredTelegrams;

  describe("No delta (passthrough)", () => {
    it("should return matching telegrams unchanged when both deltas are 0", () => {
      injectTelegrams([
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.000Z", source: "1.2.1" }),
        createMockTelegram({ timestamp: "2024-01-01T10:00:01.000Z", source: "1.2.2" }),
        createMockTelegram({ timestamp: "2024-01-01T10:00:02.000Z", source: "1.2.3" }),
      ]);

      controller.setFilterFieldValue("source", ["1.2.2"]);
      controller.setTimeDelta(0, 0);

      const result = getFiltered();
      expect(result).toHaveLength(1);
      expect(result[0].sourceAddress).toBe("1.2.2");
    });

    it("should return empty array when matching is empty", () => {
      injectTelegrams([
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.000Z", source: "1.2.1" }),
      ]);

      controller.setFilterFieldValue("source", ["9.9.9"]);
      controller.setTimeDelta(500, 500);

      const result = getFiltered();
      expect(result).toEqual([]);
    });
  });

  describe("Before delta only", () => {
    it("should include telegrams within the before window", () => {
      injectTelegrams([
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.000Z", source: "1.2.1" }), // t1
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.500Z", source: "1.2.2" }), // t2
        createMockTelegram({ timestamp: "2024-01-01T10:00:01.000Z", source: "1.2.3" }), // t3
      ]);

      // Only match t3
      controller.setFilterFieldValue("source", ["1.2.3"]);
      // 600ms before t3 should include t2 (500ms before) but not t1 (1000ms before)
      controller.setTimeDelta(600, 0);

      const result = getFiltered();
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.sourceAddress).sort()).toEqual(["1.2.2", "1.2.3"]);
    });

    it("should not include telegrams outside the before window", () => {
      injectTelegrams([
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.000Z", source: "1.2.1" }),
        createMockTelegram({ timestamp: "2024-01-01T10:00:02.000Z", source: "1.2.2" }),
      ]);

      controller.setFilterFieldValue("source", ["1.2.2"]);
      // 500ms before t2 should NOT include t1 (2000ms before)
      controller.setTimeDelta(500, 0);

      const result = getFiltered();
      expect(result).toHaveLength(1);
      expect(result[0].sourceAddress).toBe("1.2.2");
    });
  });

  describe("After delta only", () => {
    it("should include telegrams within the after window", () => {
      injectTelegrams([
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.000Z", source: "1.2.1" }), // t1
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.300Z", source: "1.2.2" }), // t2
        createMockTelegram({ timestamp: "2024-01-01T10:00:02.000Z", source: "1.2.3" }), // t3
      ]);

      controller.setFilterFieldValue("source", ["1.2.1"]);
      // 500ms after t1 should include t2 (300ms after) but not t3 (2000ms after)
      controller.setTimeDelta(0, 500);

      const result = getFiltered();
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.sourceAddress).sort()).toEqual(["1.2.1", "1.2.2"]);
    });
  });

  describe("Both before and after deltas", () => {
    it("should include telegrams in the full window around matching telegrams", () => {
      injectTelegrams([
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.000Z", source: "1.2.1" }), // t1 (ex)
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.500Z", source: "1.2.2" }), // t2 (inc)
        createMockTelegram({ timestamp: "2024-01-01T10:00:01.000Z", source: "1.2.3" }), // t3 (match)
        createMockTelegram({ timestamp: "2024-01-01T10:00:01.400Z", source: "1.2.4" }), // t4 (inc)
        createMockTelegram({ timestamp: "2024-01-01T10:00:03.000Z", source: "1.2.5" }), // t5 (ex)
      ]);

      controller.setFilterFieldValue("source", ["1.2.3"]);
      controller.setTimeDelta(600, 500);

      const result = getFiltered();
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.sourceAddress).sort()).toEqual(["1.2.2", "1.2.3", "1.2.4"]);
    });
  });

  describe("Multiple matching telegrams with overlapping windows", () => {
    it("should deduplicate when windows overlap", () => {
      injectTelegrams([
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.000Z", source: "1.2.1" }), // Match
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.300Z", source: "1.2.2" }), // Context
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.600Z", source: "1.2.3" }), // Match
      ]);

      controller.setFilterFieldValue("source", ["1.2.1", "1.2.3"]);
      controller.setTimeDelta(400, 400);

      const result = getFiltered();
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.sourceAddress).sort()).toEqual(["1.2.1", "1.2.2", "1.2.3"]);
    });
  });

  describe("Edge cases", () => {
    it("should return all telegrams when window covers entire buffer", () => {
      injectTelegrams([
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.000Z", source: "1.2.1" }),
        createMockTelegram({ timestamp: "2024-01-01T10:00:01.000Z", source: "1.2.2" }),
        createMockTelegram({ timestamp: "2024-01-01T10:00:02.000Z", source: "1.2.3" }),
      ]);

      controller.setFilterFieldValue("source", ["1.2.2"]);
      controller.setTimeDelta(5000, 5000);

      const result = getFiltered();
      expect(result).toHaveLength(3);
    });

    it("should preserve chronological order when not sorting explicitly", () => {
      controller.sortColumn = undefined;

      injectTelegrams([
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.000Z", source: "1.2.1" }),
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.100Z", source: "1.2.2" }),
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.200Z", source: "1.2.3" }),
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.300Z", source: "1.2.4" }),
      ]);

      controller.setFilterFieldValue("source", ["1.2.3"]);
      controller.setTimeDelta(150, 150);

      const result = getFiltered();
      expect(result).toHaveLength(3);
      expect(result[0].sourceAddress).toBe("1.2.2");
      expect(result[1].sourceAddress).toBe("1.2.3");
      expect(result[2].sourceAddress).toBe("1.2.4");
    });

    it("should handle exact boundary inclusion (timestamp equals window edge)", () => {
      injectTelegrams([
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.000Z", source: "1.2.1" }), // Edge
        createMockTelegram({ timestamp: "2024-01-01T10:00:00.500Z", source: "1.2.2" }), // Match
        createMockTelegram({ timestamp: "2024-01-01T10:00:01.000Z", source: "1.2.3" }), // Edge
      ]);

      controller.setFilterFieldValue("source", ["1.2.2"]);
      controller.setTimeDelta(500, 500);

      const result = getFiltered();
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.sourceAddress).sort()).toEqual(["1.2.1", "1.2.2", "1.2.3"]);
    });
  });
});
