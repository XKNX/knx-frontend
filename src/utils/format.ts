import { dump } from "js-yaml";
import type { DPT, TelegramDict } from "../types/websocket";
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

export const dptToString = (dpt: DPT | null): string => {
  if (dpt == null) return "";
  return dpt.main + (dpt.sub ? "." + dpt.sub.toString().padStart(3, "0") : "");
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
 * Formats a time duration into a human-readable string.
 * - Under 1 hour:      MM:SS.mmm
 * - 1 hour or more:    HH:MM:SS.mmm
 * - Supports optional microsecond precision: HH:MM:SS.mmmuu
 * - Returns "—" for null input.
 *
 * @param offsetMicros  Duration in microseconds (null for no previous event)
 * @param precision     "milliseconds" (default) or "microseconds"
 * @returns             Formatted time delta string
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
