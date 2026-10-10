import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

export const entry = defineExample({
  tag: "knx-info",
  copy: en.views["knx-info"],
  category: "views",
  suppliedProperties: ["hass", "knx", "route", "narrow"],
  scenarios: [{ id: "no-project", label: en.scenarios["no-project"], values: {} }],
  async load() {
    const [{ viewExample }] = await Promise.all([
      import("./view"),
      import("../../../src/views/info"),
    ]);
    return viewExample("knx-info", "/info", {
      scenarios: { "no-project": { fixtures: { project: null }, projectContext: null } },
    });
  },
});
