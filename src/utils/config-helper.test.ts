import { describe, expect, it } from "vitest";

import { getNestedValue, setNestedValue } from "./config-helper";

describe("getNestedValue", () => {
  it("reads a nested value", () => {
    const config = { knx: { color: { ga_color: { write: "1/2/3" } } } };
    expect(getNestedValue(config, "knx.color.ga_color")).toEqual({ write: "1/2/3" });
  });

  it("is undefined for a missing key", () => {
    expect(getNestedValue({ knx: {} }, "knx.ga_switch")).toBeUndefined();
    expect(getNestedValue({ knx: {} }, "knx.color.ga_color")).toBeUndefined();
  });

  it("reads an optional key set to null as absent", () => {
    // storage written by 2026.11.0 holds unset group selects and group addresses as `null`
    expect(getNestedValue({ knx: { color: null } }, "knx.color")).toBeUndefined();
  });

  it("is undefined below a null parent", () => {
    expect(getNestedValue({ knx: { color: null } }, "knx.color.ga_color")).toBeUndefined();
  });

  it("is undefined below a primitive", () => {
    expect(getNestedValue({ knx: { ga_switch: "1/2/3" } }, "knx.ga_switch.write")).toBeUndefined();
  });

  it("keeps falsy values that are set", () => {
    expect(getNestedValue({ knx: { sync_state: false } }, "knx.sync_state")).toBe(false);
    expect(getNestedValue({ knx: { max_step: 0 } }, "knx.max_step")).toBe(0);
  });
});

describe("setNestedValue", () => {
  it("creates intermediate objects", () => {
    const config = {};
    setNestedValue(config, "knx.color.ga_color", "1/2/3");
    expect(config).toEqual({ knx: { color: { ga_color: "1/2/3" } } });
  });

  it("writes below a parent that is null", () => {
    const config = { knx: { ga_switch: "1/1/1", color: null } };
    setNestedValue(config, "knx.color.ga_color", "1/2/3");
    expect(config).toEqual({ knx: { ga_switch: "1/1/1", color: { ga_color: "1/2/3" } } });
  });

  it("removes a value and prunes emptied parents", () => {
    const config = { knx: { color: { ga_color: "1/2/3" }, ga_switch: "1/1/1" } };
    setNestedValue(config, "knx.color.ga_color", undefined);
    expect(config).toEqual({ knx: { ga_switch: "1/1/1" } });
  });

  it("does not create parents when removing", () => {
    const config = { knx: { color: null } };
    setNestedValue(config, "knx.color.ga_color", undefined);
    setNestedValue(config, "knx.speed.ga_speed", undefined);
    expect(config).toEqual({ knx: { color: null } });
  });

  it("removes a null parent itself", () => {
    const config = { knx: { color: null, ga_switch: "1/1/1" } };
    setNestedValue(config, "knx.color", undefined);
    expect(config).toEqual({ knx: { ga_switch: "1/1/1" } });
  });
});
