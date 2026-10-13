import { describe, expect, it } from "vitest";

import { KnxSelectorRow } from "./knx-selector-row";

describe("duration selector row", () => {
  it("keeps an absent duration disabled but accepts zero", () => {
    const row = new KnxSelectorRow();
    row.key = "reset_after";
    row.selector = {
      type: "ha_selector",
      name: "reset_after",
      selector: {
        duration: { allow_negative: false, enable_day: true, enable_millisecond: true },
      },
    };
    row.value = null;
    row["willUpdate"](new Map([["selector", undefined]]));
    expect(row["_enabled"]).toBe(false);

    row.value = 0;
    row["willUpdate"](new Map([["selector", undefined]]));
    expect(row["_enabled"]).toBe(true);
  });

  it("splits a fractional interval into seconds and milliseconds", () => {
    const row = new KnxSelectorRow();
    row.key = "reset_after";
    row.selector = {
      type: "ha_selector",
      name: "reset_after",
      selector: {
        duration: { allow_negative: false, enable_day: true, enable_millisecond: true },
      },
    };
    row.value = 90_001.5;

    row["willUpdate"](new Map([["selector", undefined]]));

    expect(row["_haSelectorValue"]).toEqual({
      days: 1,
      hours: 1,
      minutes: 0,
      seconds: 1,
      milliseconds: 500,
    });
  });
});
