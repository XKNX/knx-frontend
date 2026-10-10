import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

export const entry = defineExample({
  tag: "knx-create-entity",
  copy: en.views["knx-create-entity"],
  category: "views",
  suppliedProperties: ["hass", "knx", "route", "narrow"],
  scenarios: [
    { id: "create", label: en.scenarios["create"], values: {} },
    { id: "empty", label: en.scenarios["empty"], values: {} },
    { id: "validation-error", label: en.scenarios["validation-error"], values: {} },
    { id: "fetch-error", label: en.scenarios["fetch-error"], values: {} },
  ],
  interaction: {
    state: ["_config", "_mode", "_yamlErrors", "_validationErrors", "_validationBaseError"],
  },
  async load() {
    const [{ viewExample }] = await Promise.all([
      import("./view"),
      import("../../../src/views/entities_create"),
    ]);
    return viewExample("knx-create-entity", "/entities/edit/light.living_room", {
      scenarios: {
        create: { path: "/entities/create/light" },
        empty: { path: "/entities/create" },
        "validation-error": { fixtures: { failEntityValidation: true } },
        "fetch-error": { fixtures: { failCalls: ["knx/get_entity_config"] } },
      },
    });
  },
});
