import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

export const entry = defineExample({
  tag: "knx-frontend",
  copy: en.views["knx-frontend"],
  category: "views",
  suppliedProperties: ["hass", "knx", "route", "narrow"],
  scenarios: [
    {
      id: "route-not-found",
      label: en.scenarios["route-not-found"],
      shortLabel: en.scenarioShortLabels["route-not-found"],
      values: {},
    },
    {
      id: "route-entities",
      label: en.scenarios["route-entities"],
      shortLabel: en.scenarioShortLabels["route-entities"],
      values: {},
    },
    {
      id: "route-expose",
      label: en.scenarios["route-expose"],
      shortLabel: en.scenarioShortLabels["route-expose"],
      values: {},
    },
    {
      id: "route-project",
      label: en.scenarios["route-project"],
      shortLabel: en.scenarioShortLabels["route-project"],
      values: {},
    },
    {
      id: "route-monitor",
      label: en.scenarios["route-monitor"],
      shortLabel: en.scenarioShortLabels["route-monitor"],
      values: {},
    },
    {
      id: "route-entity-create",
      label: en.scenarios["route-entity-create"],
      shortLabel: en.scenarioShortLabels["route-entity-create"],
      values: {},
    },
    {
      id: "route-expose-create",
      label: en.scenarios["route-expose-create"],
      shortLabel: en.scenarioShortLabels["route-expose-create"],
      values: {},
    },
  ],
  covers: [
    "knx-frontend",
    "knx-router",
    "knx-entities-router",
    "knx-expose-router",
    "knx-not-found",
  ],
  async load() {
    const [{ viewExample }] = await Promise.all([import("./view"), import("../../../src/main")]);
    return viewExample("knx-frontend", "/dashboard", {
      fixtures: { enableMonitor: true, streamTelegrams: true },
      resetMonitorCache: true,
      scenarios: {
        "route-not-found": { path: "/gallery-missing-page" },
        "route-entities": { path: "/entities" },
        "route-expose": { path: "/expose" },
        "route-project": { path: "/project" },
        "route-monitor": { path: "/group_monitor" },
        "route-entity-create": { path: "/entities/create/light" },
        "route-expose-create": { path: "/expose/create/sensor.room_temperature" },
      },
    });
  },
});
