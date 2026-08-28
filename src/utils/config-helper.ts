import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("config-helper");

/** `ha-selector < knx-selector-row < knx-form`, as far up as the event was composed. */
const composedElementPath = (ev: Event): string =>
  ev
    .composedPath()
    .map((node) => (node as HTMLElement).localName)
    .filter(Boolean)
    .join(" < ");

/**
 * Reads the config path back off the element that fired a change event.
 *
 * Every form row renders its input with a `key` property holding the dot-separated path it
 * edits, so that one handler can serve all of them. The DOM knows nothing about that, and
 * types `ev.target` as `EventTarget | null` besides.
 *
 * A row that forgot its `key` is a bug in the caller, and a quiet one: `setNestedValue`
 * would fail somewhere down in `path.split`, and a handler comparing the path against a
 * literal would just take its other branch. So say so — with the chain of elements the
 * event came through, which locates the offending row better than the name of whichever
 * module happened to handle it — and return the empty path that `setNestedValue` ignores.
 */
export const configPathFromEvent = (ev: Event): string => {
  const target = ev.target as (HTMLElement & { key?: string }) | null;
  if (target?.key === undefined) {
    logger.warn(
      `${ev.type} from an element with no "key" to write to, so its value is dropped:`,
      composedElementPath(ev),
      target,
    );
    return "";
  }
  return target.key;
};

/**
 * Sets a nested value in a configuration object using a dot-separated path.
 * Creates intermediate objects as needed when setting values.
 * When value is undefined, removes the property and cleans up empty parent objects.
 *
 * @param config - The configuration object to modify
 * @param path - Dot-separated path to the property (e.g., "knx.color.ga_color")
 * @param value - The value to set. If undefined, the property will be removed
 * @param callerLogger - Logger to attribute the debug lines to, so they carry the name of
 *   the module doing the writing. Falls back to this module's own
 *
 * @example
 * ```typescript
 * const config = {};
 * setNestedValue(config, "knx.color.ga_color", "1/2/3");
 * // Result: { knx: { color: { ga_color: "1/2/3" } } }
 *
 * setNestedValue(config, "knx.ga_switch", "1/1/1");
 * // Result: { knx: { color: { ga_color: "1/2/3" }, ga_switch: "1/1/1" } }
 *
 * setNestedValue(config, "knx.color.ga_color", undefined);
 * // Result: { knx: { ga_switch: "1/1/1" } } (removes ga_color and empty color object)
 * ```
 */
export function setNestedValue(
  config: Record<string, any>,
  path: string,
  value: any,
  callerLogger?: KNXLogger,
) {
  const log = callerLogger ?? logger;
  const keys = path.split(".");
  const targetKey = keys.pop();
  if (!targetKey) {
    // configPathFromEvent has already said why, when it is the one handing us "".
    log.debug(`nothing to write: no key in path "${path}"`);
    return;
  }
  let current = config;
  for (const key of keys) {
    if (!(key in current)) {
      if (value === undefined) return; // don't create to remove
      current[key] = {};
    }
    current = current[key];
  }
  if (value === undefined) {
    log.debug(`remove ${targetKey} at ${path}`);
    delete current[targetKey];
    if (!Object.keys(current).length && keys.length > 0) {
      // when no other keys in this, recursively remove empty objects
      setNestedValue(config, keys.join("."), undefined, callerLogger);
    }
  } else {
    log.debug(`update ${targetKey} at ${path} with value`, value);
    current[targetKey] = value;
  }
}

/**
 * Retrieves a nested value from a configuration object using a dot-separated path.
 *
 * @param config - The configuration object to read from
 * @param path - Dot-separated path to the property (e.g., "knx.color.ga_color")
 * @returns The value at the specified path, or undefined if the path doesn't exist
 *
 * @example
 * ```typescript
 * const config = { knx: { color: { ga_color: "1/2/3" } } };
 *
 * const gaColor = getNestedValue(config, "knx.color.ga_color");
 * // Returns: "1/2/3"
 *
 * const missing = getNestedValue(config, "knx.dimmer.brightness");
 * // Returns: undefined
 * ```
 */
export function getNestedValue(config: Record<string, any>, path: string): any {
  const keys = path.split(".");
  let current = config;
  for (const key of keys) {
    if (!(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}
