import en from "../localize/en.json" with { type: "json" };
import { defineExample, observe } from "./helpers";

const copy = en.components["knx-dpt-dialog-selector"];
export const entry = defineExample({
  tag: "knx-dpt-dialog-selector",
  copy,
  properties: {
    key: "ga_switch",
    parentLabel: "Switch",
    validDPTs: ["1.001", "9.001"],
    value: "1.001",
    disabled: false,
    invalid: false,
    invalidMessage: "",
    translation_key: "ga_switch",
  },
  events: ["value-changed", "knx-dpt-selector-changed", "show-dialog"],
  suppliedProperties: ["knx"],
  scenarios: [
    { id: "empty", label: en.scenarios["empty"], values: { value: "" } },
    {
      id: "invalid",
      label: en.scenarios["invalid"],
      values: { invalid: true, invalidMessage: "Choose a valid group address." },
    },
  ],
  interaction: { state: ["value"], dialogOpeners: { "knx-dpt-select-dialog": "_openDialog" } },
  controls: {
    validDPTs: {
      validate: (value) =>
        Array.isArray(value) && value.every((item) => typeof item === "string")
          ? undefined
          : en.validation.invalidValue,
    },
  },
  async load() {
    const [{ html }] = await Promise.all([
      import("lit"),
      import("../../../src/components/knx-dpt-dialog-selector"),
    ]);

    return {
      render: (env, values, _slots, emit) => {
        const on = observe(emit);
        return html`<knx-dpt-dialog-selector
          .key=${values.key}
          .parentLabel=${values.parentLabel as string}
          .validDPTs=${values.validDPTs as string[]}
          .value=${values.value as string}
          .disabled=${values.disabled as boolean}
          .invalid=${values.invalid as boolean}
          .invalidMessage=${values.invalidMessage as string}
          .translation_key=${values.translation_key as string}
          .knx=${env.knx}
          @value-changed=${on}
          @knx-dpt-selector-changed=${on}
          @show-dialog=${on}
        ></knx-dpt-dialog-selector>`;
      },
    };
  },
});
