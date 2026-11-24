import memoizeOne from "memoize-one";

import type { ExposeGroups } from "./knx-expose-groups-context";

/**
 * Reverses expose group mapping from entity_id -> addresses[]
 * to address -> entity_ids[]
 *
 * Useful for finding which exposes are configured for a given group address.
 * UI and YAML exposes are both included.
 * The result is memoized to avoid recomputation on every render.
 *
 * @param groups Record mapping entity_id to array of exposed group addresses
 * @returns Record mapping group address to array of entity_ids
 */
export const createExposesByGroupAddressMap = memoizeOne(
  (groups: ExposeGroups): Record<string, string[]> => {
    const byGA: Record<string, string[]> = Object.create(null);
    Object.entries(groups).forEach(([entityId, addresses]) => {
      addresses.forEach(({ ga }) => {
        byGA[ga] ??= [];
        // an entity may be exposed to the same address from UI and YAML
        if (!byGA[ga].includes(entityId)) {
          byGA[ga].push(entityId);
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
