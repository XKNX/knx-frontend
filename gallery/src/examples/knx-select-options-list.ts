import en from "../localize/en.json" with { type: "json" };
import { defineExample, valueChanged, localizeCallback } from "./helpers";

const copy = en.components["knx-select-options-list"];
export const entry = defineExample({
  tag: "knx-select-options-list",
  copy,
  properties: { key: "options", gaKey: "ga_switch", dpt: "1.001", required: true },
  exampleOptions: { invalid: false },
  events: ["value-changed"],
  suppliedProperties: ["hass", "knx", "validationErrors", "value"],
  callbacks: ["localizeFunction"],
  scenarios: [
    { id: "optional", label: en.scenarios["optional"], values: { required: false } },
    { id: "raw", label: en.scenarios["raw"], values: { dpt: "" } },
    { id: "invalid", label: en.scenarios["invalid"], values: { invalid: true } },
  ],
  controls: { dpt: { choices: ["1.001", "9.001", ""] } },
  interaction: { state: ["value", "_linkedDpt", "_payloadLength"] },
  async load() {
    const [{ html }] = await Promise.all([
      import("lit"),
      import("../../../src/components/knx-select-options-list"),
    ]);
    const options = [{ option: en.sample.content, value: 1 }];
    return {
      render: (env, values, _slots, emit) => {
        const changed = valueChanged(emit);
        const localize = localizeCallback(
          env,
          emit,
          "component.knx.config_panel.entities.create.light.knx",
        );
        return html`<knx-select-options-list
          .key=${values.key}
          .gaKey=${values.gaKey as string}
          .required=${values.required as boolean}
          .hass=${env.hass}
          .knx=${env.knx}
          .dpt=${(values.dpt as string) || undefined}
          .value=${options}
          .validationErrors=${values.invalid ? [{ path: [], message: en.sample.invalid, code: null }] : undefined}
          .localizeFunction=${localize}
          @value-changed=${changed}
        ></knx-select-options-list>`;
      },
    };
  },
});
