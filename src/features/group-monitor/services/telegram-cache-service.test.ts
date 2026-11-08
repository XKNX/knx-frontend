import { describe, it, expect, beforeEach, vi } from "vitest";

// Import AFTER vi.mock so the module picks up the mock.
import {
  TelegramCacheService,
  MAX_CACHE_SIZE,
  CACHE_EVICTION_HEADROOM,
} from "./telegram-cache-service";
import type { TelegramDict } from "../../../types/websocket";

// In-memory IDB stand-in: Map<key, value> per custom store.
const _store = new Map<string, any>();
let _entriesReads = 0;

vi.mock("idb-keyval", () => ({
  createStore: () => "mock-store",
  setMany: async (pairs: [string, any][]) => {
    for (const [k, v] of pairs) _store.set(k, v);
  },
  entries: async () => {
    _entriesReads++;
    return Array.from(_store.entries());
  },
  delMany: async (keys: string[]) => {
    for (const k of keys) _store.delete(k);
  },
  clear: async () => _store.clear(),
}));

function makeDict(timestamp: string): TelegramDict {
  return {
    timestamp,
    source: "1.1.1",
    source_name: "",
    destination: "0/0/1",
    destination_name: "",
    direction: "Incoming",
    telegramtype: "GroupValueWrite",
    payload: [0],
    dpt_main: 1,
    dpt_sub: 1,
    dpt_name: "DPT-1",
    unit: null,
    value: false,
    data_secure: false,
  };
}

