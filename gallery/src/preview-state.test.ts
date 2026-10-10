import { LitElement } from "lit";
import { describe, expect, it } from "vitest";
import { createTelegrams } from "./fixtures/telegrams";
import {
  applyElements,
  captureElements,
  isPreviewState,
  mergeFixtureTelegrams,
  PreviewSync,
  type PreviewState,
} from "./preview-state";

describe("preview state", () => {
  it("retains accepted history for immediate late configuration without replacing the current draft", () => {
    const original = createTelegrams();
    const added = { ...original[0], destination: "1/0/2", timestamp: "2026-01-02T00:00:00Z" };
    const current: PreviewState = {
      route: "",
      dialogs: [],
      elements: [
        { tag: "input", path: [0], values: { value: { kind: "json" as const, value: "1/0/3" } } },
        {
          tag: "knx-group-monitor",
          path: [1],
          values: { "controller._isPaused": { kind: "json" as const, value: true } },
        },
      ],
      fixtures: { telegrams: JSON.parse(JSON.stringify(original)), monitor: [] },
    };
    const accepted = mergeFixtureTelegrams(current, [...original, added]);
    expect(accepted.elements).toEqual(current.elements);
    expect(accepted.fixtures!.telegrams).toEqual([...original, added]);
    expect(accepted.fixtures!.monitor).toEqual([]);
    expect(mergeFixtureTelegrams(accepted, [...original, added])).toEqual(accepted);
    const running = structuredClone(current);
    running.elements[1].values["controller._isPaused"]!.value = false;
    expect(mergeFixtureTelegrams(running, [added]).fixtures!.monitor).toEqual([added]);
    expect(mergeFixtureTelegrams(current, [{ ...added, payload: {} } as never])).toEqual(current);
  });

  it("preserves Sets and cleared values through JSON in nested shadow roots", async () => {
    const make = () => {
      const root = document.createElement("div");
      const tree = document.createElement("knx-project-devices-view");
      Object.assign(tree, { _expanded: new Set(["device-1"]), searchText: "Kitchen" });
      const shadow = tree.attachShadow({ mode: "open" });
      const selector = document.createElement("knx-single-address-selector");
      Object.assign(selector, { value: undefined });
      shadow.append(selector);
      root.append(tree);
      return { root, tree, selector };
    };
    const source = make();
    const target = make();
    Object.assign(target.tree, { _expanded: new Set(), searchText: "Bedroom" });
    Object.assign(target.selector, { value: "1/2/3" });
    const state = JSON.parse(
      JSON.stringify({ elements: captureElements(source.root), dialogs: [], route: "" }),
    );
    expect(isPreviewState(state)).toBe(true);
    await applyElements(target.root, state.elements);
    expect(Reflect.get(target.tree, "_expanded")).toEqual(new Set(["device-1"]));
    expect(Reflect.get(target.tree, "searchText")).toBe("Kitchen");
    expect(Reflect.get(target.selector, "value")).toBeUndefined();
  });

  it("rejects arbitrary property paths and skips replaced nodes and file inputs", async () => {
    const root = document.createElement("div");
    const field = document.createElement("input");
    field.type = "file";
    root.append(field);
    expect(captureElements(root)).toEqual([]);
    const state = {
      elements: [{ path: [0], tag: "input", values: { value: { kind: "json", value: "text" } } }],
      dialogs: [],
      route: "",
    };
    expect(isPreviewState(state)).toBe(true);
    expect(
      isPreviewState({
        ...state,
        elements: [
          { ...state.elements[0], values: { innerHTML: { kind: "json", value: "<script>" } } },
        ],
      }),
    ).toBe(false);
    expect(isPreviewState({ ...state, route: "https://other.example/" })).toBe(false);
    await applyElements(root, state.elements as Parameters<typeof applyElements>[1]);
    expect(field.value).toBe("");
    const replacement = document.createElement("textarea");
    replacement.value = "preserved";
    field.replaceWith(replacement);
    await applyElements(root, state.elements as Parameters<typeof applyElements>[1]);
    expect(replacement.value).toBe("preserved");
  });
});

class SyncHost extends LitElement {}
customElements.define("gallery-sync-test", SyncHost);
declare global {
  interface HTMLElementTagNameMap {
    "gallery-sync-test": SyncHost;
  }
}

it("carries plain fixture outcomes through the same snapshot without echoing or applying after disposal", async () => {
  const host = new SyncHost();
  document.body.append(host);
  await host.updateComplete;
  let outcome = { name: "Initial" };
  const emitted: unknown[] = [];
  const sync = new PreviewSync(
    host,
    (state) => emitted.push(state),
    () => undefined,
    () => ({
      capture: () => outcome,
      apply: (state) => {
        outcome = state as typeof outcome;
      },
    }),
  );
  try {
    sync.capture();
    expect(emitted[0]).toMatchObject({ fixtures: { name: "Initial" } });
    const accepted = { elements: [], dialogs: [], route: "", fixtures: { name: "Saved" } };
    expect(isPreviewState(accepted)).toBe(true);
    emitted.length = 0;
    await sync.apply(accepted, 0);
    expect(outcome).toEqual({ name: "Saved" });
    expect(emitted).toEqual([]);
    sync.dispose();
    await sync.apply({ ...accepted, fixtures: { name: "Stale" } }, 0);
    expect(outcome).toEqual({ name: "Saved" });
    expect(isPreviewState({ ...accepted, fixtures: { callback: () => undefined } })).toBe(false);
    expect(isPreviewState({ ...accepted, fixtures: [] })).toBe(false);
    expect(isPreviewState({ ...accepted, unexpected: true })).toBe(false);
  } finally {
    sync.dispose();
    host.remove();
  }
});

it("authorizes background outcomes only for the current producer without publishing initial defaults", async () => {
  const host = new SyncHost();
  document.body.append(host);
  await host.updateComplete;
  const emitted: boolean[] = [];
  let value = 0;
  const sync = new PreviewSync(
    host,
    (_state, interaction) => emitted.push(interaction),
    () => undefined,
    () => ({
      capture: () => ({ value }),
      apply: (state) => {
        value = state.value as number;
      },
    }),
  );
  try {
    expect(sync.canProduce).toBe(false);
    sync.setWriter(true, 1);
    expect(sync.canProduce).toBe(false);
    sync.setWriter(true, 0);
    sync.capture();
    expect(emitted).toEqual([false]);
    value = 1;
    sync.fixtureChanged();
    sync.capture();
    expect(emitted).toEqual([false, true]);
    sync.setWriter(false, 0);
    expect(sync.canProduce).toBe(false);
    await sync.apply({ elements: [], dialogs: [], route: "", fixtures: { value: 2 } }, 0);
    expect(emitted).toEqual([false, true]);
    sync.dispose();
    sync.setWriter(true, 0);
    expect(sync.canProduce).toBe(false);
  } finally {
    sync.dispose();
    host.remove();
  }
});
