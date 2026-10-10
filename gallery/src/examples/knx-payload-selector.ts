import en from "../localize/en.json" with { type: "json" };
import { defineExample, valueChanged, localizeCallback } from "./helpers";

const copy = en.components["knx-payload-selector"];
export const entry = defineExample({
  tag: "knx-payload-selector",
  copy,
  properties: {
    key: "payload",
    gaKey: "ga_switch",
    dpt: "9.001",
    required: true,
    disableRaw: false,
    rawLength: 2,
  },
  exampleOptions: { externalLength: false, raw: false, numberValue: 21.5, invalid: false },
  events: ["value-changed"],
  suppliedProperties: ["hass", "knx", "validationErrors", "value"],
  callbacks: ["localizeFunction"],
  scenarios: [
    { id: "raw", label: en.scenarios["raw"], values: { raw: true } },
    { id: "no-dpt", label: en.scenarios["no-dpt"], values: { dpt: "", raw: true } },
    { id: "invalid", label: en.scenarios["invalid"], values: { invalid: true } },
  ],
  controls: { dpt: { choices: ["9.001", "1.001", ""] } },
  interaction: {
    state: [
      "value",
      "_mode",
      "_typedValue",
      "_rawPayload",
      "_rawLength",
      "_linkedDpt",
      "_rawPayloadBase",
    ],
    localProperties: ["dpt", "rawLength"],
  },
  async load() {
    const [{ html }, { keyed }] = await Promise.all([
      import("lit"),
      import("lit/directives/keyed"),
      import("../../../src/components/knx-payload-selector"),
    ]);

    return {
      render: (env, values, _slots, emit) => {
        const changed = valueChanged(emit);
        const localize = localizeCallback(
          env,
          emit,
          "component.knx.config_panel.entities.create.light.knx",
        );
        // The product seeds its editor only on initialization; unrelated controls retain it.
        return html`${keyed(
          JSON.stringify([values.raw, values.numberValue]),
          html`<knx-payload-selector
            .key=${values.key}
            .gaKey=${values.gaKey as string}
            .required=${values.required as boolean}
            .disableRaw=${values.disableRaw as boolean}
            .hass=${env.hass}
            .knx=${env.knx}
            .dpt=${(values.dpt as string) || undefined}
            .rawLength=${values.externalLength ? (values.rawLength as number) : undefined}
            .value=${values.raw ? { payload: "0x0800", payload_length: 2 } : { value: values.numberValue as number }}
            .validationErrors=${values.invalid ? [{ path: [], message: en.sample.invalid, code: null }] : undefined}
            .localizeFunction=${localize}
            @value-changed=${changed}
          ></knx-payload-selector>`,
        )}`;
      },
    };
  },
});
