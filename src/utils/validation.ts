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
