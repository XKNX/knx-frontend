import type { TelegramRow } from "../types/telegram-row";

/**
 * Service for managing a telegram buffer with ring buffer behavior
 *
 * Provides efficient storage and management of telegram data with:
 * - Automatic overflow handling (oldest telegrams removed when limit exceeded)
 * - Immutable snapshots for safe external access
 * - Tracking of removed telegrams for cleanup operations
 * - Dynamic size adjustment
 */
export class TelegramBufferService {
  private _buffer: TelegramRow[] = [];
  private _snapshot?: readonly TelegramRow[];
  private _existingIds = new Set<string>();

  private _invalidateSnapshot(): void {
    this._snapshot = undefined;
  }

  constructor(private _maxSize = 2000) {}

  /**
   * Adds one or more telegrams to the buffer, avoiding duplicate IDs
   * Telegrams are inserted in chronological order based on their timestamp (microsecond precision)
   * Only sorts if necessary for optimal performance
   * @param telegrams - Single telegram or array of telegrams to add
   * @returns Array of telegrams that were removed due to buffer overflow (empty if no overflow)
   */
  add(telegrams: TelegramRow | TelegramRow[]): TelegramRow[] {
    return this.merge(Array.isArray(telegrams) ? telegrams : [telegrams]).removed;
  }

  /**
   * Adds multiple telegrams, avoiding duplicates.
   *
   * The separate added and removed collections let dependent indexes stay in
   * sync without rescanning the buffer after a merge or an overflow.
   *
   * @param newTelegrams - Array of telegrams to merge
   * @returns Unique rows added and rows removed because the buffer overflowed.
   */
  merge(newTelegrams: TelegramRow[]): { added: TelegramRow[]; removed: TelegramRow[] } {
    if (newTelegrams.length === 0) return { added: [], removed: [] };

    const telegramArray = newTelegrams.filter((telegram) => {
      if (this._existingIds.has(telegram.id)) return false;
      this._existingIds.add(telegram.id);
      return true;
    });
    if (telegramArray.length === 0) return { added: [], removed: [] };

    telegramArray.sort((a, b) =>
      a.timestampIso < b.timestampIso ? -1 : a.timestampIso > b.timestampIso ? 1 : 0,
    );

    // Quick check: if buffer is empty, add directly (already sorted above)
    if (this._buffer.length === 0) {
      this._buffer.push(...telegramArray);
    } else {
      const lastTimestamp = this._buffer[this._buffer.length - 1].timestampIso;

      // Check if ALL new telegrams are newer than the last existing one
      // AND if the new telegrams themselves are in chronological order
      const allNewerThanLast = telegramArray.every((t) => t.timestampIso >= lastTimestamp);
      const newTelegramsAreSorted =
        telegramArray.length <= 1 ||
        telegramArray.every(
          (t, i) => i === 0 || telegramArray[i - 1].timestampIso <= t.timestampIso,
        );

      if (allNewerThanLast && newTelegramsAreSorted) {
        // Fast path: just append to end
        this._buffer.push(...telegramArray);
      } else {
        // Slow path: need to sort because order is not maintained
        this._buffer.push(...telegramArray);
        this._buffer.sort((a, b) =>
          a.timestampIso < b.timestampIso ? -1 : a.timestampIso > b.timestampIso ? 1 : 0,
        );
      }
    }

    if (this._buffer.length > this._maxSize) {
      const excessCount = this._buffer.length - this._maxSize;
      const removedTelegrams = this._buffer.splice(0, excessCount);
      for (const removed of removedTelegrams) {
        this._existingIds.delete(removed.id);
      }
      this._invalidateSnapshot();
      return { added: telegramArray, removed: removedTelegrams };
    }

    this._invalidateSnapshot();
    return { added: telegramArray, removed: [] };
  }

  /**
   * Updates the maximum buffer size
   * If the new size is smaller than current buffer length, oldest telegrams are removed
   * @param size - New maximum buffer size
   * @returns Array of telegrams that were removed due to size reduction (empty if no reduction)
   */
  setMaxSize(size: number): TelegramRow[] {
    this._maxSize = size;

    if (this._buffer.length > size) {
      const excessCount = this._buffer.length - size;
      const removedTelegrams = this._buffer.splice(0, excessCount);
      for (const removed of removedTelegrams) {
        this._existingIds.delete(removed.id);
      }
      this._invalidateSnapshot();
      return removedTelegrams;
    }

    return [];
  }

  /**
   * Gets the current maximum buffer size
   */
  get maxSize(): number {
    return this._maxSize;
  }

  /**
   * Gets the current buffer length
   */
  get length(): number {
    return this._buffer.length;
  }

  /**
   * Gets an immutable snapshot of the current buffer
   * Safe for external use without risk of modification
   */
  get snapshot(): readonly TelegramRow[] {
    if (this._snapshot === undefined) this._snapshot = [...this._buffer];
    return this._snapshot;
  }

  /**
   * Clears all telegrams from the buffer
   * @returns Array of all telegrams that were cleared
   */
  clear(): TelegramRow[] {
    if (this._buffer.length === 0) return [];
    const clearedTelegrams = [...this._buffer];
    this._buffer.length = 0;
    this._existingIds.clear();
    this._invalidateSnapshot();
    return clearedTelegrams;
  }

  /**
   * Checks if the buffer is empty
   */
  get isEmpty(): boolean {
    return this._buffer.length === 0;
  }

  /**
   * Gets the telegram at a specific index (readonly access)
   * @param index - Index of the telegram to retrieve
   * @returns Telegram at the specified index or undefined if index is out of bounds
   */
  at(index: number): TelegramRow | undefined {
    return this._buffer[index];
  }

  /**
   * Finds the index of a telegram by its ID
   * @param telegramId - ID of the telegram to find
   * @returns Index of the telegram or -1 if not found
   */
  findIndexById(telegramId: string): number {
    return this._buffer.findIndex((telegram) => telegram.id === telegramId);
  }

  /**
   * Gets a telegram by its ID
   * @param telegramId - ID of the telegram to retrieve
   * @returns Telegram with the specified ID or undefined if not found
   */
  getById(telegramId: string): TelegramRow | undefined {
    return this._buffer.find((telegram) => telegram.id === telegramId);
  }
}
