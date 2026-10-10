import en from "../localize/en.json" with { type: "json" };
import { defineExample, observe, valueChanged } from "./helpers";

const copy = en.components["knx-dpt-option-selector"];
export const entry = defineExample({
  tag: "knx-dpt-option-selector",
  copy,
  properties: {
    value: "1.001",
    label: "Datapoint type",
    disabled: false,
    invalid: false,
    invalidMessage: "",
    translation_key: "dpt",
  },
  suppliedProperties: ["options"],
  callbacks: ["localizeValue"],
  events: ["value-changed", "knx-dpt-selector-changed"],
  scenarios: [
    { id: "disabled", label: en.scenarios["disabled"], values: { disabled: true } },
    {
      id: "invalid",
      label: en.scenarios["invalid"],
      values: { invalid: true, invalidMessage: "Choose a valid group address." },
    },
  ],
  interaction: { state: ["value"] },
  async load() {
    const [{ html }] = await Promise.all([
      import("lit"),
      import("../../../src/components/knx-dpt-option-selector"),
    ]);

    return {
      render: (_env, values, _slots, emit) => {
        const on = observe(emit);
        const changed = valueChanged(emit);
        const localize = (key: string) => {
          const result = key.endsWith("switch") ? en.sample.switch : en.sample.temperature;
          emit({
            kind: "callback",
            name: "localizeValue",
            timestamp: Date.now(),
            args: { key, result },
          });
          return result;
        };
        return html`<knx-dpt-option-selector
          .value=${values.value as string}
          .label=${values.label as string}
          .disabled=${values.disabled as boolean}
          .invalid=${values.invalid as boolean}
          .invalidMessage=${values.invalidMessage as string}
          .translation_key=${values.translation_key as string}
          .options=${[
            { value: "1.001", translation_key: "switch", dpt: { main: 1, sub: 1 } },
            { value: "9.001", translation_key: "temperature", dpt: { main: 9, sub: 1 } },
          ]}
          .localizeValue=${localize}
          @value-changed=${changed}
          @knx-dpt-selector-changed=${on}
        ></knx-dpt-option-selector>`;
      },
    };
  },
});
