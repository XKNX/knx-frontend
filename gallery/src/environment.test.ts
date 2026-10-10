import { ContextEvent } from "@lit/context";
import { LitElement } from "lit";
import type { HomeAssistant } from "@ha/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  entitiesByGroupContext,
  type EntitiesByGroupContextValue,
} from "../../src/data/knx-entities-by-group-context";
import { createTelegrams } from "./fixtures/telegrams";
import type { TelegramDict } from "../../src/types/websocket";
import { createEnvironment } from "./environment";
import type { GalleryEnvironment, GalleryEvent } from "./types";

vi.hoisted(() => {
  vi.stubGlobal("__STATIC_PATH__", "/static/");
});

// Only replace the asset fetch. The real provideHass and its context/update logic run.
vi.mock("@ha/util/common-translation", () => ({
  getLocalLanguage: () => "en",
  getTranslation: async () => ({ language: "en", data: { "ui.common.save": "Save" } }),
}));

class EnvironmentHost extends LitElement {
  hass!: HomeAssistant;
}
customElements.define("gallery-environment-test", EnvironmentHost);
const environments: GalleryEnvironment[] = [];
let media: EventTarget & { matches: boolean };
async function setup(
  changed: () => void = () => undefined,
  transferred: (telegrams: TelegramDict[]) => void = () => undefined,
) {
  const host = new EnvironmentHost();
  document.body.append(host);
  const events: GalleryEvent[] = [];
  const env = await createEnvironment(host, (event) => events.push(event), changed, transferred);
  environments.push(env);
  return { host, env, events };
}
beforeEach(() => {
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => media);
});
afterEach(async () => {
  vi.useRealTimers();
  // provideHass starts lazy formatting imports; let them finish before jsdom teardown.
  await vi.dynamicImportSettled();
  environments.splice(0).forEach((env) => env.dispose());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("offline environment", () => {
  it("serves fixture readers while translations are still initializing", async () => {
    const host = new EnvironmentHost();
    document.body.append(host);
    const initializing = createEnvironment(host, () => undefined).then((env) => {
      environments.push(env);
      return env;
    });
    await Promise.all([
      initializing,
      expect(host.hass.callWS({ type: "knx/group_monitor_info" })).resolves.toEqual({
        project_loaded: true,
        recent_telegrams: createTelegrams(),
      }),
    ]);
  });

  it("transfers only accepted user history after a handoff, without replaying peer callbacks", async () => {
    const transferred = vi.fn();
    const source = await setup(undefined, transferred);
    const peer = await setup();
    const sourceCallback = vi.fn();
    const peerCallback = vi.fn();
    await source.env.hass.connection.subscribeMessage(sourceCallback, {
      type: "knx/subscribe_telegrams",
    });
    await peer.env.hass.connection.subscribeMessage(peerCallback, {
      type: "knx/subscribe_telegrams",
    });
    vi.useFakeTimers();
    await source.env.hass.callService("knx", "read", { address: "1/0/2" });
    source.env.canProduce = () => false;
    await vi.advanceTimersByTimeAsync(30);
    expect(transferred).toHaveBeenCalledOnce();
    expect(sourceCallback).toHaveBeenCalledOnce();
    const history = transferred.mock.calls[0][0];
    const eventCount = peer.events.length;
    expect(peer.env.fixtures.receiveTelegrams(history)).toBe(true);
    expect(peer.env.fixtures.receiveTelegrams(history)).toBe(false);
    expect(peer.env.fixtures.data.telegrams).toEqual(source.env.fixtures.data.telegrams);
    expect(peerCallback).not.toHaveBeenCalled();
    expect(peer.events).toHaveLength(eventCount);
    expect(source.events.filter((event) => event.name === "knx.read")).toHaveLength(1);
    await source.env.hass.callService("knx", "read", { address: "1/0/1" });
    source.env.dispose();
    await vi.advanceTimersByTimeAsync(30);
    expect(transferred).toHaveBeenCalledOnce();
  });

  it("advances raw history while a monitor is paused, validates atomically and ignores disposed delivery", async () => {
    const { env, host } = await setup();
    const monitor = document.createElement("knx-group-monitor");
    const controller = {
      isPaused: true,
      telegrams: [],
      addHistoricalTelegrams: vi.fn(),
      clearTelegrams: vi.fn(),
    };
    Reflect.set(monitor, "controller", controller);
    host.append(monitor);
    env.fixtures.refresh(host);
    env.fixtures.capture();
    const telegram = {
      ...createTelegrams()[0],
      destination: "1/0/2",
      timestamp: "2026-01-02T00:00:00Z",
    };
    expect(env.fixtures.receiveTelegrams([telegram])).toBe(true);
    expect(env.fixtures.data.telegrams).toContainEqual(telegram);
    expect(env.fixtures.data.monitor).toEqual([]);
    expect(controller.addHistoricalTelegrams).not.toHaveBeenCalled();
    const before = env.fixtures.capture();
    expect(() => env.fixtures.receiveTelegrams([telegram, { ...telegram, payload: {} }])).toThrow();
    expect(env.fixtures.capture()).toEqual(before);
    controller.isPaused = false;
    const next = { ...telegram, destination: "1/0/3" };
    env.fixtures.receiveTelegrams([telegram, next]);
    expect(controller.addHistoricalTelegrams).toHaveBeenCalledExactlyOnceWith([next], false);
    env.dispose();
    expect(env.fixtures.receiveTelegrams([{ ...next, destination: "1/0/4" }])).toBe(false);
    expect(env.fixtures.data.telegrams).not.toContainEqual(
      expect.objectContaining({ destination: "1/0/4" }),
    );
  });

  it("isolates mutable demo data and reads the current host hass", async () => {
    const first = await setup();
    const second = await setup();
    first.env.hass.config.components.push("gallery-test");
    first.env.hass.states["light.living_room"].attributes.friendly_name = "Changed";
    const project = await first.env.hass.callWS<{ info: { name: string } }>({
      type: "knx/get_knx_project",
    });
    project.info.name = "Changed";
    expect(second.env.hass.config.components).not.toContain("gallery-test");
    expect(second.env.hass.states["light.living_room"].attributes.friendly_name).toBe(
      "Living room light",
    );
    expect(await second.env.hass.callWS({ type: "knx/get_knx_project" })).not.toEqual(project);
    first.env.applyTheme({ mode: "dark", theme: "knx" });
    expect(first.env.hass).toBe(first.host.hass);
    expect(first.env.hass.themes.darkMode).toBe(true);
    expect(second.env.hass.themes.darkMode).toBe(false);
  });
  it("logs and rejects unknown public APIs and services without network access", async () => {
    const { env, events } = await setup();
    await expect(env.hass.callWS({ type: "unknown/ws" })).rejects.toBeDefined();
    await expect(env.hass.callApi("GET", "unknown/rest")).rejects.toBeDefined();
    await expect(env.hass.callService("unknown", "service")).rejects.toBeDefined();
    await expect(env.hass.fetchWithAuth("https://example.com")).rejects.toBeDefined();
    await expect(
      env.hass.connection.subscribeEvents(() => undefined, "unknown/event"),
    ).rejects.toBeDefined();
    await expect(env.hass.callApiRaw("GET", "unknown/raw")).rejects.toBeDefined();
    expect(() => env.hass.sendWS({ type: "unknown/one-way" })).toThrow();
    expect(events.filter((event) => event.kind === "error")).toHaveLength(7);
  });
  it("stops delayed subscription deliveries on unsubscribe and dispose", async () => {
    const { env } = await setup();
    vi.useFakeTimers();
    const callback = vi.fn();
    const unsubscribe = await env.hass.connection.subscribeMessage(callback, {
      type: "knx/subscribe_telegrams",
    });
    await env.hass.callService("knx", "send", { address: "1/0/1", payload: 1 });
    await vi.runAllTimersAsync();
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: "Outgoing",
        telegramtype: "GroupValueWrite",
        dpt_main: 1,
        dpt_sub: 1,
        dpt_name: "Switch",
        unit: null,
      }),
    );
    callback.mockClear();
    await env.hass.callService("knx", "send", { address: "1/0/2", payload: 21.5 });
    await vi.runAllTimersAsync();
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: "1/0/2",
        dpt_main: 9,
        dpt_sub: 1,
        dpt_name: "Temperature",
        unit: "°C",
      }),
    );
    callback.mockClear();
    await env.hass.callService("knx", "read", { address: "1/0/1" });
    await unsubscribe();
    await vi.runAllTimersAsync();
    expect(callback).not.toHaveBeenCalled();
    await env.hass.connection.subscribeMessage(callback, { type: "knx/subscribe_telegrams" });
    await env.hass.callService("knx", "read", { address: "1/0/1" });
    env.dispose();
    await vi.runAllTimersAsync();
    expect(callback).not.toHaveBeenCalled();
    expect(env.signal.aborted).toBe(true);
  });
  it("reloads group contexts from an explicit scenario mock", async () => {
    const { env, host } = await setup();
    const child = document.createElement("span");
    host.append(child);
    let context: EntitiesByGroupContextValue | null = null;
    child.dispatchEvent(
      new ContextEvent(
        entitiesByGroupContext,
        child,
        (value) => {
          context = value;
        },
        true,
      ),
    );
    env.mockWS("knx/get_entities_by_group", () => ({
      "1/0/2": [{ platform: "light", unique_id: "light.living_room", ui: false }],
    }));
    await context!.reload();
    expect(context!.groups).toEqual({ "1/0/2": { ui: [], yaml: ["light.living_room"] } });
  });
  it("publishes delayed successful outcomes without DOM activity and aborts pending work", async () => {
    let publications = 0;
    const source = await setup(() => publications++);
    const peer = await setup(() => publications++);
    vi.useFakeTimers();
    await source.env.hass.callService("knx", "read", { address: "1/0/1" });
    expect(publications).toBe(0);
    await vi.advanceTimersByTimeAsync(30);
    expect(publications).toBe(1);
    const beforeEvents = peer.events.length;
    peer.env.fixtureState!.apply(source.env.fixtureState!.capture());
    expect(peer.events).toHaveLength(beforeEvents);
    expect(publications).toBe(1);
    await expect(
      source.env.hass.callService("knx", "send", { address: "9/9/9", payload: 1 }),
    ).rejects.toThrow();
    expect(publications).toBe(1);
    await source.env.hass.callService("knx", "read", { address: "1/0/1" });
    source.env.dispose();
    await vi.advanceTimersByTimeAsync(30);
    expect(publications).toBe(1);
  });

  it("rejects a malformed combined snapshot atomically and clones every accepted readback", async () => {
    const { env } = await setup();
    const before = env.fixtureState!.capture();
    const hass = env.hass;
    expect(() =>
      env.fixtureState!.apply({ ...before, project: null, devices: { invalid: { id: 1 } } }),
    ).toThrow();
    expect(env.fixtureState!.capture()).toEqual(before);
    expect(env.hass).toBe(hass);
    const device = await env.hass.callWS<{ id: string; name: string }>({
      type: "knx/create_device",
      name: "New device",
      area_id: "living_room",
    });
    const captured = env.fixtureState!.capture();
    device.name = "Mutated return";
    expect(env.hass.devices[device.id].name).toBe("New device");
    env.fixtureState!.apply(captured);
    const config = await env.hass.callWS<Record<string, unknown>>({
      type: "knx/get_time_server_config",
    });
    config.time = { write: "1/0/9" };
    expect(await env.hass.callWS({ type: "knx/get_time_server_config" })).toEqual({});
  });

  it("waits for lazy product readers to upgrade before hydrating them", async () => {
    const { env } = await setup();
    const root = document.createElement("div");
    const project = document.createElement("knx-project-view");
    const monitor = document.createElement("knx-group-monitor");
    root.append(project, monitor);
    expect(() => env.fixtures.refresh(root)).not.toThrow();
    expect(() => env.fixtures.capture()).not.toThrow();
    const requestUpdate = vi.fn();
    Reflect.set(project, "requestUpdate", requestUpdate);
    Reflect.set(monitor, "controller", { telegrams: [] });
    env.fixtures.refresh(root);
    expect(Reflect.get(project, "_lastTelegrams")).toEqual(env.fixtures.latest);
    expect(requestUpdate).toHaveBeenCalledOnce();
    expect(env.fixtures.capture().monitor).toEqual([]);
  });
  it("updates CSS and HA dark mode on system changes only while selected", async () => {
    const { env, host } = await setup();
    env.applyTheme({ mode: "system", theme: "knx" });
    media.matches = true;
    media.dispatchEvent(new Event("change"));
    expect(env.hass.themes.darkMode).toBe(true);
    expect(host.style.getPropertyValue("--primary-color")).toBe("#5e8a3a");
    env.applyTheme({ mode: "light", theme: "default" });
    media.dispatchEvent(new Event("change"));
    expect(env.hass.themes.darkMode).toBe(false);
    expect(host.style.getPropertyValue("--primary-color")).not.toBe("#5e8a3a");
    env.dispose();
    media.dispatchEvent(new Event("change"));
    expect(env.hass.themes.darkMode).toBe(false);
  });
});

declare global {
  interface HTMLElementTagNameMap {
    "gallery-environment-test": EnvironmentHost;
  }
}
