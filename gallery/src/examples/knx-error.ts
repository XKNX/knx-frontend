import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

export const entry = defineExample({
  tag: "knx-error",
  copy: en.views["knx-error"],
  category: "views",
  covers: ["knx-error", "knx-status-page", "knx-bus-scene"],
  suppliedProperties: ["hass", "knx", "route", "narrow"],
  async load() {
    const [{ viewExample }] = await Promise.all([
      import("./view"),
      import("../../../src/views/error"),
    ]);
    return viewExample("knx-error", "/error");
  },
});
