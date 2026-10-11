import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

export const entry = defineExample({
  tag: "knx-group-monitor",
  copy: en.views["knx-group-monitor"],
  category: "views",
  suppliedProperties: ["hass", "knx", "route", "narrow"],
  scenarios: [
    { id: "paused", label: en.scenarios["paused"], values: {} },
    { id: "empty", label: en.scenarios["empty"], values: {} },
    { id: "fetch-error", label: en.scenarios["fetch-error"], values: {} },
  ],
  interaction: {
    state: [
      "_projectAlertDismissed",
      "_storedColumns",
      "controller._filters",
      "controller._sortColumn",
      "controller._sortDirection",
      "controller._expandedFilter",
      "controller._isReloadEnabled",
      "controller._isPaused",
      "controller._timeDeltaBefore",
      "controller._timeDeltaAfter",
      "controller._filterStartMs",
      "controller._filterEndMs",
    ],
    dialogOpeners: { "knx-project-upload-dialog": "_openProjectUploadDialog" },
  },
  async load() {
    const [{ viewExample }] = await Promise.all([
      import("./view"),
      import("../../../src/features/group-monitor/views/group-monitor-view"),
    ]);
    return viewExample("knx-group-monitor", "/group_monitor", {
      fixtures: { enableMonitor: true, streamTelegrams: true },
      resetMonitorCache: true,
      scenarios: {
        paused: { paused: true },
        empty: { fixtures: { emptyTelegrams: true } },
        "fetch-error": { fixtures: { failCalls: ["knx/group_monitor_info"] } },
      },
    });
  },
});
