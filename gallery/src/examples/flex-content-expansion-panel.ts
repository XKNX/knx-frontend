import en from "../localize/en.json" with { type: "json" };
import { defineExample, observe } from "./helpers";

const copy = en.components["flex-content-expansion-panel"];
export const entry = defineExample({
  tag: "flex-content-expansion-panel",
  copy,
  properties: {
    expanded: true,
    outlined: true,
    leftChevron: true,
    noCollapse: false,
    header: "Device details",
    secondary: "Living room",
  },
  slots: ["", "header", "secondary", "leading-icon", "event", "icons"],
  events: ["expanded-will-change", "expanded-changed"],
  scenarios: [{ id: "collapsed", label: en.scenarios["collapsed"], values: { expanded: false } }],
  interaction: { state: ["expanded"] },
  async load() {
    const [{ html, nothing }, { mdiDevices, mdiInformationOutline, mdiDotsVertical }] =
      await Promise.all([
        import("lit"),
        import("@mdi/js"),
        import("@ha/components/ha-svg-icon"),
        import("@ha/components/ha-icon-button"),
        import("../../../src/components/flex-content-expansion-panel"),
      ]);

    return {
      render: (_env, values, slots, emit) => {
        const on = observe(emit);
        return html`<flex-content-expansion-panel
          .expanded=${values.expanded as boolean}
          .outlined=${values.outlined as boolean}
          .leftChevron=${values.leftChevron as boolean}
          .noCollapse=${values.noCollapse as boolean}
          .header=${values.header as string}
          .secondary=${values.secondary as string}
          @expanded-will-change=${on}
          @expanded-changed=${on}
          >${slots.includes("") ? html`<div>${en.sample.content}</div>` : nothing}${slots.includes("header") ? html`<div slot="header">${en.sample.content}</div>` : nothing}${slots.includes("secondary") ? html`<div slot="secondary">${en.sample.content}</div>` : nothing}${slots.includes("leading-icon") ? html`<ha-svg-icon slot="leading-icon" .path=${mdiDevices}></ha-svg-icon>` : nothing}${slots.includes("event") ? html`<ha-svg-icon slot="event" .path=${mdiInformationOutline}></ha-svg-icon>` : nothing}${slots.includes("icons") ? html`<ha-icon-button slot="icons" .path=${mdiDotsVertical} .label=${en.sample.action} @click=${on}></ha-icon-button>` : nothing}</flex-content-expansion-panel
        >`;
      },
    };
  },
});
