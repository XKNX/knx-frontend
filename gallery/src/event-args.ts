import type { JsonValue } from "./types";

/** Observing a product event must never interrupt its handler. */
export function eventArgs(args: unknown): JsonValue {
  const seen = new WeakSet<object>();
  try {
    return JSON.parse(
      JSON.stringify(args ?? null, (_key, value: unknown) => {
        if (typeof value === "function") return "[callback]";
        if (typeof value === "bigint") return String(value);
        if (value && typeof value === "object") {
          if (seen.has(value)) return "[circular]";
          seen.add(value);
        }
        return value;
      }) ?? "null",
    ) as JsonValue;
  } catch {
    return "[unserializable]";
  }
}
