import memoizeOne from "memoize-one";

/**
 * Reverses expose group mapping from entity_id -> addresses[]
 * to address -> entity_ids[]
 *
 * Useful for finding which exposes are configured for a given group address.
 * The result is memoized to avoid recomputation on every render.
 *
 * @param groups Record mapping entity_id to array of group addresses
 * @returns Record mapping group address to array of entity_ids
 */
export const createExposesByGroupAddressMap = memoizeOne(
  (groups: Record<string, string[]>): Record<string, string[]> => {
    const byGA: Record<string, string[]> = Object.create(null);
    Object.entries(groups).forEach(([entityId, addresses]) => {
      addresses.forEach((ga) => {
        byGA[ga] ??= [];
        byGA[ga].push(entityId);
      });
    });
    return byGA;
  },
);
