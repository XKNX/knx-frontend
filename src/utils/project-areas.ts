/**
 * Pure helpers deriving Home Assistant floors and areas from the ETS building
 * structure of an imported project, for entities created from suggestions.
 */

import type { EntitySuggestion, KNXSpace } from "../types/websocket";

// ETS space types becoming a Home Assistant floor
const FLOOR_SPACE_TYPES = new Set(["Floor"]);
// ETS space types becoming a Home Assistant area - spaces of other types (eg.
// a segment of a room) take the area of a space containing them
const AREA_SPACE_TYPES = new Set(["Room", "Corridor", "Stairway"]);
// devices placed in a distribution board - even one within a room - are actuators
// or system devices: the room of the board says nothing about what they control
const DISTRIBUTION_BOARD_SPACE_TYPES = new Set(["DistributionBoard"]);

// a zero padded sort number like "05. " in "05. Kitchen" - a single digit like
// in "1. OG" (first floor) is part of the name
const SORT_NUMBER_PATTERN = /^\d{2,}\.\s+(?=\S)/;

export interface ProjectFloor {
  name: string;
  // position in the ETS building structure
  order: number;
}

export interface ProjectArea {
  name: string;
  floor: ProjectFloor | null;
}

export interface ProjectAreas {
  // key: space identifier - every space within an area-like space, the area itself included
  areaBySpace: Record<string, ProjectArea>;
  // key: individual address - devices placed in a room, not in a distribution board
  areaByDevice: Record<string, ProjectArea>;
}

export interface ProjectAreaOptions {
  // remove sort numbers like "05. " from the names of floors and areas
  stripSortNumbers?: boolean;
}

export const stripSortNumber = (name: string): string => name.replace(SORT_NUMBER_PATTERN, "");

/** Floors and areas of the ETS building structure, by space and by device placed in it. */
export const getProjectAreas = (
  locations: Record<string, KNXSpace> | null | undefined,
  options: ProjectAreaOptions = {},
): ProjectAreas => {
  const areaBySpace: Record<string, ProjectArea> = {};
  const areaByDevice: Record<string, ProjectArea> = {};
  const areaSpaces: ProjectArea[] = [];
  const spaceName = (space: KNXSpace) =>
    options.stripSortNumbers ? stripSortNumber(space.name) : space.name;
  let floorCount = 0;

  const walk = (
    spaces: Record<string, KNXSpace>,
    floor: ProjectFloor | null,
    area: ProjectArea | null,
    inDistributionBoard: boolean,
  ) => {
    Object.values(spaces).forEach((space) => {
      let spaceFloor = floor;
      let spaceArea = area;
      if (!area && FLOOR_SPACE_TYPES.has(space.type)) {
        spaceFloor = { name: spaceName(space), order: floorCount++ };
      } else if (!area && AREA_SPACE_TYPES.has(space.type)) {
        spaceArea = { name: spaceName(space), floor };
        areaSpaces.push(spaceArea);
      }
      const spaceInDistributionBoard =
        inDistributionBoard || DISTRIBUTION_BOARD_SPACE_TYPES.has(space.type);
      if (spaceArea) {
        areaBySpace[space.identifier] = spaceArea;
      }
      space.devices.forEach((ia) => {
        // innermost space listing the device wins
        if (spaceArea && !spaceInDistributionBoard) {
          areaByDevice[ia] = spaceArea;
        } else {
          delete areaByDevice[ia];
        }
      });
      walk(space.spaces, spaceFloor, spaceArea, spaceInDistributionBoard);
    });
  };
  walk(locations ?? {}, null, null, false);
  disambiguateAreaNames(areaSpaces);

  return { areaBySpace, areaByDevice };
};

/**
 * Area names are unique in Home Assistant - rooms of the same name (eg. "Corridor")
 * would otherwise end up in the same area. If rooms sharing a name are on different
 * floors, those on a floor are prefixed with it - a prefix telling nothing apart is
 * left out. Rooms still sharing a name, eg. on the same floor, get a number.
 */
const disambiguateAreaNames = (areas: ProjectArea[]) => {
  const byName = () => {
    const groups = new Map<string, ProjectArea[]>();
    areas.forEach((area) => {
      const key = normalizeRegistryName(area.name);
      groups.set(key, [...(groups.get(key) ?? []), area]);
    });
    return groups;
  };
  byName().forEach((group) => {
    if (new Set(group.map((area) => area.floor)).size < 2) return;
    group.forEach((area) => {
      if (area.floor) area.name = `${area.floor.name} ${area.name}`;
    });
  });
  byName().forEach((group) => {
    group.forEach((area, index) => {
      if (index > 0) area.name = `${area.name} ${index + 1}`;
    });
  });
};

/**
 * The area an entity created from a suggestion belongs to - `fn` suggestions are
 * grouped by the space of their function, `fb` and `cfg` suggestions by the
 * individual address of their device: the room it is placed in, if it is not
 * placed in a distribution board.
 */
export const suggestionArea = (
  suggestion: EntitySuggestion,
  projectAreas: ProjectAreas,
): ProjectArea | undefined =>
  suggestion.source === "fn"
    ? projectAreas.areaBySpace[suggestion.group_id]
    : projectAreas.areaByDevice[suggestion.group_id];

/**
 * Names of floors and areas are compared like Home Assistant does to keep them
 * unique - `name.casefold().replace(" ", "")` of its registries. Upper casing
 * first applies the case folding of eg. "ß" to "ss" that lower casing lacks.
 */
export const normalizeRegistryName = (name: string): string =>
  name.toUpperCase().toLowerCase().replace(/ /g, "");

/** The id of the registry entry of the given name, if there is one. */
export const findRegistryIdByName = (
  entries: Record<string, { name: string }>,
  name: string,
): string | undefined => {
  const normalized = normalizeRegistryName(name);
  return Object.entries(entries).find(
    ([_, entry]) => normalizeRegistryName(entry.name) === normalized,
  )?.[0];
};
