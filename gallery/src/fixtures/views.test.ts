import { LitElement } from "lit";
import type { HomeAssistant } from "@ha/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateEntityData, ExposeConfigData } from "../../../src/types/entity_data";
import type { KNXBaseData, KNXProject } from "../../../src/types/websocket";
import { createEnvironment } from "../environment";
import type { GalleryEnvironment, GalleryEvent } from "../types";
import { createKnxFixtures } from "./knx";
import { prepareViews } from "./views";
import { initialEntity } from "./outcomes";

vi.hoisted(() => vi.stubGlobal("__STATIC_PATH__", "/static/"));
vi.mock("@ha/util/common-translation", () => ({
  getLocalLanguage: () => "en",
  getTranslation: async () => ({ language: "en", data: {} }),
}));

class FixtureHost extends LitElement {
  hass!: HomeAssistant;
}
customElements.define("gallery-fixture-test", FixtureHost);
const environments: GalleryEnvironment[] = [];
async function setup() {
  const host = new FixtureHost();
  document.body.append(host);
  const events: GalleryEvent[] = [];
  const env = await createEnvironment(host, (event) => events.push(event));
  environments.push(env);
  return { env, events };
}
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => Object.assign(new EventTarget(), { matches: false }));
});
afterEach(async () => {
  vi.useRealTimers();
  await vi.dynamicImportSettled();
  environments.splice(0).forEach((env) => env.dispose());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("explicit view fixtures", () => {
  it("merges named scenario fixtures and replaces endpoint failure lists", async () => {
    history.replaceState(null, "", "?thumbnail");
    const { viewExample } = await import("../examples/view");
    const example = await viewExample("knx-create-entity", "/entities/edit/light.living_room", {
      fixtures: { project: null, failCalls: ["knx/get_entity_config"] },
      scenarios: {
        create: { path: "/entities/create/light", fixtures: { emptyExposes: true, failCalls: [] } },
      },
    });
    const { env } = await setup();
    await example.prepare!(env, "create");
    expect(location.hash).toBe("#/knx/entities/create/light");
    expect(await env.hass.callWS({ type: "knx/get_knx_project" })).toBeNull();
    expect(await env.hass.callWS({ type: "knx/get_expose_groups" })).toEqual({});
    expect(
      await env.hass.callWS({ type: "knx/get_entity_config", entity_id: "light.living_room" }),
    ).toMatchObject({ platform: "light" });
  });
  it("prepares normal, missing and empty projects with matching base data", async () => {
    const { env } = await setup();
    await prepareViews(env, {}, false);
    const normal = await env.hass.callWS<KNXProject>({ type: "knx/get_knx_project" });
    expect(normal.group_addresses["1/0/1"].name).toBe("Living room light");
    await prepareViews(env, { project: null, dptMetadata: {} }, false);
    expect(await env.hass.callWS({ type: "knx/get_knx_project" })).toBeNull();
    expect(env.knx.projectInfo).toBeNull();
    expect(env.knx.dptMetadata).toEqual({});
    expect(await env.hass.callWS({ type: "knx/get_base_data" })).toMatchObject({
      project_info: null,
      dpt_metadata: {},
    });
    const empty: KNXProject = {
      info: createKnxFixtures().project.info,
      group_addresses: {},
      group_ranges: {},
      devices: {},
      communication_objects: {},
    };
    await prepareViews(env, { project: empty }, false);
    expect(await env.hass.callWS({ type: "knx/get_knx_project" })).toEqual(empty);
    expect(await env.hass.callWS<KNXBaseData>({ type: "knx/get_base_data" })).toMatchObject({
      project_info: { name: "Gallery house" },
    });
  });

  it("saves entity and expose changes locally and starts reset from fresh data", async () => {
    const first = await setup();
    const second = await setup();
    await prepareViews(first.env, {}, false);
    await prepareViews(second.env, {}, false);
    const entity = await first.env.hass.callWS<CreateEntityData>({
      type: "knx/get_entity_config",
      entity_id: "light.living_room",
    });
    entity.data.entity.name = "Edited light";
    expect(
      await first.env.hass.callWS({
        type: "knx/update_entity",
        entity_id: "light.living_room",
        ...entity,
      }),
    ).toEqual({ success: true, entity_id: null });
    expect(
      await first.env.hass.callWS({
        type: "knx/get_entity_config",
        entity_id: "light.living_room",
      }),
    ).toEqual(entity);
    expect(first.env.hass.states["light.living_room"].attributes.friendly_name).toBe(
      "Edited light",
    );
    const expose = await first.env.hass.callWS<ExposeConfigData>({
      type: "knx/get_expose_config",
      entity_id: "sensor.room_temperature",
    });
    expose.notes = "Edited notes";
    expect(
      await first.env.hass.callWS({
        type: "knx/update_expose",
        entity_id: "sensor.room_temperature",
        data: expose,
      }),
    ).toEqual({ success: true });
    expect(
      await first.env.hass.callWS({
        type: "knx/get_expose_config",
        entity_id: "sensor.room_temperature",
      }),
    ).toEqual(expose);
    first.env.dispose();
    await Promise.all(
      [second, await setup()].map(async ({ env }) => {
        await prepareViews(env, {}, false);
        expect(
          await env.hass.callWS({ type: "knx/get_entity_config", entity_id: "light.living_room" }),
        ).toMatchObject({ data: { entity: { name: "Living room light" } } });
        expect(
          await env.hass.callWS({
            type: "knx/get_expose_config",
            entity_id: "sensor.room_temperature",
          }),
        ).toMatchObject({ notes: "Room temperature" });
      }),
    );
  });

  it("restores accepted entity outcomes in local fixtures without replaying saves", async () => {
    const source = await setup();
    const peer = await setup();
    await prepareViews(source.env, {}, false);
    await prepareViews(peer.env, {}, false);
    const entity = await source.env.hass.callWS<CreateEntityData>({
      type: "knx/get_entity_config",
      entity_id: "light.living_room",
    });
    entity.data.entity.name = "Accepted light";
    await source.env.hass.callWS({
      type: "knx/update_entity",
      entity_id: "light.living_room",
      ...entity,
    });
    const accepted = source.env.fixtureState!.capture();
    peer.env.fixtureState!.apply(accepted);
    expect(peer.env.hass.states["light.living_room"].attributes.friendly_name).toBe(
      "Accepted light",
    );
    expect(
      await peer.env.hass.callWS({ type: "knx/get_entity_config", entity_id: "light.living_room" }),
    ).toEqual(entity);
    expect(
      await peer.env.hass.callWS({
        type: "config/entity_registry/get",
        entity_id: "light.living_room",
      }),
    ).toMatchObject({ name: "Accepted light" });
    expect(peer.events.filter(({ name }) => name === "knx/update_entity")).toEqual([]);
    const peerHass = peer.env.hass;
    peer.env.fixtureState!.apply(accepted);
    expect(peer.env.hass).toBe(peerHass);
    entity.data.entity.name = "Peer-only follow-up";
    await peer.env.hass.callWS({
      type: "knx/update_entity",
      entity_id: "light.living_room",
      ...entity,
    });
    expect(source.env.hass.states["light.living_room"].attributes.friendly_name).toBe(
      "Accepted light",
    );
    const late = await setup();
    await prepareViews(late.env, {}, false);
    late.env.fixtureState!.apply(accepted);
    expect(late.env.hass.states["light.living_room"].attributes.friendly_name).toBe(
      "Accepted light",
    );
    late.env.dispose();
    late.env.fixtureState!.apply(peer.env.fixtureState!.capture());
    expect(late.env.hass.states["light.living_room"].attributes.friendly_name).toBe(
      "Accepted light",
    );
  });

  it("does not publish rejected entity saves as accepted fixture outcomes", async () => {
    const { env } = await setup();
    await prepareViews(env, { failEntityValidation: true }, false);
    const entity = await env.hass.callWS<CreateEntityData>({
      type: "knx/get_entity_config",
      entity_id: "light.living_room",
    });
    const before = env.fixtureState!.capture();
    entity.data.entity.name = "Rejected light";
    expect(
      await env.hass.callWS({
        type: "knx/update_entity",
        entity_id: "light.living_room",
        ...entity,
      }),
    ).toMatchObject({ success: false });
    expect(env.fixtureState!.capture()).toEqual(before);
    expect(env.hass.states["light.living_room"].attributes.friendly_name).toBe("Living room light");
  });

  it("uses named empty data and validation rejection without changing saved data", async () => {
    const { env } = await setup();
    await prepareViews(
      env,
      {
        emptyEntities: true,
        emptyExposes: true,
        failEntityValidation: true,
        failExposeValidation: true,
      },
      false,
    );
    expect(await env.hass.callWS({ type: "config/entity_registry/list" })).toEqual([]);
    expect(await env.hass.callWS({ type: "knx/get_entities_by_group" })).toEqual({});
    expect(await env.hass.callWS({ type: "knx/get_expose_groups" })).toEqual({});
    expect(env.hass.entities).toEqual({});
    const entity = initialEntity();
    entity.data.entity.name = "Rejected";
    expect(
      await env.hass.callWS({
        type: "knx/update_entity",
        entity_id: "light.living_room",
        ...entity,
      }),
    ).toMatchObject({ success: false });
    expect(await env.hass.callWS({ type: "knx/create_entity", ...entity })).toMatchObject({
      success: false,
    });
    await expect(
      env.hass.callWS({ type: "knx/get_entity_config", entity_id: "light.living_room" }),
    ).rejects.toThrow();
    const expose = createKnxFixtures().expose;
    expose.notes = "Rejected";
    expect(
      await env.hass.callWS({
        type: "knx/update_expose",
        entity_id: "sensor.room_temperature",
        data: expose,
      }),
    ).toMatchObject({ success: false });
    await expect(
      env.hass.callWS({ type: "knx/get_expose_config", entity_id: "sensor.room_temperature" }),
    ).rejects.toThrow();
  });

  it.each([
    "knx/get_entity_config",
    "knx/get_expose_config",
    "knx/group_monitor_info",
    "knx/group_telegrams",
  ] as const)("rejects the explicitly failing %s endpoint", async (type) => {
    const { env } = await setup();
    await prepareViews(env, { failCalls: [type] }, false);
    await expect(
      env.hass.callWS({
        type,
        entity_id: type.includes("expose") ? "sensor.room_temperature" : "light.living_room",
      }),
    ).rejects.toThrow();
  });

  it("creates an entity in an empty registry and restores deletion in every reader", async () => {
    const source = await setup();
    const peer = await setup();
    await prepareViews(source.env, { emptyEntities: true }, false);
    await prepareViews(peer.env, { emptyEntities: true }, false);
    const data = {
      platform: "sensor",
      data: {
        entity: { name: "New sensor", device_info: "1.1.1", entity_category: "diagnostic" },
        knx: { ga_sensor: { state: "1/0/2" } },
      },
    };
    const result = await source.env.hass.callWS<{ entity_id: string }>({
      type: "knx/create_entity",
      ...data,
    });
    peer.env.fixtureState!.apply(source.env.fixtureState!.capture());
    expect(await peer.env.hass.callWS({ type: "config/entity_registry/list" })).toEqual([
      expect.objectContaining({
        entity_id: result.entity_id,
        name: "New sensor",
        entity_category: "diagnostic",
      }),
    ]);
    expect(
      await peer.env.hass.callWS({ type: "knx/get_entity_config", entity_id: result.entity_id }),
    ).toEqual(data);
    expect(await peer.env.hass.callWS({ type: "knx/get_entities_by_group" })).toEqual({
      "1/0/2": [{ platform: "sensor", unique_id: result.entity_id, ui: true }],
    });
    await source.env.hass.callWS({ type: "knx/delete_entity", entity_id: result.entity_id });
    peer.env.fixtureState!.apply(source.env.fixtureState!.capture());
    expect(await peer.env.hass.callWS({ type: "config/entity_registry/list" })).toEqual([]);
    expect(peer.env.hass.states[result.entity_id]).toBeUndefined();
    await expect(
      peer.env.hass.callWS({ type: "knx/get_entity_config", entity_id: result.entity_id }),
    ).rejects.toThrow();
    await expect(
      peer.env.hass.callWS({ type: "config/entity_registry/get", entity_id: result.entity_id }),
    ).rejects.toThrow();
    expect(peer.events.filter(({ name }) => /knx\/(create|delete)_entity/.test(name))).toEqual([]);
  });

  it("restores expose notes and addresses then removes the saved expose without deleting its entity", async () => {
    const source = await setup();
    const peer = await setup();
    await prepareViews(source.env, { emptyExposes: true }, false);
    await prepareViews(peer.env, { emptyExposes: true }, false);
    const data = createKnxFixtures().expose;
    data.notes = "Accepted notes";
    data.options[0].ga.write = "1/0/3";
    await source.env.hass.callWS({
      type: "knx/update_expose",
      entity_id: "sensor.room_temperature",
      data,
    });
    peer.env.fixtureState!.apply(source.env.fixtureState!.capture());
    expect(await peer.env.hass.callWS({ type: "knx/get_expose_groups" })).toEqual({
      "sensor.room_temperature": ["1/0/3"],
    });
    expect(
      await peer.env.hass.callWS({
        type: "knx/get_expose_config",
        entity_id: "sensor.room_temperature",
      }),
    ).toEqual(data);
    await source.env.hass.callWS({
      type: "knx/delete_expose",
      entity_id: "sensor.room_temperature",
    });
    peer.env.fixtureState!.apply(source.env.fixtureState!.capture());
    expect(await peer.env.hass.callWS({ type: "knx/get_expose_groups" })).toEqual({});
    await expect(
      peer.env.hass.callWS({ type: "knx/get_expose_config", entity_id: "sensor.room_temperature" }),
    ).rejects.toThrow();
    expect(peer.env.hass.states["sensor.room_temperature"]).toBeDefined();
  });

  it("restores project null, time and distinct named devices together", async () => {
    const source = await setup();
    const peer = await setup();
    await prepareViews(source.env, {}, false);
    await prepareViews(peer.env, {}, false);
    const first = await source.env.hass.callWS<{ id: string }>({
      type: "knx/create_device",
      name: "New actuator",
      area_id: "living_room",
    });
    const second = await source.env.hass.callWS<{ id: string }>({
      type: "knx/create_device",
      name: "Another actuator",
    });
    expect(first.id).not.toBe(second.id);
    expect(first.id).not.toBe("gallery-actuator");
    await source.env.hass.callWS({
      type: "knx/update_time_server_config",
      config: { time: { write: "1/0/3" } },
    });
    await source.env.hass.callWS({ type: "knx/project_file_remove" });
    peer.env.fixtureState!.apply(source.env.fixtureState!.capture());
    expect(await peer.env.hass.callWS({ type: "knx/get_knx_project" })).toBeNull();
    expect(peer.env.knx.projectInfo).toBeNull();
    expect(await peer.env.hass.callWS({ type: "knx/get_time_server_config" })).toEqual({
      time: { write: "1/0/3" },
    });
    expect(peer.env.hass.devices[first.id]).toMatchObject({
      name: "New actuator",
      area_id: "living_room",
    });
    await source.env.hass.callWS({ type: "knx/project_file_process", file_id: "gallery-upload" });
    await source.env.hass.callWS({ type: "knx/update_time_server_config", config: {} });
    peer.env.fixtureState!.apply(source.env.fixtureState!.capture());
    expect(await peer.env.hass.callWS({ type: "knx/get_knx_project" })).toMatchObject({
      info: { name: "Gallery house" },
    });
    expect(await peer.env.hass.callWS({ type: "knx/get_time_server_config" })).toEqual({});
  });

  it("shares delayed raw telegrams with monitor history and peers without subscription replay", async () => {
    const source = await setup();
    const peer = await setup();
    await prepareViews(source.env, { emptyTelegrams: true, enableMonitor: true }, false);
    await prepareViews(peer.env, { emptyTelegrams: true, enableMonitor: true }, false);
    vi.useFakeTimers();
    const received: unknown[] = [];
    await peer.env.hass.connection.subscribeMessage((telegram) => received.push(telegram), {
      type: "knx/subscribe_telegrams",
    });
    await source.env.hass.callService("knx", "send", { address: "1/0/2", payload: 23 });
    await vi.advanceTimersByTimeAsync(30);
    const history = await source.env.hass.callWS<{ recent_telegrams: unknown[] }>({
      type: "knx/group_monitor_info",
    });
    expect(history.recent_telegrams).toEqual([
      expect.objectContaining({ value: 23, destination: "1/0/2" }),
    ]);
    peer.env.fixtureState!.apply(source.env.fixtureState!.capture());
    expect(await peer.env.hass.callWS({ type: "knx/query_telegrams" })).toMatchObject({
      telegrams: history.recent_telegrams,
      total_count: 1,
    });
    expect(await peer.env.hass.callWS({ type: "knx/group_telegrams" })).toEqual({
      "1/0/2": history.recent_telegrams[0],
    });
    expect(received).toEqual([]);
    expect(peer.events.filter(({ name }) => name === "knx.send")).toEqual([]);
    const before = source.env.fixtureState!.capture();
    await source.env.hass.callService("knx", "read", { address: "1/0/1" });
    source.env.dispose();
    await vi.advanceTimersByTimeAsync(30);
    expect(source.env.fixtureState!.capture()).toEqual(before);
  });

  it("drops a pending automatic telegram after writer loss but keeps an explicit user service", async () => {
    const { env, events } = await setup();
    vi.useFakeTimers();
    await prepareViews(env, { enableMonitor: true, streamTelegrams: true }, false);
    const before = env.fixtures.data.telegrams.length;
    const received = vi.fn();
    await env.hass.connection.subscribeMessage(received, { type: "knx/subscribe_telegrams" });
    await vi.advanceTimersByTimeAsync(1200);
    env.canProduce = () => false;
    await env.hass.callService("knx", "read", { address: "1/0/2" });
    await vi.advanceTimersByTimeAsync(30);
    expect(env.fixtures.data.telegrams.slice(before)).toEqual([
      expect.objectContaining({ destination: "1/0/2", telegramtype: "GroupValueRead" }),
    ]);
    expect(received).toHaveBeenCalledOnce();
    expect(events.filter(({ name }) => name === "knx.read")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2400);
    expect(events.filter(({ name }) => name === "knx.send")).toHaveLength(1);
  });
  it("streams every 1200ms and aborts independently of another preview", async () => {
    const first = await setup();
    const second = await setup();
    vi.useFakeTimers();
    await Promise.all(
      [first, second].map(({ env }) =>
        prepareViews(env, { enableMonitor: true, streamTelegrams: true }, false),
      ),
    );
    await vi.advanceTimersByTimeAsync(1199);
    expect(first.events.filter((event) => event.name === "knx.send")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(first.events.filter((event) => event.name === "knx.send")).toHaveLength(1);
    first.env.dispose();
    await vi.advanceTimersByTimeAsync(2400);
    expect(first.events.filter((event) => event.name === "knx.send")).toHaveLength(1);
    expect(second.events.filter((event) => event.name === "knx.send")).toHaveLength(3);
  });

  it.each([
    [{ enableMonitor: true, streamTelegrams: true }, true],
    [{ enableMonitor: true, streamTelegrams: true, emptyTelegrams: true }, false],
    [
      {
        enableMonitor: true,
        streamTelegrams: true,
        failCalls: ["knx/group_monitor_info"] as const,
      },
      false,
    ],
    [{ enableMonitor: true, streamTelegrams: false }, false],
    [{ enableMonitor: false, streamTelegrams: true }, false],
  ] as const)(
    "keeps thumbnail, empty, failing or disabled monitor data static (%j)",
    async (options, thumbnail) => {
      const { env, events } = await setup();
      vi.useFakeTimers();
      await prepareViews(env, options, thumbnail);
      await vi.advanceTimersByTimeAsync(3600);
      expect(events.filter((event) => event.name === "knx.send")).toHaveLength(0);
      if ("emptyTelegrams" in options && options.emptyTelegrams) {
        expect(await env.hass.callWS({ type: "knx/group_monitor_info" })).toMatchObject({
          recent_telegrams: [],
        });
      }
    },
  );
});

declare global {
  interface HTMLElementTagNameMap {
    "gallery-fixture-test": FixtureHost;
  }
}
