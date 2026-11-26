import { describe, expect, it } from "vitest";
import type { EntitySuggestion, KNXSpace } from "../types/websocket";
import {
  findRegistryIdByName,
  getProjectAreas,
  normalizeRegistryName,
  stripSortNumber,
  suggestionArea,
} from "./project-areas";

const space = (identifier: string, overrides: Partial<KNXSpace> = {}): KNXSpace => ({
  type: "Room",
  identifier,
  name: identifier,
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

const suggestion = (source: string, groupId: string): EntitySuggestion => ({
  id: `${source}-${groupId}`,
  source,
  suggested_name: "",
  group_id: groupId,
  group_name: "",
  secondary_info: "",
  platform_options: [],
  suggestions: {},
  existing_entity_ids: [],
  metadata: {},
});

/**
 * Building                                  devices 1.1.9
 * ├─ 00. Ground floor (Floor)
 * │  ├─ 05. Kitchen (Room)                  devices 1.1.1
 * │  │  └─ Segment (RoomSegment)            devices 1.1.2
 * │  ├─ Corridor (Corridor)
 * │  ├─ Corridor (Corridor)                 - same name on the same floor
 * │  ├─ Board (DistributionBoard)           devices 1.1.3
 * │  └─ Technical room (Room)               devices 1.1.4
 * │     └─ Room board (DistributionBoard)   devices 1.1.5
 * └─ 1. First floor (Floor)
 *    └─ Corridor (Corridor)
 * Garden (Room - not on a floor)
 */
const locations: Record<string, KNXSpace> = {
  building: space("building", {
    type: "Building",
    name: "Building",
    devices: ["1.1.9"],
    spaces: {
      gf: space("gf", {
        type: "Floor",
        name: "00. Ground floor",
        spaces: {
          kitchen: space("kitchen", {
            name: "05. Kitchen",
            devices: ["1.1.1"],
            spaces: {
              segment: space("segment", { type: "RoomSegment", devices: ["1.1.2"] }),
            },
          }),
          gfCorridor: space("gfCorridor", { type: "Corridor", name: "Corridor" }),
          gfCorridor2: space("gfCorridor2", { type: "Corridor", name: "Corridor" }),
          board: space("board", { type: "DistributionBoard", devices: ["1.1.3"] }),
          technical: space("technical", {
            name: "Technical room",
            devices: ["1.1.4"],
            spaces: {
              roomBoard: space("roomBoard", { type: "DistributionBoard", devices: ["1.1.5"] }),
            },
          }),
        },
      }),
      ff: space("ff", {
        type: "Floor",
        name: "1. First floor",
        spaces: {
          ffCorridor: space("ffCorridor", { type: "Corridor", name: " corridor" }),
        },
      }),
    },
  }),
  garden: space("garden", { name: "Garden" }),
};

describe("getProjectAreas", () => {
  const { areaBySpace, areaByDevice } = getProjectAreas(locations);

  it("maps rooms to areas on their floor", () => {
    expect(areaBySpace.kitchen).toEqual({
      name: "05. Kitchen",
      floor: { name: "00. Ground floor", order: 0 },
    });
    expect(areaBySpace.ffCorridor.floor).toEqual({ name: "1. First floor", order: 1 });
    expect(areaBySpace.garden).toEqual({ name: "Garden", floor: null });
  });

  it("gives spaces within a room the area of the room", () => {
    expect(areaBySpace.segment).toBe(areaBySpace.kitchen);
    expect(areaBySpace.roomBoard).toBe(areaBySpace.technical);
  });

  it("gives no area to spaces not within a room", () => {
    expect(areaBySpace.building).toBeUndefined();
    expect(areaBySpace.gf).toBeUndefined();
    expect(areaBySpace.board).toBeUndefined();
  });

  it("makes the names of areas unique", () => {
    // on different floors - prefixed with the floor, numbered on the same one
    expect(areaBySpace.gfCorridor.name).toBe("00. Ground floor Corridor");
    expect(areaBySpace.gfCorridor2.name).toBe("00. Ground floor Corridor 2");
    expect(areaBySpace.ffCorridor.name).toBe("1. First floor  corridor");
    expect(areaBySpace.kitchen.name).toBe("05. Kitchen");
  });

  it("numbers rooms of the same name on the same floor without a floor prefix", () => {
    const floor = space("ug", {
      type: "Floor",
      name: "UG",
      spaces: {
        bath1: space("bath1", { name: "04. Bath" }),
        bath2: space("bath2", { name: "07. Bath" }),
      },
    });
    const areas = getProjectAreas({ ug: floor }, { stripSortNumbers: true });
    expect(areas.areaBySpace.bath1.name).toBe("Bath");
    expect(areas.areaBySpace.bath2.name).toBe("Bath 2");
  });

  it("gives devices in a room its area - not those in a distribution board", () => {
    expect(areaByDevice).toEqual({
      "1.1.1": areaBySpace.kitchen,
      "1.1.2": areaBySpace.kitchen,
      "1.1.4": areaBySpace.technical,
    });
  });

  it("removes sort numbers if asked to", () => {
    const stripped = getProjectAreas(locations, { stripSortNumbers: true }).areaBySpace;
    expect(stripped.kitchen).toEqual({
      name: "Kitchen",
      floor: { name: "Ground floor", order: 0 },
    });
    // a single digit is part of the name
    expect(stripped.ffCorridor.floor!.name).toBe("1. First floor");
    expect(stripped.gfCorridor.name).toBe("Ground floor Corridor");
  });

  it("returns nothing without a building structure", () => {
    expect(getProjectAreas(undefined)).toEqual({ areaBySpace: {}, areaByDevice: {} });
  });
});

describe("suggestionArea", () => {
  const projectAreas = getProjectAreas(locations);
  const area = (item: EntitySuggestion) => suggestionArea(item, projectAreas)?.name;

  it("uses the space of a building function", () => {
    expect(area(suggestion("fn", "kitchen"))).toBe("05. Kitchen");
    expect(area(suggestion("fn", "segment"))).toBe("05. Kitchen");
    expect(area(suggestion("fn", "unknown"))).toBeUndefined();
  });

  it("uses the room the device of other suggestions is placed in", () => {
    expect(area(suggestion("fb", "1.1.2"))).toBe("05. Kitchen");
    expect(area(suggestion("cfg", "1.1.4"))).toBe("Technical room");
  });

  it("has no area for devices in a distribution board or not placed in a room", () => {
    expect(area(suggestion("fb", "1.1.3"))).toBeUndefined();
    // a board within the technical room
    expect(area(suggestion("cfg", "1.1.5"))).toBeUndefined();
    expect(area(suggestion("fb", "1.1.9"))).toBeUndefined();
    expect(area(suggestion("fb", "1.1.99"))).toBeUndefined();
  });
});

describe("names", () => {
  it("strips zero padded sort numbers only", () => {
    expect(stripSortNumber("04. 2. OG")).toBe("2. OG");
    expect(stripSortNumber("10. Technik (Elektro)")).toBe("Technik (Elektro)");
    expect(stripSortNumber("1. OG")).toBe("1. OG");
    expect(stripSortNumber("08 - Hintereingang")).toBe("08 - Hintereingang");
    expect(stripSortNumber("05. ")).toBe("05. ");
    expect(stripSortNumber("Küche")).toBe("Küche");
  });

  it("compares registry names like Home Assistant", () => {
    expect(normalizeRegistryName(" Living  Room")).toBe(normalizeRegistryName("living room"));
    expect(normalizeRegistryName("Straße")).toBe(normalizeRegistryName("STRASSE"));
    expect(
      findRegistryIdByName({ a: { name: "Kitchen" }, b: { name: "Living room" } }, "living Room"),
    ).toBe("b");
    expect(findRegistryIdByName({ a: { name: "Kitchen" } }, "Bath")).toBeUndefined();
  });
});
