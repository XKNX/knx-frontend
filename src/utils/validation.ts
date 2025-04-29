import type { ErrorDescription } from "../types/entity_data";

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

// group select validation errors may have no "write" or "state" path key since the ga-key isn't in config
// so we show a general exception.
// When `itemName` is undefined, this gets the general error for a group address item without "write" or "state" key
// if an `itemName` is provided, it will return the error for that item.
export const getValidationError = (
  errors: ErrorDescription[] | undefined,
  itemName: string | undefined = undefined,
): ErrorDescription | undefined => {
  if (itemName) {
    errors = extractValidationErrors(errors, itemName);
  }
  return errors?.find((error) => error.path?.length === 0);
};
