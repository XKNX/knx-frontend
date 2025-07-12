import { dump } from "js-yaml";
import type { DPT, TelegramDict } from "../types/websocket";

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
 * Format a Date object representing a time offset to MM:SS.MMM format.
 *
 * @param offset - The Date object containing the time difference
 * @returns Formatted string in MM:SS.MMM format
 */
export const formatOffset = (offset: Date): string => {
  const minutes = offset.getUTCMinutes().toString().padStart(2, "0");
  const seconds = offset.getUTCSeconds().toString().padStart(2, "0");
  const milliseconds = offset.getUTCMilliseconds().toString().padStart(3, "0");
  return `${minutes}:${seconds}.${milliseconds}`;
};
