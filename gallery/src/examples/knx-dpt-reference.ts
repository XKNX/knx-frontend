import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

export const entry = defineExample({
  tag: "knx-dpt-reference",
  copy: en.views["knx-dpt-reference"],
  category: "views",
  suppliedProperties: ["hass", "knx", "route", "narrow"],
  scenarios: [{ id: "empty", label: en.scenarios["empty"], values: {} }],
  interaction: { state: ["_filter"] },
  async load() {
    const [{ viewExample }] = await Promise.all([
      import("./view"),
      import("../../../src/views/dpt_reference"),
    ]);
    return viewExample("knx-dpt-reference", "/dpt_reference", {
      scenarios: { empty: { fixtures: { dptMetadata: {} } } },
    });
  },
});
