import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

export const entry = defineExample({
  tag: "knx-entities-view",
  copy: en.views["knx-entities-view"],
  category: "views",
  suppliedProperties: ["hass", "knx", "route", "narrow"],
  scenarios: [
    { id: "empty", label: en.scenarios["empty"], values: {} },
    { id: "fetch-error", label: en.scenarios["fetch-error"], values: {} },
  ],
  interaction: {
    state: ["_filters", "_expandedFilter", "_activeGrouping", "_activeSorting", "_storedColumns"],
  },
  async load() {
    const [{ viewExample }] = await Promise.all([
      import("./view"),
      import("../../../src/views/entities_view"),
    ]);
    return viewExample("knx-entities-view", "/entities", {
      scenarios: {
        empty: { fixtures: { emptyEntities: true } },
        "fetch-error": { entityGroupsError: en.views.fetchError },
      },
    });
  },
});
