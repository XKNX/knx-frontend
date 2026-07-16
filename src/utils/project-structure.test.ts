import { describe, it, expect } from "vitest";
import {
  buildDeviceTree,
  filterDeviceTree,
  getLocationByDevice,
  getLineByDevice,
  getDptFilterOptions,
  getLocationFilterOptions,
  getLineFilterOptions,
  hasDeviceTreeFilterActive,
} from "./project-structure";
import type { DeviceTreeFilter } from "./project-structure";
import type {
  CommunicationObject,
  Device,
  GroupAddress,
  KNXProject,
  KNXSpace,
  KNXTopologyArea,
} from "../types/websocket";

const makeGroupAddress = (overrides: Partial<GroupAddress> = {}): GroupAddress => ({
  name: "GA",
  identifier: "GA-1",
  raw_address: 1,
  address: "0/0/1",
  project_uid: 1,
  dpt: { main: 1, sub: 1 },
  communication_object_ids: [],
  description: "",
  comment: "",
  ...overrides,
});

const makeComObject = (overrides: Partial<CommunicationObject> = {}): CommunicationObject => ({
  name: "CO",
  number: 0,
  text: "Com Object",
  function_text: "",
  description: "",
  device_address: "1.1.1",
  device_application: null,
  module: null,
  channel: null,
  dpts: [],
  object_size: "1 Bit",
  group_address_links: [],
  flags: {
    read: false,
    write: true,
    communication: true,
    transmit: false,
    update: false,
    readOnInit: false,
  },
  ...overrides,
});

const makeDevice = (overrides: Partial<Device> = {}): Device => ({
  name: "Device",
  hardware_name: "HW",
  description: "",
  manufacturer_name: "ACME",
  individual_address: "1.1.1",
  application: null,
  project_uid: 1,
  communication_object_ids: [],
  channels: {},
  ...overrides,
});

const makeSpace = (overrides: Partial<KNXSpace> = {}): KNXSpace => ({
  type: "Room",
  identifier: "S-1",
  name: "Room",
  usage_id: null,
  usage_text: "",
  number: "",
  description: "",
  project_uid: null,
  devices: [],
  spaces: {},
  functions: [],
  ...overrides,
});

/**
 * Project with two devices:
 * - 1.1.1 "Switch Actuator" (ACME): channel CH1 "Output A" with CO 0 ("Schalten",
 *   GAs 0/0/1 DPT 1.001 + 0/0/2 DPT 1.011), plus channel-less CO 5 ("Zentral", GA 0/0/3 DPT 9.001)
 * - 1.1.2 "Dimmer" (Lux GmbH): channel-less CO 1 ("Dimmen absolut", GA 0/0/4 DPT 5.001)
 */
const project: KNXProject = {
  info: { name: "Test", last_modified: "", tool_version: "", xknxproject_version: "3.9.0" },
  group_addresses: {
    "0/0/1": makeGroupAddress({ identifier: "GA-1", address: "0/0/1", name: "Licht schalten" }),
    "0/0/2": makeGroupAddress({
      identifier: "GA-2",
      address: "0/0/2",
      name: "Licht Status",
      dpt: { main: 1, sub: 11 },
    }),
    "0/0/3": makeGroupAddress({
      identifier: "GA-3",
      address: "0/0/3",
      name: "Temperatur",
      dpt: { main: 9, sub: 1 },
    }),
    "0/0/4": makeGroupAddress({
      identifier: "GA-4",
      address: "0/0/4",
      name: "Helligkeit",
      dpt: { main: 5, sub: 1 },
    }),
  },
  group_ranges: {},
  devices: {
    "1.1.2": makeDevice({
      individual_address: "1.1.2",
      name: "Dimmer",
      manufacturer_name: "Lux GmbH",
      communication_object_ids: ["co-3"],
    }),
    "1.1.1": makeDevice({
      individual_address: "1.1.1",
      name: "Switch Actuator",
      communication_object_ids: ["co-1", "co-2"],
      channels: { CH1: { identifier: "CH1", name: "Output A" } },
    }),
  },
  communication_objects: {
    "co-1": makeComObject({
      number: 0,
      text: "Schalten",
      channel: "CH1",
      group_address_links: ["0/0/1", "0/0/2"],
    }),
    "co-2": makeComObject({
      number: 5,
      text: "Zentral",
      group_address_links: ["0/0/3"],
    }),
    "co-3": makeComObject({
      number: 1,
      text: "Dimmen absolut",
      device_address: "1.1.2",
      group_address_links: ["0/0/4"],
    }),
  },
};

