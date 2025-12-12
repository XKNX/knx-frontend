import { dump } from "js-yaml";
import type { TelegramDict } from "../types/websocket";
import type { TimePrecision } from "../features/group-monitor";

export const TelegramDictFormatter = {
  payload: (telegram: TelegramDict): string => {
    if (telegram.payload == null) return "";
    return Array.isArray(telegram.payload)
      ? telegram.payload.reduce((res, curr) => res + curr.toString(16).padStart(2, "0"), "0x")
      : telegram.payload.toString();
  },

  valueWithUnit: (telegram: TelegramDict): string => {
    if (telegram.value == null) return "";
    if (
      typeof telegram.value === "number" ||
      typeof telegram.value === "boolean" ||
      typeof telegram.value === "string"
    ) {
      return telegram.value.toString() + (telegram.unit ? " " + telegram.unit : "");
    }
    return dump(telegram.value);
  },

  timeWithMilliseconds: (telegram: TelegramDict): string => {
    const date = new Date(telegram.timestamp);
    return date.toLocaleTimeString(["en-US"], {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  },

  dateWithMilliseconds: (telegram: TelegramDict): string => {
    const date = new Date(telegram.timestamp);
    return date.toLocaleTimeString([], {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  },

  dptNumber: (telegram: TelegramDict): string => {
    if (telegram.dpt_main == null) return "";
    return telegram.dpt_sub == null
      ? telegram.dpt_main.toString()
      : telegram.dpt_main.toString() + "." + telegram.dpt_sub.toString().padStart(3, "0");
  },

  dptNameNumber: (telegram: TelegramDict): string => {
    const dptNumber = TelegramDictFormatter.dptNumber(telegram);
    if (telegram.dpt_name == null) return `DPT ${dptNumber}`;
    return dptNumber ? `DPT ${dptNumber} ${telegram.dpt_name}` : telegram.dpt_name;
  },
};

/**
 * Format a Date object to a time string with milliseconds.
 */
export const formatTimeWithMilliseconds = (date: Date): string =>
  date.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });

/**
 * Format a Date object to a date and time string with milliseconds.
 */
export const formatDateTimeWithMilliseconds = (date: Date): string =>
  date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }) +
  ", " +
  date.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });

/**
 * Format an ISO timestamp string to a date and time string with microsecond precision.
 *
 * @param timestampIso - The ISO timestamp string containing microsecond precision
 * @returns Formatted date and time string with microsecond precision
 */
export const formatIsoTimestampWithMicroseconds = (timestampIso: string): string => {
  // Create Date object from ISO timestamp
  const date = new Date(timestampIso);

  // Extract microseconds from ISO timestamp (format: YYYY-MM-DDTHH:MM:SS.ffffff)
  const microsecondMatch = timestampIso.match(/\.(\d{6})/);
  const microseconds = microsecondMatch ? microsecondMatch[1] : "000000";

  return (
    date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }) +
    ", " +
    date.toLocaleTimeString(undefined, {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) +
    "." +
    microseconds
  );
};

// Time conversion constants
export const MICROSECONDS_PER_MILLISECOND = 1_000;
export const MILLISECONDS_PER_SECOND = 1_000;
export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;

// Derived constants for milliseconds
export const MILLISECONDS_PER_MINUTE = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE;
export const MILLISECONDS_PER_HOUR = MILLISECONDS_PER_MINUTE * MINUTES_PER_HOUR;

// Derived constants for microseconds
export const MICROSECONDS_PER_SECOND = MICROSECONDS_PER_MILLISECOND * MILLISECONDS_PER_SECOND;
export const MICROSECONDS_PER_MINUTE = MICROSECONDS_PER_SECOND * SECONDS_PER_MINUTE;
export const MICROSECONDS_PER_HOUR = MICROSECONDS_PER_MINUTE * MINUTES_PER_HOUR;

// Padding constants
const TIME_COMPONENT_PADDING = 2;
const FRACTIONAL_COMPONENT_PADDING = 3;

