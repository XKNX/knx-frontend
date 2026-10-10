import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

export const entry = defineExample({
  tag: "knx-create-expose",
  copy: en.views["knx-create-expose"],
  category: "views",
  suppliedProperties: ["hass", "knx", "route", "narrow"],
  scenarios: [
    { id: "empty", label: en.scenarios["empty"], values: {} },
    { id: "validation-error", label: en.scenarios["validation-error"], values: {} },
    { id: "fetch-error", label: en.scenarios["fetch-error"], values: {} },
  ],
  interaction: {
    state: [
      "_entityId",
      "_config",
      "_mode",
      "_showRawValues",
      "_showNotesDialog",
      "_yamlErrors",
      "_validationErrors",
      "_validationBaseError",
    ],
  },
  async load() {
    const [{ viewExample }] = await Promise.all([
      import("./view"),
      import("../../../src/views/expose_create"),
    ]);
    return viewExample("knx-create-expose", "/expose/edit/sensor.room_temperature", {
      scenarios: {
        empty: { path: "/expose/create", fixtures: { emptyExposes: true } },
        "validation-error": { fixtures: { failExposeValidation: true } },
        "fetch-error": { fixtures: { failCalls: ["knx/get_expose_config"] } },
      },
    });
  },
});
