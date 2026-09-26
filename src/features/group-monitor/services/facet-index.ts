/**
 * KNX Group Monitor Facet Index
 *
 * Maintains inverted bitset indexes for each filterable telegram property.
 * This allows the Group Monitor to calculate matching telegrams and counts
 * for every filter option without rescanning the complete buffer per facet.
 */

import { SparseTypedFastBitSet } from "typedfastbitset";

/** Filterable telegram property represented by a Group Monitor facet. */
export type FilterField = "source" | "destination" | "direction" | "telegramtype" | "dpt";

/** All facets that participate in matching and cross-filter count calculations. */
export const FILTER_FIELDS: readonly FilterField[] = [
  "source",
  "destination",
  "direction",
  "telegramtype",
  "dpt",
];

/** Stable filter value representing telegrams without a known DPT. */
export const UNKNOWN_DPT_ID = "unknown";

/** Selected filter values, grouped by their facet. */
export type FilterMap = Record<FilterField, ReadonlySet<string>>;

/** Telegram fields required to build and query the facet indexes. */
export interface FacetTelegram {
  id: string;
  sourceAddress: string;
  sourceText: string | null;
  destinationAddress: string;
  destinationText: string | null;
  direction: string;
  type: string;
  dptId: string | null;
  dpt: string | null;
}

/** A single filter option and the number of telegrams it would match. */
export interface DistinctValueInfo {
  id: string;
  name: string;
  /** Matches after applying every active filter except this option's own facet. */
  crossFilteredCount: number;
}

/** Available filter options, grouped by their facet. */
export type DistinctValues = Record<FilterField, Record<string, DistinctValueInfo>>;

/** Synchronized result of filtering telegrams and deriving all facet counts. */
export interface FacetQueryResult<T extends FacetTelegram> {
  matchingTelegrams: T[];
  distinctValues: DistinctValues;
}

/** Inverted index entry for one value in a filter facet. */
interface FacetEntry {
  bits: SparseTypedFastBitSet;
  name: string;
}

/** Creates a complete, empty result shape so every facet is always present. */
const emptyDistinctValues = (): DistinctValues => ({
  source: {},
  destination: {},
  direction: {},
  telegramtype: {},
  dpt: {},
});

/** Maps a telegram field to its stable filter value and display name. */
const facetValue = (telegram: FacetTelegram, field: FilterField): { id: string; name: string } => {
  switch (field) {
    case "source":
      return { id: telegram.sourceAddress, name: telegram.sourceText ?? "" };
    case "destination":
      return { id: telegram.destinationAddress, name: telegram.destinationText ?? "" };
    case "direction":
      return { id: telegram.direction, name: "" };
    case "telegramtype":
      return { id: telegram.type, name: "" };
    case "dpt":
      return telegram.dptId
        ? { id: telegram.dptId, name: telegram.dpt ?? telegram.dptId }
        : { id: UNKNOWN_DPT_ID, name: "" };
  }
  throw new Error(`Unknown filter field: ${field}`);
};

/**
 * Bitset-backed inverted index for Group Monitor filters.
 *
 * Each indexed telegram has one numeric bit position. Every facet value keeps
 * a bitset of its matching positions, allowing filter intersections and
 * cross-filter counts to be calculated efficiently.
 */
export class FacetIndex {
  /** Per-facet values and the bitsets of telegrams assigned to each value. */
  private readonly _entries = new Map<FilterField, Map<string, FacetEntry>>(
    FILTER_FIELDS.map((field) => [field, new Map<string, FacetEntry>()] as const),
  );

  /** Maps a telegram ID to its reusable bitset position. */
  private readonly _idToIndex = new Map<string, number>();

  /** Bitset containing every telegram currently tracked by this index. */
  private _all = new SparseTypedFastBitSet();

  /** Next unused bitset position when no removed position can be reused. */
  private _nextIndex = 0;

  /** Removed bitset positions available for a future telegram. */
  private _freeIndices: number[] = [];

  /**
   * Applies buffer changes to the index.
   *
   * Removed rows are processed first so a freed bitset position can be reused
   * immediately when a row is added in the same update.
   */
  public update(added: readonly FacetTelegram[], removed: readonly FacetTelegram[]): void {
    const removedRows = new Set(removed);
    for (const telegram of removed) this._remove(telegram);
    for (const telegram of added) {
      if (!removedRows.has(telegram)) this._add(telegram);
    }
  }

