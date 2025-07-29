import { describe, it, expect } from "vitest";
import { formatOffset } from "../../src/utils/format";

describe("formatOffset", () => {
  it("should format minutes and seconds without hours", () => {
    const offset = new Date(2 * 60 * 1000 + 30 * 1000 + 500);
    expect(formatOffset(offset)).toBe("02:30.500");
  });

  it("should format with hours when present", () => {
    const offset = new Date(2 * 60 * 60 * 1000 + 15 * 60 * 1000 + 30 * 1000 + 250);
    expect(formatOffset(offset)).toBe("02:15:30.250");
  });

  it("should handle large hour values (multi-day offsets)", () => {
    const offset = new Date(122 * 60 * 60 * 1000 + 15 * 60 * 1000 + 30 * 1000 + 250);
    expect(formatOffset(offset)).toBe("122:15:30.250");
  });

  it("should handle zero offset", () => {
    const offset = new Date(0);
    expect(formatOffset(offset)).toBe("00:00.000");
  });

  it("should pad single digit values correctly", () => {
    const offset = new Date(5 * 60 * 60 * 1000 + 3 * 60 * 1000 + 7 * 1000 + 9);
    expect(formatOffset(offset)).toBe("05:03:07.009");
  });

  it("should handle edge cases", () => {
    // Milliseconds only
    expect(formatOffset(new Date(123))).toBe("00:00.123");
    
    // Exactly 1 hour
    expect(formatOffset(new Date(60 * 60 * 1000))).toBe("01:00:00.000");
    
    // Max values before next unit
    expect(formatOffset(new Date(59 * 60 * 1000 + 59 * 1000 + 999))).toBe("59:59.999");
  });
});
