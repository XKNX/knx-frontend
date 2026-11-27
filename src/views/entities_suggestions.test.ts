import { describe, expect, it } from "vitest";
import { html, render } from "lit";
import type { IconOverflowMenuItem } from "@ha/components/ha-icon-overflow-menu";
import type { HomeAssistant } from "@ha/types";
import type { KnxStickyExpansionPanel } from "../components/knx-sticky-expansion-panel";
import type { KNX } from "../types/knx";
import type { EntitySuggestion, EntitySuggestionsResult } from "../types/websocket";
import { KNXEntitiesSuggestions } from "./entities_suggestions";

const suggestion = (
  id: string,
  source: string,
  groupId: string,
  groupName: string,
): EntitySuggestion => ({
  id,
  source,
  suggested_name: id,
  group_id: groupId,
  group_name: groupName,
  secondary_info: "",
  platform_options: ["switch"],
  suggestions: {
    switch: { knx: {}, matched_group_addresses: [], unmatched: [] },
  } as unknown as EntitySuggestion["suggestions"],
  existing_entity_ids: [],
  metadata: {},
});

/** Renders the suggestions of a result without the websocket request of the task. */
const draw = (result: EntitySuggestionsResult) => {
  const view = new KNXEntitiesSuggestions();
  view.hass = { localize: (key: string) => key, states: {} } as unknown as HomeAssistant;
  view.knx = { localize: (key: string) => key } as unknown as KNX;
  Reflect.set(view, "_suggestionsTask", { value: result });
  const host = view.attachShadow({ mode: "open" });
  const update = () =>
    render(html`${view["_renderSelectionActions"]()}${view["_renderSuggestions"]()}`, host, {
      host: view,
    });
  update();
  return { view, host, update };
};

const RESULT: EntitySuggestionsResult = {
  suggestions: [
    suggestion("fb_1", "fb", "1.1.1", "Actuator"),
    suggestion("fb_2", "fb", "1.1.1", "Actuator"),
    suggestion("fn_1", "fn", "P-2", "Kitchen"),
    suggestion("cfg_1", "cfg", "1.1.1", "Actuator"),
    suggestion("cfg_2", "cfg", "1.1.1", "Actuator"),
  ],
  providers: { fb: { state: "ok" }, fn: { state: "ok" }, cfg: { state: "ok" } },
};

const panels = (host: ShadowRoot) => [
  ...host.querySelectorAll<KnxStickyExpansionPanel>("knx-sticky-expansion-panel"),
];

const panelOf = (host: ShadowRoot, providerId: string) =>
  host.querySelector<KnxStickyExpansionPanel>(
    `knx-sticky-expansion-panel[data-provider-id="${providerId}"]`,
  )!;

describe("KNXEntitiesSuggestions", () => {
  it("renders an expanded panel per provider with a card per group", () => {
    const { host } = draw(RESULT);
    expect(panels(host).map((panel) => panel.getAttribute("data-provider-id"))).toEqual([
      "fb",
      "fn",
      "cfg",
    ]);
    for (const panel of panels(host)) {
      expect(panel.expanded).toBe(true);
      expect(panel.querySelectorAll("ha-card")).toHaveLength(1);
    }
    expect(panelOf(host, "fb").querySelectorAll(".row")).toHaveLength(2);
  });

  it("titles a device group by address and name, a room by its name only", () => {
    const { host } = draw(RESULT);
    const title = (providerId: string) =>
      panelOf(host, providerId).querySelector(".card-header span")!.textContent!.trim();
    expect(title("fb")).toBe("1.1.1 Actuator");
    expect(title("fn")).toBe("Kitchen");
  });

  it("keeps a provider collapsed across rerenders", () => {
    const { view, host, update } = draw(RESULT);
    const panel = panelOf(host, "fn");
    // the panel toggles itself - the view is disconnected, so set what a click would
    panel.expanded = false;
    // filtering out the provider listed before it rebuilds the list
    Reflect.set(view, "_hiddenProviders", new Set(["fb"]));
    update();
    expect(panels(host).map((item) => item.getAttribute("data-provider-id"))).toEqual([
      "fn",
      "cfg",
    ]);
    expect(panelOf(host, "fn")).toBe(panel);
    expect(panel.expanded).toBe(false);
    expect(panelOf(host, "cfg").expanded).toBe(true);
  });

  it("selects all of a group without touching another provider", () => {
    const { view, host, update } = draw(RESULT);
    const checkbox = panelOf(host, "fb").querySelector<HTMLInputElement>(
      ".card-header ha-checkbox",
    )!;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    update();
    const selected = (id: string) =>
      view["_rowState"](RESULT.suggestions.find((item) => item.id === id)!).selected;
    expect(selected("fb_1")).toBe(false);
    expect(selected("fb_2")).toBe(false);
    // same group id, other provider
    expect(selected("cfg_1")).toBe(true);
    expect(selected("cfg_2")).toBe(true);
  });

  it("selects and deselects every shown suggestion from the toolbar", () => {
    const { view, host, update } = draw(RESULT);
    const menu = host.querySelector<HTMLElement & { items: IconOverflowMenuItem[] }>(
      "ha-icon-overflow-menu",
    )!;
    const [selectAll, deselectAll] = [0, 1].map((index) => () => menu.items[index]!);
    const selected = (id: string) =>
      view["_rowState"](RESULT.suggestions.find((item) => item.id === id)!).selected;
    // everything starts selected - there is nothing more to select
    expect(selectAll().disabled).toBe(true);
    expect(deselectAll().disabled).toBe(false);

    // a filtered out provider keeps its selection
    Reflect.set(view, "_hiddenProviders", new Set(["cfg"]));
    update();
    deselectAll().action();
    update();
    expect(selected("fb_1")).toBe(false);
    expect(selected("fb_2")).toBe(false);
    expect(selected("fn_1")).toBe(false);
    expect(selected("cfg_1")).toBe(true);
    expect(selectAll().disabled).toBe(false);
    expect(deselectAll().disabled).toBe(true);

    selectAll().action();
    update();
    expect(selected("fb_1")).toBe(true);
    expect(selected("fb_2")).toBe(true);
    expect(selected("fn_1")).toBe(true);
    expect(selectAll().disabled).toBe(true);
  });
});
