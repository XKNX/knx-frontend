import { describe, expect, it, vi } from "vitest";
import {
  FacetIndex,
  FILTER_FIELDS,
  type FacetTelegram,
  type FilterMap,
  UNKNOWN_DPT_ID,
} from "./facet-index";

const telegram = (
  id: string,
  sourceAddress: string,
  destinationAddress: string,
  direction: string,
  type: string,
  dptId: string | null,
): FacetTelegram => ({
  id,
  sourceAddress,
  sourceText: `Source ${sourceAddress}`,
  destinationAddress,
  destinationText: `Destination ${destinationAddress}`,
  direction,
  type,
  dptId,
  dpt: dptId,
});

const filters = (values: Partial<Record<keyof FilterMap, string[]>> = {}): FilterMap => ({
  source: new Set(values.source),
  destination: new Set(values.destination),
  direction: new Set(values.direction),
  telegramtype: new Set(values.telegramtype),
  dpt: new Set(values.dpt),
});

const a = telegram("a", "1.1.1", "1/1/1", "Incoming", "GroupValueWrite", "1.001");
const b = telegram("b", "1.1.2", "1/1/1", "Incoming", "GroupValueRead", null);
const c = telegram("c", "1.1.1", "2/2/2", "Outgoing", "GroupValueWrite", "1.001");
const d = telegram("d", "1.1.3", "2/2/2", "Incoming", "GroupValueWrite", "5.001");

describe("FacetIndex", () => {
  it("ORs within fields, ANDs across fields, and ignores the counted field", () => {
    const index = new FacetIndex();
    index.update([a, b, c, d], []);

    const result = index.query(
      [a, b, c],
      filters({ source: ["1.1.1", "1.1.2"], direction: ["Incoming"] }),
    );

    expect(result.matchingTelegrams.map((row) => row.id)).toEqual(["a", "b"]);
    expect(result.distinctValues.source["1.1.1"].crossFilteredCount).toBe(1);
    expect(result.distinctValues.source["1.1.2"].crossFilteredCount).toBe(1);
    expect(result.distinctValues.source["1.1.3"].crossFilteredCount).toBe(0);
    expect(result.distinctValues.destination["1/1/1"].crossFilteredCount).toBe(2);
    expect(result.distinctValues.destination["2/2/2"].crossFilteredCount).toBe(0);
    expect(result.distinctValues.direction.Incoming.crossFilteredCount).toBe(2);
    expect(result.distinctValues.direction.Outgoing.crossFilteredCount).toBe(1);
    expect(result.distinctValues.dpt["1.001"].crossFilteredCount).toBe(1);
    expect(result.distinctValues.dpt[UNKNOWN_DPT_ID].crossFilteredCount).toBe(1);
  });

  it("keeps zero-count and selected unknown values visible", () => {
    const index = new FacetIndex();
    index.update([a, b, c, d], []);

    const result = index.query([a, b, c, d], filters({ destination: ["9/9/9"] }));

    expect(result.matchingTelegrams).toEqual([]);
    expect(result.distinctValues.destination["1/1/1"].crossFilteredCount).toBe(2);
    expect(result.distinctValues.destination["2/2/2"].crossFilteredCount).toBe(2);
    expect(result.distinctValues.destination["9/9/9"]).toEqual({
      id: "9/9/9",
      name: "",
      crossFilteredCount: 0,
    });
  });

  it("does not treat duplicate scope rows as the full indexed scope", () => {
    const index = new FacetIndex();
    index.update([a, b], []);

    const result = index.query([a, a], filters());

    expect(result.distinctValues.source["1.1.1"].crossFilteredCount).toBe(1);
    expect(result.distinctValues.source["1.1.2"].crossFilteredCount).toBe(0);
  });

  it("updates incrementally, reuses released indices, and ignores duplicates", () => {
    const index = new FacetIndex();
    index.update([a, a], []);

    expect(index.query([a], filters()).distinctValues.source["1.1.1"].crossFilteredCount).toBe(1);

    index.update([], [telegram("missing", "0.0.0", "0/0/0", "Incoming", "x", null)]);
    index.update([], [a]);
    index.update([d], []);

    expect((index as any)._nextIndex).toBe(1);
    const result = index.query([d], filters());
    expect(result.distinctValues.source["1.1.1"]).toBeUndefined();
    expect(result.distinctValues.source["1.1.3"].crossFilteredCount).toBe(1);
  });

  it("does not index a row added and removed in the same update", () => {
    const index = new FacetIndex();

    index.update([a], [a]);

    expect(index.query([], filters()).distinctValues.source["1.1.1"]).toBeUndefined();
  });

  it("enriches an existing facet value when a later telegram supplies its name", () => {
    const index = new FacetIndex();
    const unnamedSource = { ...a, id: "unnamed-source", sourceText: null };
    const namedSource = { ...a, id: "named-source", sourceText: "Living room switch" };

    index.update([unnamedSource, namedSource], []);

    expect(
      index.query([unnamedSource, namedSource], filters()).distinctValues.source["1.1.1"].name,
    ).toBe("Living room switch");
  });

  it("rejects an unsupported filter field", () => {
    const index = new FacetIndex();
    const mutableFilterFields = FILTER_FIELDS as unknown as string[];
    mutableFilterFields.push("unsupported");

    try {
      expect(() => index.update([a], [])).toThrow("Unknown filter field: unsupported");
    } finally {
      mutableFilterFields.pop();
    }
  });

  it("clears every indexed value", () => {
    const index = new FacetIndex();
    index.update([a, b], []);
    index.clear();

    expect(index.query([], filters())).toEqual({
      matchingTelegrams: [],
      distinctValues: { source: {}, destination: {}, direction: {}, telegramtype: {}, dpt: {} },
    });
  });

  it("preserves labels for selected values with zero counts", () => {
    const index = new FacetIndex();
    index.update([a], []);

    const activeFilters = filters({ source: ["1.1.1"], destination: ["1/1/1"] });
    index.clear(activeFilters);

    const result = index.query([], activeFilters);
    expect(result.distinctValues.source["1.1.1"]).toEqual({
      id: "1.1.1",
      name: "Source 1.1.1",
      crossFilteredCount: 0,
    });
    expect(result.distinctValues.destination["1/1/1"]).toEqual({
      id: "1/1/1",
      name: "Destination 1/1/1",
      crossFilteredCount: 0,
    });
  });

  it("drops cleared values once they are no longer selected", () => {
    const index = new FacetIndex();
    index.update([a], []);

    index.clear(filters({ source: ["1.1.1"] }));

    const result = index.query([], filters());

    expect(result.distinctValues.source["1.1.1"]).toBeUndefined();
  });

  it("uses cloned _all bitset on full scope query", () => {
    const index = new FacetIndex();
    index.update([a, b, c], []);

    const spyClone = vi.spyOn((index as any)._all, "clone");
    const result = index.query([a, b, c], filters(), true);

    expect(spyClone).toHaveBeenCalled();
    expect(result.matchingTelegrams.map((r) => r.id)).toEqual(["a", "b", "c"]);
    spyClone.mockRestore();

    const spyCloneNotFull = vi.spyOn((index as any)._all, "clone");
    index.query([a, b], filters(), true);
    expect(spyCloneNotFull).not.toHaveBeenCalled();
    spyCloneNotFull.mockRestore();
  });
});
