import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

const copy = en.dialogs["knx-send-dialog"];
export const entry = defineExample({
  tag: "knx-send-dialog",
  copy,
  category: "dialogs",
  events: ["value-changed"],
  suppliedProperties: ["params"],
  interaction: { state: ["_data"] },
  async load() {
    const { dialogButton } = await import("./dialog");
    await import("../../../src/dialogs/knx-send-dialog");
    return {
      render: (env, _values, _slots, emit) =>
        dialogButton(env, emit, "knx-send-dialog", { hass: env.hass, knx: env.knx }),
    };
  },
});
