import en from "../localize/en.json" with { type: "json" };
import { defineExample, observe } from "./helpers";

const copy = en.components["knx-table-cell-filterable"];
export const entry = defineExample({
  tag: "knx-table-cell-filterable",
  copy,
  properties: {
    filterValue: "1/0/1",
    filterDisplayText: "Living room light",
    filterActive: false,
    filterDisabled: false,
  },
  slots: ["primary", "secondary"],
  events: ["toggle-filter"],
  suppliedProperties: ["knx"],
  scenarios: [
    { id: "active", label: en.scenarios["active"], values: { filterActive: true } },
    { id: "disabled", label: en.scenarios["disabled"], values: { filterDisabled: true } },
  ],
  interaction: { state: ["filterActive"] },
  async load() {
    const [{ html, nothing }] = await Promise.all([
      import("lit"),
      import("../../../src/components/data-table/cell/knx-table-cell-filterable"),
    ]);

    return {
      render: (env, values, slots, emit) => {
        const on = observe(emit);
        return html`<knx-table-cell-filterable
          .filterValue=${values.filterValue as string}
          .filterDisplayText=${values.filterDisplayText as string}
          .filterActive=${values.filterActive as boolean}
          .filterDisabled=${values.filterDisabled as boolean}
          .knx=${env.knx}
          @toggle-filter=${on}
          >${slots.includes("primary") ? html`<div slot="primary">${en.sample.content}</div>` : nothing}${slots.includes("secondary") ? html`<div slot="secondary">${en.sample.content}</div>` : nothing}</knx-table-cell-filterable
        >`;
      },
    };
  },
});