/**
 * Converts any ISO-8601 timestamp to microseconds since Unix epoch.
 *
 * @param iso - ISO timestamp, e.g. "2025-07-13T22:11:08.273496+02:00"
 * @returns Microseconds since 1970-01-01T00:00:00Z
 */
export function extractMicrosecondsFromIso(iso: string): number {
  const dotPos = iso.indexOf(".");

  // Fast path – no fractional part
  if (dotPos === -1) return Date.parse(iso) * 1_000;

  // Locate start of timezone designator (Z / + / -) after the dot
  let tzPos = iso.indexOf("Z", dotPos);
  if (tzPos === -1) {
    tzPos = iso.indexOf("+", dotPos);
    if (tzPos === -1) tzPos = iso.indexOf("-", dotPos);
  }
  if (tzPos === -1) tzPos = iso.length; // ISO without explicit TZ (rare but valid)

  // -------- milliseconds part (safe, no rounding) ----------
  const baseIso = iso.slice(0, dotPos) + iso.slice(tzPos); // strip fractional secs
  const msSinceEpoch = Date.parse(baseIso); // single parse

  // -------- microseconds part ------------------------------
  let frac = iso.slice(dotPos + 1, tzPos); // digits after '.'
  if (frac.length < 6)
    frac = frac.padEnd(6, "0"); // e.g. ".27" -> "270000"
  else if (frac.length > 6) frac = frac.slice(0, 6); // ignore >µs precision

  return msSinceEpoch * 1_000 + Number(frac);
}

/**
 * Formats a time duration into a human-readable string with microsecond precision support.
 *
 * Output formats:
 * - Under 1 hour: MM:SS.mmm (or MM:SS.mmmuu with microsecond precision)
 * - 1 hour or more: HH:MM:SS.mmm (or HH:MM:SS.mmmuu with microsecond precision)
 * - Negative values: prefixed with "-"
 * - Null input: "—" (em dash)
 *
 * @param offsetMicros - Duration in microseconds (null for no previous event)
 * @param precision - "milliseconds" (default, rounds to 3 decimals) or "microseconds" (6 decimals)
 * @returns Formatted time delta string or "—" for null input
 *
 * @example
 * formatTimeDelta(150500000) // "02:30.500"
 * formatTimeDelta(1123456, "microseconds") // "00:01.123456"
 */
export function formatTimeDelta(
  offsetMicros: number | null,
  precision: TimePrecision = "milliseconds",
): string {
  if (offsetMicros == null) {
    return "—";
  }

  const sign = offsetMicros < 0 ? "-" : "";
  const micros = Math.abs(offsetMicros);

  // Convert to total milliseconds (rounded or floored)
  const totalMs =
    precision === "milliseconds"
      ? Math.round(micros / MICROSECONDS_PER_MILLISECOND)
      : Math.floor(micros / MICROSECONDS_PER_MILLISECOND);

  // Remaining microseconds for microsecond precision
  const extraMicros = precision === "microseconds" ? micros % MICROSECONDS_PER_MILLISECOND : 0;

  // Break down into hours, minutes, seconds, milliseconds
  const hours = Math.floor(totalMs / MILLISECONDS_PER_HOUR);
  const minutes = Math.floor((totalMs % MILLISECONDS_PER_HOUR) / MILLISECONDS_PER_MINUTE);
  const seconds = Math.floor((totalMs % MILLISECONDS_PER_MINUTE) / MILLISECONDS_PER_SECOND);
  const milliseconds = totalMs % MILLISECONDS_PER_SECOND;

  // Helpers for zero-padding
  const padTime = (n: number) => n.toString().padStart(TIME_COMPONENT_PADDING, "0");
  const padFractional = (n: number) => n.toString().padStart(FRACTIONAL_COMPONENT_PADDING, "0");

  // Build fractional part
  const fractional =
    precision === "microseconds"
      ? `.${padFractional(milliseconds)}${padFractional(extraMicros)}`
      : `.${padFractional(milliseconds)}`;

  // Assemble base time (MM:SS) and prefix hours if needed
  const base = `${padTime(minutes)}:${padTime(seconds)}`;
  const time = hours > 0 ? `${padTime(hours)}:${base}` : base;

  return `${sign}${time}${fractional}`;
}
