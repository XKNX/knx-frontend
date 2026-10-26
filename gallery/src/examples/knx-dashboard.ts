import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

export const entry = defineExample({
  tag: "knx-dashboard",
  copy: en.views["knx-dashboard"],
  category: "views",
  suppliedProperties: ["hass", "knx", "route", "narrow"],
  scenarios: [{ id: "no-project", label: en.scenarios["no-project"], values: {} }],
  interaction: {
    dialogOpeners: {
      "knx-send-dialog": "_openSendDialog",
      "knx-project-upload-dialog": "_openProjectUploadDialog",
      "knx-time-server-dialog": "_openTimeServerDialog",
    },
  },
  async load() {
    const [{ viewExample }] = await Promise.all([
      import("./view"),
      import("../../../src/views/dashboard"),
    ]);
    return viewExample("knx-dashboard", "/dashboard", {
      scenarios: { "no-project": { fixtures: { project: null }, projectContext: null } },
    });
  },
});
