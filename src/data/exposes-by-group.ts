import memoizeOne from "memoize-one";

import type { ExposeGroups } from "./knx-expose-groups-context";

/** An expose of an entity to a group address. */
export interface RelatedExpose {
  entity_id: string;
  ui: boolean; // ui or yaml expose
}

/**
 * Reverses expose group mapping from entity_id -> addresses[]
 * to address -> exposes[]
 *
 * Useful for finding which exposes are configured for a given group address.
 * UI and YAML exposes of the same entity are separate items.
 * The result is memoized to avoid recomputation on every render.
 *
 * @param groups Record mapping entity_id to array of exposed group addresses
 * @returns Record mapping group address to array of exposes
 */
export const createExposesByGroupAddressMap = memoizeOne(
  (groups: ExposeGroups): Record<string, RelatedExpose[]> => {
    const byGA: Record<string, RelatedExpose[]> = Object.create(null);
    Object.entries(groups).forEach(([entityId, addresses]) => {
      addresses.forEach(({ ga, ui }) => {
        byGA[ga] ??= [];
        // an expose can send several of its options to the same group address
        if (!byGA[ga].some((expose) => expose.entity_id === entityId && expose.ui === ui)) {
          byGA[ga].push({ entity_id: entityId, ui });
        }
      });
    });
    return byGA;
  },
);

/**
 * Group addresses of UI configured exposes by entity_id.
 * Entities exposed from YAML only are omitted.
 */
export const createUiExposeGroups = memoizeOne((groups: ExposeGroups): Record<string, string[]> => {
  const uiGroups: Record<string, string[]> = Object.create(null);
  Object.entries(groups).forEach(([entityId, addresses]) => {
    const uiAddresses = addresses.filter((address) => address.ui).map((address) => address.ga);
    if (uiAddresses.length) {
      uiGroups[entityId] = uiAddresses;
    }
  });
  return uiGroups;
});
