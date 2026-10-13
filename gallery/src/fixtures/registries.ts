import type { HomeAssistant } from "@ha/types";
import type { EntityRegistryEntry } from "@ha/data/entity/entity_registry";

export function createRegistries() {
  const devices: HomeAssistant["devices"] = {
    "gallery-actuator": {
      id: "gallery-actuator",
      config_entries: ["gallery-knx"],
      config_entries_subentries: {},
      connections: [],
      identifiers: [["knx", "1.1.1"]],
      manufacturer: "Gallery",
      model: "Switch actuator",
      model_id: null,
      name: "Living room actuator",
      labels: [],
      sw_version: null,
      hw_version: null,
      serial_number: null,
      via_device_id: null,
      area_id: "living_room",
      name_by_user: null,
      entry_type: null,
      disabled_by: null,
      configuration_url: null,
      primary_config_entry: "gallery-knx",
      parent_device_id: null,
      created_at: 0,
      modified_at: 0,
    },
  };
  const areas: HomeAssistant["areas"] = {
    living_room: {
      area_id: "living_room",
      name: "Living room",
      picture: null,
      aliases: [],
      floor_id: null,
      humidity_entity_id: null,
      temperature_entity_id: null,
      icon: null,
      labels: [],
      created_at: 0,
      modified_at: 0,
    },
  };
  const entities: HomeAssistant["entities"] = {
    "light.living_room": {
      entity_id: "light.living_room",
      name: "Living room light",
      platform: "knx",
      device_id: "gallery-actuator",
      area_id: "living_room",
      labels: [],
    },
    "sensor.room_temperature": {
      entity_id: "sensor.room_temperature",
      name: "Room temperature",
      platform: "demo",
      area_id: "living_room",
      labels: [],
    },
  };
  const entityRegistry: EntityRegistryEntry[] = Object.values(entities).map((entry) => ({
    ...entry,
    id: entry.entity_id,
    name: entry.name ?? null,
    icon: null,
    platform: entry.platform!,
    config_entry_id: entry.platform === "knx" ? "gallery-knx" : null,
    config_subentry_id: null,
    device_id: entry.device_id ?? null,
    area_id: entry.area_id ?? null,
    disabled_by: null,
    hidden_by: null,
    entity_category: null,
    has_entity_name: false,
    unique_id: entry.entity_id,
    options: null,
    categories: {},
    created_at: 0,
    modified_at: 0,
  }));
  const states: HomeAssistant["states"] = Object.fromEntries(
    Object.values(entities).map((entry) => [
      entry.entity_id,
      {
        entity_id: entry.entity_id,
        state: entry.platform === "knx" ? "on" : "21.5",
        attributes: {
          friendly_name: entry.name,
          ...(entry.platform === "knx"
            ? { supported_color_modes: ["onoff"], color_mode: "onoff" }
            : { unit_of_measurement: "°C", device_class: "temperature" }),
        },
        last_changed: "2026-01-01T12:00:00+00:00",
        last_updated: "2026-01-01T12:00:00+00:00",
        context: { id: "gallery", parent_id: null, user_id: null },
      },
    ]),
  );
  return { devices, areas, entities, floors: {}, states, entityRegistry };
}
