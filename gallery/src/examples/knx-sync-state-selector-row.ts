import en from "../localize/en.json" with { type: "json" };
import { defineExample, valueChanged, localizeCallback } from "./helpers";

const copy = en.components["knx-sync-state-selector-row"];
export const entry = defineExample({
  tag: "knx-sync-state-selector-row",
  copy,
  properties: { key: "sync_state", value: true, allowFalse: true },
  events: ["value-changed"],
  suppliedProperties: ["hass"],
  callbacks: ["localizeFunction"],
  scenarios: [
    { id: "periodic", label: en.scenarios["periodic"], values: { value: "every 30" } },
    { id: "never", label: en.scenarios["never"], values: { value: false } },
  ],
  controls: { value: { choices: [true, false, "init", "expire 60", "every 30"] } },
  interaction: { state: ["value", "_minutes"] },
  async load() {
    const [{ html }] = await Promise.all([
      import("lit"),
      import("../../../src/components/knx-sync-state-selector-row"),
    ]);

    return {
      render: (env, values, _slots, emit) => {
        const changed = valueChanged(emit);
        const localize = localizeCallback(
          env,
          emit,
          "component.knx.config_panel.entities.create.light.knx",
        );
        return html`<knx-sync-state-selector-row
          .key=${values.key}
          .value=${values.value as string | boolean}
          .allowFalse=${values.allowFalse as boolean}
          .hass=${env.hass}
          .localizeFunction=${localize}
          @value-changed=${changed}
        ></knx-sync-state-selector-row>`;
      },
    };
  },
});
