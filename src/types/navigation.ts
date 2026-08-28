import type { PageNavigation } from "@ha/layouts/hass-tabs-subpage";

export interface Route {
  path: string;
  prefix: string;
}

export interface LocationChangedEvent {
  detail?: { route: Route; force?: boolean };
}

/** A key under KNX's own translations, which is what `hass.localize` accepts. */
export type KnxTranslationKey = `component.${string}`;

export interface KnxPageNavigation extends PageNavigation {
  descriptionTranslationKey: KnxTranslationKey;
  translationKey: KnxTranslationKey;
}
