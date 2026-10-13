import { describe, expect, it } from "vitest";

import { KNXConfigureEntity } from "./knx-configure-entity";
import type { SelectorSchema } from "../types/schema";

const backendSchema: SelectorSchema[] = [
  {
    type: "ha_selector",
    name: "reset_after",
    selector: { number: { min: 0, step: 0.001, mode: "box", unit_of_measurement: "s" } },
  },
];

describe("binary sensor reset after", () => {
  it("uses the nonnegative Duration selector with days and milliseconds", () => {
    const element = new KNXConfigureEntity();
    element.schema = backendSchema;
    element.platform = "binary_sensor";

    expect(element["_formSchema"][0]).toMatchObject({
      name: "reset_after",
      selector: {
        duration: { allow_negative: false, enable_day: true, enable_millisecond: true },
      },
    });
    expect(backendSchema[0]).toHaveProperty("selector.number");

    element.platform = "sensor";
    expect(element["_formSchema"]).toBe(backendSchema);
  });

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
