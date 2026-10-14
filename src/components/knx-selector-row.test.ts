import { describe, expect, it } from "vitest";

import { KnxSelectorRow } from "./knx-selector-row";

describe("duration selector row", () => {
  it("uses the KNX seconds adapter only for an explicit KNX duration selector", async () => {
    const row = new KnxSelectorRow();
    row.hass = { localize: () => "" } as unknown as typeof row.hass;
    row.key = "reset_after";
    row.value = 1.5;
    row.selector = {
      type: "knx_duration",
      name: "reset_after",
      selector: { duration: { allow_negative: false, enable_millisecond: true } },
    };
    document.body.append(row);
    try {
      await row.updateComplete;
      expect(row.shadowRoot!.querySelector("knx-duration-selector")).not.toBeNull();

      row.selector = {
        type: "ha_selector",
        name: "duration_object",
        selector: { duration: {} },
      };
      await row.updateComplete;
      expect(row.shadowRoot!.querySelector("knx-duration-selector")).toBeNull();
      expect(row.shadowRoot!.querySelector("ha-selector.newline-selector")).not.toBeNull();
    } finally {
      row.remove();
    }
  });

  it("keeps an absent duration disabled but accepts zero", () => {
    const row = new KnxSelectorRow();
    row.key = "reset_after";
    row.selector = {
      type: "knx_duration",
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
});
