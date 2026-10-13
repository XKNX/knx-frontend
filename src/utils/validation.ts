import type { LocalizeFunc } from "@ha/common/translations/localize";
import type { ErrorDescription } from "../types/entity_data";

const VALIDATION_ERROR_KEY_PREFIX = "component.knx.config_panel.validation_error.";

const formatPlaceholder = (value: unknown): string =>
  Array.isArray(value) ? value.map(String).join(", ") : String(value);

/**
 * Replaces backend validation messages with their translation.
 *
 * Errors without a translation keep the English message from the backend.
 */
export const localizeValidationErrors = (
  localize: LocalizeFunc,
  errors: ErrorDescription[],
): ErrorDescription[] =>
  errors.map((error) => {
    if (!error.translation_key) {
      return error;
    }
    const placeholders = Object.fromEntries(
      Object.entries(error.placeholders ?? {}).map(([key, value]) => [
        key,
        formatPlaceholder(value),
      ]),
    );
    const message = localize(
      `${VALIDATION_ERROR_KEY_PREFIX}${error.translation_key}`,
      placeholders,
    );
    return message ? { ...error, message } : error;
  });

export const extractValidationErrors = (
  errors: ErrorDescription[] | undefined,
  itemName: string,
): ErrorDescription[] | undefined => {
  if (!errors) {
    return undefined;
  }

  const errorsForItem: ErrorDescription[] = [];

  for (const error of errors) {
    if (error.path) {
      const [pathHead, ...pathTail] = error.path;
      if (pathHead === itemName) {
        errorsForItem.push({ ...error, path: pathTail });
      }
    }
  }

  return errorsForItem.length ? errorsForItem : undefined;
};

/**
 * When `itemName` is undefined, this gets the base error for given description if it exists (path is empty).
 * if an `itemName` is provided, it will return the error for that item.
 *
 * group select validation errors may have no "write" or "state" path key since the ga-key isn't in config
 * so we show a general exception.
 */
export const getValidationError = (
  errors: ErrorDescription[] | undefined,
  itemName: string | undefined = undefined,
): ErrorDescription | undefined => {
  if (itemName) {
    errors = extractValidationErrors(errors, itemName);
  }
  return errors?.find((error) => error.path?.length === 0);
};
