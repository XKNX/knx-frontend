import { describe, expect, it } from "vitest";
import type { HassEntities, HassEntity } from "home-assistant-js-websocket";
import { selectEntityStates } from "./entity-states";

const state = (entityId: string, value: string): HassEntity =>
  ({ entity_id: entityId, state: value, attributes: {} }) as HassEntity;

describe("selectEntityStates", () => {
  const states: HassEntities = {
    "light.a": state("light.a", "on"),
    "light.b": state("light.b", "off"),
    "light.other": state("light.other", "on"),
  };

  it("keeps the previous result while none of the listed states changed", () => {
    const first = selectEntityStates(["light.a", "light.b"], states);
    expect(first).toEqual({ "light.a": states["light.a"], "light.b": states["light.b"] });
    // another entity changed; the listed ones did not
    const next = { ...states, "light.other": state("light.other", "off") };
    expect(selectEntityStates(["light.a", "light.b"], next, first)).toBe(first);
  });

  it("returns a new result when a listed state changed", () => {
    const first = selectEntityStates(["light.a", "light.b"], states);
    const next = { ...states, "light.b": state("light.b", "on") };
    const second = selectEntityStates(["light.a", "light.b"], next, first);
    expect(second).not.toBe(first);
    expect(second["light.b"]).toBe(next["light.b"]);
  });

  it("returns a new result when the listed entities change", () => {
    const first = selectEntityStates(["light.a"], states);
    expect(selectEntityStates(["light.a", "light.b"], states, first)).not.toBe(first);
    expect(selectEntityStates(["light.b"], states, first)).not.toBe(first);
  });

  it("keeps entries for entities without a state, such as disabled ones", () => {
    const first = selectEntityStates(["light.a", "light.disabled"], states);
    expect(first).toEqual({ "light.a": states["light.a"], "light.disabled": undefined });
    expect(selectEntityStates(["light.a", "light.disabled"], states, first)).toBe(first);
  });
});
