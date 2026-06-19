/**
 * Persistent cache for raw telegram dicts backed by IndexedDB (via idb-keyval).
 *
 * Stores raw `TelegramDict` objects so they can survive a page reload without a
 * round-trip to the backend. Each entry is keyed by the telegram's stable id
 * (the same slugified string used by `TelegramRow`) and stores the epoch-ms
 * timestamp alongside the dict so we can evict old entries without deserialising
 * the full payload.
 *
 * All methods are fire-and-forget safe: callers should catch errors and treat
 * the cache as purely advisory — a miss or failure just falls back to a backend
 * query.
 */

import { clear, createStore, delMany, entries, setMany } from "idb-keyval";
import type { TelegramDict } from "../../../types/websocket";

/** Maximum number of telegrams kept in the persistent cache. */
export const MAX_CACHE_SIZE = 100_000;

/** IDB store name — kept stable; changing it orphans existing data. */
const IDB_STORE = createStore("knx-group-monitor", "telegrams");

/** Shape of each entry stored in IndexedDB. */
interface CachedEntry {
  ts: number; // epoch milliseconds — used for eviction ordering
  dict: TelegramDict;
}

export class TelegramCacheService {
  /**
   * Persists a batch of telegram dicts.  Existing entries with the same key are
   * overwritten (idempotent merge, matches buffer deduplication behaviour).
   */
  async store(id: string, ts: number, dict: TelegramDict): Promise<void>;
  async store(telegrams: { id: string; ts: number; dict: TelegramDict }[]): Promise<void>;
  async store(
    idOrBatch: string | { id: string; ts: number; dict: TelegramDict }[],
    ts?: number,
    dict?: TelegramDict,
  ): Promise<void> {
    const pairs: [string, CachedEntry][] =
      typeof idOrBatch === "string"
        ? [[idOrBatch, { ts: ts!, dict: dict! }]]
        : idOrBatch.map(({ id, ts: t, dict: d }) => [id, { ts: t, dict: d }]);
    if (pairs.length === 0) return;
    await setMany(pairs, IDB_STORE);
  }

  /**
   * Returns all cached dicts, newest first (sorted by `ts` descending).
   */
  async loadAll(): Promise<{ id: string; ts: number; dict: TelegramDict }[]> {
    const all = await entries<string, CachedEntry>(IDB_STORE);
    return all
      .map(([id, entry]) => ({ id, ts: entry.ts, dict: entry.dict }))
      .sort((a, b) => b.ts - a.ts);
  }

  /**
   * Deletes all entries whose timestamp is strictly before `minMs`.
   */
  async evictBefore(minMs: number): Promise<void> {
    const all = await entries<string, CachedEntry>(IDB_STORE);
    const stale = all.filter(([, entry]) => entry.ts < minMs).map(([id]) => id);
    if (stale.length > 0) await delMany(stale, IDB_STORE);
  }

  /**
   * Trims the cache to at most `maxCount` entries by deleting the oldest.
   */
  async evictToSize(maxCount: number): Promise<void> {
    const all = await entries<string, CachedEntry>(IDB_STORE);
    if (all.length <= maxCount) return;
    // Sort oldest-first and evict the excess.
    all.sort((a, b) => a[1].ts - b[1].ts);
    const toEvict = all.slice(0, all.length - maxCount).map(([id]) => id);
    await delMany(toEvict, IDB_STORE);
  }

  /** Returns the total number of entries in the cache. */
  async count(): Promise<number> {
    const all = await entries(IDB_STORE);
    return all.length;
  }

  /** Wipes all entries from the cache. */
  async clear(): Promise<void> {
    await clear(IDB_STORE);
  }
}
