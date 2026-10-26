import type { Ref } from "lit/directives/ref";
import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";

const copy = en.components["knx-project-devices-view"];
export const entry = defineExample({
  tag: "knx-project-devices-view",
  copy,
  properties: {
    searchText: "",
    filterDpt: ["1.001"],
    filterLocation: ["living_room"],
    filterLine: ["1.1"],
  },
  exampleOptions: { showRelated: true, showTelegrams: true },
  suppliedProperties: [
    "hass",
    "knx",
    "narrow",
    "data",
    "lastTelegrams",
    "locationByDevice",
    "lineByDevice",
    "entitiesByGroup",
    "exposesByGA",
  ],
  methods: ["expandAll()", "collapseAll()"],
  scenarios: [
    {
      id: "no-match",
      label: en.scenarios["no-match"],
      values: { searchText: "no-matching-device" },
    },
    {
      id: "unfiltered",
      label: en.scenarios["unfiltered"],
      values: { filterDpt: [], filterLocation: [], filterLine: [] },
    },
    { id: "empty", label: en.scenarios["empty"], values: {} },
  ],
  interaction: {
    state: [
      "searchText",
      "filterDpt",
      "filterLocation",
      "filterLine",
      "_expanded",
      "_collapsedChannels",
      "_manuallyCollapsed",
    ],
  },
  controls: {
    filterDpt: {
      validate: (value) =>
        Array.isArray(value) && value.every((item) => typeof item === "string")
          ? undefined
          : en.validation.invalidValue,
    },
    filterLocation: {
      validate: (value) =>
        Array.isArray(value) && value.every((item) => typeof item === "string")
          ? undefined
          : en.validation.invalidValue,
    },
    filterLine: {
      validate: (value) =>
        Array.isArray(value) && value.every((item) => typeof item === "string")
          ? undefined
          : en.validation.invalidValue,
    },
  },
  async load() {
    const [{ html }] = await Promise.all([
      import("lit"),
      import("../../../src/components/knx-project-devices-view"),
    ]);
    const { createKnxFixtures } = await import("../fixtures/knx");
    const project = createKnxFixtures().project;
    const { createTelegrams } = await import("../fixtures/telegrams");
    const lastTelegrams = Object.fromEntries(
      createTelegrams().map((item) => [item.destination, item]),
    );
    const { createRef, ref } = await import("lit/directives/ref");
    const target: Ref<HTMLElementTagNameMap["knx-project-devices-view"]> = createRef();

    return {
      async prepare(_env, scenarioId) {
        if (scenarioId === "empty") project.devices = {};
      },
      render: (env, values, _slots, emit) => {
        const action = (_event: Event, method: "expandAll" | "collapseAll") => {
          target.value![method]();
          emit({ kind: "callback", name: method, timestamp: Date.now(), args: null });
        };
        const expand = (event: Event) => action(event, "expandAll");
        const collapse = (event: Event) => action(event, "collapseAll");
        return html`<button @click=${expand}>${en.sample.expand}</button
          ><button @click=${collapse}>${en.sample.collapse}</button
          ><knx-project-devices-view
            ${ref(target)}
            .searchText=${values.searchText as string}
            .filterDpt=${values.filterDpt as string[]}
            .filterLocation=${values.filterLocation as string[]}
            .filterLine=${values.filterLine as string[]}
            .hass=${env.hass}
            .knx=${env.knx}
            .data=${project}
            .narrow=${matchMedia("(max-width: 870px)").matches}
            .lastTelegrams=${values.showTelegrams ? lastTelegrams : {}}
            .locationByDevice=${{ "1.1.1": { id: "living_room", name: en.sample.content, path: [en.sample.header] } }}
            .lineByDevice=${{ "1.1.1": { id: "1.1", label: "1.1", mediumType: "TP" } }}
            .entitiesByGroup=${values.showRelated ? { "1/0/1": { ui: ["light.living_room"], yaml: [] } } : null}
            .exposesByGA=${values.showRelated ? { "1/0/2": ["sensor.room_temperature"] } : null}
          ></knx-project-devices-view>`;
      },
    };
  },
});
