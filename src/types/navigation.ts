import type { PageNavigation } from "@ha/layouts/hass-tabs-subpage";

export interface Route {
  path: string;
  prefix: string;
}

export interface LocationChangedEvent {
  detail?: { route: Route; force?: boolean };
}

export interface KnxPageNavigation extends PageNavigation {
  descriptionTranslationKey: string;
  translationKey: string;
}
