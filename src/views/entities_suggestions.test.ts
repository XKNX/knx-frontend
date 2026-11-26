import { describe, expect, it, vi } from "vitest";
import { render } from "lit";
import type { HomeAssistant } from "@ha/types";
import type { KnxStickyExpansionPanel } from "../components/knx-sticky-expansion-panel";
import type { KNX } from "../types/knx";
import type { EntitySuggestion, EntitySuggestionsResult, KNXProject } from "../types/websocket";
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
  const update = () => render(view["_renderSuggestions"](), host, { host: view });
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

  describe("area assignment", () => {
    const space = (identifier: string, type: string, name: string, spaces = {}, devices = []) => ({
      type,
      identifier,
      name,
      usage_id: null,
      usage_text: "",
      number: "",
      description: "",
      project_uid: null,
      devices,
      spaces,
      functions: [],
    });
    const PROJECT = {
      locations: {
        b: space("b", "Building", "Building", {
          cellar: space("cellar", "Floor", "Basement", {
            storage: space("storage", "Room", "Storage"),
          }),
          gf: space("gf", "Floor", "Ground floor", {
            kitchen: space(
              "kitchen",
              "Room",
              "Kitchen",
              { board: space("board", "DistributionBoard", "Board", {}, ["1.1.2"] as never[]) },
              ["1.1.1"] as never[],
            ),
            bath: space("bath", "Room", "Bath"),
          }),
          ff: space("ff", "Floor", "First floor", {
            office: space("office", "Room", "Office"),
          }),
        }),
      },
    } as unknown as KNXProject;
    const AREA_RESULT: EntitySuggestionsResult = {
      suggestions: [
        suggestion("fn_1", "fn", "kitchen", "Kitchen"),
        suggestion("fn_2", "fn", "bath", "Bath"),
        suggestion("fb_1", "fb", "1.1.1", "Sensor"),
        // an actuator in the distribution board within the kitchen
        suggestion("fb_2", "fb", "1.1.2", "Actuator"),
        suggestion("fn_3", "fn", "office", "Office"),
        suggestion("fn_4", "fn", "storage", "Storage"),
      ],
      providers: { fn: { state: "ok" }, fb: { state: "ok" } },
    };

    const setup = (existingAreas: Record<string, { name: string }> = {}, failAreas = false) => {
      const { view, host, update } = draw(AREA_RESULT);
      let counter = 0;
      const callWS = vi.fn(async (msg: Record<string, unknown>) => {
        switch (msg.type) {
          case "knx/validate_entity":
            return { success: true };
          case "knx/create_entity":
            counter += 1;
            return { success: true, entity_id: `switch.entity_${counter}` };
          case "config/floor_registry/create":
            return { floor_id: `floor_${String(msg.name).toLowerCase().replace(" ", "_")}` };
          case "config/area_registry/create":
            if (failAreas) throw new Error("nope");
            return { area_id: `area_${String(msg.name).toLowerCase()}` };
          default:
            return {};
        }
      });
      view.hass = {
        ...view.hass,
        callWS,
        areas: existingAreas,
        floors: {},
      } as unknown as HomeAssistant;
      view["_projectData"] = PROJECT;
      update();
      const calls = (type: string) =>
        callWS.mock.calls.map(([msg]) => msg).filter((msg) => msg.type === type);
      return { view, host, update, calls };
    };

    it("leaves areas alone unless enabled", async () => {
      const { view, host, calls } = setup();
      expect(host.querySelector(".area-options")).not.toBeNull();
      await view["_createSelected"]();
      expect(calls("knx/create_entity")).toHaveLength(6);
      expect(calls("config/entity_registry/update")).toHaveLength(0);
      expect(calls("config/area_registry/create")).toHaveLength(0);
    });

    it("creates floors and areas once and assigns entities to them", async () => {
      const { view, calls } = setup({
        existing_bath: { name: "bath" },
        // its floor of the ETS is not created - it keeps its own
        existing_office: { name: "OFFICE" },
      });
      view["_assignAreas"] = true;
      await view["_createSelected"]();
      // floors up front in the order of the ETS - not in the order of the entities
      expect(calls("config/floor_registry/create").map((msg) => msg.name)).toEqual([
        "Basement",
        "Ground floor",
      ]);
      expect(calls("config/area_registry/create")).toEqual([
        { type: "config/area_registry/create", name: "Kitchen", floor_id: "floor_ground_floor" },
        { type: "config/area_registry/create", name: "Storage", floor_id: "floor_basement" },
      ]);
      // the actuator in the distribution board gets no area - though the board is in a room
      expect(
        calls("config/entity_registry/update").map((msg) => [msg.entity_id, msg.area_id]),
      ).toEqual([
        ["switch.entity_1", "area_kitchen"],
        ["switch.entity_2", "existing_bath"],
        ["switch.entity_3", "area_kitchen"],
        ["switch.entity_5", "existing_office"],
        ["switch.entity_6", "area_storage"],
      ]);
    });

    it("keeps the entity created if its area can't be assigned", async () => {
      const { view, calls } = setup({}, true);
      view["_assignAreas"] = true;
      await view["_createSelected"]();
      expect(calls("knx/create_entity")).toHaveLength(6);
      const rowState = view["_rowState"](AREA_RESULT.suggestions[0]);
      expect(rowState.status).toBe("created");
      expect(rowState.areaErrorMessage).toBe("suggestions_area_error");
    });
  });
});
