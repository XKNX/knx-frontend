import { describe, expect, it } from "vitest";
import { createTelegrams } from "./fixtures/telegrams";
import { callbackAdapter, eventAdapter, readMessage } from "./protocol";
import type { GalleryEvent, GalleryMessage } from "./types";

const origin = "http://localhost:8101";
const sessionId = "current-session";
const base = { channel: "knx-gallery", sessionId } as const;
const configure: GalleryMessage = {
  ...base,
  type: "configure",
  autoHeight: false,
  componentId: "knx-separator",
  scenarioId: "default",
  overrides: { height: 0 },
  slots: [""],
  theme: { mode: "system", theme: "knx" },
};
const message = (data: unknown, source: Window = window, eventOrigin = origin) =>
  new MessageEvent("message", { data, source, origin: eventOrigin });

describe("gallery protocol", () => {
  it("validates transferred raw history, revision and the existing source/session boundary", () => {
    const valid = { ...base, type: "fixture-telegrams", telegrams: createTelegrams(), revision: 2 };
    expect(readMessage(message(valid), window, origin, sessionId)).toEqual(valid);
    for (const invalid of [
      { ...valid, revision: -1 },
      { ...valid, revision: 0.5 },
      { ...valid, sessionId: "old" },
      { ...valid, telegrams: [{ ...valid.telegrams[0], timestamp: "bad" }] },
      { ...valid, telegrams: [{ ...valid.telegrams[0], payload: {} }] },
      { ...valid, telegrams: [{ timestamp: "2026-01-01", source: "1.1.1", destination: "1/0/1" }] },
      { ...valid, state: {} },
    ]) {
      expect(readMessage(message(invalid), window, origin, sessionId)).toBeUndefined();
    }
    expect(
      readMessage(message(valid, window, "https://foreign"), window, origin, sessionId),
    ).toBeUndefined();
    expect(readMessage(message(valid), {} as Window, origin, sessionId)).toBeUndefined();
  });

  it.each([
    { ...base, type: "ready" },
    configure,
    { ...base, type: "interaction-start", revision: 1 },
    { ...base, type: "rendered" },
    { ...base, type: "code", code: "<knx-tabs-subpage-data></knx-tabs-subpage-data>" },
    { ...base, type: "appearance", theme: { mode: "dark", theme: "default" } },
    {
      ...base,
      type: "preview-state",
      interaction: true,
      revision: 1,
      state: { elements: [], dialogs: [], route: "" },
    },
    { ...base, type: "auto-height", enabled: true },
    { ...base, type: "resize", height: 50 },
    { ...base, type: "resize", height: null },
    {
      ...base,
      type: "event",
      event: { kind: "callback", name: "select", timestamp: 0, args: null },
    },
    { ...base, type: "error", error: "Failed" },
  ])("accepts valid $type messages", (data) => {
    expect(readMessage(message(data), window, origin, sessionId)).toEqual(data);
  });

  it("rejects sparse slot arrays instead of returning null slot names", () => {
    expect(
      readMessage(message({ ...configure, slots: new Array(1) }), window, origin, sessionId),
    ).toBeUndefined();
  });

  it("rejects stale sessions, foreign origins and foreign windows", () => {
    expect(
      readMessage(message({ ...base, type: "ready", sessionId: "old" }), window, origin, sessionId),
    ).toBeUndefined();
    expect(
      readMessage(
        message({ ...base, type: "ready" }, window, "http://elsewhere"),
        window,
        origin,
        sessionId,
      ),
    ).toBeUndefined();
    const frame = document.createElement("iframe");
    document.body.append(frame);
    expect(
      readMessage(
        message({ ...base, type: "ready" }, frame.contentWindow!),
        window,
        origin,
        sessionId,
      ),
    ).toBeUndefined();
    frame.remove();
  });

  it.each([
    { ...base, type: "interaction-start", revision: -1 },
    { ...base, type: "interaction-start", revision: "1" },
    null,
    [],
    { ...base, type: "unknown" },
    { ...base, type: "code", code: 1 },
    {
      ...base,
      type: "preview-state",
      interaction: true,
      revision: 1,
      state: {
        elements: [{ path: [-2], tag: "input", values: { value: "x" }, unset: [] }],
        dialogs: [],
        route: "",
      },
    },
    { ...base, type: "auto-height", enabled: "true" },
    { ...base, type: "auto-height", enabled: true, extra: 1 },
    { ...base, type: "resize", height: -1 },
    { ...base, type: "resize", height: Infinity },
    { ...base, type: "resize", height: "50" },
    { ...base, type: "resize", height: 50, extra: true },
    { ...configure, autoHeight: "true" },
    { ...base, type: "ready", extra: true },
    { ...base, type: "ready", channel: "foreign" },
    { ...configure, componentId: "missing" },
    { ...configure, scenarioId: "missing" },
    { ...configure, overrides: { missing: 1 } },
    { ...configure, overrides: { height: "1" } },
    { ...configure, overrides: JSON.parse('{"__proto__":{}}') },
    { ...configure, slots: ["unknown"] },
    { ...configure, slots: [false] },
    { ...configure, theme: { mode: "unknown", theme: "default" } },
    { ...configure, theme: { mode: ["light"], theme: "default" } },
    { ...base, type: "event", event: { kind: ["event"], name: "x", timestamp: 0, args: null } },
    { ...configure, theme: { mode: "light", theme: "default", extra: true } },
    { ...base, type: "event", event: { kind: "unknown", name: "x", timestamp: 0, args: null } },
    {
      ...base,
      type: "event",
      event: { kind: "event", name: "x", timestamp: Infinity, args: null },
    },
    {
      ...base,
      type: "event",
      event: {
        kind: "event",
        name: "x",
        timestamp: 0,
        args: JSON.parse('{"nested":{"prototype":{}}}'),
      },
    },
    { ...base, type: "error", error: {} },
  ])("rejects malformed payload %#", (data) => {
    expect(readMessage(message(data), window, origin, sessionId)).toBeUndefined();
  });
});

