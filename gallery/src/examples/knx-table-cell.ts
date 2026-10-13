import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

const copy = en.components["knx-table-cell"];
export const entry = defineExample({
  tag: "knx-table-cell",
  copy,
  slots: ["primary", "secondary"],
  async load() {
    const [{ html, nothing }] = await Promise.all([
      import("lit"),
      import("../../../src/components/data-table/cell/knx-table-cell"),
    ]);

    return {
      render: (_env, _values, slots, _emit) => {
        return html`<knx-table-cell
          >${slots.includes("primary") ? html`<div slot="primary">${en.sample.content}</div>` : nothing}${slots.includes("secondary") ? html`<div slot="secondary">${en.sample.content}</div>` : nothing}</knx-table-cell
        >`;
      },
    };
  },
});
