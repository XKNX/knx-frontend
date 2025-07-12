/**
 * KNX Sorting Types
 */

/**
 * Generic comparator function type.
 *
 * @template T - Type of objects being compared
 * @param a - First object to compare
 * @param b - Second object to compare
 * @returns Negative if a < b, positive if a > b, zero if equal
 */
export type Comparator<T> = (a: T, b: T) => number;

/**
 * Valid sort directions for ascending and descending order.
 */
export type SortDirection = "asc" | "desc";

/**
 * Sort direction constants for type safety and consistent usage.
 */
export const SORT_ASC: SortDirection = "asc";
export const SORT_DESC: SortDirection = "desc";
