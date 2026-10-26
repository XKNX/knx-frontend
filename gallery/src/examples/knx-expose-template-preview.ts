import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

const copy = en.components["knx-expose-template-preview"];
export const entry = defineExample({
  tag: "knx-expose-template-preview",
  copy,
  properties: { entityId: "sensor.room_temperature", attribute: "", valueTemplate: "" },
  suppliedProperties: ["statesContext", "connectionContext"],
  scenarios: [
    {
      id: "attribute",
      label: en.scenarios["attribute"],
      values: { attribute: "unit_of_measurement" },
    },
    { id: "template", label: en.scenarios["template"], values: { valueTemplate: "{{ value }}" } },
  ],
  interaction: { localProperties: ["attribute"] },
  async load() {
    const [{ html }] = await Promise.all([
      import("lit"),
      import("../../../src/components/knx-expose-template-preview"),
    ]);

    return {
      async prepare(env) {
        env.mockWS("render_template", (message, _hass, callback) => {
          callback?.({
            result: String((message.variables as { value?: unknown })?.value ?? ""),
            listeners: { all: false, domains: [], entities: [], time: false },
          });
          return () => undefined;
        });
      },
      render: (_env, values, _slots, _emit) => {
        return html`<knx-expose-template-preview
          .entityId=${values.entityId as string}
          .valueTemplate=${values.valueTemplate as string}
          .attribute=${(values.attribute as string) || undefined}
        ></knx-expose-template-preview>`;
      },
    };
  },
});
