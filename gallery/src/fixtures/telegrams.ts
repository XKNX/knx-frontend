import { isJsonValue, isRecord } from "../state";
import type { TelegramDict } from "../../../src/types/websocket";

export function createTelegrams(): TelegramDict[] {
  return [
    {
      data_secure: false,
      destination: "1/0/1",
      destination_name: "Living room light",
      direction: "Incoming",
      dpt_main: 1,
      dpt_sub: 1,
      dpt_name: "Switch",
      source: "1.1.1",
      source_name: "Living room actuator",
      payload: 1,
      telegramtype: "GroupValueWrite",
      timestamp: "2026-01-01T12:00:00+00:00",
      unit: null,
      value: true,
    },
  ];
}

/** A fixed pair for Previous/Next in the telegram information dialog. */
export function createDialogTelegrams(): TelegramDict[] {
  const telegram = createTelegrams()[0];
  return [
    telegram,
    { ...telegram, timestamp: "2026-01-01T12:00:01+00:00", payload: 0, value: false },
  ];
}

/** Raw wire rows only; validate the whole history before any owner changes. */
export function isTelegramHistory(value: unknown): value is TelegramDict[] {
  return (
    Array.isArray(value) &&
    isJsonValue(value) &&
    value.every(
      (row) =>
        isRecord(row) &&
        ["destination", "destination_name", "source", "source_name", "timestamp"].every(
          (key) => typeof row[key] === "string",
        ) &&
        Number.isFinite(Date.parse(row.timestamp as string)) &&
        ["Incoming", "Outgoing"].includes(String(row.direction)) &&
        ["GroupValueRead", "GroupValueWrite", "GroupValueResponse"].includes(
          String(row.telegramtype),
        ) &&
        ["dpt_main", "dpt_sub"].every(
          (key) => row[key] === null || Number.isSafeInteger(row[key]),
        ) &&
        ["dpt_name", "unit"].every((key) => row[key] === null || typeof row[key] === "string") &&
        (row.data_secure === undefined || typeof row.data_secure === "boolean") &&
        (row.payload === null ||
          typeof row.payload === "number" ||
          (Array.isArray(row.payload) && row.payload.every((item) => typeof item === "number"))) &&
        row.value !== undefined,
    )
  );
}

/** Union raw histories without duplicating replayed rows or discarding repeated real rows. */
export function telegramAdditions(
  current: TelegramDict[],
  incoming: TelegramDict[],
): TelegramDict[] {
  const counts = new Map<string, number>();
  current.forEach((row) => {
    const key = JSON.stringify(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return incoming.filter((row) => {
    const key = JSON.stringify(row);
    const count = counts.get(key) ?? 0;
    if (count) counts.set(key, count - 1);
    return !count;
  });
}

export function mergeTelegramHistory(
  current: TelegramDict[],
  incoming: TelegramDict[],
): TelegramDict[] {
  return structuredClone([...current, ...telegramAdditions(current, incoming)]).sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
}
