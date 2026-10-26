import type { Ref } from "lit/directives/ref";
import en from "../localize/en.json" with { type: "json" };
import { defineExample, observe } from "./helpers";

const copy = en.components["knx-device-picker"];
export const entry = defineExample({
  tag: "knx-device-picker",
  copy,
  properties: {
    label: "KNX device",
    helper: "Choose a device from the offline project.",
    value: "1.1.1",
  },
  events: ["value-changed", "show-dialog"],
  suppliedProperties: ["hass", "picker"],
  methods: ["open()", "focus()"],
  scenarios: [{ id: "empty", label: en.scenarios["empty"], values: { value: "" } }],
  interaction: {
    state: ["value", "_deviceId", "_opened", "_allDevices"],
    dialogOpeners: { "knx-device-create-dialog": "_openCreateDeviceDialog" },
  },
  async load() {
    const [{ html }] = await Promise.all([
      import("lit"),
      import("../../../src/components/knx-device-picker"),
    ]);

    const { createRef, ref } = await import("lit/directives/ref");
    const picker: Ref<HTMLElementTagNameMap["knx-device-picker"]> = createRef();

    return {
      render: (env, values, _slots, emit) => {
        const on = observe(emit);
        const pickerAction = async (_event: Event, method: "open" | "focus") => {
          await picker.value![method]();
          emit({ kind: "callback", name: method, timestamp: Date.now(), args: null });
        };
        const openPicker = (event: Event) => pickerAction(event, "open");
        const focusPicker = (event: Event) => pickerAction(event, "focus");
        return html`<knx-device-picker
            ${ref(picker)}
            .label=${values.label as string}
            .helper=${values.helper as string}
            .value=${values.value as string}
            .hass=${env.hass}
            @value-changed=${on}
            @show-dialog=${on}
          ></knx-device-picker
          ><button @click=${openPicker}>${en.sample.open}</button
          ><button @click=${focusPicker}>${en.sample.focus}</button>`;
      },
    };
  },
});
