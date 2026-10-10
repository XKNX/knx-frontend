import { deepEqual } from "@ha/common/util/deep-equal";
import en from "./localize/en.json" with { type: "json" };
import type { GalleryControl, GalleryEvent, GalleryMeta, GalleryValues, JsonValue } from "./types";

const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

export function isJsonValue(value: unknown, ancestors = new Set<unknown>()): value is JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if ((!Array.isArray(value) && !isRecord(value)) || ancestors.has(value)) return false;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
    }
  }
  ancestors.add(value);
  const valid = Object.entries(value).every(
    ([key, child]) => !forbiddenKeys.has(key) && isJsonValue(child, ancestors),
  );
  ancestors.delete(value);
  return valid;
}

export function snapshot(value: JsonValue): JsonValue {
  if (!isJsonValue(value)) throw new Error(en.validation.invalidJson);
  return JSON.parse(JSON.stringify(value));
}

function validateControl(control: GalleryControl, value: JsonValue): string | undefined {
  const validKind =
    control.kind === "json" ||
    (control.kind === "text" && typeof value === "string") ||
    (control.kind === "number" && typeof value === "number") ||
    (control.kind === "boolean" && typeof value === "boolean") ||
    (control.kind === "select" &&
      control.options?.some((option) => deepEqual(option.value, value)));
  return validKind ? control.validate(value) : en.validation.invalidValue;
}

// Text controls accept literal text; all other controls use JSON syntax.
export function parseOverride(
  control: GalleryControl,
  text: string,
): { ok: true; value: JsonValue } | { ok: false; error: string } {
  let value: unknown;
  try {
    value = control.kind === "text" ? text : JSON.parse(text);
  } catch {
    return { ok: false, error: en.validation.invalidJson };
  }
  if (!isJsonValue(value)) return { ok: false, error: en.validation.invalidJson };
  const error = validateControl(control, value);
  return error === undefined ? { ok: true, value } : { ok: false, error };
}

export function resolveValues(
  meta: GalleryMeta,
  scenarioId: string,
  overrides: GalleryValues,
): GalleryValues {
  const scenario = meta.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error(en.validation.unknownScenario);
  const values: GalleryValues = {};
  const apply = (input: GalleryValues) => {
    if (!isRecord(input) || !isJsonValue(input)) throw new Error(en.validation.invalidJson);
    for (const [key, value] of Object.entries(input)) {
      const control = meta.controls.find((item) => item.key === key);
      if (!control) throw new Error(en.validation.unknownControl);
      const error = validateControl(control, value);
      if (error !== undefined) throw new Error(error);
      values[key] = snapshot(value);
    }
  };
  apply(Object.fromEntries(meta.controls.map((control) => [control.key, control.defaultValue])));
  apply(scenario.values);
  apply(overrides);
  return values;
}

export function validateSlots(meta: GalleryMeta, slots: string[]): string[] {
  if (
    !Array.isArray(slots) ||
    !isJsonValue(slots) ||
    slots.some((name) => forbiddenKeys.has(name) || !meta.slots.some((slot) => slot.name === name))
  ) {
    throw new Error(en.validation.unknownSlot);
  }
  return [...slots];
}

export function appendEvent(events: readonly GalleryEvent[], event: GalleryEvent): GalleryEvent[] {
  return [...events.slice(-199), { ...event, args: snapshot(event.args) }];
}
