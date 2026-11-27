import { describe, expect, it } from "vitest";

import type { EntitiesByGroup, RelatedEntity } from "./knx-entities-by-group-context";
import type { ExposeGroups } from "./knx-expose-groups-context";
import { createGroupAddressUsageMap } from "./knx-group-address-usage-context";
import type { ExposeGroupAddress } from "../types/websocket";

const entity = (entity_id: string): RelatedEntity => ({ entity_id, ui: true, disabled: false });

const ENTITIES: EntitiesByGroup = {
  "1/0/1": [entity("light.kitchen"), entity("sensor.kitchen")],
  "1/0/2": [entity("light.kitchen")],
};

const ui = (ga: string): ExposeGroupAddress => ({ ga, ui: true });
const yaml = (ga: string): ExposeGroupAddress => ({ ga, ui: false });

const EXPOSES: ExposeGroups = {
  "sensor.outdoor": [ui("1/0/1"), ui("2/0/1"), yaml("2/0/1")],
  "light.kitchen": [ui("1/0/2")],
};

describe("createGroupAddressUsageMap", () => {
  it("merges entities and exposes by group address", () => {
    const usage = createGroupAddressUsageMap(ENTITIES, EXPOSES);

    expect(usage["1/0/1"]).toEqual({
      entities: [entity("light.kitchen"), entity("sensor.kitchen")],
      exposes: [{ entity_id: "sensor.outdoor", ui: true }],
    });
    // UI and YAML exposes of the same entity are separate items
    expect(usage["2/0/1"]).toEqual({
      entities: [],
      exposes: [
        { entity_id: "sensor.outdoor", ui: true },
        { entity_id: "sensor.outdoor", ui: false },
      ],
    });
    expect(usage["9/9/9"]).toBeUndefined();
  });

  it("leaves out the entity being edited, but not its expose", () => {
    const usage = createGroupAddressUsageMap(ENTITIES, EXPOSES, {
      type: "entity",
      entityId: "light.kitchen",
    });

    expect(usage["1/0/1"].entities).toEqual([entity("sensor.kitchen")]);
    expect(usage["1/0/2"]).toEqual({
      entities: [],
      exposes: [{ entity_id: "light.kitchen", ui: true }],
    });
  });

  it("leaves out the expose being edited, but not its entity", () => {
    const usage = createGroupAddressUsageMap(ENTITIES, EXPOSES, {
      type: "expose",
      entityId: "light.kitchen",
    });

    expect(usage["1/0/2"]).toEqual({ entities: [entity("light.kitchen")], exposes: [] });
    expect(usage["2/0/1"].exposes.map((expose) => expose.entity_id)).toEqual([
      "sensor.outdoor",
      "sensor.outdoor",
    ]);
  });

  it("still reports a YAML expose of the expose being edited", () => {
    const usage = createGroupAddressUsageMap(
      undefined,
      { "light.kitchen": [ui("1/0/2"), yaml("1/0/3")] },
      { type: "expose", entityId: "light.kitchen" },
    );

    expect(usage["1/0/2"]).toBeUndefined();
    expect(usage["1/0/3"]).toEqual({
      entities: [],
      exposes: [{ entity_id: "light.kitchen", ui: false }],
    });
  });

  it("handles data that has not loaded yet", () => {
    expect(createGroupAddressUsageMap(undefined, undefined)).toEqual({});
  });
});
