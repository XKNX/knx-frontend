import { describe, expect, it } from "vitest";

import type { EntitiesByGroup, RelatedEntity } from "./knx-entities-by-group-context";
import { createGroupAddressUsageMap } from "./knx-group-address-usage-context";

const entity = (entity_id: string): RelatedEntity => ({ entity_id, ui: true, disabled: false });

const ENTITIES: EntitiesByGroup = {
  "1/0/1": [entity("light.kitchen"), entity("sensor.kitchen")],
  "1/0/2": [entity("light.kitchen")],
};

const EXPOSES = {
  "sensor.outdoor": ["1/0/1", "2/0/1", "2/0/1"],
  "light.kitchen": ["1/0/2"],
};

describe("createGroupAddressUsageMap", () => {
  it("merges entities and exposes by group address", () => {
    const usage = createGroupAddressUsageMap(ENTITIES, EXPOSES, { type: "entity" });

    expect(usage["1/0/1"]).toEqual({
      entities: [entity("light.kitchen"), entity("sensor.kitchen")],
      exposes: ["sensor.outdoor"],
    });
    expect(usage["2/0/1"]).toEqual({ entities: [], exposes: ["sensor.outdoor"] });
    expect(usage["9/9/9"]).toBeUndefined();
  });

  it("leaves out the entity being edited, but not its expose", () => {
    const usage = createGroupAddressUsageMap(ENTITIES, EXPOSES, {
      type: "entity",
      entityId: "light.kitchen",
    });

    expect(usage["1/0/1"].entities).toEqual([entity("sensor.kitchen")]);
    expect(usage["1/0/2"]).toEqual({ entities: [], exposes: ["light.kitchen"] });
  });

  it("leaves out the expose being edited, but not its entity", () => {
    const usage = createGroupAddressUsageMap(ENTITIES, EXPOSES, {
      type: "expose",
      entityId: "light.kitchen",
    });

    expect(usage["1/0/2"]).toEqual({ entities: [entity("light.kitchen")], exposes: [] });
    expect(usage["2/0/1"].exposes).toEqual(["sensor.outdoor"]);
  });

  it("handles data that has not loaded yet", () => {
    expect(createGroupAddressUsageMap(undefined, undefined, { type: "entity" })).toEqual({});
  });
});