const emptyFilter: DeviceTreeFilter = { searchText: "", dpt: [], location: [], line: [] };
const tree = buildDeviceTree(project);

describe("buildDeviceTree", () => {
  it("sorts devices by individual address and resolves group addresses", () => {
    expect(tree.map((device) => device.ia)).toEqual(["1.1.1", "1.1.2"]);
    expect(tree[0].channels).toHaveLength(1);
    expect(tree[0].channels[0].comObjects[0].groupAddresses.map((ga) => ga.address)).toEqual([
      "0/0/1",
      "0/0/2",
    ]);
    expect(tree[0].noChannelComObjects.map((item) => item.comObject.number)).toEqual([5]);
    expect(tree[0].comObjectCount).toBe(2);
  });
});

describe("getLocationByDevice", () => {
  const locations: Record<string, KNXSpace> = {
    Building: makeSpace({
      type: "Building",
      name: "Building",
      devices: ["1.1.2"],
      spaces: {
        "Floor 1": makeSpace({
          type: "Floor",
          name: "Floor 1",
          spaces: {
            Kitchen: makeSpace({ name: "Kitchen", devices: ["1.1.1"] }),
          },
        }),
      },
    }),
  };

  it("assigns the innermost space and full path", () => {
    const result = getLocationByDevice(locations);
    expect(result["1.1.1"]).toEqual({
      id: "Building/Floor 1/Kitchen",
      name: "Kitchen",
      path: ["Building", "Floor 1", "Kitchen"],
    });
    expect(result["1.1.2"].name).toBe("Building");
  });

  it("returns empty map for null", () => {
    expect(getLocationByDevice(null)).toEqual({});
  });

  it("builds filter options with device counts and parent path", () => {
    const options = getLocationFilterOptions(getLocationByDevice(locations));
    expect(options).toHaveLength(2);
    const kitchen = options.find((option) => option.name === "Kitchen")!;
    expect(kitchen.secondary).toBe("Building → Floor 1");
    expect(kitchen.count).toBe(1);
  });
});

describe("getLineByDevice", () => {
  const topology: Record<string, KNXTopologyArea> = {
    "1": {
      name: "Area",
      description: null,
      lines: {
        "1": { name: "TP Line", description: null, devices: ["1.1.1"], medium_type: "TP" },
      },
    },
  };

  it("uses topology data and falls back to the address prefix", () => {
    const result = getLineByDevice(topology, ["1.1.1", "2.3.4"]);
    expect(result["1.1.1"]).toEqual({ id: "1.1", label: "1.1 TP Line", mediumType: "TP" });
    expect(result["2.3.4"]).toEqual({ id: "2.3", label: "2.3", mediumType: "" });
  });

  it("builds sorted filter options", () => {
    const options = getLineFilterOptions(getLineByDevice(topology, ["1.1.1", "2.3.4", "2.3.5"]));
    expect(options.map((option) => option.id)).toEqual(["1.1", "2.3"]);
    expect(options[1].count).toBe(2);
  });
});

describe("getDptFilterOptions", () => {
  it("counts devices per distinct DPT, sorted numerically", () => {
    const options = getDptFilterOptions(tree);
    expect(options.map((option) => option.id)).toEqual(["1.001", "1.011", "5.001", "9.001"]);
    expect(options.every((option) => option.count === 1)).toBe(true);
  });
});

