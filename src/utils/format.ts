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

  timestamp: (telegram: TelegramDict): string => {
    const date = new Date(telegram.timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  },
};
