import { describe, expect, it, vi } from "vitest";
import { render } from "lit";
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

const panelsOf = (host: ShadowRoot, providerId: string) => [
  ...host.querySelectorAll<KnxStickyExpansionPanel>(
    `section[data-provider-id="${providerId}"] knx-sticky-expansion-panel`,
  ),
];

describe("KNXEntitiesSuggestions", () => {
  it("renders a section per provider with an expanded panel per group", () => {
    const { host } = draw(RESULT);
    expect(
      [...host.querySelectorAll("section")].map((section) =>
        section.getAttribute("data-provider-id"),
      ),
    ).toEqual(["fb", "fn", "cfg"]);
    for (const providerId of ["fb", "fn", "cfg"]) {
      const panels = panelsOf(host, providerId);
      expect(panels).toHaveLength(1);
      expect(panels[0].expanded).toBe(true);
    }
    expect(panelsOf(host, "fb")[0].querySelectorAll(".row")).toHaveLength(2);
  });

  it("titles a device group by address and name, a room by its name only", () => {
    const { host } = draw(RESULT);
    const title = (providerId: string) =>
      panelsOf(host, providerId)[0].querySelector(".group-title")!.textContent!.trim();
    expect(title("fb")).toBe("1.1.1 Actuator");
    expect(title("fn")).toBe("Kitchen");
  });

  it("keeps a panel collapsed across rerenders", () => {
    const { host, update } = draw(RESULT);
    const panel = panelsOf(host, "fb")[0];
    // the panel toggles itself - the view is disconnected, so set what a click would
    panel.expanded = false;
    update();
    expect(panelsOf(host, "fb")[0]).toBe(panel);
    expect(panel.expanded).toBe(false);
  });

  it("selects all of a group without toggling it or touching another provider", () => {
    const { view, host, update } = draw(RESULT);
    const panel = panelsOf(host, "fb")[0];
    // the header of the panel toggles on the clicks and key presses reaching it
    const reachedPanel = vi.fn();
    panel.addEventListener("click", reachedPanel);
    panel.addEventListener("keydown", reachedPanel);
    const checkbox = panel.querySelector<HTMLInputElement>(".group-header ha-checkbox")!;
    checkbox.checked = false;
    checkbox.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    checkbox.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true, composed: true }),
    );
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    update();
    expect(reachedPanel).not.toHaveBeenCalled();
    const selected = (id: string) =>
      view["_rowState"](RESULT.suggestions.find((item) => item.id === id)!).selected;
    expect(selected("fb_1")).toBe(false);
    expect(selected("fb_2")).toBe(false);
    // same group id, other provider
    expect(selected("cfg_1")).toBe(true);
    expect(selected("cfg_2")).toBe(true);
  });
});
