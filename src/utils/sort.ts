/**
 * KNX Sorting Utilities
 */

/**
 * Locale-aware collator for natural string sorting.
 */
export const KnxCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
