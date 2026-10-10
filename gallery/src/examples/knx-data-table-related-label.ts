import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

const copy = en.components["knx-data-table-related-label"];
export const entry = defineExample({
  tag: "knx-data-table-related-label",
  copy,
  properties: {
    entities: ["light.living_room"],
    entitiesYaml: ["sensor.room_temperature"],
    exposes: ["sensor.room_temperature"],
  },
  suppliedProperties: ["hass"],
  scenarios: [
    { id: "single", label: en.scenarios["single"], values: { entitiesYaml: [], exposes: [] } },
    {
      id: "empty",
      label: en.scenarios["empty"],
      values: { entities: [], entitiesYaml: [], exposes: [] },
    },
  ],
  controls: {
    entities: {
      validate: (value) =>
        Array.isArray(value) && value.every((item) => typeof item === "string")
          ? undefined
          : en.validation.invalidValue,
    },
    entitiesYaml: {
      validate: (value) =>
        Array.isArray(value) && value.every((item) => typeof item === "string")
          ? undefined
          : en.validation.invalidValue,
    },
    exposes: {
      validate: (value) =>
        Array.isArray(value) && value.every((item) => typeof item === "string")
          ? undefined
          : en.validation.invalidValue,
    },
  },
  async load() {
    const [{ html }] = await Promise.all([
      import("lit"),
      import("../../../src/components/data-table/knx-data-table-related-label"),
    ]);

    return {
      render: (env, values, _slots, _emit) => {
        return html`<knx-data-table-related-label
          .entities=${values.entities as string[]}
          .entitiesYaml=${values.entitiesYaml as string[]}
          .exposes=${values.exposes as string[]}
          .hass=${env.hass}
        ></knx-data-table-related-label>`;
      },
    };
  },
});
