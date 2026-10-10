import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

export const entry = defineExample({
  tag: "knx-expose-view",
  copy: en.views["knx-expose-view"],
  category: "views",
  suppliedProperties: ["hass", "knx", "route", "narrow"],
  scenarios: [{ id: "empty", label: en.scenarios["empty"], values: {} }],
  interaction: {
    state: ["_filters", "_expandedFilter", "_activeGrouping", "_activeSorting", "_storedColumns"],
  },
  async load() {
    const [{ viewExample }] = await Promise.all([
      import("./view"),
      import("../../../src/views/expose_view"),
    ]);
    return viewExample("knx-expose-view", "/expose", {
      scenarios: {
        empty: { fixtures: { emptyExposes: true, reloadExposeContext: true } },
      },
    });
  },
});
