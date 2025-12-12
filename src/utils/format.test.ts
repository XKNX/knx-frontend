import { describe, it, expect } from "vitest";
import {
  formatTimeDelta,
  TelegramDictFormatter,
  formatTimeWithMilliseconds,
  formatDateTimeWithMilliseconds,
  formatIsoTimestampWithMicroseconds,
  extractMicrosecondsFromIso,
} from "./format";
import type { TelegramDict } from "../types/websocket";

/**
 * Helper to create mock telegram data for testing
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
    dpt_name: "Switch",
    unit: null,
    value: "On",
    ...overrides,
  };
}

describe("extractMicrosecondsFromIso", () => {
  it("should handle ISO timestamps without fractional seconds", () => {
    const iso = "2023-12-25T20:24:22Z";
    const result = extractMicrosecondsFromIso(iso);

    // Should be equivalent to Date.parse * 1000
    const expected = Date.parse(iso) * 1_000;
    expect(result).toBe(expected);
  });

  it("should handle ISO timestamps with full 6-digit microsecond precision", () => {
    const iso = "2023-12-25T20:24:22.614053Z";
    const result = extractMicrosecondsFromIso(iso);

    // Expected: base timestamp in ms * 1000 + microseconds
    const baseMs = Date.parse("2023-12-25T20:24:22Z");
    const expected = baseMs * 1_000 + 614053;
    expect(result).toBe(expected);
  });

  it("should handle ISO timestamps with timezone offsets", () => {
    const iso = "2023-12-25T20:24:22.614053+02:00";
    const result = extractMicrosecondsFromIso(iso);

    // Should correctly parse timezone and add microseconds
    const baseMs = Date.parse("2023-12-25T20:24:22+02:00");
    const expected = baseMs * 1_000 + 614053;
    expect(result).toBe(expected);
  });

  it("should handle ISO timestamps with negative timezone offsets", () => {
    const iso = "2023-12-25T20:24:22.614053-05:00";
    const result = extractMicrosecondsFromIso(iso);

    const baseMs = Date.parse("2023-12-25T20:24:22-05:00");
    const expected = baseMs * 1_000 + 614053;
    expect(result).toBe(expected);
  });

  it("should pad short fractional parts to 6 digits", () => {
    const iso = "2023-12-25T20:24:22.27Z";
    const result = extractMicrosecondsFromIso(iso);

    // .27 should be treated as .270000 (270000 microseconds)
    const baseMs = Date.parse("2023-12-25T20:24:22Z");
    const expected = baseMs * 1_000 + 270000;
    expect(result).toBe(expected);
  });

  it("should truncate long fractional parts to 6 digits", () => {
    const iso = "2023-12-25T20:24:22.1234567890Z";
    const result = extractMicrosecondsFromIso(iso);

    // Should only use first 6 digits: 123456
    const baseMs = Date.parse("2023-12-25T20:24:22Z");
    const expected = baseMs * 1_000 + 123456;
    expect(result).toBe(expected);
  });

  it("should handle ISO timestamps without explicit timezone", () => {
    const iso = "2023-12-25T20:24:22.614053";
    const result = extractMicrosecondsFromIso(iso);

    const baseMs = Date.parse("2023-12-25T20:24:22");
    const expected = baseMs * 1_000 + 614053;
    expect(result).toBe(expected);
  });

  it("should calculate correct differences for real telegram data", () => {
    // Real data from the bug report
    const timestamp1 = "2023-12-25T20:24:22.614053Z";
    const timestamp2 = "2023-12-25T20:24:20.604003Z";

    const micros1 = extractMicrosecondsFromIso(timestamp1);
    const micros2 = extractMicrosecondsFromIso(timestamp2);

    const diff = micros1 - micros2;

    // Should be 2.010050 seconds = 2,010,050 microseconds
    expect(diff).toBe(2010050);
  });

  it("should handle edge case with exactly 3 fractional digits", () => {
    const iso = "2023-12-25T20:24:22.123Z";
    const result = extractMicrosecondsFromIso(iso);

    // .123 should become 123000 microseconds
    const baseMs = Date.parse("2023-12-25T20:24:22Z");
    const expected = baseMs * 1_000 + 123000;
    expect(result).toBe(expected);
  });

  it("should handle single fractional digit", () => {
    const iso = "2023-12-25T20:24:22.5Z";
    const result = extractMicrosecondsFromIso(iso);

    // .5 should become 500000 microseconds
    const baseMs = Date.parse("2023-12-25T20:24:22Z");
    const expected = baseMs * 1_000 + 500000;
    expect(result).toBe(expected);
  });

  it("should handle performance comparison with original implementation", () => {
    // Compare with a simple implementation to ensure correctness
    const iso = "2025-07-13T22:11:08.273496+02:00";
    const result = extractMicrosecondsFromIso(iso);

    // Manual calculation for verification
    const baseMs = Date.parse("2025-07-13T22:11:08+02:00");
    const expected = baseMs * 1_000 + 273496;
    expect(result).toBe(expected);
  });

  it("should handle very large time differences without precision loss", () => {
    // Test with timestamps spanning years to ensure no overflow or precision loss
    const timestamp1 = "2025-12-31T23:59:59.999999Z"; // End of 2025
    const timestamp2 = "2020-01-01T00:00:00.000001Z"; // Start of 2020

    const micros1 = extractMicrosecondsFromIso(timestamp1);
    const micros2 = extractMicrosecondsFromIso(timestamp2);

    const diff = micros1 - micros2;

    // Should be approximately 6 years in microseconds
    // 6 years ≈ 6 * 365.25 * 24 * 60 * 60 * 1,000,000 microseconds
    const expectedYears = 6;
    const approximateYearInMicros = 365.25 * 24 * 60 * 60 * 1_000_000;
    const expectedDiff = expectedYears * approximateYearInMicros;

    // Check that we're in the right ballpark (within 1% of expected)
    const tolerance = expectedDiff * 0.01;
    expect(Math.abs(diff - expectedDiff)).toBeLessThan(tolerance);

    // Verify microsecond precision is preserved
    expect(micros1 % 1_000_000).toBe(999999); // .999999 seconds = 999999 microseconds
    expect(micros2 % 1_000_000).toBe(1); // .000001 seconds = 1 microsecond

    // Ensure no precision loss occurred (diff should include the microsecond precision)
    const microsecondDiff = 999999 - 1; // 999998 microseconds from fractional part
    expect(diff % 1_000_000).toBe(microsecondDiff);
  });
});

describe("formatTimeDelta", () => {
  describe("Basic functionality", () => {
    it("should return dash for null offset", () => {
      expect(formatTimeDelta(null)).toBe("—");
    });

    it("should format zero offset", () => {
      expect(formatTimeDelta(0)).toBe("00:00.000");
    });

    it("should format minutes and seconds without hours", () => {
      const offset = 2 * 60 * 1_000_000 + 30 * 1_000_000 + 500_000; // 2:30.500
      expect(formatTimeDelta(offset)).toBe("02:30.500");
    });

    it("should format with hours when >= 1 hour", () => {
      const offset = 2 * 60 * 60 * 1_000_000 + 15 * 60 * 1_000_000 + 30 * 1_000_000 + 250_000;
      expect(formatTimeDelta(offset)).toBe("02:15:30.250");
    });

    it("should handle negative offsets", () => {
      const offset = -(2 * 60 * 1_000_000 + 30 * 1_000_000 + 500_000);
      expect(formatTimeDelta(offset)).toBe("-02:30.500");
    });
  });

  describe("Precision modes", () => {
    it("should format with millisecond precision by default", () => {
      const offset = 1_000_000 + 123_456; // 1.123456 seconds
      expect(formatTimeDelta(offset)).toBe("00:01.123");
    });

    it("should format with microsecond precision when specified", () => {
      const offset = 1_000_000 + 123_456; // 1.123456 seconds
      expect(formatTimeDelta(offset, "microseconds")).toBe("00:01.123456");
    });

    it("should round milliseconds correctly", () => {
      const offset = 1_000_000 + 123_500; // 1.1235 seconds -> should round to 1.124
      expect(formatTimeDelta(offset)).toBe("00:01.124");
    });
  });

  describe("Edge cases", () => {
    it("should handle large values", () => {
      const offset = 25 * 60 * 60 * 1_000_000; // 25 hours
      expect(formatTimeDelta(offset)).toBe("25:00:00.000");
    });

    it("should pad single digits correctly", () => {
      const offset = 5 * 60 * 1_000_000 + 3 * 1_000_000 + 7_000; // 5:03.007
      expect(formatTimeDelta(offset)).toBe("05:03.007");
    });
  });

  describe("formatTimeWithMilliseconds", () => {
    it("should format time string with milliseconds", () => {
      const date = new Date("2024-01-01T14:30:25.123Z");
      const result = formatTimeWithMilliseconds(date);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}[,.]\d{3}$/);
    });

    it("should handle midnight timestamp", () => {
      const date = new Date("2024-01-01T00:00:00.000Z");
      const result = formatTimeWithMilliseconds(date);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}[,.]\d{3}$/);
    });

    it("should handle timestamp with microsecond precision", () => {
      const date = new Date("2024-01-01T14:30:25.123Z");
      const result = formatTimeWithMilliseconds(date);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}[,.]\d{3}$/);
    });

    it("should handle edge case with no milliseconds", () => {
      const date = new Date("2024-01-01T14:30:25Z");
      const result = formatTimeWithMilliseconds(date);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}[,.]\d{3}$/);
    });
  });

  describe("formatDateTimeWithMilliseconds", () => {
    it("should format date and time with milliseconds", () => {
      const date = new Date("2024-01-01T14:30:25.123Z");
      const result = formatDateTimeWithMilliseconds(date);
      expect(result).toMatch(/\d+[./]\d+[./]\d+.+\d{2}:\d{2}:\d{2}[,.]\d{3}/);
    });

    it("should handle year end timestamp", () => {
      const date = new Date("2024-12-31T23:59:59.999Z");
      const result = formatDateTimeWithMilliseconds(date);
      expect(result).toMatch(/\d+[./]\d+[./]\d+.+\d{2}:\d{2}:\d{2}[,.]\d{3}/);
    });

    it("should handle leap year date", () => {
      const date = new Date("2024-02-29T12:00:00.500Z");
      const result = formatDateTimeWithMilliseconds(date);
      expect(result).toMatch(/\d+[./]\d+[./]\d+.+\d{2}:\d{2}:\d{2}[,.]\d{3}/);
    });
  });

  describe("formatIsoTimestampWithMicroseconds", () => {
    it("should format ISO timestamp with microseconds", () => {
      const result = formatIsoTimestampWithMicroseconds("2024-01-01T14:30:25.123456Z");
      expect(result).toContain("14:30:25.123456");
    });

    it("should handle timestamp with only milliseconds", () => {
      const result = formatIsoTimestampWithMicroseconds("2024-01-01T14:30:25.123Z");
      expect(result).toContain("14:30:25");
      expect(result).toContain("000000");
    });

    it("should handle timestamp without fractional seconds", () => {
      const result = formatIsoTimestampWithMicroseconds("2024-01-01T14:30:25Z");
      expect(result).toContain("14:30:25");
      expect(result).toContain("000000");
    });

    it("should extract microseconds correctly", () => {
      const result = formatIsoTimestampWithMicroseconds("2024-01-01T14:30:25.123456789Z");
      // Should truncate to 6 digits (microseconds)
      expect(result).toContain("14:30:25.123456");
    });

    it("should handle malformed timestamp gracefully", () => {
      const result = formatIsoTimestampWithMicroseconds("invalid-timestamp");
      expect(typeof result).toBe("string");
    });
  });
});

describe("TelegramDictFormatter", () => {
  describe("payload", () => {
    it("should format null payload as empty string", () => {
      const telegram = createMockTelegram({ payload: null });
      expect(TelegramDictFormatter.payload(telegram)).toBe("");
    });

    it("should format single number payload", () => {
      const telegram = createMockTelegram({ payload: 255 });
      expect(TelegramDictFormatter.payload(telegram)).toBe("255");
    });

    it("should format array payload as hex", () => {
      const telegram = createMockTelegram({ payload: [0x01, 0xff, 0x0a] });
      expect(TelegramDictFormatter.payload(telegram)).toBe("0x01ff0a");
    });

    it("should format empty array payload", () => {
      const telegram = createMockTelegram({ payload: [] });
      expect(TelegramDictFormatter.payload(telegram)).toBe("0x");
    });

    it("should format single byte array", () => {
      const telegram = createMockTelegram({ payload: [0x42] });
      expect(TelegramDictFormatter.payload(telegram)).toBe("0x42");
    });

    it("should pad single digit hex values", () => {
      const telegram = createMockTelegram({ payload: [0x01, 0x05, 0x0f] });
      expect(TelegramDictFormatter.payload(telegram)).toBe("0x01050f");
    });
  });

  describe("valueWithUnit", () => {
    it("should format null value as empty string", () => {
      const telegram = createMockTelegram({ value: null });
      expect(TelegramDictFormatter.valueWithUnit(telegram)).toBe("");
    });

    it("should format value without unit", () => {
      const telegram = createMockTelegram({ value: "On", unit: null });
      expect(TelegramDictFormatter.valueWithUnit(telegram)).toBe("On");
    });

    it("should format value with unit", () => {
      const telegram = createMockTelegram({ value: 23.5, unit: "°C" });
      expect(TelegramDictFormatter.valueWithUnit(telegram)).toBe("23.5 °C");
    });

    it("should format boolean values", () => {
      const telegram = createMockTelegram({ value: true });
      expect(TelegramDictFormatter.valueWithUnit(telegram)).toBe("true");
    });

    it("should format false boolean values", () => {
      const telegram = createMockTelegram({ value: false });
      expect(TelegramDictFormatter.valueWithUnit(telegram)).toBe("false");
    });

    it("should format number values with unit", () => {
      const telegram = createMockTelegram({ value: 42, unit: "%" });
      expect(TelegramDictFormatter.valueWithUnit(telegram)).toBe("42 %");
    });

    it("should format zero value", () => {
      const telegram = createMockTelegram({ value: 0, unit: "V" });
      expect(TelegramDictFormatter.valueWithUnit(telegram)).toBe("0 V");
    });
  });

  describe("timeWithMilliseconds", () => {
    it("should format time with milliseconds", () => {
      const telegram = createMockTelegram({ timestamp: "2024-01-01T14:30:25.123Z" });
      const result = TelegramDictFormatter.timeWithMilliseconds(telegram);
      // Result format should be HH:MM:SS.mmm
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    });

    it("should handle midnight timestamp", () => {
      const telegram = createMockTelegram({ timestamp: "2024-01-01T00:00:00.000Z" });
      const result = TelegramDictFormatter.timeWithMilliseconds(telegram);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    });

    it("should handle timestamp with microsecond precision", () => {
      const telegram = createMockTelegram({ timestamp: "2024-01-01T14:30:25.123456Z" });
      const result = TelegramDictFormatter.timeWithMilliseconds(telegram);
      // Should truncate to milliseconds
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    });
  });

  describe("dateWithMilliseconds", () => {
    it("should format date and time with milliseconds", () => {
      const telegram = createMockTelegram({ timestamp: "2024-01-01T14:30:25.123Z" });
      const result = TelegramDictFormatter.dateWithMilliseconds(telegram);
      // Should contain date and time components
      expect(result).toMatch(/\d+[./]\d+[./]\d+.+\d{2}:\d{2}:\d{2}[,.]\d{3}/);
    });

    it("should handle different date formats", () => {
      const telegram = createMockTelegram({ timestamp: "2024-12-31T23:59:59.999Z" });
      const result = TelegramDictFormatter.dateWithMilliseconds(telegram);
      expect(result).toMatch(/\d+[./]\d+[./]\d+.+\d{2}:\d{2}:\d{2}[,.]\d{3}/);
    });
  });

  describe("dptNumber", () => {
    it("should return empty string for null dpt_main", () => {
      const telegram = createMockTelegram({ dpt_main: null });
      expect(TelegramDictFormatter.dptNumber(telegram)).toBe("");
    });

    it("should format main DPT only", () => {
      const telegram = createMockTelegram({ dpt_main: 1, dpt_sub: null });
      expect(TelegramDictFormatter.dptNumber(telegram)).toBe("1");
    });

    it("should pad sub DPT correctly", () => {
      const telegram = createMockTelegram({ dpt_main: 9, dpt_sub: 7 });
      expect(TelegramDictFormatter.dptNumber(telegram)).toBe("9.007");
    });

    it("should handle large DPT numbers", () => {
      const telegram = createMockTelegram({ dpt_main: 20, dpt_sub: 102 });
      expect(TelegramDictFormatter.dptNumber(telegram)).toBe("20.102");
    });

    it("should handle zero sub DPT", () => {
      const telegram = createMockTelegram({ dpt_main: 5, dpt_sub: 0 });
      expect(TelegramDictFormatter.dptNumber(telegram)).toBe("5.000");
    });
  });

  describe("dptNameNumber", () => {
    it("should format DPT number with default prefix when no name", () => {
      const telegram = createMockTelegram({ dpt_main: 1, dpt_sub: 1, dpt_name: null });
      expect(TelegramDictFormatter.dptNameNumber(telegram)).toBe("DPT 1.001");
    });

    it("should format DPT number with name", () => {
      const telegram = createMockTelegram({ dpt_main: 1, dpt_sub: 1, dpt_name: "Switch" });
      expect(TelegramDictFormatter.dptNameNumber(telegram)).toBe("DPT 1.001 Switch");
    });

    it("should return just name when no DPT number", () => {
      const telegram = createMockTelegram({ dpt_main: null, dpt_name: "Custom Type" });
      expect(TelegramDictFormatter.dptNameNumber(telegram)).toBe("Custom Type");
    });

    it("should handle main DPT only with name", () => {
      const telegram = createMockTelegram({ dpt_main: 5, dpt_sub: null, dpt_name: "Percent" });
      expect(TelegramDictFormatter.dptNameNumber(telegram)).toBe("DPT 5 Percent");
    });

    it("should handle empty DPT name", () => {
      const telegram = createMockTelegram({ dpt_main: 1, dpt_sub: 1, dpt_name: "" });
      expect(TelegramDictFormatter.dptNameNumber(telegram)).toBe("DPT 1.001 ");
    });

    it("should handle both null main and name", () => {
      const telegram = createMockTelegram({ dpt_main: null, dpt_name: null });
      expect(TelegramDictFormatter.dptNameNumber(telegram)).toBe("DPT ");
    });
  });
});
