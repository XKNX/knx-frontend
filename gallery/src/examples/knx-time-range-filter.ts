import type { HASSDomEvent } from "@ha/common/dom/fire_event";
import type { TimeRangeChangedEvent } from "../../../src/components/data-table/filter/knx-time-range-filter";
import en from "../localize/en.json" with { type: "json" };
import { defineExample, observe } from "./helpers";

const copy = en.components["knx-time-range-filter"];
export const entry = defineExample({
  tag: "knx-time-range-filter",
  copy,
  properties: {
    expanded: true,
    startMs: 1767268800000,
    endMs: 1767272400000,
    loading: false,
    warning: "",
  },
  exampleOptions: { openEnded: false },
  events: ["expanded-changed", "time-range-changed", "time-range-cleared"],
  suppliedProperties: ["hass", "knx"],
  scenarios: [
    { id: "loading", label: en.scenarios["loading"], values: { loading: true } },
    {
      id: "warning",
      label: en.scenarios["warning"],
      values: { warning: "History is limited to this offline sample." },
    },
    { id: "open-ended", label: en.scenarios["open-ended"], values: { openEnded: true } },
  ],
  interaction: { state: ["expanded", "startMs", "endMs"] },
  async load() {
    const [{ html }] = await Promise.all([
      import("lit"),
      import("../../../src/components/data-table/filter/knx-time-range-filter"),
    ]);

    return {
      render: (env, values, _slots, emit) => {
        const on = observe(emit);
        const changeRange = (event: HASSDomEvent<TimeRangeChangedEvent>) => {
          on(event);
          Object.assign(event.currentTarget!, {
            startMs: event.detail.startMs,
            endMs: event.detail.endMs,
          });
        };
        const clearRange = (event: Event) => {
          on(event);
          Object.assign(event.currentTarget!, { startMs: undefined, endMs: undefined });
        };
        return html`<knx-time-range-filter
          .expanded=${values.expanded as boolean}
          .startMs=${values.startMs as number}
          .loading=${values.loading as boolean}
          .warning=${values.warning as string}
          .endMs=${values.openEnded ? undefined : (values.endMs as number)}
          .hass=${env.hass}
          .knx=${env.knx}
          @expanded-changed=${on}
          @time-range-changed=${changeRange}
          @time-range-cleared=${clearRange}
        ></knx-time-range-filter>`;
      },
    };
  },
});
