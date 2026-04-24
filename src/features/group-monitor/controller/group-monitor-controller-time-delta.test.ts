import { describe, it, expect } from "vitest";
import { TelegramRow } from "../types/telegram-row";
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

/**
 * Helper to create TelegramRow with specific timestamp, source and destination
 */
function createTelegramRow(
  timestamp: string,
  source = "1.2.3",
  destination = "1/2/3",
  telegramtype = "GroupValueWrite",
  direction = "Outgoing",
): TelegramRow {
  const mockData = createMockTelegram({
    timestamp,
    source,
    destination,
    telegramtype,
    direction,
  });
  return new TelegramRow(mockData);
}

/**
 * Test the time-delta expansion logic directly.
 * We access the private method via casting to any, since
 * it encapsulates the core algorithm we want to verify.
 */
describe("GroupMonitorController - Time-Delta Expansion", () => {
  // Create a controller instance to test the private method
  // We need a minimal host mock
  const mockHost = {
    addController: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
    removeController: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
    requestUpdate: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
    updateComplete: Promise.resolve(true),
  };

  const controller = new GroupMonitorController(mockHost as any);
  const applyTimeDeltaExpansion = (controller as any)._applyTimeDeltaExpansion.bind(controller);

  describe("No delta (passthrough)", () => {
    it("should return matching telegrams unchanged when both deltas are 0", () => {
      const t1 = createTelegramRow("2024-01-01T10:00:00.000Z", "1.2.1", "1/2/1");
      const t2 = createTelegramRow("2024-01-01T10:00:01.000Z", "1.2.2", "1/2/2");
      const t3 = createTelegramRow("2024-01-01T10:00:02.000Z", "1.2.3", "1/2/3");

      const allTelegrams = [t1, t2, t3];
      const matchingTelegrams = [t2];

      const result = applyTimeDeltaExpansion(matchingTelegrams, allTelegrams, 0, 0);
      expect(result).toEqual([t2]);
    });

    it("should return matching telegrams unchanged when matching is empty", () => {
      const t1 = createTelegramRow("2024-01-01T10:00:00.000Z", "1.2.1", "1/2/1");
      const result = applyTimeDeltaExpansion([], [t1], 500, 500);
      expect(result).toEqual([]);
    });
  });

  describe("Before delta only", () => {
    it("should include telegrams within the before window", () => {
      // t1 at 10:00:00.000, t2 at 10:00:00.500, t3 at 10:00:01.000
      const t1 = createTelegramRow("2024-01-01T10:00:00.000Z", "1.2.1", "1/2/1");
      const t2 = createTelegramRow("2024-01-01T10:00:00.500Z", "1.2.2", "1/2/2");
      const t3 = createTelegramRow("2024-01-01T10:00:01.000Z", "1.2.3", "1/2/3");

      const allTelegrams = [t1, t2, t3];
      const matchingTelegrams = [t3]; // Only t3 matches filters

      // 600ms before t3 should include t2 (500ms before) but not t1 (1000ms before)
      const result = applyTimeDeltaExpansion(matchingTelegrams, allTelegrams, 600, 0);
      expect(result).toHaveLength(2);
      expect(result).toContain(t2);
      expect(result).toContain(t3);
    });

    it("should not include telegrams outside the before window", () => {
      const t1 = createTelegramRow("2024-01-01T10:00:00.000Z", "1.2.1", "1/2/1");
      const t2 = createTelegramRow("2024-01-01T10:00:02.000Z", "1.2.2", "1/2/2");

      const allTelegrams = [t1, t2];
      const matchingTelegrams = [t2];

      // 500ms before t2 should NOT include t1 (2000ms before)
      const result = applyTimeDeltaExpansion(matchingTelegrams, allTelegrams, 500, 0);
      expect(result).toHaveLength(1);
      expect(result).toContain(t2);
    });
  });

  describe("After delta only", () => {
    it("should include telegrams within the after window", () => {
      const t1 = createTelegramRow("2024-01-01T10:00:00.000Z", "1.2.1", "1/2/1");
      const t2 = createTelegramRow("2024-01-01T10:00:00.300Z", "1.2.2", "1/2/2");
      const t3 = createTelegramRow("2024-01-01T10:00:02.000Z", "1.2.3", "1/2/3");

      const allTelegrams = [t1, t2, t3];
      const matchingTelegrams = [t1]; // Only t1 matches filters

      // 500ms after t1 should include t2 (300ms after) but not t3 (2000ms after)
      const result = applyTimeDeltaExpansion(matchingTelegrams, allTelegrams, 0, 500);
      expect(result).toHaveLength(2);
      expect(result).toContain(t1);
      expect(result).toContain(t2);
    });
  });

  describe("Both before and after deltas", () => {
    it("should include telegrams in the full window around matching telegrams", () => {
      const t1 = createTelegramRow("2024-01-01T10:00:00.000Z", "1.2.1", "1/2/1");
      const t2 = createTelegramRow("2024-01-01T10:00:00.500Z", "1.2.2", "1/2/2");
      const t3 = createTelegramRow("2024-01-01T10:00:01.000Z", "1.2.3", "1/2/3"); // Match
      const t4 = createTelegramRow("2024-01-01T10:00:01.400Z", "1.2.4", "1/2/4");
      const t5 = createTelegramRow("2024-01-01T10:00:03.000Z", "1.2.5", "1/2/5");

      const allTelegrams = [t1, t2, t3, t4, t5];
      const matchingTelegrams = [t3];

      // 600ms before and 500ms after t3 (10:00:01.000)
      // Window: [10:00:00.400, 10:00:01.500]
      // t2 at 10:00:00.500 → included (within before window)
      // t3 at 10:00:01.000 → included (matching)
      // t4 at 10:00:01.400 → included (within after window)
      // t1 at 10:00:00.000 → excluded (1000ms before, outside 600ms window)
      // t5 at 10:00:03.000 → excluded (2000ms after, outside 500ms window)
      const result = applyTimeDeltaExpansion(matchingTelegrams, allTelegrams, 600, 500);
      expect(result).toHaveLength(3);
      expect(result).toContain(t2);
      expect(result).toContain(t3);
      expect(result).toContain(t4);
      expect(result).not.toContain(t1);
      expect(result).not.toContain(t5);
    });
  });

  describe("Multiple matching telegrams with overlapping windows", () => {
    it("should deduplicate when windows overlap", () => {
      const t1 = createTelegramRow("2024-01-01T10:00:00.000Z", "1.2.1", "1/2/1"); // Match
      const t2 = createTelegramRow("2024-01-01T10:00:00.300Z", "1.2.2", "1/2/2"); // Context
      const t3 = createTelegramRow("2024-01-01T10:00:00.600Z", "1.2.3", "1/2/3"); // Match

      const allTelegrams = [t1, t2, t3];
      const matchingTelegrams = [t1, t3];

      // 400ms after t1 includes t2; 400ms before t3 includes t2
      // t2 should only appear once in the result
      const result = applyTimeDeltaExpansion(matchingTelegrams, allTelegrams, 400, 400);
      expect(result).toHaveLength(3);
      expect(result[0]).toBe(t1);
      expect(result[1]).toBe(t2);
      expect(result[2]).toBe(t3);
    });
  });

  describe("Edge cases", () => {
    it("should return all telegrams when window covers entire buffer", () => {
      const t1 = createTelegramRow("2024-01-01T10:00:00.000Z", "1.2.1", "1/2/1");
      const t2 = createTelegramRow("2024-01-01T10:00:01.000Z", "1.2.2", "1/2/2");
      const t3 = createTelegramRow("2024-01-01T10:00:02.000Z", "1.2.3", "1/2/3");

      const allTelegrams = [t1, t2, t3];
      const matchingTelegrams = [t2];

      // 5000ms before and 5000ms after covers everything
      const result = applyTimeDeltaExpansion(matchingTelegrams, allTelegrams, 5000, 5000);
      expect(result).toHaveLength(3);
    });

    it("should preserve chronological order", () => {
      const t1 = createTelegramRow("2024-01-01T10:00:00.000Z", "1.2.1", "1/2/1");
      const t2 = createTelegramRow("2024-01-01T10:00:00.100Z", "1.2.2", "1/2/2");
      const t3 = createTelegramRow("2024-01-01T10:00:00.200Z", "1.2.3", "1/2/3");
      const t4 = createTelegramRow("2024-01-01T10:00:00.300Z", "1.2.4", "1/2/4");

      const allTelegrams = [t1, t2, t3, t4];
      const matchingTelegrams = [t3]; // Match t3

      const result = applyTimeDeltaExpansion(matchingTelegrams, allTelegrams, 150, 150);
      // Window: [10:00:00.050, 10:00:00.350]
      // Includes: t2 (100ms), t3 (200ms), t4 (300ms)
      expect(result).toHaveLength(3);
      expect(result[0]).toBe(t2);
      expect(result[1]).toBe(t3);
      expect(result[2]).toBe(t4);
    });

    it("should handle when all telegrams already match (skip expansion)", () => {
      const t1 = createTelegramRow("2024-01-01T10:00:00.000Z", "1.2.1", "1/2/1");
      const t2 = createTelegramRow("2024-01-01T10:00:01.000Z", "1.2.2", "1/2/2");

      const allTelegrams = [t1, t2];
      const matchingTelegrams = [t1, t2]; // All match

      const result = applyTimeDeltaExpansion(matchingTelegrams, allTelegrams, 500, 500);
      expect(result).toEqual(matchingTelegrams);
    });

    it("should handle exact boundary inclusion (timestamp equals window edge)", () => {
      const t1 = createTelegramRow("2024-01-01T10:00:00.000Z", "1.2.1", "1/2/1");
      const t2 = createTelegramRow("2024-01-01T10:00:00.500Z", "1.2.2", "1/2/2"); // Match
      const t3 = createTelegramRow("2024-01-01T10:00:01.000Z", "1.2.3", "1/2/3");

      const allTelegrams = [t1, t2, t3];
      const matchingTelegrams = [t2];

      // Exactly 500ms before and 500ms after
      // t1 is exactly at the boundary (500ms before t2) → should be included
      // t3 is exactly at the boundary (500ms after t2) → should be included
      const result = applyTimeDeltaExpansion(matchingTelegrams, allTelegrams, 500, 500);
      expect(result).toHaveLength(3);
      expect(result).toContain(t1);
      expect(result).toContain(t2);
      expect(result).toContain(t3);
    });
  });
});
