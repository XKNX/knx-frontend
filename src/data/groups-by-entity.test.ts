import { describe, expect, it } from "vitest";

import { createGroupAddressesByEntityMap } from "./groups-by-entity";
import type { EntitiesByGroup } from "./knx-entities-by-group-context";

const groups: EntitiesByGroup = {
  "1/2/3": [
    { entity_id: "light.ui", ui: true, disabled: false },
    { entity_id: "switch.yaml", ui: false, disabled: false },
  ],
  "1/2/4": [{ entity_id: "light.ui", ui: true, disabled: true }],
};

describe("createGroupAddressesByEntityMap", () => {
  it("returns an empty map without groups", () => {
    expect(createGroupAddressesByEntityMap(undefined)).toEqual({});
  });

  it("collects the group addresses of each entity", () => {
    const result = createGroupAddressesByEntityMap(groups);

    expect(result["light.ui"]).toEqual({ groups: new Set(["1/2/3", "1/2/4"]), ui: true });
    expect(result["switch.yaml"]).toEqual({ groups: new Set(["1/2/3"]), ui: false });
  });

  it.each([
    ["UI", { ui: true, yaml: false }, ["light.ui"]],
    ["YAML", { ui: false, yaml: true }, ["switch.yaml"]],
  ])("limits the result to %s entities", (_, options, expectedEntityIds) => {
    expect(Object.keys(createGroupAddressesByEntityMap(groups, options))).toEqual(
      expectedEntityIds,
    );
  });
});
