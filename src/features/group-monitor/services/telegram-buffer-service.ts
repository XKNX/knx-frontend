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

  constructor(private _maxSize = 2000) {}

  /**
   * Adds one or more telegrams to the buffer
   * Telegrams are inserted in chronological order based on their timestamp (microsecond precision)
   * Only sorts if necessary for optimal performance
   * @param telegrams - Single telegram or array of telegrams to add
   * @returns Array of telegrams that were removed due to buffer overflow (empty if no overflow)
   */
  add(telegrams: TelegramRow | TelegramRow[]): TelegramRow[] {
    const telegramArray = Array.isArray(telegrams) ? telegrams : [telegrams];

    // Quick check: if buffer is empty, add and sort if necessary
    if (this._buffer.length === 0) {
      this._buffer.push(...telegramArray);
      // Sort if we have multiple telegrams that might be unsorted
      if (telegramArray.length > 1) {
        this._buffer.sort((a, b) =>
          a.timestampIso < b.timestampIso ? -1 : a.timestampIso > b.timestampIso ? 1 : 0,
        );
      }
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
      return removedTelegrams;
    }

    return [];
  }

  /**
   * Adds multiple telegrams, avoiding duplicates
   * @param newTelegrams - Array of telegrams to merge
   * @returns Object containing unique new telegrams added and removed telegrams due to overflow
   */
  merge(newTelegrams: TelegramRow[]): { added: TelegramRow[]; removed: TelegramRow[] } {
    // Create a Set of existing telegram IDs for efficient lookup
    const existingIds = new Set(this._buffer.map((t) => t.id));

    // Filter out duplicates from new telegrams
    const uniqueNewTelegrams = newTelegrams.filter((telegram) => !existingIds.has(telegram.id));

    // Sort new telegrams by timestamp to maintain chronological order
    uniqueNewTelegrams.sort((a, b) =>
      a.timestampIso < b.timestampIso ? -1 : a.timestampIso > b.timestampIso ? 1 : 0,
    );

    // Add new telegrams and get removed telegrams
    const removedTelegrams = this.add(uniqueNewTelegrams);

    return {
      added: uniqueNewTelegrams,
      removed: removedTelegrams,
    };
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
    return [...this._buffer];
  }

  /**
   * Clears all telegrams from the buffer
   * @returns Array of all telegrams that were cleared
   */
  clear(): TelegramRow[] {
    const clearedTelegrams = [...this._buffer];
    this._buffer.length = 0;
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
