import { TelegramDict } from "../types/websocket";

export const TelegramDictFormatter = {
  payload: (telegram: TelegramDict): string => {
    if (telegram.payload == null) return "";
    return Array.isArray(telegram.payload)
      ? telegram.payload.reduce((res, curr) => res + curr.toString(16).padStart(2, "0"), "0x")
      : telegram.payload.toString();
  },

  valueWithUnit: (telegram: TelegramDict): string => {
    if (telegram.value == null) return "";
    return telegram.value.toString() + (telegram.unit ? " " + telegram.unit : "");
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
    if (telegram.dpt_name == null) return dptNumber;
    return dptNumber ? telegram.dpt_name + " - " + dptNumber : telegram.dpt_name;
  },
};
