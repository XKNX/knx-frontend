import type { ConfigEntry } from "@ha/data/config_entries";
import type { KNXBaseData, KNXProject } from "../../../src/types/websocket";
import type { ExposeConfigData } from "../../../src/types/entity_data";

export function createKnxFixtures() {
  const project: KNXProject = {
    info: {
      name: "Gallery house",
      last_modified: "2026-01-01T12:00:00+00:00",
      tool_version: "ETS6",
      xknxproject_version: "3.8.0",
    },
    group_addresses: {
      "1/0/1": {
        name: "Living room light",
        identifier: "GA-1",
        raw_address: 2049,
        address: "1/0/1",
        project_uid: 1,
        dpt: { main: 1, sub: 1 },
        communication_object_ids: ["CO-1"],
        description: "Switch the living room light",
        comment: "",
      },
      "1/0/2": {
        name: "Room temperature",
        identifier: "GA-2",
        raw_address: 2050,
        address: "1/0/2",
        project_uid: 2,
        dpt: { main: 9, sub: 1 },
        communication_object_ids: [],
        description: "Temperature in °C",
        comment: "",
      },
    },
    group_ranges: {
      "1": {
        name: "Lighting",
        address_start: 2048,
        address_end: 4095,
        comment: "",
        group_addresses: ["1/0/1", "1/0/2"],
        group_ranges: {},
      },
    },
    devices: {
      "1.1.1": {
        name: "Living room actuator",
        hardware_name: "Switch actuator",
        description: "Gallery device",
        manufacturer_name: "Gallery",
        individual_address: "1.1.1",
        application: "Switching",
        project_uid: 1,
        communication_object_ids: ["CO-1"],
        channels: {},
      },
    },
    communication_objects: {
      "CO-1": {
        name: "Switch",
        number: 0,
        text: "Living room light",
        function_text: "Switch",
        description: "",
        device_address: "1.1.1",
        device_application: "Switching",
        module: null,
        channel: null,
        dpts: [{ main: 1, sub: 1 }],
        object_size: "1 bit",
        group_address_links: ["1/0/1"],
        flags: {
          read: true,
          write: true,
          communication: true,
          transmit: true,
          update: true,
          readOnInit: false,
        },
      },
    },
  };
  const base: KNXBaseData = {
    connection_info: {
      version: "3.8.0",
      connected: true,
      current_address: "1.1.250",
      telegram_backend: "SQLite",
      telegram_retention: 7,
      telegram_max_count: 10000,
    },
    project_info: project.info,
    supported_platforms: ["light", "sensor"],
    dpt_metadata: {
      "1.001": {
        dpt_class: "numeric",
        main: 1,
        sub: 1,
        name: "Switch",
        unit: null,
        sensor_device_class: null,
        sensor_state_class: null,
        payload_length: 1,
        min: 0,
        max: 1,
        step: 1,
      },
      "9.001": {
        dpt_class: "numeric",
        main: 9,
        sub: 1,
        name: "Temperature",
        unit: "°C",
        sensor_device_class: "temperature",
        sensor_state_class: "measurement",
        payload_length: 2,
        min: -273,
        max: 670760,
        step: 0.01,
      },
    },
  };
  const configEntry: ConfigEntry = {
    entry_id: "gallery-knx",
    domain: "knx",
    title: "Gallery KNX",
    source: "user",
    state: "loaded",
    supports_options: true,
    supports_remove_device: true,
    supports_unload: true,
    supports_reconfigure: true,
    supported_subentry_types: {},
    num_subentries: 0,
    pref_disable_new_entities: false,
    pref_disable_polling: false,
    disabled_by: null,
    reason: null,
    error_reason_translation_domain: null,
    error_reason_translation_key: null,
    error_reason_translation_placeholders: null,
  };
  const expose: ExposeConfigData = {
    options: [{ ga: { write: "1/0/2", dpt: "9.001" }, respond_to_read: true, send_on_init: true }],
    notes: "Room temperature",
  };
  return { project, base, configEntry, expose };
}
