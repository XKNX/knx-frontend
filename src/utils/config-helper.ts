import type { KNXLogger } from "../tools/knx-logger";

/**
 * Sets a nested value in a configuration object using a dot-separated path.
 * Creates intermediate objects as needed when setting values.
 * When value is undefined, removes the property and cleans up empty parent objects.
 *
 * @param config - The configuration object to modify
 * @param path - Dot-separated path to the property (e.g., "knx.color.ga_color")
 * @param value - The value to set. If undefined, the property will be removed
 * @param logger - Optional logger instance for debugging operations
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
export function setNestedValue(config: object, path: string, value: any, logger?: KNXLogger) {
  const keys = path.split(".");
  const keysTail = keys.pop();
  if (!keysTail) return;
  let current = config;
  for (const key of keys) {
    if (!(key in current)) {
      if (value === undefined) return; // don't create to remove
      current[key] = {};
    }
    current = current[key];
  }
  if (value === undefined) {
    if (logger) logger.debug(`remove ${keysTail} at ${path}`);
    delete current[keysTail];
    if (!Object.keys(current).length && keys.length > 0) {
      // when no other keys in this, recursively remove empty objects
      setNestedValue(config, keys.join("."), undefined);
    }
  } else {
    if (logger) logger.debug(`update ${keysTail} at ${path} with value`, value);
    current[keysTail] = value;
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
export function getNestedValue(config: object, path: string): any {
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
