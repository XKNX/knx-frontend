import { consume } from "@ha/common/decorators/consume";
import { transform } from "@ha/common/decorators/transform";
import { internationalizationContext } from "@ha/data/context";
import type { HomeAssistantInternationalization } from "@ha/types";

import type { KnxLocalizeFunc } from "./localize";
import { withMissingKeyReporting } from "./localize";

/**
 * Like HA's `consumeLocalize`, but the consumed `localize` logs missing keys and
 * renders them as the key instead of an empty string. Use `localize.optional`
 * for lookups that are expected to miss.
 *
 * Only KNX components use this; the HA context itself stays untouched, because
 * HA components rely on empty strings for missing keys.
 */
export const consumeKnxLocalize = () => {
  const transformDec = transform<HomeAssistantInternationalization, KnxLocalizeFunc | undefined>({
    transformer: (i18n) => (i18n ? withMissingKeyReporting(i18n.localize) : undefined),
  });
  const consumeDec = consume({ context: internationalizationContext, subscribe: true });
  return (proto: any, propertyKey: string) => {
    transformDec(proto, propertyKey);
    consumeDec(proto, propertyKey);
  };
};
