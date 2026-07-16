/**
 * Pure helpers for the project devices tree:
 * building the device tree from KNX project data, deriving device
 * locations (ETS building structure) and lines (ETS topology), building
 * filter option lists and filtering the tree by search text and filters.
 */

import type {
  CommunicationObject,
  GroupAddress,
  KNXProject,
  KNXSpace,
  KNXTopologyArea,
} from "../types/websocket";
import { dptToString } from "./dpt";

export interface ComObjectItem {
  comObject: CommunicationObject;
  groupAddresses: GroupAddress[];
}

export interface DeviceChannelItem {
  id: string;
  name: string;
  comObjects: ComObjectItem[];
}

export interface DeviceTreeItem {
  ia: string;
  name: string;
  manufacturer: string;
  description: string;
  noChannelComObjects: ComObjectItem[];
  channels: DeviceChannelItem[];
  comObjectCount: number;
}

export interface DeviceLocation {
  id: string; // unique path key
  name: string; // innermost space name
  path: string[]; // space names from root to innermost
}

export interface DeviceLine {
  id: string; // "«area».«line»"
  label: string;
  mediumType: string;
}

export interface DeviceFilterOption {
  id: string;
  name: string;
  secondary?: string;
  count: number; // number of devices
}

export interface DeviceTreeFilter {
  searchText: string;
  dpt: string[];
  location: string[];
  line: string[];
}

