import { describe, expect, it } from "vitest";
import { fitScale, stepScale } from "./canvas-navigation";

describe("canvas zoom", () => {
  it("fits both axes without enlarging a small board or imposing a zoom floor", () => {
    expect(fitScale({ width: 800, height: 500 }, { width: 2000, height: 2000 }, 1)).toBe(0.25);
    expect(fitScale({ width: 800, height: 500 }, { width: 200, height: 100 }, 0.5)).toBe(1);
    expect(fitScale({ width: 200, height: 200 }, { width: 10000, height: 100 }, 1)).toBe(0.02);
  });
  it("keeps the previous scale for hidden or invalid geometry", () => {
    for (const invalid of [0, -1, NaN, Infinity]) {
      expect(fitScale({ width: invalid, height: 500 }, { width: 200, height: 100 }, 0.5)).toBe(0.5);
      expect(fitScale({ width: 800, height: 500 }, { width: 200, height: invalid }, 0.5)).toBe(0.5);
    }
  });
  it("steps manual zoom in rounded tenths within 10–200 percent", () => {
    expect(stepScale(1, 1)).toBe(1.1);
    expect(stepScale(1.1, -1)).toBe(1);
    expect(stepScale(0.04, -1)).toBe(0.1);
    expect(stepScale(2, 1)).toBe(2);
  });
});
