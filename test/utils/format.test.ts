import { describe, it, expect } from "vitest";
import { formatOffset } from "../../src/utils/format";

// Time constants for better readability
const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

describe("formatOffset", () => {
  it("should format minutes and seconds without hours", () => {
    const offset = new Date(2 * MINUTE_MS + 30 * SECOND_MS + 500);
    expect(formatOffset(offset)).toBe("02:30.500");
  });

  it("should format with hours when present", () => {
    const offset = new Date(2 * HOUR_MS + 15 * MINUTE_MS + 30 * SECOND_MS + 250);
    expect(formatOffset(offset)).toBe("02:15:30.250");
  });

  it("should handle large hour values (multi-day offsets)", () => {
    const offset = new Date(122 * HOUR_MS + 15 * MINUTE_MS + 30 * SECOND_MS + 250);
    expect(formatOffset(offset)).toBe("122:15:30.250");
  });

  it("should handle zero offset", () => {
    const offset = new Date(0);
    expect(formatOffset(offset)).toBe("00:00.000");
  });

  it("should pad single digit values correctly", () => {
    const offset = new Date(5 * HOUR_MS + 3 * MINUTE_MS + 7 * SECOND_MS + 9);
    expect(formatOffset(offset)).toBe("05:03:07.009");
  });

  it("should handle edge cases", () => {
    // Milliseconds only
    expect(formatOffset(new Date(123))).toBe("00:00.123");
    
    // Exactly 1 hour
    expect(formatOffset(new Date(HOUR_MS))).toBe("01:00:00.000");
    
    // Max values before next unit
    expect(formatOffset(new Date(59 * MINUTE_MS + 59 * SECOND_MS + 999))).toBe("59:59.999");
  });
});
