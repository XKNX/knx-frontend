import en from "../localize/en.json" with { type: "json" };
import { defineExample, observe } from "./helpers";

const copy = en.components["knx-configure-entity"];
export const entry = defineExample({
  tag: "knx-configure-entity",
  copy,
  properties: { platform: "light" },
  exampleOptions: { invalid: false },
  slots: ["knx-validation-error"],
  events: ["knx-entity-configuration-changed"],
  suppliedProperties: ["hass", "knx", "validationErrors", "config", "schema", "platformStyle"],
  scenarios: [{ id: "invalid", label: en.scenarios["invalid"], values: { invalid: true } }],
  controls: { platform: { choices: ["light"] } },
  interaction: { state: ["config"] },
  async load() {
    const [{ html, nothing }] = await Promise.all([
      import("lit"),
      import("../../../src/components/knx-configure-entity"),
    ]);
    const { createSchemas } = await import("../fixtures/schemas");
    const schemas = createSchemas();
    schemas.light = schemas.light.map((item) => ({ ...item, name: "ga_switch" }));
    const config = {
      entity: { name: en.sample.content, device_info: "1.1.1", entity_category: null },
      knx: { ga_switch: { write: "1/0/1" } },
    };
    return {
      render: (env, values, slots, emit) => {
        const on = observe(emit);
        return html`<knx-configure-entity
          .platform=${values.platform as string}
          .hass=${env.hass}
          .knx=${env.knx}
          .config=${config}
          .schema=${schemas.light}
          .validationErrors=${values.invalid ? [{ path: ["data", "knx"], message: en.sample.invalid, code: null }] : undefined}
          @knx-entity-configuration-changed=${on}
          >${slots.includes("knx-validation-error") ? html`<div slot="knx-validation-error">${en.sample.content}</div>` : nothing}</knx-configure-entity
        >`;
      },
    };
  },
});
