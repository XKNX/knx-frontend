import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalog } from "./catalog";
import { parseOverride, resolveValues } from "./state";
import { observe } from "./examples/helpers";
import type { GalleryEvent } from "./types";

describe("component catalog", () => {
  it("has unique identities and documented, valid controls and scenarios", () => {
    expect(new Set(catalog.map(({ meta }) => meta.id)).size).toBe(catalog.length);
    for (const { meta } of catalog) {
      expect(meta.description).not.toBe("");
      expect(["components", "dialogs", "views"]).toContain(meta.category);
      expect(meta.scenarios.filter(({ id }) => id === "default")).toHaveLength(1);
      for (const api of meta.api) expect(api.description).toBeTruthy();
      expect(meta.scenarios.length).toBeGreaterThan(0);
      expect(new Set(meta.controls.map(({ key }) => key)).size).toBe(meta.controls.length);
      for (const control of meta.controls) {
        expect(control.label).not.toBe("");
        const property = meta.api.find(
          ({ name, kind }) => name === control.key && kind === "property",
        );
        expect(control.description).toBeTruthy();
        expect(["property", "example"]).toContain(control.target);
        if (control.target === "example") expect(property).toBeUndefined();
        else expect(property).toBeDefined();
      }
      for (const scenario of meta.scenarios) {
        expect(() => resolveValues(meta, scenario.id, {})).not.toThrow();
      }
    }
  });
});

it("documents selector controls once and classifies its supplied callback explicitly", () => {
  const { meta } = catalog.find((entry) => entry.meta.id === "knx-dpt-option-selector")!;
  expect(
    meta.controls.every((control) => control.description && control.target === "property"),
  ).toBe(true);
  expect(meta.api.find((api) => api.name === "localizeValue")?.kind).toBe("callback");
  expect(meta.api.find((api) => api.name === "options")?.kind).toBe("property");
  expect(
    meta.controls.some((control) => control.key === "options" || control.key === "localizeValue"),
  ).toBe(false);
  expect(meta.scenarios.map((scenario) => scenario.id)).toEqual(["default", "disabled", "invalid"]);
});

it("observes Event-with-detail payloads while keeping plain events target-free", () => {
  const events: GalleryEvent[] = [];
  const target = new EventTarget();
  target.addEventListener(
    "sample",
    observe((event) => events.push(event)),
  );
  target.dispatchEvent(new Event("sample"));
  target.dispatchEvent(Object.assign(new Event("sample"), { detail: { direction: "desc" } }));
  expect(events).toEqual([
    { kind: "event", name: "sample", timestamp: expect.any(Number), args: null },
    { kind: "event", name: "sample", timestamp: expect.any(Number), args: { direction: "desc" } },
  ]);
});

it("assigns every permanent source registration to exactly one example", () => {
  const sourceRoot = join(import.meta.dirname, "../../src");
  const registeredTags = new Set<string>();
  for (const path of readdirSync(sourceRoot, { recursive: true }) as string[]) {
    if (!path.endsWith(".ts") || /\.(?:test|stub)\./.test(path)) continue;
    const source = readFileSync(join(sourceRoot, path), "utf8");
    for (const match of source.matchAll(
      /@customElement\(["']([^"']+)["']\)|customElements\.define\(["']([^"']+)["']/g,
    )) {
      registeredTags.add(match[1] ?? match[2]);
    }
  }
  expect(registeredTags.size).toBeGreaterThan(0);
  for (const tag of registeredTags) expect(customElements.get(tag)).toBeUndefined();
  const covered = catalog.flatMap(({ covers }) => covers);
  expect(new Set(covered).size).toBe(covered.length);
  expect(new Set(covered)).toEqual(registeredTags);
});

it.each([
  [
    "knx-data-table-ga-label",
    "groupAddresses",
    [{ address: "1/0/1" }],
    [{ name: "missing address" }],
  ],
  ["knx-data-table-related-label", "entities", [], [1]],
  ["knx-list-filter", "selectedOptions", [], [null]],
  ["knx-dpt-dialog-selector", "validDPTs", [], [1]],
  ["knx-project-device-tree", "validDPTs", [{ main: 1, sub: null }], [{ main: "1", sub: 1 }]],
  ["knx-project-devices-view", "filterDpt", [], [false]],
  ["knx-group-address-selector", "config", {}, { passive: "1/0/1" }],
] as const)("validates the actual %s %s input contract", (tag, key, accepted, rejected) => {
  const control = catalog
    .find(({ meta }) => meta.tag === tag)!
    .meta.controls.find((item) => item.key === key)!;
  expect(parseOverride(control, JSON.stringify(accepted)).ok).toBe(true);
  expect(parseOverride(control, JSON.stringify(rejected)).ok).toBe(false);
});

it.each([
  {},
  { ga_switch: {} },
  { ga_switch: null },
  { ga_switch: { write: null, state: "", passive: [], dpt: "1.001" } },
  { ga_switch: { write: "1/0/1", passive: ["1/0/2"] } },
])("accepts optional form group-address configuration %j", (value) => {
  const control = catalog
    .find(({ meta }) => meta.tag === "knx-form")!
    .meta.controls.find(({ key }) => key === "config")!;
  expect(parseOverride(control, JSON.stringify(value)).ok).toBe(true);
});

it.each([
  { ga_switch: { passive: 42 } },
  { ga_switch: { passive: [42] } },
  { ga_switch: { write: 42 } },
  { ga_switch: { state: [] } },
  { ga_switch: { dpt: false } },
  { ga_switch: [] },
  { ga_switch: "1/0/1" },
])("rejects malformed form group-address configuration %j", (value) => {
  const control = catalog
    .find(({ meta }) => meta.tag === "knx-form")!
    .meta.controls.find(({ key }) => key === "config")!;
  expect(parseOverride(control, JSON.stringify(value)).ok).toBe(false);
});

it("preserves the separator's documented methods, supplied ratio and height details", () => {
  const { meta } = catalog.find((entry) => entry.meta.tag === "knx-separator")!;
  expect(meta.api.filter(({ kind }) => kind === "method").map(({ name }) => name)).toEqual([
    "setHeight(newHeight, animate?)",
    "expand()",
    "collapse()",
    "toggle()",
  ]);
  expect(meta.api.find(({ name }) => name === "expansionRatio")?.kind).toBe("property");
  expect(meta.controls.some(({ key }) => key === "expansionRatio")).toBe(false);
  const height = meta.controls.find(({ key }) => key === "height")!;
  expect(height.details).toBeTruthy();
  expect(meta.api.find(({ name }) => name === "height")?.details).toBe(height.details);
  expect(parseOverride(height, "-1").ok).toBe(false);
  expect(parseOverride(height, "0").ok).toBe(true);
  expect(meta.slots.map(({ name }) => name)).toEqual([""]);
  expect(meta.scenarios.map(({ id, label }) => [id, label])).toEqual([
    ["default", "Default"],
    ["expanded", "Expanded"],
  ]);
});
