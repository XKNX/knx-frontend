import { describe, expect, it } from "vitest";

import type { EntityRegistryEntry } from "@ha/data/entity/entity_registry";

import type { KNXEntityIdentifier } from "../types/websocket";

import { mapEntitiesByGroup } from "./knx-entities-by-group-context";

const identifier = (
  platform: string,
  uniqueId: string,
  options: Partial<Pick<KNXEntityIdentifier, "ui" | "disabled">> = {},
): KNXEntityIdentifier => ({
  platform,
  unique_id: uniqueId,
  ui: true,
  disabled: false,
  ...options,
});

const registryEntry = (
  entityId: string,
  uniqueId: string,
  options: Partial<Pick<EntityRegistryEntry, "platform" | "disabled_by">> = {},
): EntityRegistryEntry =>
  ({
    entity_id: entityId,
    unique_id: uniqueId,
    platform: "knx",
    disabled_by: null,
    ...options,
  }) as EntityRegistryEntry;

describe("mapEntitiesByGroup", () => {
  it("resolves identifiers to entity ids through the registry", () => {
    const result = mapEntitiesByGroup({ "1/2/3": [identifier("switch", "knx_es_1")] }, [
      registryEntry("switch.renamed", "knx_es_1"),
    ]);

    expect(result).toEqual({
      "1/2/3": [{ entity_id: "switch.renamed", ui: true, disabled: false }],
    });
  });

  it("passes the ui and disabled flags through", () => {
    const result = mapEntitiesByGroup(
      {
        "1/2/3": [
          identifier("switch", "1/2/3", { ui: false }),
          identifier("light", "knx_es_1", { disabled: true }),
        ],
      },
      [registryEntry("switch.yaml", "1/2/3"), registryEntry("light.disabled", "knx_es_1")],
    );

    expect(result["1/2/3"]).toEqual([
      { entity_id: "light.disabled", ui: true, disabled: true },
      { entity_id: "switch.yaml", ui: false, disabled: false },
    ]);
  });

  it("treats a missing disabled flag of older backends as enabled", () => {
    const legacyIdentifier = { platform: "switch", unique_id: "knx_es_1", ui: true };
    const result = mapEntitiesByGroup({ "1/2/3": [legacyIdentifier as KNXEntityIdentifier] }, [
      registryEntry("switch.test", "knx_es_1"),
    ]);

    expect(result["1/2/3"]).toEqual([{ entity_id: "switch.test", ui: true, disabled: false }]);
  });

  it("lists UI entities before YAML entities, each sorted by entity id", () => {
    const result = mapEntitiesByGroup(
      {
        "1/2/3": [
          identifier("switch", "1/2/3", { ui: false }),
          identifier("light", "knx_es_b"),
          identifier("light", "knx_es_a"),
        ],
      },
      [
        registryEntry("switch.yaml", "1/2/3"),
        registryEntry("light.b", "knx_es_b"),
        registryEntry("light.a", "knx_es_a"),
      ],
    );

    expect(result["1/2/3"].map((entity) => entity.entity_id)).toEqual([
      "light.a",
      "light.b",
      "switch.yaml",
    ]);
  });

  it("matches on the entity domain and ignores other integrations", () => {
    const result = mapEntitiesByGroup({ "1/2/3": [identifier("switch", "shared_id")] }, [
      registryEntry("light.knx", "shared_id"),
      registryEntry("switch.other", "shared_id", { platform: "mqtt" }),
      registryEntry("switch.knx", "shared_id"),
    ]);

    expect(result["1/2/3"]).toEqual([{ entity_id: "switch.knx", ui: true, disabled: false }]);
  });

  it("drops identifiers without a registry entry", () => {
    const result = mapEntitiesByGroup({ "1/2/3": [identifier("switch", "unknown")] }, []);

    expect(result).toEqual({ "1/2/3": [] });
  });
});
