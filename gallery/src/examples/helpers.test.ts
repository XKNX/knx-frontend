import { describe, expect, it } from "vitest";
import en from "../localize/en.json";
import { parseOverride, resolveValues } from "../state";
import type { GalleryDefinition, JsonValue } from "../types";
import { defineExample } from "./helpers";

const definition = (changes: Partial<GalleryDefinition> = {}): GalleryDefinition => ({
  tag: "test-element",
  copy: {
    title: "Test",
    description: "Test component",
    api: {
      value: "Public value",
      raw: "Use raw input",
      default: "Default content",
      service: "Local service",
      handle: "Callback",
      run: "Run method",
      changed: "Change event",
    },
    labels: { value: "Value", raw: "Raw input", default: "Content" },
  },
  properties: { value: "initial" },
  async load() {
    throw new Error("Runtime must stay lazy");
  },
  ...changes,
});

describe("named gallery definitions", () => {
  it.each([
    [true, "boolean"],
    [2, "number"],
    ["text", "text"],
    [[], "json"],
    [{ optional: true }, "json"],
    [null, "json"],
  ] as const)("documents and infers a %s control", (value, kind) => {
    const { meta } = defineExample(definition({ properties: { value: value as JsonValue } }));
    expect(meta.controls[0]).toMatchObject({
      key: "value",
      label: "Value",
      description: "Public value",
      target: "property",
      kind,
      defaultValue: value,
    });
    expect(meta.api).toEqual([{ name: "value", kind: "property", description: "Public value" }]);
    expect(resolveValues(meta, "default", {})).toEqual({ value });
  });

  it("keeps example options editable and described outside the property API", () => {
    const entry = defineExample(
      definition({
        exampleOptions: { raw: false },
        suppliedProperties: ["service"],
        callbacks: ["handle"],
        methods: ["run"],
        events: ["changed"],
        slots: [""],
        apiDetails: { raw: "Extra raw detail", run: "Extra method detail" },
        interaction: { state: ["value"] },
      }),
    );
    expect(entry.meta.controls[1]).toMatchObject({
      key: "raw",
      description: "Use raw input",
      details: "Extra raw detail",
      target: "example",
    });
    expect(entry.meta.api).toEqual([
      { name: "value", kind: "property", description: "Public value" },
      { name: "service", kind: "property", description: "Local service" },
      { name: "run", kind: "method", description: "Run method", details: "Extra method detail" },
      { name: "changed", kind: "event", description: "Change event" },
      { name: "handle", kind: "callback", description: "Callback" },
      { name: "default", kind: "slot", description: "Default content" },
    ]);
    expect(entry.meta.slots).toEqual([{ name: "", label: "Content" }]);
    expect(entry).toMatchObject({
      covers: ["test-element"],
      interaction: { state: ["value"] },
      meta: {
        id: "test-element",
        category: "components",
        scenarios: [{ id: "default", label: en.sample.default, values: {} }],
      },
    });
  });

  it("uses select choices and explicit kind/custom validation through state resolution", () => {
    const { meta } = defineExample(
      definition({
        properties: { value: 1 },
        controls: {
          value: {
            choices: [1, 2],
            validate: (value) => (value === 2 ? "Rejected two" : undefined),
          },
        },
      }),
    );
    expect(meta.controls[0]).toMatchObject({
      kind: "select",
      options: [
        { label: "1", value: 1 },
        { label: "2", value: 2 },
      ],
    });
    expect(() => resolveValues(meta, "default", { value: 3 })).toThrow();
    expect(() => resolveValues(meta, "default", { value: 2 })).toThrow("Rejected two");
    const json = defineExample(definition({ controls: { value: { kind: "json" } } }));
    expect(json.meta.controls[0].kind).toBe("json");
  });

  it("lets explicit select choices define the allowed types", () => {
    const { meta } = defineExample(
      definition({
        properties: { value: false },
        controls: { value: { choices: [false, 5, { mode: "auto" }] } },
      }),
    );
    expect(resolveValues(meta, "default", { value: 5 })).toEqual({ value: 5 });
    expect(resolveValues(meta, "default", { value: { mode: "auto" } })).toEqual({
      value: { mode: "auto" },
    });
  });

  it("allows a property and its same-named slot to describe their separate interfaces", () => {
    const { meta } = defineExample(definition({ slots: ["value"] }));
    expect(meta.api.filter(({ name }) => name === "value").map(({ kind }) => kind)).toEqual([
      "property",
      "slot",
    ]);
  });

  it("labels structured choices distinctly and retains their typed values", () => {
    const choices = [{ mode: "auto" }, { mode: "manual" }, [1], [2]];
    const { meta } = defineExample(
      definition({ properties: { value: choices[0] }, controls: { value: { choices } } }),
    );
    expect(meta.controls[0].options?.map(({ label }) => label)).toEqual(
      choices.map((value) => JSON.stringify(value)),
    );
    for (const value of choices) {
      expect(parseOverride(meta.controls[0], JSON.stringify(value))).toEqual({ ok: true, value });
    }
  });

  it("preserves an explicit default scenario first and resets to its own values", () => {
    const { meta } = defineExample(
      definition({
        id: "custom",
        category: "dialogs",
        covers: ["test-element", "extra-element"],
        scenarios: [
          { id: "last", label: "Last", values: {} },
          { id: "default", label: "Authored default", values: { value: "default value" } },
          { id: "next", label: "Next", values: { value: "next value" } },
        ],
      }),
    );
    expect(meta.scenarios.map((item) => item.id)).toEqual(["default", "last", "next"]);
    expect(meta.scenarios[0]).toEqual({
      id: "default",
      label: "Authored default",
      values: { value: "default value" },
    });
    expect(resolveValues(meta, "default", { value: "edited" })).toEqual({ value: "edited" });
    expect(resolveValues(meta, "default", {})).toEqual({ value: "default value" });
  });

  it.each([
    [[], [1, { optional: true }], {}, false],
    [{ optional: true }, {}, [], false],
    [null, { extra: [null] }, false, true],
  ] as const)(
    "validates JSON at the root without turning samples into schemas",
    (sample, accepted, rejected, acceptsAny) => {
      const { meta } = defineExample(definition({ properties: { value: sample as JsonValue } }));
      expect(resolveValues(meta, "default", { value: accepted as JsonValue })).toEqual({
        value: accepted,
      });
      expect(parseOverride(meta.controls[0], JSON.stringify(rejected)).ok).toBe(acceptsAny);
    },
  );

  it.each([
    ["tag", { tag: " ", id: "test-element" }],
    ["id", { id: " " }],
    ["title", { copy: { ...definition().copy, title: " " } }],
    ["description", { copy: { ...definition().copy, description: " " } }],
    ["value", { copy: { ...definition().copy, labels: {} } }],
    ["value", { copy: { ...definition().copy, api: {} } }],
    ["value", { suppliedProperties: ["value"] }],
    ["service", { suppliedProperties: ["service", "service"] }],
    ["handle", { callbacks: ["handle", "handle"] }],
    ["value", { exampleOptions: { value: false } }],
    ["default", { slots: ["", "default"] }],
    [
      "default",
      {
        scenarios: [
          { id: "default", label: "One", values: {} },
          { id: "default", label: "Two", values: {} },
        ],
      },
    ],
    ["unknown", { controls: { unknown: {} } }],
    ["unknown", { apiDetails: { unknown: "Detail" } }],
    ["bad", { scenarios: [{ id: "bad", label: "Bad", values: { unknown: 1 } }] }],
    ["bad", { scenarios: [{ id: "bad", label: "Bad", values: { value: false } }] }],
    ["bad", { scenarios: [{ id: "bad", label: " ", values: {} }] }],
    ["value", { controls: { value: { choices: [] } } }],
    ["value", { controls: { value: { choices: ["other"] } } }],
    ["value", { controls: { value: { choices: [NaN] } } }],
    ["value", { controls: { value: { choices: ["initial", "initial"] } } }],
    ["value", { controls: { value: { kind: "select" } } }],
    ["value", { controls: { value: { kind: "boolean" } } }],
    ["value", { properties: { value: Infinity } }],
    ["value", { properties: { value: JSON.parse('{"constructor":{}}') } }],
    ["value", { controls: { value: { validate: () => "Rejected default" } } }],
  ] satisfies [string, Partial<GalleryDefinition>][])(
    "rejects malformed %s definitions with contextual errors",
    (field, changes) => {
      expect(() => defineExample(definition(changes))).toThrow(
        new RegExp(`test-element.*${field}|${field}.*test-element`),
      );
    },
  );
});
