import type { HASSDomEvent } from "@ha/common/dom/fire_event";
import en from "../localize/en.json" with { type: "json" };
import { defineExample, observe } from "./helpers";

const copy = en.components["knx-sort-menu-item"];
export const entry = defineExample({
  tag: "knx-sort-menu-item",
  copy,
  properties: {
    criterion: "name",
    displayName: "Name",
    defaultDirection: "asc",
    direction: "asc",
    active: true,
    ascendingText: "Ascending",
    descendingText: "Descending",
    ascendingIcon: "M12 4l-7 7h4v9h6v-9h4z",
    descendingIcon: "M12 20l-7-7h4V4h6v9h4z",
    isMobileDevice: false,
    disabled: false,
  },
  events: ["sort-option-selected"],
  suppliedProperties: ["knx"],
  scenarios: [
    { id: "disabled", label: en.scenarios["disabled"], values: { disabled: true } },
    { id: "mobile", label: en.scenarios["mobile"], values: { isMobileDevice: true } },
  ],
  controls: {
    defaultDirection: { choices: ["asc", "desc"] },
    direction: { choices: ["asc", "desc"] },
  },
  interaction: { state: ["active", "direction"] },
  async load() {
    const [{ html }] = await Promise.all([
      import("lit"),
      import("../../../src/components/knx-sort-menu-item"),
    ]);

    return {
      render: (env, values, _slots, emit) => {
        const on = observe(emit);
        const selectSort = (event: HASSDomEvent<HASSDomEvents["sort-option-selected"]>) => {
          on(event);
          Object.assign(event.currentTarget!, { active: true, direction: event.detail.direction });
        };
        return html`<knx-sort-menu-item
          .criterion=${values.criterion as string}
          .displayName=${values.displayName as string}
          .defaultDirection=${values.defaultDirection as "asc" | "desc"}
          .direction=${values.direction as "asc" | "desc"}
          .active=${values.active as boolean}
          .ascendingText=${values.ascendingText as string}
          .descendingText=${values.descendingText as string}
          .ascendingIcon=${values.ascendingIcon as string}
          .descendingIcon=${values.descendingIcon as string}
          .isMobileDevice=${values.isMobileDevice as boolean}
          .disabled=${values.disabled as boolean}
          .knx=${env.knx}
          @sort-option-selected=${selectSort}
        ></knx-sort-menu-item>`;
      },
    };
  },
});
