import type { Config } from "../../../src/components/data-table/filter/knx-list-filter";
import en from "../localize/en.json" with { type: "json" };
import { defineExample, observe } from "./helpers";

const copy = en.components["knx-list-filter"];
export const entry = defineExample({
  tag: "knx-list-filter",
  copy,
  properties: {
    expanded: true,
    selectedOptions: ["1/0/1"],
    pinSelectedItems: true,
    filterTitle: "Group addresses",
    filterQuery: "",
    sortCriterion: "primaryField",
    sortDirection: "asc",
    isMobileDevice: false,
  },
  events: ["selection-changed", "sort-changed", "expanded-changed"],
  suppliedProperties: ["hass", "knx", "narrow", "data", "config"],
  scenarios: [
    { id: "empty", label: en.scenarios["empty"], values: { filterQuery: "no-matching-address" } },
    { id: "collapsed", label: en.scenarios["collapsed"], values: { expanded: false } },
  ],
  controls: {
    selectedOptions: {
      validate: (value) =>
        Array.isArray(value) && value.every((item) => typeof item === "string")
          ? undefined
          : en.validation.invalidValue,
    },
    sortCriterion: { choices: ["idField", "primaryField"] },
    sortDirection: { choices: ["asc", "desc"] },
  },
  interaction: {
    state: [
      "selectedOptions",
      "expanded",
      "filterQuery",
      "pinSelectedItems",
      "sortCriterion",
      "sortDirection",
    ],
  },
  async load() {
    const [{ html }] = await Promise.all([
      import("lit"),
      import("../../../src/components/data-table/filter/knx-list-filter"),
    ]);
    const { createKnxFixtures } = await import("../fixtures/knx");
    const data = Object.values(createKnxFixtures().project.group_addresses);
    const config: Config<(typeof data)[number]> = {
      idField: {
        filterable: true,
        sortable: true,
        fieldName: en.sample.secondary,
        mapper: (item) => item.address,
      },
      primaryField: {
        filterable: true,
        sortable: true,
        fieldName: en.sample.header,
        mapper: (item) => item.name,
      },
      secondaryField: { filterable: true, sortable: false, mapper: (item) => item.address },
      badgeField: {
        filterable: false,
        sortable: false,
        mapper: (item) => String(item.communication_object_ids.length),
      },
    };
    return {
      render: (env, values, _slots, emit) => {
        const on = observe(emit);
        const observedConfig = { ...config };
        for (const field of ["idField", "primaryField", "secondaryField", "badgeField"] as const) {
          observedConfig[field] = {
            ...config[field],
            mapper: (item) => {
              const result = config[field].mapper(item);
              emit({
                kind: "callback",
                name: `${field}.mapper`,
                timestamp: Date.now(),
                args: { address: item.address, result: result ?? null },
              });
              return result;
            },
          };
        }
        return html`<knx-list-filter
          style="height: auto"
          .expanded=${values.expanded as boolean}
          .selectedOptions=${values.selectedOptions as string[]}
          .pinSelectedItems=${values.pinSelectedItems as boolean}
          .filterTitle=${values.filterTitle as string}
          .filterQuery=${values.filterQuery as string}
          .sortCriterion=${values.sortCriterion as string}
          .sortDirection=${values.sortDirection as "asc" | "desc"}
          .isMobileDevice=${values.isMobileDevice as boolean}
          .hass=${env.hass}
          .knx=${env.knx}
          .data=${data}
          .config=${observedConfig}
          .narrow=${matchMedia("(max-width: 870px)").matches}
          @selection-changed=${on}
          @sort-changed=${on}
          @expanded-changed=${on}
        ></knx-list-filter>`;
      },
    };
  },
});
