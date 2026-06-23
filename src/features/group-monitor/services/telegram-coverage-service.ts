/**
 * A closed time interval `[start, end]` in epoch milliseconds.
 */
export type Interval = [number, number];

/**
 * Tracks which time ranges have been fully loaded into the telegram buffer.
 *
 * The Group Monitor loads history transparently: when the user selects a time
 * range, only the parts of that range that are not yet covered need to be
 * queried from the backend. This service performs the interval bookkeeping for
 * that "coverage cache":
 *
 * - Covered intervals are kept sorted, merged and non-overlapping.
 * - `gaps()` returns the sub-ranges of a request that still need loading.
 * - A trailing "live" interval grows while telegrams stream in and is closed
 *   when the stream pauses or disconnects, so pause windows become real gaps.
 *
 * All math is pure and operates on epoch-millisecond numbers, which makes it
 * trivial to unit-test independently of telegram data.
 */
export class TelegramCoverageService {
  private _covered: Interval[] = [];

  /** End timestamp of the currently open live interval, or null when closed. */
  private _liveStart: number | null = null;

  /**
   * Returns an immutable snapshot of the covered intervals.
   */
  get covered(): readonly Interval[] {
    return this._covered.map((i) => [i[0], i[1]] as Interval);
  }

  /**
   * Marks the interval `[start, end]` as fully loaded, merging it with any
   * existing covered intervals that overlap or are adjacent.
   */
  addCovered(start: number, end: number): void {
    if (end < start) return;
    this._covered.push([start, end]);
    this._covered.sort((a, b) => a[0] - b[0]);

    const merged: Interval[] = [];
    for (const [s, e] of this._covered) {
      const last = merged[merged.length - 1];
      // Merge when overlapping or directly adjacent (touching endpoints).
      if (last && s <= last[1]) {
        if (e > last[1]) last[1] = e;
      } else {
        merged.push([s, e]);
      }
    }
    this._covered = merged;
  }

  /**
   * Returns the sub-intervals of `[start, end]` that are not yet covered.
   * The result is sorted and non-overlapping; an empty array means the whole
   * range is already loaded.
   */
  gaps(start: number, end: number): Interval[] {
    if (end < start) return [];

    const result: Interval[] = [];
    let cursor = start;

    for (const [s, e] of this._covered) {
      if (e < cursor) continue; // covered interval entirely before the cursor
      if (s > end) break; // covered intervals are sorted; no more overlap
      if (s > cursor) {
        // Gap before this covered interval (s <= end here, so s-1 <= end).
        result.push([cursor, s - 1]);
      }
      cursor = Math.max(cursor, e + 1);
      if (cursor > end) break;
    }

    if (cursor <= end) {
      result.push([cursor, end]);
    }

    return result;
  }

  /**
   * Whether `[start, end]` is entirely covered.
   */
  isCovered(start: number, end: number): boolean {
    return this.gaps(start, end).length === 0;
  }

  /**
   * Drops or clips covered intervals that fall before `minMs`. Used to keep the
   * cache within the backend's retention window.
   */
  trim(minMs: number): void {
    this._covered = this._covered
      .filter((i) => i[1] >= minMs)
      .map((i) => [Math.max(i[0], minMs), i[1]] as Interval);
    if (this._liveStart !== null) {
      this._liveStart = Math.max(this._liveStart, minMs);
    }
  }

  /**
   * Extends the open "live" coverage interval up to `tsMs`. The first call
   * (after a `closeLive()` or construction) anchors the interval start.
   */
  extendLive(tsMs: number): void {
    if (this._liveStart === null) {
      this._liveStart = tsMs;
    }
    this.addCovered(this._liveStart, tsMs);
    this._liveStart = tsMs;
  }

  /**
   * Closes the open live interval so the following pause/disconnect window is
   * treated as a gap. The next `extendLive()` starts a fresh live interval.
   */
  closeLive(): void {
    this._liveStart = null;
  }

  /**
   * Clears all coverage state.
   */
  clear(): void {
    this._covered = [];
    this._liveStart = null;
  }
}
