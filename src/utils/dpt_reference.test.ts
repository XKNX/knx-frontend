import { describe, expect, it } from "vitest";

import type { DPTMetadata } from "../types/websocket";
import {
  filterDptReferenceEntries,
  groupDptReferenceEntries,
  groupPayloadLength,
  normalizeDptReferenceEntries,
  shouldRenderDptGroupAsCards,
} from "./dpt_reference";

const METADATA: Record<string, DPTMetadata> = {
  "5.001": {
    dpt_class: "numeric",
    main: 5,
    sub: 1,
    name: "percentage",
    unit: "%",
    sensor_device_class: null,
    sensor_state_class: null,
    payload_length: 1,
  },
  "9.001": {
    dpt_class: "numeric",
    main: 9,
    sub: 1,
    name: "temperature",
    unit: "°C",
    sensor_device_class: "temperature",
    sensor_state_class: "measurement",
    payload_length: 2,
  },
  "9.007": {
    dpt_class: "numeric",
    main: 9,
    sub: 7,
    name: "humidity",
    unit: "%",
    sensor_device_class: "humidity",
    sensor_state_class: "measurement",
    payload_length: 2,
  },
  "1": {
    dpt_class: "enum",
    main: 1,
    sub: null,
    name: "switch",
    unit: null,
    sensor_device_class: null,
    sensor_state_class: null,
    payload_length: 1,
    options: ["on", "off"],
  },
  "251.600": {
    dpt_class: "complex",
    main: 251,
    sub: 600,
    name: "color rgbw",
    unit: null,
    sensor_device_class: null,
    sensor_state_class: null,
    payload_length: 6,
    schema: [
      { name: "red", type: "integer", required: true },
      { name: "mode", type: "enum", required: true, options: ["fade", "solid"] },
    ],
  },
  "9.008": {
    dpt_class: "numeric",
    main: 9,
    sub: 8,
    name: "ppm",
    unit: "ppm",
    sensor_device_class: null,
    sensor_state_class: null,
    payload_length: 2,
  },
  "9.010": {
    dpt_class: "numeric",
    main: 9,
    sub: 10,
    name: "time1",
    unit: "s",
    sensor_device_class: null,
    sensor_state_class: null,
    payload_length: 2,
  },
};

describe("normalizeDptReferenceEntries", () => {
  it("sorts entries by main and sub DPT", () => {
    const result = normalizeDptReferenceEntries(METADATA);
    expect(result.map((entry) => entry.dpt)).toEqual([
      "1",
      "5.001",
      "9.001",
      "9.007",
      "9.008",
      "9.010",
      "251.600",
    ]);
  });
});

describe("filterDptReferenceEntries", () => {
  it("filters by DPT string", () => {
    const result = filterDptReferenceEntries(normalizeDptReferenceEntries(METADATA), "9.007");
    expect(result).toHaveLength(1);
    expect(result[0].dpt).toBe("9.007");
  });

  it("filters by name and unit", () => {
    const entries = normalizeDptReferenceEntries(METADATA);
    expect(filterDptReferenceEntries(entries, "humidity")).toHaveLength(1);
    expect(filterDptReferenceEntries(entries, "ppm")).toHaveLength(1);
  });

  it("filters by enum options", () => {
    const entries = normalizeDptReferenceEntries(METADATA);
    const result = filterDptReferenceEntries(entries, "off");
    expect(result).toHaveLength(1);
    expect(result[0].dpt).toBe("1");
  });

  it("filters by complex schema field name", () => {
    const entries = normalizeDptReferenceEntries(METADATA);
    const result = filterDptReferenceEntries(entries, "red");
    expect(result).toHaveLength(1);
    expect(result[0].dpt).toBe("251.600");
  });

  it("filters by enum options within a complex schema field", () => {
    const entries = normalizeDptReferenceEntries(METADATA);
    const result = filterDptReferenceEntries(entries, "fade");
    expect(result).toHaveLength(1);
    expect(result[0].dpt).toBe("251.600");
  });
});

describe("groupDptReferenceEntries and shouldRenderDptGroupAsCards", () => {
  it("groups entries by main DPT", () => {
    const groups = groupDptReferenceEntries(normalizeDptReferenceEntries(METADATA));
    expect(groups.map((group) => group.main)).toEqual([1, 5, 9, 251]);
  });

  it("uses cards for groups with less than 4 entries", () => {
    const groups = groupDptReferenceEntries(normalizeDptReferenceEntries(METADATA));
    const groupFive = groups.find((group) => group.main === 5);
    expect(groupFive).toBeDefined();
    expect(shouldRenderDptGroupAsCards(groupFive!)).toBe(true);
  });

  it("uses expansion for groups with 4 or more entries", () => {
    const groups = groupDptReferenceEntries(normalizeDptReferenceEntries(METADATA));
    const groupNine = groups.find((group) => group.main === 9);
    expect(groupNine).toBeDefined();
    expect(shouldRenderDptGroupAsCards(groupNine!)).toBe(false);
  });
});

describe("groupPayloadLength", () => {
  it("reports 0 for DPT main 1, packed into the APCI header", () => {
    const groups = groupDptReferenceEntries(normalizeDptReferenceEntries(METADATA));
    const groupOne = groups.find((group) => group.main === 1);
    expect(groupOne).toBeDefined();
    expect(groupOne!.items[0].metadata.payload_length).toBe(1);
    expect(groupPayloadLength(groupOne!)).toBe(0);
  });

  it("reports the backend payload length for other DPT mains", () => {
    const groups = groupDptReferenceEntries(normalizeDptReferenceEntries(METADATA));
    const groupFive = groups.find((group) => group.main === 5);
    expect(groupFive).toBeDefined();
    expect(groupPayloadLength(groupFive!)).toBe(1);
  });
});
