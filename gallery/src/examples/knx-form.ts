import en from "../localize/en.json" with { type: "json" };
import { isRecord } from "../state";
import { defineExample, observe, localizeCallback, validateGroupAddressConfig } from "./helpers";

const copy = en.components["knx-form"];
export const entry = defineExample({
  tag: "knx-form",
  copy,
  properties: { config: { ga_switch: { write: "1/0/1", state: "1/0/1" } } },
  exampleOptions: { invalid: false },
  events: ["knx-form-config-changed"],
  suppliedProperties: ["hass", "knx", "validationErrors", "schema"],
  callbacks: ["backendLocalize"],
  scenarios: [{ id: "invalid", label: en.scenarios["invalid"], values: { invalid: true } }],
  controls: {
    config: {
      validate: (value) =>
        isRecord(value)
          ? validateGroupAddressConfig(value.ga_switch ?? {})
          : en.validation.invalidValue,
    },
  },
  interaction: { state: ["config", "_selectedGroupSelectOptions"] },
  async load() {
    const [{ html }] = await Promise.all([
      import("lit"),
      import("../../../src/components/knx-form"),
    ]);
    const { createSchemas } = await import("../fixtures/schemas");
    const schemas = createSchemas();
    schemas.light = schemas.light.map((item) => ({ ...item, name: "ga_switch" }));
    return {
      render: (env, values, _slots, emit) => {
        const on = observe(emit);
        const localize = localizeCallback(
          env,
          emit,
          "component.knx.config_panel.entities.create.light.knx",
        );
        return html`<knx-form
          .config=${values.config as Record<string, unknown>}
          .hass=${env.hass}
          .knx=${env.knx}
          .schema=${schemas.light}
          .validationErrors=${values.invalid ? [{ path: [], message: en.sample.invalid, code: null }] : undefined}
          .backendLocalize=${localize}
          @knx-form-config-changed=${on}
        ></knx-form>`;
      },
    };
  },
});
