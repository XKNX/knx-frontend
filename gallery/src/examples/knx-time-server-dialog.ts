import type { CreateEntityResult } from "../../../src/types/entity_data";
import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

const copy = en.dialogs["knx-time-server-dialog"];
export const entry = defineExample({
  tag: "knx-time-server-dialog",
  copy,
  category: "dialogs",
  suppliedProperties: ["params"],
  scenarios: [{ id: "validation-error", label: en.scenarios["validation-error"], values: {} }],
  interaction: { state: ["_data", "_errors"] },
  async load() {
    const { dialogButton } = await import("./dialog");
    await import("../../../src/dialogs/knx-time-server-dialog");
    return {
      async prepare(env, scenario) {
        env.fixtures.prepare((data) => {
          data.time = {
            time: { write: "1/0/3" },
            date: { write: "1/0/4" },
            datetime: { write: "1/0/5" },
          };
        });
        env.mockWS("knx/update_time_server_config", (message): CreateEntityResult => {
          if (scenario === "validation-error") {
            return {
              success: false,
              error_base: "invalid_address",
              errors: [{ path: [], message: en.dialogs.validationError, code: "invalid_address" }],
            };
          }
          env.fixtures.commit((data) => {
            data.time = message.config;
          });
          return { success: true, entity_id: null };
        });
      },
      render: (env, _values, _slots, emit) =>
        dialogButton(env, emit, "knx-time-server-dialog", { hass: env.hass, knx: env.knx }),
    };
  },
});