describe("explicit observers", () => {
  it("records a non-bubbling event directly with an immutable selected payload", () => {
    const logs: GalleryEvent[] = [];
    const target = document.createElement("div");
    target.addEventListener(
      "selected",
      eventAdapter(
        "selected",
        (event) => logs.push(event),
        (event: Event) => (event as CustomEvent<{ value: number[] }>).detail,
      ),
    );
    const detail = { value: [0] };
    target.dispatchEvent(new CustomEvent("selected", { detail, bubbles: false }));
    detail.value.push(1);
    expect(logs).toEqual([
      { kind: "event", name: "selected", timestamp: expect.any(Number), args: { value: [0] } },
    ]);
  });

  it("preserves this, original arguments and the exact synchronous return", () => {
    const logs: GalleryEvent[] = [];
    const value = { value: [1] };
    const owner = {
      marker: 2,
      callback: callbackAdapter(
        "callback",
        (event) => logs.push(event),
        function (this: { marker: number }, arg: typeof value) {
          arg.value.push(this.marker);
          return arg;
        },
        (arg) => arg,
      ),
    };
    expect(owner.callback(value)).toBe(value);
    expect(value.value).toEqual([1, 2]);
    expect(logs[0].args).toEqual({ value: [1] });
  });

  it("preserves the original resolved promise and its result", async () => {
    const result = {};
    const promise = Promise.resolve(result);
    const callback = callbackAdapter(
      "callback",
      () => undefined,
      () => promise,
      () => [],
    );
    expect(callback()).toBe(promise);
    expect(await callback()).toBe(result);
  });

  it("records rejected promises without replacing the original promise or rejection", async () => {
    const logs: GalleryEvent[] = [];
    const error = new Error("Rejected");
    const promise = Promise.reject(error);
    const callback = callbackAdapter(
      "callback",
      (event) => logs.push(event),
      () => promise,
      () => [],
    );
    expect(callback()).toBe(promise);
    await expect(promise).rejects.toBe(error);
    expect(logs.map(({ kind, args }) => ({ kind, args }))).toEqual([
      { kind: "callback", args: [] },
      { kind: "error", args: "Rejected" },
    ]);
  });

  it("records and rethrows the same synchronous error", () => {
    const logs: GalleryEvent[] = [];
    const error = new Error("Thrown");
    const callback = callbackAdapter(
      "callback",
      (event) => logs.push(event),
      () => {
        throw error;
      },
      () => [],
    );
    expect(callback).toThrow(error);
    expect(logs[1]).toMatchObject({ kind: "error", args: "Thrown" });
  });
});