  /**
   * Clears all indexed rows while retaining selected values as empty options.
   *
   * Retaining selections keeps active filter chips visible after the telegram
   * buffer is cleared, even though their current match count is zero.
   */
  public clear(filters?: FilterMap): void {
    const preservedEntries = new Map<FilterField, Map<string, string>>();
    if (filters) {
      for (const field of FILTER_FIELDS) {
        const entries = new Map<string, string>();
        for (const id of filters[field]) {
          const entry = this._entries.get(field)!.get(id);
          if (entry) entries.set(id, entry.name);
        }
        preservedEntries.set(field, entries);
      }
    }

    for (const entries of this._entries.values()) entries.clear();
    this._idToIndex.clear();
    this._all = new SparseTypedFastBitSet();
    this._nextIndex = 0;
    this._freeIndices = [];

    for (const [field, entries] of preservedEntries) {
      const values = this._entries.get(field)!;
      for (const [id, name] of entries) {
        values.set(id, { bits: new SparseTypedFastBitSet(), name });
      }
    }
  }

  /**
   * Filters telegrams in a scope and calculates the options for every facet.
   *
   * A facet's `crossFilteredCount` applies active filters from every other
   * facet, but excludes the facet itself. This lets users see which values can
   * be selected next without hiding alternatives in the currently open facet.
   *
   * @param scope - Telegrams eligible for this query after time-range filtering.
   * @param filters - Currently selected values for every facet.
   * @param isFullScope - Whether `scope` contains every currently indexed row.
   * @returns Matching telegrams and per-facet cross-filter counts.
   */
  public query<T extends FacetTelegram>(
    scope: readonly T[],
    filters: FilterMap,
    isFullScope?: boolean,
  ): FacetQueryResult<T> {
    const scopeBits = this._scopeBits(scope, isFullScope);
    const activeMasks = new Map<FilterField, SparseTypedFastBitSet>();

    for (const field of FILTER_FIELDS) {
      if (filters[field].size === 0) continue;
      const union = new SparseTypedFastBitSet();
      for (const value of filters[field]) {
        const entry = this._entries.get(field)!.get(value);
        if (entry) union.union(entry.bits);
      }
      activeMasks.set(field, union);
    }

    const matchingBits = scopeBits.clone();
    for (const mask of activeMasks.values()) matchingBits.intersection(mask);

    const matchingTelegrams = scope.filter((telegram) => {
      const index = this._idToIndex.get(telegram.id);
      return index !== undefined && matchingBits.has(index);
    });

    const distinctValues = emptyDistinctValues();
    for (const field of FILTER_FIELDS) {
      const crossBits = scopeBits.clone();
      for (const [activeField, mask] of activeMasks) {
        if (activeField !== field) crossBits.intersection(mask);
      }

      for (const [id, entry] of this._entries.get(field)!) {
        if (entry.bits.isEmpty() && !filters[field].has(id)) continue;
        distinctValues[field][id] = {
          id,
          name: entry.name,
          crossFilteredCount: entry.bits.intersection_size(crossBits),
        };
      }

      for (const id of filters[field]) {
        distinctValues[field][id] ??= { id, name: "", crossFilteredCount: 0 };
      }
    }

    return { matchingTelegrams, distinctValues };
  }

  /** Returns the index positions contained in a query scope. */
  private _scopeBits(
    scope: readonly FacetTelegram[],
    isFullScope?: boolean,
  ): SparseTypedFastBitSet {
    if (isFullScope && scope.length === this._idToIndex.size) {
      return this._all.clone();
    }
    const result = new SparseTypedFastBitSet();
    for (const telegram of scope) {
      const index = this._idToIndex.get(telegram.id);
      if (index !== undefined) result.add(index);
    }
    return result;
  }

  /** Adds one telegram to every applicable facet index. */
  private _add(telegram: FacetTelegram): void {
    if (this._idToIndex.has(telegram.id)) return;
    const index = this._freeIndices.pop() ?? this._nextIndex++;
    this._idToIndex.set(telegram.id, index);
    this._all.add(index);

    for (const field of FILTER_FIELDS) {
      const { id, name } = facetValue(telegram, field);
      const values = this._entries.get(field)!;
      let entry = values.get(id);
      if (!entry) {
        entry = { bits: new SparseTypedFastBitSet(), name };
        values.set(id, entry);
      } else if (!entry.name && name) {
        entry.name = name;
      }
      entry.bits.add(index);
    }
  }

  /** Removes one telegram from every applicable facet index. */
  private _remove(telegram: FacetTelegram): void {
    const index = this._idToIndex.get(telegram.id);
    if (index === undefined) return;

    for (const field of FILTER_FIELDS) {
      const { id } = facetValue(telegram, field);
      const values = this._entries.get(field)!;
      const entry = values.get(id);
      if (!entry) continue;
      entry.bits.remove(index);
      if (entry.bits.isEmpty()) values.delete(id);
    }

    this._idToIndex.delete(telegram.id);
    this._all.remove(index);
    this._freeIndices.push(index);
  }
}
