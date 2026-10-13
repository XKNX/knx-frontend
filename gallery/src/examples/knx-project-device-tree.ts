import en from "../localize/en.json" with { type: "json" };
import { isRecord } from "../state";
import { defineExample } from "./helpers";

const copy = en.components["knx-project-device-tree"];
export const entry = defineExample({
  tag: "knx-project-device-tree",
  copy,
  properties: { validDPTs: [{ main: 1, sub: 1 }] },
  suppliedProperties: ["data", "deviceTree", "dragDropContext"],
  scenarios: [
    {
      id: "no-match",
      label: en.scenarios["no-match"],
      values: { validDPTs: [{ main: 9, sub: 1 }] },
    },
    { id: "empty", label: en.scenarios["empty"], values: {} },
  ],
  interaction: { state: ["_selectedDevice"] },
  controls: {
    validDPTs: {
      validate: (value) =>
        Array.isArray(value) &&
        value.every(
          (item) =>
            isRecord(item) &&
            Number.isInteger(item.main) &&
            (item.sub === null || Number.isInteger(item.sub)),
        )
          ? undefined
          : en.validation.invalidValue,
    },
  },
  async load() {
    const [{ html }] = await Promise.all([
      import("lit"),
      import("../../../src/components/knx-project-device-tree"),
    ]);
    const { createKnxFixtures } = await import("../fixtures/knx");
    const project = createKnxFixtures().project;
    const { keyed } = await import("lit/directives/keyed");
    return {
      async prepare(_env, scenarioId) {
        if (scenarioId === "empty") {
          project.devices = {};
          project.communication_objects = {};
        }
      },
      render: (_env, values, _slots, _emit) => {
        return html`${keyed(JSON.stringify(values.validDPTs), html`<knx-project-device-tree .data=${project} .validDPTs=${values.validDPTs as { main: number; sub: number }[]}></knx-project-device-tree>`)}`;
      },
    };
  },
});