describe("TelegramCacheService", () => {
  let svc: TelegramCacheService;

  beforeEach(() => {
    _store.clear();
    _entriesReads = 0;
    svc = new TelegramCacheService();
  });

  describe("store / loadAll", () => {
    it("stores a single entry and loads it back", async () => {
      const dict = makeDict("2024-01-01T12:00:00.000Z");
      await svc.store("id-a", 1000, dict);
      const loaded = await svc.loadAll();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe("id-a");
      expect(loaded[0].ts).toBe(1000);
      expect(loaded[0].dict.timestamp).toBe("2024-01-01T12:00:00.000Z");
    });

    it("stores a batch and returns all entries", async () => {
      await svc.store([
        { id: "a", ts: 100, dict: makeDict("2024-01-01T00:00:00.000Z") },
        { id: "b", ts: 200, dict: makeDict("2024-01-01T00:00:01.000Z") },
        { id: "c", ts: 300, dict: makeDict("2024-01-01T00:00:02.000Z") },
      ]);
      const loaded = await svc.loadAll();
      expect(loaded).toHaveLength(3);
    });

    it("returns entries sorted newest-first", async () => {
      await svc.store([
        { id: "a", ts: 100, dict: makeDict("2024-01-01T00:00:00.000Z") },
        { id: "b", ts: 300, dict: makeDict("2024-01-01T00:00:02.000Z") },
        { id: "c", ts: 200, dict: makeDict("2024-01-01T00:00:01.000Z") },
      ]);
      const loaded = await svc.loadAll();
      expect(loaded.map((e) => e.ts)).toEqual([300, 200, 100]);
    });

    it("overwrites an existing entry with the same key (idempotent)", async () => {
      const dict1 = makeDict("2024-01-01T00:00:00.000Z");
      const dict2 = makeDict("2024-01-01T00:00:01.000Z");
      await svc.store("id-a", 100, dict1);
      await svc.store("id-a", 200, dict2);
      const loaded = await svc.loadAll();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].ts).toBe(200);
    });

    it("returns empty array when cache is empty", async () => {
      expect(await svc.loadAll()).toEqual([]);
    });
  });

  describe("evictBefore", () => {
    it("removes entries strictly before minMs", async () => {
      await svc.store([
        { id: "a", ts: 100, dict: makeDict("2024-01-01T00:00:00.000Z") },
        { id: "b", ts: 200, dict: makeDict("2024-01-01T00:00:01.000Z") },
        { id: "c", ts: 300, dict: makeDict("2024-01-01T00:00:02.000Z") },
      ]);
      await svc.evictBefore(200);
      const loaded = await svc.loadAll();
      expect(loaded.map((e) => e.id).sort()).toEqual(["b", "c"]);
    });

    it("keeps entries at exactly minMs", async () => {
      await svc.store("a", 200, makeDict("2024-01-01T00:00:01.000Z"));
      await svc.evictBefore(200);
      expect(await svc.count()).toBe(1);
    });

    it("is a no-op when all entries are newer", async () => {
      await svc.store("a", 500, makeDict("2024-01-01T00:00:05.000Z"));
      await svc.evictBefore(200);
      expect(await svc.count()).toBe(1);
    });
  });

  describe("evictToSize", () => {
    it("trims oldest entries when over maxCount", async () => {
      await svc.store([
        { id: "a", ts: 100, dict: makeDict("2024-01-01T00:00:00.000Z") },
        { id: "b", ts: 200, dict: makeDict("2024-01-01T00:00:01.000Z") },
        { id: "c", ts: 300, dict: makeDict("2024-01-01T00:00:02.000Z") },
        { id: "d", ts: 400, dict: makeDict("2024-01-01T00:00:03.000Z") },
        { id: "e", ts: 500, dict: makeDict("2024-01-01T00:00:04.000Z") },
      ]);
      await svc.evictToSize(3);
      const loaded = await svc.loadAll();
      expect(loaded).toHaveLength(3);
      expect(loaded.map((e) => e.id).sort()).toEqual(["c", "d", "e"]);
    });

    it("returns the oldest surviving timestamp when eviction occurs", async () => {
      await svc.store([
        { id: "a", ts: 100, dict: makeDict("2024-01-01T00:00:00.000Z") },
        { id: "b", ts: 200, dict: makeDict("2024-01-01T00:00:01.000Z") },
        { id: "c", ts: 300, dict: makeDict("2024-01-01T00:00:02.000Z") },
      ]);
      const oldest = await svc.evictToSize(2);
      expect(oldest).toBe(200); // entry "b" is now the oldest surviving
    });

    it("returns null when at or below maxCount", async () => {
      await svc.store("a", 100, makeDict("2024-01-01T00:00:00.000Z"));
      const result = await svc.evictToSize(3);
      expect(result).toBeNull();
      expect(await svc.count()).toBe(1);
    });
  });

  describe("evictIfOverCap", () => {
    const seed = (count: number) =>
      svc.store(
        Array.from({ length: count }, (_, i) => ({
          id: `t${i}`,
          ts: i,
          dict: makeDict("2024-01-01T00:00:00.000Z"),
        })),
      );

    it("reads the store once to learn its size, then skips reads while under the cap", async () => {
      await seed(3);
      expect(await svc.evictIfOverCap()).toBeNull();
      expect(_entriesReads).toBe(1);

      await svc.store("x", 10, makeDict("2024-01-01T00:00:00.000Z"));
      expect(await svc.evictIfOverCap()).toBeNull();
      expect(_entriesReads).toBe(1);
      expect(_store.size).toBe(4);
    });

    it("trims the oldest entries to headroom below the cap once it is exceeded", async () => {
      await seed(MAX_CACHE_SIZE + 1);
      const oldestSurviving = await svc.evictIfOverCap();

      const target = MAX_CACHE_SIZE - CACHE_EVICTION_HEADROOM;
      expect(_store.size).toBe(target);
      expect(oldestSurviving).toBe(MAX_CACHE_SIZE + 1 - target);
      expect(_store.has("t0")).toBe(false);
      expect(_store.has(`t${MAX_CACHE_SIZE}`)).toBe(true);

      // The size is known exactly now, so the next check needs no read.
      _entriesReads = 0;
      expect(await svc.evictIfOverCap()).toBeNull();
      expect(_entriesReads).toBe(0);
    });

    it("counts writes towards the cap without reading the store", async () => {
      await seed(MAX_CACHE_SIZE);
      expect(await svc.evictIfOverCap()).toBeNull();
      _entriesReads = 0;

      await svc.store("late", MAX_CACHE_SIZE + 5, makeDict("2024-01-01T00:00:00.000Z"));
      expect(await svc.evictIfOverCap()).not.toBeNull();
      expect(_entriesReads).toBe(1);
      expect(_store.size).toBe(MAX_CACHE_SIZE - CACHE_EVICTION_HEADROOM);
    });
  });

  describe("loadRange", () => {
    it("returns only entries within [startMs, endMs]", async () => {
      await svc.store([
        { id: "a", ts: 100, dict: makeDict("2024-01-01T00:00:00.000Z") },
        { id: "b", ts: 200, dict: makeDict("2024-01-01T00:00:01.000Z") },
        { id: "c", ts: 300, dict: makeDict("2024-01-01T00:00:02.000Z") },
        { id: "d", ts: 400, dict: makeDict("2024-01-01T00:00:03.000Z") },
      ]);
      const result = await svc.loadRange(200, 300);
      expect(result.map((e) => e.id).sort()).toEqual(["b", "c"]);
    });

    it("returns entries sorted newest first", async () => {
      await svc.store([
        { id: "a", ts: 100, dict: makeDict("2024-01-01T00:00:00.000Z") },
        { id: "b", ts: 200, dict: makeDict("2024-01-01T00:00:01.000Z") },
        { id: "c", ts: 300, dict: makeDict("2024-01-01T00:00:02.000Z") },
      ]);
      const result = await svc.loadRange(100, 300);
      expect(result.map((e) => e.ts)).toEqual([300, 200, 100]);
    });

    it("returns empty array when no entries match the range", async () => {
      await svc.store("a", 100, makeDict("2024-01-01T00:00:00.000Z"));
      expect(await svc.loadRange(500, 1000)).toEqual([]);
    });
  });

  describe("loadRanges", () => {
    const seed = () =>
      svc.store([
        { id: "a", ts: 100, dict: makeDict("2024-01-01T00:00:00.000Z") },
        { id: "b", ts: 200, dict: makeDict("2024-01-01T00:00:01.000Z") },
        { id: "c", ts: 300, dict: makeDict("2024-01-01T00:00:02.000Z") },
        { id: "d", ts: 400, dict: makeDict("2024-01-01T00:00:03.000Z") },
      ]);

    it("returns the entries of every range in one read, newest first", async () => {
      await seed();
      _entriesReads = 0;
      const result = await svc.loadRanges([
        [100, 150],
        [300, 400],
      ]);
      expect(result.map((e) => e.id)).toEqual(["d", "c", "a"]);
      expect(_entriesReads).toBe(1);
    });

    it("does not read the store for no ranges", async () => {
      await seed();
      _entriesReads = 0;
      expect(await svc.loadRanges([])).toEqual([]);
      expect(_entriesReads).toBe(0);
    });
  });

  describe("loadStartup", () => {
    it("returns every key with its timestamp and only the newest dicts", async () => {
      await svc.store([
        { id: "b", ts: 200, dict: makeDict("2024-01-01T00:00:01.000Z") },
        { id: "a", ts: 100, dict: makeDict("2024-01-01T00:00:00.000Z") },
        { id: "c", ts: 300, dict: makeDict("2024-01-01T00:00:02.000Z") },
      ]);
      _entriesReads = 0;

      const { index, newest } = await svc.loadStartup(2);

      expect(index).toEqual([
        { id: "a", ts: 100 },
        { id: "b", ts: 200 },
        { id: "c", ts: 300 },
      ]);
      expect(newest.map((e) => e.id)).toEqual(["c", "b"]);
      expect(newest[0].dict.timestamp).toBe("2024-01-01T00:00:02.000Z");
      expect(_entriesReads).toBe(1);
    });

    it("returns everything when the store is smaller than the limit", async () => {
      await svc.store("a", 100, makeDict("2024-01-01T00:00:00.000Z"));
      const { index, newest } = await svc.loadStartup(10);
      expect(index).toHaveLength(1);
      expect(newest).toHaveLength(1);
    });

    it("handles an empty store", async () => {
      expect(await svc.loadStartup(10)).toEqual({ index: [], newest: [] });
    });
  });

  describe("count", () => {
    it("returns 0 on an empty store", async () => {
      expect(await svc.count()).toBe(0);
    });

    it("returns the correct count after storing entries", async () => {
      await svc.store("a", 100, makeDict("2024-01-01T00:00:00.000Z"));
      await svc.store("b", 200, makeDict("2024-01-01T00:00:01.000Z"));
      expect(await svc.count()).toBe(2);
    });
  });

  describe("clear", () => {
    it("removes all entries", async () => {
      await svc.store("a", 100, makeDict("2024-01-01T00:00:00.000Z"));
      await svc.store("b", 200, makeDict("2024-01-01T00:00:01.000Z"));
      await svc.clear();
      expect(await svc.count()).toBe(0);
    });
  });

  describe("MAX_CACHE_SIZE", () => {
    it("exports the expected cap", () => {
      expect(MAX_CACHE_SIZE).toBe(100_000);
    });
  });
});
