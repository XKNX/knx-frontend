import type { Ref } from "lit/directives/ref";
import en from "../localize/en.json" with { type: "json" };
import { defineExample, observe } from "./helpers";

const copy = en.components["knx-tabs-subpage-data"];
export const entry = defineExample({
  tag: "knx-tabs-subpage-data",
  copy,
  properties: {
    hasFilters: true,
    filters: 1,
    showFilters: false,
    resultCount: 2,
    filterLabel: "Filters",
    filterPaneNarrow: "auto",
    backPath: "/knx",
  },
  exampleOptions: { twoTabs: false, customLocalize: false },
  slots: [
    "",
    "header",
    "toolbar-icon",
    "toolbar-leading",
    "toolbar-search",
    "toolbar-trailing",
    "active-filters",
    "banner",
    "sidebar",
    "content-footer",
    "footer",
    "filter-pane",
    "filter-pane-actions",
  ],
  events: ["show-filters-changed", "clear-filter", "click", "input", "change", "remove"],
  suppliedProperties: ["hass", "narrow", "route", "tabs"],
  callbacks: ["localizeFunc"],
  scenarios: [
    { id: "filters", label: en.scenarios["filters"], values: { showFilters: true } },
    {
      id: "minimal",
      label: en.scenarios["minimal"],
      values: { hasFilters: false, filters: 0 },
    },
  ],
  controls: { filterPaneNarrow: { choices: ["auto", "dialog", "inline"] } },
  interaction: { state: ["showFilters"] },
  async load() {
    const [{ html, nothing }] = await Promise.all([
      import("lit"),
      import("../../../src/layouts/knx-tabs-subpage-data"),
      import("@ha/components/chips/ha-assist-chip"),
      import("@ha/components/chips/ha-input-chip"),
      import("@ha/components/ha-alert"),
      import("@ha/components/ha-button"),
      import("@ha/components/input/ha-input-search"),
    ]);

    const { createRef, ref } = await import("lit/directives/ref");
    const view: Ref<HTMLElementTagNameMap["knx-tabs-subpage-data"]> = createRef();
    // The narrow HA subpage normally leaves document flow; only this gallery
    // example lets content sizing opt it back in without changing product CSS.
    const sizing = new CSSStyleSheet();
    sizing.replaceSync(
      "hass-tabs-subpage[narrow] { position: var(--gallery-subpage-position, fixed); }",
    );
    const attachView = async (element?: Element) => {
      view.value = element as HTMLElementTagNameMap["knx-tabs-subpage-data"] | undefined;
      if (!view.value) return;
      const page = view.value;
      // Slot content belongs to this example, and follows accepted filter state in every peer.
      page.addController({
        hostUpdated() {
          if (filterChip.value) filterChip.value.slot = chipSlot(Boolean(page.filters));
          if (filterCheckbox.value) filterCheckbox.value.checked = Boolean(page.filters);
        },
      });
      await page.updateComplete;
      if (!element?.isConnected) return;
      const root = element.shadowRoot!;
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sizing];
    };
    const filterCheckbox: Ref<HTMLInputElement> = createRef();
    const filterChip: Ref<HTMLElement> = createRef();
    // The page owns its chips: an unassigned slot name hides the sample chip, so the
    // active filters row collapses as it would when a page stops rendering the chip.
    const chipSlot = (active: boolean) => (active ? "active-filters" : "inactive-filters");
    return {
      render: (env, values, slots, emit) => {
        const on = observe(emit);
        const localizeTitle = (key: string) => {
          const result = en.sample.localizedPageTitle;
          emit({
            kind: "callback",
            name: "localizeFunc",
            timestamp: Date.now(),
            args: { key, result },
          });
          return result;
        };
        const titleTab = values.customLocalize
          ? { path: "/knx/gallery", translationKey: "sample.localizedPageTitle" }
          : { path: "/knx/gallery", name: copy.title };
        const sampleAction = (event: Event) => {
          const target = event.currentTarget as HTMLElement;
          emit({
            kind: "event",
            name: event.type,
            timestamp: Date.now(),
            args: {
              slot: target.closest("[slot]")?.getAttribute("slot") ?? "",
              ...(event.type === "input"
                ? { value: (target as HTMLElementTagNameMap["ha-input-search"]).value }
                : {}),
              ...(event.type === "change" ? { checked: (target as HTMLInputElement).checked } : {}),
            },
          });
        };
        const clearFilters = (event: Event) => {
          on(event);
          view.value!.filters = 0;
        };
        const sampleFilterChanged = (event: Event) => {
          sampleAction(event);
          const selected = filterCheckbox.value!.checked;
          view.value!.filters = selected ? 1 : 0;
        };
        const removeChip = (event: Event) => {
          event.preventDefault();
          clearFilters(event);
        };
        return html`<knx-tabs-subpage-data
          ${ref(attachView)}
          style="height: var(--gallery-example-height, 720px)"
          .hasFilters=${values.hasFilters as boolean}
          .filters=${values.filters as number}
          .showFilters=${values.showFilters as boolean}
          .resultCount=${values.resultCount as number}
          .filterLabel=${values.filterLabel as string}
          .backPath=${values.backPath as string}
          .hass=${env.hass}
          .route=${{ prefix: "/knx", path: "/gallery" }}
          .tabs=${
            values.twoTabs ? [titleTab, { path: "/knx/info", name: en.sample.header }] : [titleTab]
          }
          .localizeFunc=${(values.customLocalize ? localizeTitle : undefined) as HTMLElementTagNameMap["knx-tabs-subpage-data"]["localizeFunc"]}
          .narrow=${matchMedia("(max-width: 870px)").matches}
          .filterPaneNarrow=${values.filterPaneNarrow === "auto" ? undefined : values.filterPaneNarrow === "dialog"}
          @show-filters-changed=${on}
          @clear-filter=${clearFilters}
          >${slots.includes("") ? html`<div><ha-button @click=${sampleAction}>${en.sample.action}</ha-button></div>` : nothing}${slots.includes("header") ? html`<div slot="header">${en.sample.header}</div>` : nothing}${slots.includes("toolbar-icon") ? html`<ha-icon-button slot="toolbar-icon" .label=${en.sample.action} .path=${"M12 4v16m-8-8h16"} @click=${sampleAction}></ha-icon-button>` : nothing}${slots.includes("toolbar-leading") ? html`<ha-assist-chip slot="toolbar-leading" .label=${en.sample.action} @click=${sampleAction}></ha-assist-chip>` : nothing}${slots.includes("toolbar-search") ? html`<ha-input-search slot="toolbar-search" .placeholder=${en.sample.search} @input=${sampleAction}></ha-input-search>` : nothing}${slots.includes("toolbar-trailing") ? html`<ha-assist-chip slot="toolbar-trailing" .label=${en.sample.action} @click=${sampleAction}></ha-assist-chip>` : nothing}${
            slots.includes("active-filters")
              ? html`<ha-input-chip
                  ${ref(filterChip)}
                  slot=${chipSlot(Boolean(values.filters))}
                  .label=${en.sample.filter}
                  @remove=${removeChip}
                ></ha-input-chip>`
              : nothing
          }${slots.includes("banner") ? html`<ha-alert slot="banner">${en.sample.banner}</ha-alert>` : nothing}${slots.includes("sidebar") ? html`<div slot="sidebar" style="width: 240px; padding: 16px; border-inline-start: 1px solid var(--divider-color)">${en.sample.content}</div>` : nothing}${slots.includes("content-footer") ? html`<div slot="content-footer">${en.sample.footer}</div>` : nothing}${slots.includes("footer") ? html`<div slot="footer"><ha-button @click=${sampleAction}>${en.sample.action}</ha-button></div>` : nothing}${slots.includes("filter-pane") ? html`<label slot="filter-pane"><input ${ref(filterCheckbox)} type="checkbox" .checked=${Boolean(values.filters)} @change=${sampleFilterChanged} />${en.sample.filter}</label>` : nothing}${slots.includes("filter-pane-actions") ? html`<ha-icon-button slot="filter-pane-actions" .label=${en.sample.action} .path=${"M12 4v16m-8-8h16"} @click=${sampleAction}></ha-icon-button>` : nothing}</knx-tabs-subpage-data
        >`;
      },
    };
  },
});