describe("filterDeviceTree", () => {
  it("returns input unchanged without active filters", () => {
    expect(hasDeviceTreeFilterActive(emptyFilter)).toBe(false);
    expect(filterDeviceTree(tree, emptyFilter, null, null)).toBe(tree);
  });

  it("filters whole devices by location and line", () => {
    const locationByDevice = {
      "1.1.1": { id: "Building/Kitchen", name: "Kitchen", path: ["Building", "Kitchen"] },
    };
    const byLocation = filterDeviceTree(
      tree,
      { ...emptyFilter, location: ["Building/Kitchen"] },
      locationByDevice,
      null,
    );
    expect(byLocation.map((device) => device.ia)).toEqual(["1.1.1"]);

    const lineByDevice = getLineByDevice(null, ["1.1.1", "1.1.2"]);
    const byLine = filterDeviceTree(tree, { ...emptyFilter, line: ["1.1"] }, null, lineByDevice);
    expect(byLine).toHaveLength(2); // both share line 1.1
  });

  it("prunes group addresses by DPT and drops emptied devices", () => {
    const filtered = filterDeviceTree(tree, { ...emptyFilter, dpt: ["1.001"] }, null, null);
    expect(filtered.map((device) => device.ia)).toEqual(["1.1.1"]);
    expect(filtered[0].noChannelComObjects).toHaveLength(0); // CO 5 has only DPT 9.001
    expect(filtered[0].channels[0].comObjects[0].groupAddresses.map((ga) => ga.address)).toEqual([
      "0/0/1",
    ]);
    expect(filtered[0].comObjectCount).toBe(1);
  });

  it("keeps the whole device on device-level match", () => {
    const filtered = filterDeviceTree(tree, { ...emptyFilter, searchText: "acme" }, null, null);
    expect(filtered.map((device) => device.ia)).toEqual(["1.1.1"]);
    expect(filtered[0].comObjectCount).toBe(2);
  });

  it("keeps the whole channel on channel-name match", () => {
    const filtered = filterDeviceTree(tree, { ...emptyFilter, searchText: "output" }, null, null);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].channels[0].comObjects[0].groupAddresses).toHaveLength(2);
    expect(filtered[0].noChannelComObjects).toHaveLength(0);
  });

  it("keeps the whole com object with all GAs on com-object match", () => {
    const filtered = filterDeviceTree(tree, { ...emptyFilter, searchText: "schalten" }, null, null);
    expect(filtered).toHaveLength(1);
    // CO text match keeps both GAs, even though only 0/0/1 matches "schalten"
    expect(filtered[0].channels[0].comObjects[0].groupAddresses).toHaveLength(2);
  });

  it("keeps only matching GAs and their ancestors on GA-level match", () => {
    const filtered = filterDeviceTree(tree, { ...emptyFilter, searchText: "status" }, null, null);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].channels[0].comObjects[0].groupAddresses.map((ga) => ga.address)).toEqual([
      "0/0/2",
    ]);
  });

  it("requires all search terms to match (AND)", () => {
    const both = filterDeviceTree(tree, { ...emptyFilter, searchText: "licht status" }, null, null);
    expect(both[0].channels[0].comObjects[0].groupAddresses.map((ga) => ga.address)).toEqual([
      "0/0/2",
    ]);
    const none = filterDeviceTree(tree, { ...emptyFilter, searchText: "licht xyz" }, null, null);
    expect(none).toHaveLength(0);
  });

  it("combines DPT filter and search with AND", () => {
    const filtered = filterDeviceTree(
      tree,
      { ...emptyFilter, dpt: ["1.011"], searchText: "licht" },
      null,
      null,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].channels[0].comObjects[0].groupAddresses.map((ga) => ga.address)).toEqual([
      "0/0/2",
    ]);
  });

  it("matches DPT strings in search", () => {
    const filtered = filterDeviceTree(tree, { ...emptyFilter, searchText: "9.001" }, null, null);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].noChannelComObjects[0].groupAddresses.map((ga) => ga.address)).toEqual([
      "0/0/3",
    ]);
  });
});
