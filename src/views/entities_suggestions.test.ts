import { describe, expect, it, vi } from "vitest";
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

  describe("areas", () => {
    const withArea = (id: string, area: EntitySuggestion["suggested_area"]): EntitySuggestion => ({
      ...suggestion(id, "fn", "space", "Room"),
      suggested_area: area,
    });
    const AREA_RESULT: EntitySuggestionsResult = {
      suggestions: [
        withArea("new", { name: "Kitchen", floor: "Ground floor", area_id: null }),
        withArea("existing", { name: "Bath", floor: null, area_id: "bath" }),
        withArea("none", null),
        // a backend without suggested areas
        suggestion("old", "fn", "space", "Room"),
      ],
      providers: { fn: { state: "ok" } },
    };

    /** Creates all suggestions - returns the `knx/create_entity` messages by suggestion id. */
    const createAll = async (adjust?: (view: KNXEntitiesSuggestions) => void) => {
      const { view, host } = draw(AREA_RESULT);
      const callWS = vi.fn(async (msg: Record<string, unknown>) => ({
        success: true,
        entity_id: msg.type === "knx/create_entity" ? "switch.x" : null,
      }));
      view.hass = { ...view.hass, callWS } as unknown as HomeAssistant;
      adjust?.(view);
      await view["_createSelected"]();
      const sent = callWS.mock.calls.map(([msg]) => msg);
      return {
        host,
        validated: sent.filter((msg) => msg.type === "knx/validate_entity"),
        created: Object.fromEntries(
          sent
            .filter((msg) => msg.type === "knx/create_entity")
            .map((msg, index) => [AREA_RESULT.suggestions[index].id, msg]),
        ),
      };
    };

    it("shows an area picker only if the backend suggests areas", () => {
      const { host } = draw(AREA_RESULT);
      expect(host.querySelectorAll("ha-area-picker")).toHaveLength(3);
      // only the area to create can be removed - next to "open in editor" of every row
      const buttons = (id: string) =>
        host.querySelectorAll(`ha-icon-button[data-suggestion-id='${id}']`).length;
      expect(buttons("new")).toBe(2);
      expect(buttons("existing")).toBe(1);
    });

    it("creates entities in their suggested area", async () => {
      const { created, validated } = await createAll();
      expect(created.new.suggested_area).toEqual({ name: "Kitchen", floor: "Ground floor" });
      expect(created.new.area_id).toBeUndefined();
      expect(created.existing.area_id).toBe("bath");
      expect(created.existing.suggested_area).toBeUndefined();
      for (const id of ["none", "old"]) {
        expect(created[id].area_id).toBeUndefined();
        expect(created[id].suggested_area).toBeUndefined();
      }
      // `knx/validate_entity` doesn't take an area
      expect(validated.every((msg) => !("area_id" in msg) && !("suggested_area" in msg))).toBe(
        true,
      );
    });

    it("shows the area to create in the field and brings back a removed suggestion", () => {
      const { view, host, update } = draw(AREA_RESULT);
      const [newArea, existing] = AREA_RESULT.suggestions;
      const picker = (id: string) =>
        host.querySelector<HTMLElement & { label?: string; value?: string }>(
          `ha-area-picker[data-suggestion-id='${id}']`,
        )!;
      const button = () =>
        host.querySelector<HTMLElement>("ha-icon-button[data-suggestion-id='new']")!;
      const area = (item: EntitySuggestion) => view["_area"](item, view["_rowState"](item));

      // the localize stub returns the key - the name is a placeholder of it
      expect(picker("new").label).toBe("suggestions_new_area");
      expect(button().hasAttribute("data-undo")).toBe(false);
      button().click();
      update();
      expect(area(newArea)).toEqual({});
      expect(picker("new").label).toBeUndefined();
      expect(button().hasAttribute("data-undo")).toBe(true);
      button().click();
      update();
      expect(area(newArea)).toEqual({ suggested_area: { name: "Kitchen", floor: "Ground floor" } });

      // an existing area replaced by another one can be brought back too
      view["_updateRowState"](existing, { areaId: "office" });
      update();
      host
        .querySelector<HTMLElement>("ha-icon-button[data-suggestion-id='existing'][data-undo]")!
        .click();
      expect(area(existing)).toEqual({ area_id: "bath" });
    });

    it("names an area to create - in full with its floor on hover", () => {
      const { view, host, update } = draw({
        suggestions: [
          withArea("floor", { name: "Kitchen", floor: "Ground floor", area_id: null }),
          withArea("prefixed", {
            name: "Ground floor / Hall",
            floor: "Ground floor",
            area_id: null,
          }),
          withArea("no_floor", { name: "Garden", floor: null, area_id: null }),
        ],
        providers: { fn: { state: "ok" } },
      });
      view.knx = {
        localize: (key: string, args?: { name?: string; area?: string }) =>
          args?.area ? `${args.area} (new)` : (args?.name ?? key),
      } as unknown as KNX;
      update();
      const picker = (id: string) =>
        host.querySelector<HTMLElement & { label?: string }>(
          `ha-area-picker[data-suggestion-id='${id}']`,
        )!;
      expect(picker("floor").label).toBe("Kitchen (new)");
      // the floor only once
      expect(picker("floor").title).toBe("Kitchen (Ground floor)");
      expect(picker("prefixed").title).toBe("Ground floor / Hall");
      expect(picker("no_floor").title).toBe("Garden");
    });

    it("creates entities in the area picked - or none", async () => {
      const { created } = await createAll((view) => {
        const [newArea, existing] = AREA_RESULT.suggestions;
        view["_updateRowState"](newArea, { areaId: null });
        view["_updateRowState"](existing, { areaId: "office" });
      });
      expect(created.new.suggested_area).toBeUndefined();
      expect(created.new.area_id).toBeUndefined();
      expect(created.existing.area_id).toBe("office");
    });
  });
});
