import en from "../localize/en.json" with { type: "json" };
import { defineExample, observe } from "./helpers";

const copy = en.components["knx-tabs-subpage-data-filter-pane"];
export const entry = defineExample({
  tag: "knx-tabs-subpage-data-filter-pane",
  copy,
  properties: {
    label: "Filters",
    path: "M3 4h18v2H3zM6 10h12v2H6zM9 16h6v2H9z",
    count: 1,
    resultCount: 2,
    disabled: false,
  },
  slots: ["", "actions"],
  events: ["close-filter-pane", "clear-filter"],
  suppliedProperties: ["narrow"],
  scenarios: [{ id: "disabled", label: en.scenarios["disabled"], values: { disabled: true } }],
  async load() {
    const [{ html, nothing }] = await Promise.all([
      import("lit"),
      import("../../../src/layouts/knx-tabs-subpage-data-filter-pane"),
    ]);

    return {
      render: (_env, values, slots, emit) => {
        const on = observe(emit);
        return html`<knx-tabs-subpage-data-filter-pane
          .label=${values.label as string}
          .path=${values.path as string}
          .count=${values.count as number}
          .resultCount=${values.resultCount as number}
          .disabled=${values.disabled as boolean}
          .narrow=${matchMedia("(max-width: 870px)").matches}
          @close-filter-pane=${on}
          @clear-filter=${on}
          >${slots.includes("") ? html`<div>${en.sample.content}</div>` : nothing}${slots.includes("actions") ? html`<div slot="actions">${en.sample.content}</div>` : nothing}</knx-tabs-subpage-data-filter-pane
        >`;
      },
    };
  },
});
