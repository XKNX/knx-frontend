import type { HassEntities, HassEntity } from "home-assistant-js-websocket";

export type EntityStates = Record<string, HassEntity | undefined>;

/**
 * Picks the state objects of the given entities out of `hass.states`.
 *
 * Returns `previous` unchanged while none of those states changed (Home Assistant replaces
 * a state object whenever it changes), so a memoized row builder that takes the result as
 * input only rebuilds its rows when a listed entity updates, not on every state change in
 * Home Assistant.
 */
export const selectEntityStates = (
  entityIds: string[],
  states: HassEntities,
  previous: EntityStates = {},
): EntityStates => {
  const unchanged =
    entityIds.length === Object.keys(previous).length &&
    entityIds.every((id) => id in previous && previous[id] === states[id]);
  if (unchanged) return previous;
  return Object.fromEntries(entityIds.map((id) => [id, states[id]]));
};
