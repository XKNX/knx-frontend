import type { Connection } from "home-assistant-js-websocket";

import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("connection-collections");

/**
 * Duck-typed shape of a `getCollection()` result (home-assistant-js-websocket).
 * Those objects are cached on the `Connection` under a private key, e.g.
 * `_entityRegistry` or `_labelRegistry`.
 */
interface CachedCollection {
  refresh: () => Promise<unknown>;
  subscribe: (subscriber: (state: any) => void) => () => void;
}

const isCachedCollection = (value: unknown): value is CachedCollection =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as CachedCollection).subscribe === "function" &&
  typeof (value as CachedCollection).refresh === "function";

/** Whether the function was created by this window or a same-origin ancestor. */
const belongsToLivingRealm = (fn: CachedCollection["subscribe"]): boolean => {
  let win: Window = window;
  for (;;) {
    try {
      if (fn instanceof (win as Window & typeof globalThis).Function) {
        return true;
      }
    } catch (_err) {
      // cross-origin ancestor - not inspectable, so it isn't one of ours either
      return false;
    }
    if (win.parent === win) {
      return false;
    }
    win = win.parent;
  }
};

const ownCollectionKeys = (connection: Connection, ownRealmOnly: boolean): string[] =>
  Object.entries(connection)
    .filter(
      ([, value]) =>
        isCachedCollection(value) &&
        (ownRealmOnly
          ? value.subscribe instanceof Function
          : !belongsToLivingRealm(value.subscribe)),
    )
    .map(([key]) => key);

/**
 * Home Assistant caches websocket collections (entity registry, label registry, ...)
 * on the shared `Connection` object. The KNX panel is registered with `embed_iframe`,
 * so a collection that our bundle is the first to request is created in the iframe
 * realm while the `Connection` itself lives in the main window.
 *
 * When the user navigates to another panel, `ha-panel-custom` removes the iframe and
 * our realm is destroyed - but the collection object stays cached on the connection.
 * Its store and the `setTimeout` that hands the cached state to new subscribers are
 * dead, so the next subscriber (a new KNX iframe, or the main frontend itself) never
 * receives a value and waits forever. That is what left the entities data table empty
 * after leaving and re-entering the panel.
 *
 * Dropping the orphans makes the next `getCollection()` recreate them in a live realm.
 */
export const dropDeadConnectionCollections = (connection: Connection): void => {
  for (const key of ownCollectionKeys(connection, false)) {
    logger.debug(`Dropping collection "${key}" cached by a destroyed realm.`);
    delete (connection as unknown as Record<string, unknown>)[key];
  }
};

/**
 * Counterpart of `dropDeadConnectionCollections`: remove the collections this realm
 * created from the shared connection before the iframe goes away, so neither the main
 * frontend nor the next KNX iframe inherits a dead cache.
 *
 * `pagehide` fires on the iframe window when `ha-panel-custom` removes the iframe.
 */
export const releaseConnectionCollectionsOnUnload = (connection: Connection): void => {
  if (window.parent === window) {
    // not embedded - the connection is torn down together with this window
    return;
  }
  window.addEventListener("pagehide", () => {
    for (const key of ownCollectionKeys(connection, true)) {
      delete (connection as unknown as Record<string, unknown>)[key];
    }
  });
};
