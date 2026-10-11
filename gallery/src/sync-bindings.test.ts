import { describe, expect, it } from "vitest";
import { defineExample } from "./examples/helpers";
import { composeBindings } from "./sync-bindings";

const entry = () =>
  defineExample({
    tag: "test-element",
    copy: {
      title: "Test",
      description: "Test",
      labels: { value: "Value", raw: "Raw", narrow: "Narrow", transformed: "Transformed" },
      api: {
        value: "Value",
        raw: "Raw",
        narrow: "Narrow",
        transformed: "Transformed",
        callback: "Callback",
      },
    },
    properties: { value: "initial", narrow: false, transformed: 0 },
    exampleOptions: { raw: false },
    callbacks: ["callback"],
    interaction: {
      state: [
        "value",
        "controller._filter",
        "raw",
        "callback",
        "hass",
        "knx",
        "isWide",
        "isMobileDevice",
        "filterPaneNarrow",
      ],
      localProperties: ["transformed"],
      dialogOpeners: { "test-dialog": "_openDialog" },
    },
    async load() {
      throw new Error("Must stay lazy");
    },
  });

describe("entry-owned synchronization", () => {
  it("deduplicates actual state and editable properties while excluding options, callbacks and local fields", () => {
    const composed = composeBindings([entry()]);
    expect(composed.syncBindings["test-element"]).toEqual(["value", "controller._filter"]);
    expect(composed.dialogOpeners).toEqual({ "test-element": { "test-dialog": "_openDialog" } });
  });
  it("retains shared Home Assistant bindings without catalog entries", () => {
    expect(composeBindings([]).syncBindings["ha-textarea"]).toEqual(["value"]);
  });
  it("rejects multiple owners for a component instead of overwriting state or openers", () => {
    expect(() => composeBindings([entry(), entry()])).toThrow(/test-element/);
  });
});
