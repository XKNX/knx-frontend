import en from "../localize/en.json" with { type: "json" };
import { defineExample, observe } from "./helpers";

const copy = en.components["knx-single-address-selector"];
export const entry = defineExample({
  tag: "knx-single-address-selector",
  copy,
  properties: {
    key: "ga_switch.write",
    index: 0,
    hintMessage: "",
    value: "1/0/1",
    label: "Write address",
    parentLabel: "Switch",
    disabled: false,
    invalid: false,
    invalidMessage: "",
    required: true,
  },
  events: ["value-changed", "show-dialog"],
  suppliedProperties: ["groupAddresses"],
  scenarios: [
    { id: "disabled", label: en.scenarios["disabled"], values: { disabled: true } },
    {
      id: "invalid",
      label: en.scenarios["invalid"],
      values: { value: "wrong", invalid: true, invalidMessage: "Choose a valid group address." },
    },
    { id: "empty", label: en.scenarios["empty"], values: { value: "" } },
  ],
  interaction: { state: ["value"], dialogOpeners: { "knx-ga-select-dialog": "_openDialog" } },
  async load() {
    const [{ html }] = await Promise.all([
      import("lit"),
      import("../../../src/components/knx-single-address-selector"),
    ]);
    const { createKnxFixtures } = await import("../fixtures/knx");
    const project = createKnxFixtures().project;
    return {
      render: (_env, values, _slots, emit) => {
        const on = observe(emit);
        return html`<knx-single-address-selector
          .key=${values.key}
          .index=${values.index as number}
          .hintMessage=${values.hintMessage as string}
          .value=${values.value as string}
          .label=${values.label as string}
          .parentLabel=${values.parentLabel as string}
          .disabled=${values.disabled as boolean}
          .invalid=${values.invalid as boolean}
          .invalidMessage=${values.invalidMessage as string}
          .required=${values.required as boolean}
          .groupAddresses=${Object.values(project.group_addresses)}
          @value-changed=${on}
          @show-dialog=${on}
        ></knx-single-address-selector>`;
      },
    };
  },
});
