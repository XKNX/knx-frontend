import { describe, it, expect, beforeEach } from "vitest";
import { TelegramBufferService } from "./telegram-buffer-service";
import { TelegramRow } from "../types/telegram-row";
import type { TelegramDict } from "../../../types/websocket";

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
 * Helper function to create TelegramRow with specific timestamp and unique addresses
 */
function createTelegramRow(timestamp: string, id = "1"): TelegramRow {
  const mockData = createMockTelegram({
    timestamp,
    source: `1.2.${id}`,
    destination: `1/2/${id}`,
  });
  return new TelegramRow(mockData);
}

/**
 * Helper to create multiple telegrams with incremental timestamps (1 second apart)
 */
function createTelegrams(count: number, baseTime = "2024-01-01T10:00:00.000Z"): TelegramRow[] {
  const baseDate = new Date(baseTime);
  const telegrams: TelegramRow[] = [];

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(baseDate.getTime() + i * 1000);
    telegrams.push(createTelegramRow(timestamp.toISOString(), i.toString()));
  }

  return telegrams;
}

describe("TelegramBufferService", () => {
  let service: TelegramBufferService;

  beforeEach(() => {
    service = new TelegramBufferService();
  });

  describe("Basic Operations", () => {
    it("should initialize with default settings", () => {
      expect(service.maxSize).toBe(2000);
      expect(service.length).toBe(0);
      expect(service.isEmpty).toBe(true);
      expect(service.snapshot).toEqual([]);
    });

    it("should add single telegram", () => {
      const telegram = createTelegramRow("2024-01-01T10:00:00.000Z");
      const removed = service.add(telegram);

      expect(service.length).toBe(1);
      expect(service.isEmpty).toBe(false);
      expect(removed).toEqual([]);
      expect(service.snapshot[0]).toBe(telegram);
    });

    it("should add multiple telegrams", () => {
      const telegrams = createTelegrams(3);
      const removed = service.add(telegrams);

      expect(service.length).toBe(3);
      expect(removed).toEqual([]);
      expect(service.snapshot).toEqual(telegrams);
    });

    it("should clear buffer", () => {
      const telegrams = createTelegrams(3);
      service.add(telegrams);

      const cleared = service.clear();

      expect(cleared).toEqual(telegrams);
      expect(service.length).toBe(0);
      expect(service.isEmpty).toBe(true);
    });
  });

  describe("Chronological Ordering", () => {
    it("should maintain chronological order when added in sequence", () => {
      const telegram1 = createTelegramRow("2024-01-01T10:00:01.000Z", "1");
      const telegram2 = createTelegramRow("2024-01-01T10:00:02.000Z", "2");
      const telegram3 = createTelegramRow("2024-01-01T10:00:03.000Z", "3");

      service.add(telegram1);
      service.add(telegram2);
      service.add(telegram3);

      const snapshot = service.snapshot;
      expect(snapshot[0]).toBe(telegram1);
      expect(snapshot[1]).toBe(telegram2);
      expect(snapshot[2]).toBe(telegram3);
    });

    it("should sort when telegrams are added out of chronological order", () => {
      const telegram1 = createTelegramRow("2024-01-01T10:00:01.000Z", "1");
      const telegram2 = createTelegramRow("2024-01-01T10:00:02.000Z", "2");
      const telegram3 = createTelegramRow("2024-01-01T10:00:03.000Z", "3");

      // Add out of order
      service.add(telegram3);
      service.add(telegram1);
      service.add(telegram2);

      const snapshot = service.snapshot;
      expect(snapshot[0]).toBe(telegram1);
      expect(snapshot[1]).toBe(telegram2);
      expect(snapshot[2]).toBe(telegram3);
    });

    it("should insert telegram in correct chronological position", () => {
      const telegram1 = createTelegramRow("2024-01-01T10:00:01.000Z", "1");
      const telegram3 = createTelegramRow("2024-01-01T10:00:03.000Z", "3");
      service.add([telegram1, telegram3]);

      const telegram2 = createTelegramRow("2024-01-01T10:00:02.000Z", "2");
      service.add(telegram2);

      const snapshot = service.snapshot;
      expect(snapshot[0]).toBe(telegram1);
      expect(snapshot[1]).toBe(telegram2);
      expect(snapshot[2]).toBe(telegram3);
    });
  });

  describe("Buffer Overflow", () => {
    beforeEach(() => {
      service = new TelegramBufferService(3); // Small buffer for testing
    });

    it("should remove oldest telegrams when buffer overflows", () => {
      const telegrams = createTelegrams(5);
      const removed = service.add(telegrams);

      expect(service.length).toBe(3);
      expect(removed).toEqual(telegrams.slice(0, 2)); // First 2 removed
      expect(service.snapshot).toEqual(telegrams.slice(2)); // Last 3 remain
    });

    it("should handle single telegram overflow", () => {
      const telegrams = createTelegrams(3);
      service.add(telegrams);

      const newTelegram = createTelegramRow("2024-01-01T10:00:04.000Z", "4");
      const removed = service.add(newTelegram);

      expect(service.length).toBe(3);
      expect(removed).toEqual([telegrams[0]]);
      expect(service.snapshot).toEqual([telegrams[1], telegrams[2], newTelegram]);
    });
  });

  describe("Merge Operations", () => {
    it("should merge unique telegrams", () => {
      const telegram1 = createTelegramRow("2024-01-01T10:00:01.000Z", "1");
      const telegram2 = createTelegramRow("2024-01-01T10:00:03.000Z", "3");
      service.add([telegram1, telegram2]);

      const newTelegrams = [
        createTelegramRow("2024-01-01T10:00:02.000Z", "2"),
        createTelegramRow("2024-01-01T10:00:04.000Z", "4"),
      ];

      const result = service.merge(newTelegrams);

      expect(result.added).toEqual(newTelegrams);
      expect(result.removed).toEqual([]);
      expect(service.length).toBe(4);

      // Check chronological order
      const snapshot = service.snapshot;
      expect(snapshot[0].timestampIso).toBe("2024-01-01T10:00:01.000Z");
      expect(snapshot[1].timestampIso).toBe("2024-01-01T10:00:02.000Z");
      expect(snapshot[2].timestampIso).toBe("2024-01-01T10:00:03.000Z");
      expect(snapshot[3].timestampIso).toBe("2024-01-01T10:00:04.000Z");
    });

    it("should filter out duplicate telegrams", () => {
      const telegram1 = createTelegramRow("2024-01-01T10:00:01.000Z", "1");
      const telegram2 = createTelegramRow("2024-01-01T10:00:02.000Z", "2");
      service.add([telegram1, telegram2]);

      const newTelegrams = [
        telegram1, // Duplicate
        createTelegramRow("2024-01-01T10:00:03.000Z", "3"), // New
        telegram2, // Duplicate
      ];

      const result = service.merge(newTelegrams);

      expect(result.added.length).toBe(1);
      expect(result.added[0].timestampIso).toBe("2024-01-01T10:00:03.000Z");
      expect(service.length).toBe(3);
    });
  });

  describe("Buffer Size Management", () => {
    it("should update max size without overflow", () => {
      const telegrams = createTelegrams(3);
      service.add(telegrams);

      const removed = service.setMaxSize(5);

      expect(service.maxSize).toBe(5);
      expect(service.length).toBe(3);
      expect(removed).toEqual([]);
    });

    it("should remove telegrams when reducing max size", () => {
      const telegrams = createTelegrams(5);
      service.add(telegrams);

      const removed = service.setMaxSize(3);

      expect(service.maxSize).toBe(3);
      expect(service.length).toBe(3);
      expect(removed).toEqual(telegrams.slice(0, 2));
      expect(service.snapshot).toEqual(telegrams.slice(2));
    });
  });

  describe("Data Access", () => {
    let telegrams: TelegramRow[];

    beforeEach(() => {
      telegrams = createTelegrams(3);
      service.add(telegrams);
    });

    it("should get telegram by index", () => {
      expect(service.at(0)).toBe(telegrams[0]);
      expect(service.at(1)).toBe(telegrams[1]);
      expect(service.at(2)).toBe(telegrams[2]);
      expect(service.at(-1)).toBeUndefined();
      expect(service.at(3)).toBeUndefined();
    });

    it("should find telegram by ID", () => {
      expect(service.findIndexById(telegrams[0].id)).toBe(0);
      expect(service.findIndexById(telegrams[1].id)).toBe(1);
      expect(service.findIndexById("non-existent")).toBe(-1);
    });

    it("should get telegram by ID", () => {
      expect(service.getById(telegrams[0].id)).toBe(telegrams[0]);
      expect(service.getById("non-existent")).toBeUndefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty arrays", () => {
      expect(service.add([])).toEqual([]);
      expect(service.merge([])).toEqual({ added: [], removed: [] });
    });

    it("should handle identical timestamps", () => {
      const sameTime = "2024-01-01T10:00:00.000Z";
      const telegram1 = createTelegramRow(sameTime, "1");
      const telegram2 = createTelegramRow(sameTime, "2");

      service.add(telegram1);
      service.add(telegram2);

      const snapshot = service.snapshot;
      expect(snapshot[0]).toBe(telegram1);
      expect(snapshot[1]).toBe(telegram2);
    });

    it("should return immutable snapshots", () => {
      const telegrams = createTelegrams(2);
      service.add(telegrams);

      const snapshot1 = service.snapshot;
      const snapshot2 = service.snapshot;

      expect(snapshot1).not.toBe(snapshot2); // Different instances
      expect(snapshot1).toEqual(snapshot2); // Same content
    });
  });
});