export const compareIndividualAddresses = (a: string, b: string): number => {
  const aParts = a.split(".").map(Number);
  const bParts = b.split(".").map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const countComObjects = (
  noChannelComObjects: ComObjectItem[],
  channels: DeviceChannelItem[],
): number =>
  noChannelComObjects.length +
  channels.reduce((sum, channel) => sum + channel.comObjects.length, 0);

export const buildDeviceTree = (project: KNXProject): DeviceTreeItem[] =>
  Object.values(project.devices)
    .map((device) => {
      const noChannelComObjects: ComObjectItem[] = [];
      const channelComObjects: Record<string, ComObjectItem[]> = {};

      for (const comObjectId of device.communication_object_ids) {
        const comObject = project.communication_objects[comObjectId];
        if (!comObject) {
          continue;
        }
        const groupAddresses = comObject.group_address_links
          .map((id) => project.group_addresses[id])
          .filter((ga): ga is GroupAddress => !!ga);
        const item: ComObjectItem = { comObject, groupAddresses };
        if (comObject.channel && comObject.channel in device.channels) {
          (channelComObjects[comObject.channel] ??= []).push(item);
        } else {
          noChannelComObjects.push(item);
        }
      }

      const channels = Object.entries(device.channels)
        .filter(([chId, _]) => channelComObjects[chId]?.length)
        .map(([chId, channel]) => ({
          id: chId,
          name: channel.name,
          comObjects: channelComObjects[chId],
        }));

      return {
        ia: device.individual_address,
        name: device.name,
        manufacturer: device.manufacturer_name,
        description: device.description.split(/[\r\n]/, 1)[0], // first line of description like in ETS
        noChannelComObjects,
        channels,
        comObjectCount: countComObjects(noChannelComObjects, channels),
      };
    })
    .sort((a, b) => compareIndividualAddresses(a.ia, b.ia));

export const getLocationByDevice = (
  locations: Record<string, KNXSpace> | null,
): Record<string, DeviceLocation> => {
  const result: Record<string, DeviceLocation> = {};
  const walk = (spaces: Record<string, KNXSpace>, parentPath: string[]) => {
    Object.values(spaces).forEach((space) => {
      const path = [...parentPath, space.name];
      space.devices.forEach((ia) => {
        // innermost space listing the device wins
        result[ia] = { id: path.join("/"), name: space.name, path };
      });
      walk(space.spaces, path);
    });
  };
  if (locations) {
    walk(locations, []);
  }
  return result;
};

export const getLineByDevice = (
  topology: Record<string, KNXTopologyArea> | null,
  deviceIAs: string[],
): Record<string, DeviceLine> => {
  const result: Record<string, DeviceLine> = {};
  if (topology) {
    Object.entries(topology).forEach(([areaAddress, area]) => {
      Object.entries(area.lines).forEach(([lineAddress, line]) => {
        const id = `${areaAddress}.${lineAddress}`;
        const deviceLine: DeviceLine = {
          id,
          label: line.name ? `${id} ${line.name}` : id,
          mediumType: line.medium_type,
        };
        line.devices.forEach((ia) => {
          result[ia] = deviceLine;
        });
      });
    });
  }
  // fallback for devices not listed in topology data
  deviceIAs.forEach((ia) => {
    if (ia in result) {
      return;
    }
    const prefix = ia.split(".").slice(0, 2).join(".");
    result[ia] = { id: prefix, label: prefix, mediumType: "" };
  });
  return result;
};

const compareDptIds = (a: string, b: string): number => {
  const [aMain, aSub] = a.split(".").map(Number);
  const [bMain, bSub] = b.split(".").map(Number);
  return aMain - bMain || (aSub ?? -1) - (bSub ?? -1);
};

export const getDptFilterOptions = (deviceTree: DeviceTreeItem[]): DeviceFilterOption[] => {
  const deviceCounts: Record<string, number> = {};
  deviceTree.forEach((device) => {
    const deviceDpts = new Set<string>();
    [...device.noChannelComObjects, ...device.channels.flatMap((ch) => ch.comObjects)].forEach(
      (co) =>
        co.groupAddresses.forEach((ga) => {
          const dpt = dptToString(ga.dpt);
          if (dpt) {
            deviceDpts.add(dpt);
          }
        }),
    );
    deviceDpts.forEach((dpt) => {
      deviceCounts[dpt] = (deviceCounts[dpt] ?? 0) + 1;
    });
  });
  return Object.entries(deviceCounts)
    .sort(([a], [b]) => compareDptIds(a, b))
    .map(([id, count]) => ({ id, name: id, count }));
};

export const getLocationFilterOptions = (
  locationByDevice: Record<string, DeviceLocation>,
): DeviceFilterOption[] => {
  const options: Record<string, DeviceFilterOption> = {};
  Object.values(locationByDevice).forEach((location) => {
    if (options[location.id]) {
      options[location.id].count += 1;
      return;
    }
    options[location.id] = {
      id: location.id,
      name: location.name,
      secondary: location.path.slice(0, -1).join(" → ") || undefined,
      count: 1,
    };
  });
  return Object.values(options).sort((a, b) => a.id.localeCompare(b.id));
};

export const getLineFilterOptions = (
  lineByDevice: Record<string, DeviceLine>,
): DeviceFilterOption[] => {
  const options: Record<string, DeviceFilterOption> = {};
  Object.values(lineByDevice).forEach((line) => {
    if (options[line.id]) {
      options[line.id].count += 1;
      return;
    }
    options[line.id] = {
      id: line.id,
      name: line.label,
      secondary: line.mediumType || undefined,
      count: 1,
    };
  });
  return Object.values(options).sort((a, b) => compareIndividualAddresses(a.id, b.id));
};

export const hasDeviceTreeFilterActive = (filter: DeviceTreeFilter): boolean =>
  Boolean(filter.searchText.trim()) ||
  filter.dpt.length > 0 ||
  filter.location.length > 0 ||
  filter.line.length > 0;

const matchesTerms = (terms: string[], corpus: string): boolean =>
  terms.every((term) => corpus.includes(term));

const gaCorpus = (ga: GroupAddress): string =>
  `${ga.address}\n${ga.name}\n${dptToString(ga.dpt)}`.toLowerCase();

const coCorpus = (co: CommunicationObject): string =>
  `${co.text}\n${co.function_text}\n${co.number}`.toLowerCase();

/**
 * Filter the device tree by location/line (whole devices), DPT (pruning
 * group addresses) and search text. Search matches hierarchically: a device
 * level match keeps the whole device content, a channel name match keeps the
 * whole channel, a com object match keeps the com object with all its group
 * addresses, otherwise only matching group addresses (and their ancestors)
 * are kept.
 */
export const filterDeviceTree = (
  items: DeviceTreeItem[],
  filter: DeviceTreeFilter,
  locationByDevice: Record<string, DeviceLocation> | null,
  lineByDevice: Record<string, DeviceLine> | null,
): DeviceTreeItem[] => {
  if (!hasDeviceTreeFilterActive(filter)) {
    return items;
  }
  const terms = filter.searchText.toLowerCase().split(/\s+/).filter(Boolean);
  const dptActive = filter.dpt.length > 0;

  const pruneByDpt = (item: ComObjectItem): ComObjectItem | null => {
    if (!dptActive) {
      return item;
    }
    const groupAddresses = item.groupAddresses.filter((ga) =>
      filter.dpt.includes(dptToString(ga.dpt)),
    );
    return groupAddresses.length ? { ...item, groupAddresses } : null;
  };

  const searchComObject = (item: ComObjectItem): ComObjectItem | null => {
    if (matchesTerms(terms, coCorpus(item.comObject))) {
      return item;
    }
    const groupAddresses = item.groupAddresses.filter((ga) => matchesTerms(terms, gaCorpus(ga)));
    return groupAddresses.length ? { ...item, groupAddresses } : null;
  };

  const result: DeviceTreeItem[] = [];
  for (const device of items) {
    if (filter.location.length) {
      const location = locationByDevice?.[device.ia];
      if (!location || !filter.location.includes(location.id)) {
        continue;
      }
    }
    if (filter.line.length) {
      const line = lineByDevice?.[device.ia];
      if (!line || !filter.line.includes(line.id)) {
        continue;
      }
    }

    let noChannelComObjects = device.noChannelComObjects
      .map(pruneByDpt)
      .filter((item): item is ComObjectItem => !!item);
    let channels = device.channels
      .map((channel) => ({
        ...channel,
        comObjects: channel.comObjects
          .map(pruneByDpt)
          .filter((item): item is ComObjectItem => !!item),
      }))
      .filter((channel) => channel.comObjects.length);
    if (dptActive && !noChannelComObjects.length && !channels.length) {
      continue;
    }

    if (terms.length) {
      const deviceCorpus =
        `${device.ia}\n${device.name}\n${device.manufacturer}\n${device.description}`.toLowerCase();
      if (!matchesTerms(terms, deviceCorpus)) {
        noChannelComObjects = noChannelComObjects
          .map(searchComObject)
          .filter((item): item is ComObjectItem => !!item);
        channels = channels
          .map((channel) =>
            matchesTerms(terms, channel.name.toLowerCase())
              ? channel
              : {
                  ...channel,
                  comObjects: channel.comObjects
                    .map(searchComObject)
                    .filter((item): item is ComObjectItem => !!item),
                },
          )
          .filter((channel) => channel.comObjects.length);
        if (!noChannelComObjects.length && !channels.length) {
          continue;
        }
      }
    }

    result.push({
      ...device,
      noChannelComObjects,
      channels,
      comObjectCount: countComObjects(noChannelComObjects, channels),
    });
  }
  return result;
};
