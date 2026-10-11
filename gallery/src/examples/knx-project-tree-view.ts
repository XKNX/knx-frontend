import en from "../localize/en.json" with { type: "json" };
import { defineExample, observe } from "./helpers";

const copy = en.components["knx-project-tree-view"];
export const entry = defineExample({
  tag: "knx-project-tree-view",
  copy,
  properties: { multiselect: false },
  events: ["knx-group-range-selection-changed"],
  suppliedProperties: ["data"],
  scenarios: [
    { id: "multiple", label: en.scenarios["multiple"], values: { multiselect: true } },
    { id: "empty", label: en.scenarios["empty"], values: {} },
  ],
  interaction: { state: ["_selectableRanges"] },
  async load() {
    const [{ html }] = await Promise.all([
      import("lit"),
      import("../../../src/components/knx-project-tree-view"),
    ]);
    const { createKnxFixtures } = await import("../fixtures/knx");
    const project = createKnxFixtures().project;
    return {
      async prepare(_env, scenarioId) {
        if (scenarioId === "empty") project.group_ranges = {};
      },
      render: (_env, values, _slots, emit) => {
        const on = observe(emit);
        return html`<knx-project-tree-view
          .multiselect=${values.multiselect as boolean}
          .data=${project}
          @knx-group-range-selection-changed=${on}
        ></knx-project-tree-view>`;
      },
    };
  },
});
