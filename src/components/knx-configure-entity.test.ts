import { describe, expect, it } from "vitest";

import { KNXConfigureEntity } from "./knx-configure-entity";

describe("binary sensor reset after", () => {
  it("converts the Duration value to seconds before emitting configuration", () => {
    const element = new KNXConfigureEntity();
    element.platform = "binary_sensor";
    element.config = {
      entity: { name: "In operation", device_info: null, entity_category: null },
      knx: { reset_after: 90_000 },
    };
    const events: unknown[] = [];
    element.addEventListener("knx-entity-configuration-changed", (event) => {
      events.push((event as CustomEvent).detail);
    });
    const form = document.createElement("div") as HTMLDivElement & { key?: string };
    form.key = "knx";
    form.addEventListener("knx-form-config-changed", (event) =>
      element["_updateConfig"](event as CustomEvent),
    );
    form.dispatchEvent(
      new CustomEvent("knx-form-config-changed", {
        detail: {
          value: { reset_after: { days: 1, hours: 1, minutes: 0, seconds: 1, milliseconds: 500 } },
        },
      }),
    );

    expect(element.config.knx.reset_after).toBe(90_001.5);
    expect(events).toHaveLength(1);
  });
});
