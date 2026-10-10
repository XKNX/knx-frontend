import en from "../localize/en.json" with { type: "json" };
import { defineExample, observe } from "./helpers";

const copy = en.components["knx-sort-menu"];
export const entry = defineExample({
  tag: "knx-sort-menu",
  copy,
  properties: { sortCriterion: "name", sortDirection: "asc", isMobileDevice: false },
  slots: ["trigger", "header", "title", "toolbar", ""],
  events: ["sort-changed", "click"],
  suppliedProperties: ["knx"],
  scenarios: [
    { id: "descending", label: en.scenarios["descending"], values: { sortDirection: "desc" } },
  ],
  controls: {
    sortCriterion: { choices: ["name", "address"] },
    sortDirection: { choices: ["asc", "desc"] },
  },
  interaction: { state: ["sortCriterion", "sortDirection"] },
  async load() {
    const [{ html, nothing }] = await Promise.all([
      import("lit"),
      import("../../../src/components/knx-sort-menu"),
    ]);

    return {
      render: (env, values, slots, emit) => {
        const on = observe(emit);
        return html`<knx-sort-menu
          .sortCriterion=${values.sortCriterion as string}
          .sortDirection=${values.sortDirection as "asc" | "desc"}
          .isMobileDevice=${values.isMobileDevice as boolean}
          .knx=${env.knx}
          @sort-changed=${on}
        >
          ${slots.includes("trigger") ? html`<button slot="trigger">${en.sample.sort}</button>` : nothing}
          ${slots.includes("header") ? html`<div slot="header">${en.sample.header}</div>` : nothing}
          ${slots.includes("title") ? html`<span slot="title">${en.sample.sort}</span>` : nothing}
          ${slots.includes("toolbar") ? html`<button slot="toolbar" @click=${on}>${en.sample.action}</button>` : nothing}
          ${
            slots.includes("")
              ? html`<knx-sort-menu-item
                    criterion="name"
                    .displayName=${en.sample.header}
                  ></knx-sort-menu-item>
                  <knx-sort-menu-item
                    criterion="address"
                    .displayName=${en.sample.secondary}
                  ></knx-sort-menu-item>`
              : nothing
          }</knx-sort-menu
        >`;
      },
    };
  },
});
