import en from "../localize/en.json" with { type: "json" };
import { defineExample } from "./helpers";
import type { JsonValue } from "../types";

const copy = en.examples.separator;

export const entry = defineExample({
  tag: "knx-separator",
  copy: {
    title: en.separator,
    description: copy.description,
    labels: {
      height: copy.height,
      minHeight: copy.minHeight,
      maxHeight: copy.maxHeight,
      animationDuration: copy.animationDuration,
      customClass: copy.customClass,
      default: copy.content,
    },
    api: {
      ...copy.api,
      "setHeight(newHeight, animate?)": copy.api.setHeight,
      "expand()": copy.api.expand,
      "collapse()": copy.api.collapse,
      "toggle()": copy.api.toggle,
      default: copy.api.content,
    },
  },
  properties: { height: 1, minHeight: 1, maxHeight: 50, animationDuration: 150, customClass: "" },
  suppliedProperties: ["expansionRatio"],
  methods: ["setHeight(newHeight, animate?)", "expand()", "collapse()", "toggle()"],
  slots: [""],
  apiDetails: { height: copy.api.heightDetails },
  controls: Object.fromEntries(
    ["height", "minHeight", "maxHeight", "animationDuration"].map((key) => [
      key,
      {
        validate: (value: JsonValue) =>
          typeof value === "number" && value >= 0 ? undefined : en.validation.nonNegative,
      },
    ]),
  ),
  scenarios: [
    { id: "default", label: copy.default, values: {} },
    { id: "expanded", label: copy.expanded, values: { height: 50 } },
  ],
  interaction: { state: ["height"] },

  async load() {
    const [{ html, nothing }] = await Promise.all([
      import("lit"),
      import("../../../src/components/knx-separator"),
    ]);
    return {
      render: (_env, values, slots) =>
        html`<knx-separator
          .height=${values.height as number}
          .minHeight=${values.minHeight as number}
          .maxHeight=${values.maxHeight as number}
          .animationDuration=${values.animationDuration as number}
          .customClass=${values.customClass as string}
          >${slots.includes("") ? copy.sampleContent : nothing}</knx-separator
        >`,
    };
  },
});
