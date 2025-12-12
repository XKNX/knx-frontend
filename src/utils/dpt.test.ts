import { describe, expect, it } from "vitest";
import { compareDpt, dptToString, stringToDpt, dptInClasses } from "./dpt";
import type { DPT, DPTMetadata } from "../types/websocket";

describe("dptToString", () => {
  it("should return empty string for null DPT", () => {
    expect(dptToString(null)).toBe("");
  });

  it("should format main DPT only", () => {
    const dpt: DPT = { main: 1, sub: null };
    expect(dptToString(dpt)).toBe("1");
  });

  it("should format main and sub DPT with padding", () => {
    const dpt: DPT = { main: 1, sub: 1 };
    expect(dptToString(dpt)).toBe("1.001");
  });

  it("should handle large DPT numbers", () => {
    const dpt: DPT = { main: 20, sub: 102 };
    expect(dptToString(dpt)).toBe("20.102");
  });
});

describe("stringToDpt", () => {
  it("should parse main segment only", () => {
    expect(stringToDpt("5")).toEqual({ main: 5, sub: null });
  });

  it("should parse main and sub segments with padding", () => {
    expect(stringToDpt("9.007")).toEqual({ main: 9, sub: 7 });
  });

  it("should handle larger sub numbers", () => {
    expect(stringToDpt("20.102")).toEqual({ main: 20, sub: 102 });
  });

  it("should ignore surrounding whitespace", () => {
    expect(stringToDpt("  15.001 \n")).toEqual({ main: 15, sub: 1 });
  });

  it("should return null for empty string", () => {
    expect(stringToDpt("")).toBeNull();
  });

  it("should return null for invalid main segment", () => {
    expect(stringToDpt("abc")).toBeNull();
  });

  it("should return null for invalid sub segment", () => {
    expect(stringToDpt("1.xyz")).toBeNull();
  });

  it("should return null for trailing separator", () => {
    expect(stringToDpt("3.")).toBeNull();
  });

  it("should return null when more than one separator is present", () => {
    expect(stringToDpt("1.2.3")).toBeNull();
  });
});

describe("compareDpt", () => {
  it("should sort by main value first", () => {
    const dpts = [
      { main: 6, sub: null },
      { main: 5, sub: 3 },
      { main: 4, sub: null },
    ];
    const sorted = [...dpts].sort(compareDpt);
    expect(sorted.map((dpt) => dpt.main)).toEqual([4, 5, 6]);
  });

  it("should place null sub before numeric sub", () => {
    const a = { main: 5, sub: null };
    const b = { main: 5, sub: 1 };
    expect(compareDpt(a, b)).toBeLessThan(0);
    expect(compareDpt(b, a)).toBeGreaterThan(0);
  });

  it("should compare numeric sub values when both present", () => {
    const a = { main: 5, sub: 1 };
    const b = { main: 5, sub: 10 };
    expect(compareDpt(a, b)).toBeLessThan(0);
    expect(compareDpt(b, a)).toBeGreaterThan(0);
  });

  it("should consider equal DPTs as equivalent", () => {
    const a = { main: 7, sub: 1 };
    const b = { main: 7, sub: 1 };
    expect(compareDpt(a, b)).toBe(0);
  });
});

describe("dptInClasses", () => {
  const mockMetadata: Record<string, DPTMetadata> = {
    "1.001": { main: 1, sub: 1, name: "Switch", unit: "", dpt_class: "enum" },
    "5": { main: 5, sub: null, name: "Unsigned", unit: "", dpt_class: "numeric" },
    "5.001": { main: 5, sub: 1, name: "Percentage", unit: "%", dpt_class: "numeric" },
    "9.001": { main: 9, sub: 1, name: "Temperature", unit: "°C", dpt_class: "numeric" },
    "16.001": { main: 16, sub: 1, name: "String", unit: "", dpt_class: "string" },
  };

  it("should return true when DPT is in specified class", () => {
    const dpt: DPT = { main: 1, sub: 1 };
    expect(dptInClasses(dpt, ["enum"], mockMetadata)).toBe(true);
  });

  it("should return true when DPT is in one of multiple classes", () => {
    const dpt: DPT = { main: 9, sub: 1 };
    expect(dptInClasses(dpt, ["numeric", "string"], mockMetadata)).toBe(true);
  });

  it("should return false when DPT is not in any specified class", () => {
    const dpt: DPT = { main: 1, sub: 1 };
    expect(dptInClasses(dpt, ["numeric", "string"], mockMetadata)).toBe(false);
  });

  it("should return false when DPT is not in any specified class", () => {
    const dpt: DPT = { main: 16, sub: 1 };
    expect(dptInClasses(dpt, ["numeric"], mockMetadata)).toBe(false);
  });

  it("should return false when DPT is not in metadata", () => {
    const dpt: DPT = { main: 99, sub: 99 };
    expect(dptInClasses(dpt, ["numeric"], mockMetadata)).toBe(false);
  });

  it("should return false for main-only DPT when only full DPT exists in metadata", () => {
    const dpt: DPT = { main: 9, sub: null };
    expect(dptInClasses(dpt, ["numeric"], mockMetadata)).toBe(false);
  });

  it("should return true for main-only DPT when it exists in metadata", () => {
    const dpt: DPT = { main: 5, sub: null };
    expect(dptInClasses(dpt, ["numeric"], mockMetadata)).toBe(true);
  });

  it("should handle empty class list", () => {
    const dpt: DPT = { main: 1, sub: 1 };
    expect(dptInClasses(dpt, [], mockMetadata)).toBe(false);
  });
});
