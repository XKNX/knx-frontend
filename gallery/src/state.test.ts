import { describe, expect, it } from "vitest";
import { defineExample } from "./examples/helpers";
import { appendEvent, parseOverride, resolveValues, validateSlots } from "./state";
import type { GalleryControl, GalleryEvent, GalleryMeta } from "./types";

const control = (
  kind: GalleryControl["kind"],
  defaultValue: GalleryControl["defaultValue"],
): GalleryControl => ({
  key: "value",
  label: "Value",
  description: "Test value",
  target: "property",
  kind,
  defaultValue,
  validate: () => undefined,
});
const meta: GalleryMeta = {
  id: "test",
  tag: "test-element",
  title: "Test",
  description: "Test",
  category: "components",
  controls: [control("json", null)],
  slots: [{ name: "", label: "Content" }],
  scenarios: [{ id: "default", label: "Default", values: { value: { nested: [1] } } }],
  api: [],
};

// These checks protect the trust boundary and preserve the last applied state.
describe("gallery values", () => {
  it.each([
    ["text", "", ""],
    ["boolean", "false", false],
    ["number", "0", 0],
    ["json", "null", null],
  ] as const)("preserves valid %s values", (kind, text, value) => {
    expect(parseOverride(control(kind, value), text)).toEqual({ ok: true, value });
    expect(
      resolveValues(
        {
          ...meta,
          controls: [control(kind, value)],
          scenarios: [{ id: "default", label: "Default", values: {} }],
        },
        "default",
        { value },
      ),
    ).toEqual({ value });
  });

  it.each([
    ["boolean", "0"],
    ["number", '"3"'],
    ["number", ""],
    ["number", "1e999"],
    ["json", "{"],
    ["json", '{"__proto__":{}}'],
    ["json", '{"nested":[{"constructor":{}}]}'],
    ["json", '{"nested":{"prototype":{}}}'],
  ] as const)("rejects invalid %s input %s", (kind, text) => {
    expect(parseOverride(control(kind, null), text).ok).toBe(false);
  });

  it("enforces select options and the declared validator", () => {
    const select = {
      ...control("select", null),
      options: [
        { label: "None", value: null },
        { label: "Empty", value: "" },
      ],
    };
    expect(parseOverride(select, "null")).toEqual({ ok: true, value: null });
    expect(parseOverride(select, '""')).toEqual({ ok: true, value: "" });
    expect(parseOverride(select, '"unknown"').ok).toBe(false);
    expect(
      parseOverride(
        { ...control("number", 0), validate: (value) => (value === 2 ? undefined : "Only two") },
        "1",
      ),
    ).toEqual({ ok: false, error: "Only two" });
  });

  it("resolves defaults, scenario values, then overrides as fresh data", () => {
    const defaults = { nested: [0] };
    const values = resolveValues({ ...meta, controls: [control("json", defaults)] }, "default", {});
    expect(values).toEqual({ value: { nested: [1] } });
    (values.value as { nested: number[] }).nested.push(2);
    expect(meta.scenarios[0].values).toEqual({ value: { nested: [1] } });
    expect(defaults).toEqual({ nested: [0] });
    expect(resolveValues(meta, "default", { value: null })).toEqual({ value: null });
  });

  it.each([
    { unknown: 1 },
    JSON.parse('{"__proto__":{}}'),
    { value: JSON.parse('{"nested":{"constructor":{}}}') },
    { value: undefined },
    { value: NaN },
    { value: Infinity },
    { value: new Date() },
  ])("rejects invalid overrides without changing the last applied value", (invalid) => {
    let applied = resolveValues(meta, "default", { value: 0 });
    expect(() => {
      applied = resolveValues(meta, "default", invalid);
    }).toThrow();
    expect(applied).toEqual({ value: 0 });
  });

  it("rejects unknown scenarios, wrong control types and cyclic data", () => {
    expect(() => resolveValues(meta, "missing", {})).toThrow();
    expect(() =>
      resolveValues({ ...meta, controls: [control("number", 0)] }, "default", { value: "1" }),
    ).toThrow();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => resolveValues(meta, "default", circular as never)).toThrow();
  });

  it("rejects sparse arrays while preserving dense JSON arrays", () => {
    const sparse = new Array(1);
    expect(() => resolveValues(meta, "default", { value: sparse })).toThrow();
    expect(() =>
      appendEvent([], { kind: "event", name: "sparse", timestamp: 0, args: sparse }),
    ).toThrow();
    expect(() => validateSlots(meta, sparse)).toThrow();
    expect(resolveValues(meta, "default", { value: [null, 0, false, ""] })).toEqual({
      value: [null, 0, false, ""],
    });
  });

  it("resolves example options with properties and resets both to selected scenario values", () => {
    const { meta: authored } = defineExample({
      tag: "state-example",
      copy: {
        title: "State",
        description: "State example",
        api: { value: "Public value", raw: "Raw example input" },
        labels: { value: "Value", raw: "Raw" },
      },
      properties: { value: { optional: true } },
      exampleOptions: { raw: false },
      scenarios: [{ id: "raw", label: "Raw input", values: { value: {}, raw: true } }],
      async load() {
        throw new Error("Not used");
      },
    });
    const edited = resolveValues(authored, "raw", { raw: false, value: { added: [1] } });
    expect(edited).toEqual({ value: { added: [1] }, raw: false });
    expect(resolveValues(authored, "raw", {})).toEqual({ value: {}, raw: true });
    expect(authored.api.some((api) => api.name === "raw")).toBe(false);
  });

  it("accepts only declared slots", () => {
    expect(validateSlots(meta, [""])).toEqual([""]);
    expect(() => validateSlots(meta, ["unknown"])).toThrow();
    expect(() => validateSlots(meta, ["__proto__"])).toThrow();
  });
});

describe("event history", () => {
  it("retains the last 200 events and snapshots their arguments", () => {
    const args = { nested: [1] };
    let events: GalleryEvent[] = [];
    for (let index = 0; index < 201; index++) {
      events = appendEvent(events, { kind: "event", name: String(index), timestamp: index, args });
    }
    args.nested.push(2);
    expect(events).toHaveLength(200);
    expect(events[0]).toEqual({ kind: "event", name: "1", timestamp: 1, args: { nested: [1] } });
    expect(events[199].name).toBe("200");
  });

  it("rejects non-JSON arguments", () => {
    expect(() =>
      appendEvent([], { kind: "event", name: "invalid", timestamp: 0, args: Infinity }),
    ).toThrow();
  });
});
