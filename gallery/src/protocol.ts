import { isTelegramHistory } from "./fixtures/telegrams";
import { isPreviewState } from "./preview-state";
import { catalog } from "./catalog";
import { isJsonValue, isRecord, resolveValues, snapshot, validateSlots } from "./state";
import type { GalleryEvent, GalleryMessage, GalleryTheme, JsonValue } from "./types";

const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));

function isTheme(value: unknown): value is GalleryTheme {
  return (
    isRecord(value) &&
    exactKeys(value, ["mode", "theme"]) &&
    typeof value.mode === "string" &&
    ["system", "light", "dark"].includes(value.mode) &&
    typeof value.theme === "string" &&
    ["default", "knx"].includes(value.theme)
  );
}

function isGalleryEvent(value: unknown): value is GalleryEvent {
  return (
    isRecord(value) &&
    exactKeys(value, ["kind", "name", "timestamp", "args"]) &&
    typeof value.kind === "string" &&
    ["event", "callback", "api", "error"].includes(value.kind) &&
    typeof value.name === "string" &&
    typeof value.timestamp === "number" &&
    Number.isFinite(value.timestamp) &&
    isJsonValue(value.args)
  );
}

export function readMessage(
  event: MessageEvent,
  peer: Window,
  origin: string,
  sessionId: string,
): GalleryMessage | undefined {
  if (event.source !== peer || event.origin !== origin) return undefined;
  const data: unknown = event.data;
  if (
    !isRecord(data) ||
    !isJsonValue(data) ||
    data.channel !== "knx-gallery" ||
    data.sessionId !== sessionId
  ) {
    return undefined;
  }
  const keys = ["channel", "sessionId", "type"];
  switch (data.type) {
    case "ready":
    case "rendered":
      if (!exactKeys(data, keys)) return undefined;
      break;
    case "code":
      if (!exactKeys(data, [...keys, "code"]) || typeof data.code !== "string") return undefined;
      break;
    case "appearance":
      if (!exactKeys(data, [...keys, "theme"]) || !isTheme(data.theme)) return undefined;
      break;
    case "interaction-start":
      if (
        !exactKeys(data, [...keys, "revision"]) ||
        !Number.isSafeInteger(data.revision) ||
        (data.revision as number) < 0
      ) {
        return undefined;
      }
      break;
    case "fixture-telegrams":
      if (
        !exactKeys(data, [...keys, "telegrams", "revision"]) ||
        !Number.isSafeInteger(data.revision) ||
        (data.revision as number) < 0 ||
        !isTelegramHistory(data.telegrams)
      ) {
        return undefined;
      }
      break;
    case "writer":
      if (
        !exactKeys(data, [...keys, "active", "revision"]) ||
        typeof data.active !== "boolean" ||
        !Number.isSafeInteger(data.revision) ||
        (data.revision as number) < 0
      ) {
        return undefined;
      }
      break;
    case "preview-state":
      if (
        !exactKeys(data, [...keys, "state", "interaction", "revision"]) ||
        typeof data.interaction !== "boolean" ||
        !Number.isSafeInteger(data.revision) ||
        (data.revision as number) < 0 ||
        !isPreviewState(data.state)
      ) {
        return undefined;
      }
      break;
    case "auto-height":
      if (!exactKeys(data, [...keys, "enabled"]) || typeof data.enabled !== "boolean") {
        return undefined;
      }
      break;
    case "resize":
      if (
        !exactKeys(data, [...keys, "height"]) ||
        (data.height !== null &&
          (typeof data.height !== "number" || !Number.isFinite(data.height) || data.height < 0))
      ) {
        return undefined;
      }
      break;
    case "configure": {
      if (
        !exactKeys(data, [
          ...keys,
          "componentId",
          "scenarioId",
          "overrides",
          "slots",
          "theme",
          "autoHeight",
          ...(data.fixtures === undefined ? [] : ["fixtures"]),
        ]) ||
        (data.fixtures !== undefined && !isRecord(data.fixtures)) ||
        typeof data.autoHeight !== "boolean" ||
        typeof data.componentId !== "string" ||
        typeof data.scenarioId !== "string" ||
        !isRecord(data.overrides) ||
        !Array.isArray(data.slots) ||
        !data.slots.every((slot) => typeof slot === "string") ||
        !isTheme(data.theme)
      ) {
        return undefined;
      }
      const entry = catalog.find((item) => item.meta.id === data.componentId);
      if (!entry) return undefined;
      try {
        resolveValues(entry.meta, data.scenarioId, data.overrides);
        validateSlots(entry.meta, data.slots);
      } catch {
        return undefined;
      }
      break;
    }
    case "event":
      if (!exactKeys(data, [...keys, "event"]) || !isGalleryEvent(data.event)) return undefined;
      break;
    case "error":
      if (!exactKeys(data, [...keys, "error"]) || typeof data.error !== "string") return undefined;
      break;
    default:
      return undefined;
  }
  // Every variant has been checked above; clone so callers cannot mutate received data.
  return JSON.parse(JSON.stringify(data)) as GalleryMessage;
}

export function eventAdapter<E extends Event>(
  name: string,
  emit: (event: GalleryEvent) => void,
  selectPayload: (event: E) => JsonValue,
): (event: E) => void {
  return (event) =>
    emit({ kind: "event", name, timestamp: Date.now(), args: snapshot(selectPayload(event)) });
}

export function callbackAdapter<This, Args extends unknown[], Result>(
  name: string,
  emit: (event: GalleryEvent) => void,
  implementation: (this: This, ...args: Args) => Result,
  selectArgs: (...args: Args) => JsonValue,
): (this: This, ...args: Args) => Result {
  const reportError = (error: unknown) =>
    emit({
      kind: "error",
      name,
      timestamp: Date.now(),
      args: error instanceof Error ? error.message : String(error),
    });
  return function (this: This, ...args: Args): Result {
    emit({ kind: "callback", name, timestamp: Date.now(), args: snapshot(selectArgs(...args)) });
    try {
      const result = implementation.apply(this, args);
      if (result instanceof Promise) void result.catch(reportError);
      return result;
    } catch (error) {
      reportError(error);
      throw error;
    }
  };
}
