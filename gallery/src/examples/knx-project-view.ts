import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

export const entry = defineExample({
  tag: "knx-project-view",
  copy: en.views["knx-project-view"],
  category: "views",
  suppliedProperties: ["hass", "knx", "route", "narrow"],
  scenarios: [
    { id: "no-project", label: en.scenarios["no-project"], values: {} },
    { id: "empty", label: en.scenarios["empty"], values: {} },
    { id: "fetch-error", label: en.scenarios["fetch-error"], values: {} },
  ],
  interaction: {
    state: [
      "rangeSelectorHidden",
      "_visibleGroupAddresses",
      "_viewMode",
      "_devicesShowFilters",
      "_devicesSearchText",
      "_devicesExpandedFilter",
      "_devicesFilterDpt",
      "_devicesFilterLocation",
      "_devicesFilterLine",
      "_storedColumns",
    ],
  },
  async load() {
    const [{ viewExample }, { createKnxFixtures }] = await Promise.all([
      import("./view"),
      import("../fixtures/knx"),
      import("../../../src/views/project_view"),
    ]);
    const emptyProject = {
      info: createKnxFixtures().project.info,
      group_addresses: {},
      group_ranges: {},
      devices: {},
      communication_objects: {},
    };
    return viewExample("knx-project-view", "/project", {
      scenarios: {
        "no-project": { fixtures: { project: null }, projectContext: null },
        empty: { fixtures: { project: emptyProject }, projectContext: emptyProject },
        "fetch-error": { fixtures: { failCalls: ["knx/group_telegrams"] } },
      },
    });
  },
});
