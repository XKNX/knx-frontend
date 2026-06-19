import { describe, it, expect, beforeEach, vi } from "vitest";

// Import AFTER vi.mock so the module picks up the mock.
import { TelegramCacheService, MAX_CACHE_SIZE } from "./telegram-cache-service";
import type { TelegramDict } from "../../../types/websocket";

// In-memory IDB stand-in: Map<key, value> per custom store.
const _store = new Map<string, any>();

vi.mock("idb-keyval", () => ({
  createStore: () => "mock-store",
  setMany: async (pairs: [string, any][]) => {
    for (const [k, v] of pairs) _store.set(k, v);
  },
  entries: async () => Array.from(_store.entries()),
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

    it("is a no-op when at or below maxCount", async () => {
      await svc.store("a", 100, makeDict("2024-01-01T00:00:00.000Z"));
      await svc.evictToSize(3);
      expect(await svc.count()).toBe(1);
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
