import { describe, expect, it } from "vitest";

import { durationDataToSeconds, secondsToDurationData } from "./duration";

describe("secondsToDurationData", () => {
  it("splits seconds into every duration unit", () => {
    expect(secondsToDurationData(90_001.5)).toEqual({
      days: 1,
      hours: 1,
      minutes: 0,
      seconds: 1,
      milliseconds: 500,
    });
  });

  it("keeps zero as an all-zero duration", () => {
    expect(secondsToDurationData(0)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    });
  });

  it("rounds to whole milliseconds", () => {
    expect(secondsToDurationData(1.0005)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 1,
      milliseconds: 1,
    });
    expect(secondsToDurationData(0.9999)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 1,
      milliseconds: 0,
    });
  });

  it("round-trips through durationDataToSeconds", () => {
    expect(durationDataToSeconds(secondsToDurationData(3_723.25))).toBe(3_723.25);
  });
});
