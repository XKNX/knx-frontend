import { mdiInformationOutline, mdiLan, mdiFileDocumentOutline, mdiViewList } from "@mdi/js";
import { customElement, property } from "lit/decorators";

import type { RouterOptions } from "@ha/layouts/hass-router-page";
import { HassRouterPage } from "@ha/layouts/hass-router-page";
import type { HomeAssistant, Route } from "@ha/types";
import type { PageNavigation } from "@ha/layouts/hass-tabs-subpage";
import { mainWindow } from "@ha/common/dom/get_main_window";
import type { KNX } from "./types/knx";
import { KNXLogger } from "./tools/knx-logger";
import type { KnxPageNavigation } from "./types/navigation";

const logger = new KNXLogger("router");

export const BASE_URL = "/knx";

/**
 * KNX navigation entry with shared translation roots.
 * `translationKey` is consumed directly by HA components as title, so we derive it from
 * `baseTranslationKey` alongside `descriptionTranslationKey` to keep title and
 * description keys in sync.
 */
function _knxPageNavigationFactory(
  pageNavigation: PageNavigation & { baseTranslationKey: string },
): KnxPageNavigation {
  return {
    ...pageNavigation,
    translationKey: `${pageNavigation.baseTranslationKey}.title`,
    descriptionTranslationKey: `${pageNavigation.baseTranslationKey}.description`,
  };
}

// tabs are used for page titles in hass-tabs-subpage when wide
// when no tabs are used - single item array

export const infoTab = _knxPageNavigationFactory({
  baseTranslationKey: "component.knx.config_panel.info",
  path: `${BASE_URL}/info`,
  iconPath: mdiInformationOutline,
  iconColor: "var(--blue-grey-color)",
});
export const groupMonitorTab = _knxPageNavigationFactory({
  baseTranslationKey: "component.knx.config_panel.group_monitor",
  path: `${BASE_URL}/group_monitor`,
  iconPath: mdiLan,
  iconColor: "var(--green-color)",
});
export const projectTab = _knxPageNavigationFactory({
  baseTranslationKey: "component.knx.config_panel.project",
  path: `${BASE_URL}/project`,
  iconPath: mdiFileDocumentOutline,
  iconColor: "var(--teal-color)",
});
export const entitiesTab = _knxPageNavigationFactory({
  baseTranslationKey: "component.knx.config_panel.entities",
  path: `${BASE_URL}/entities`,
  iconPath: mdiViewList,
  iconColor: "var(--blue-color)",
});

export const knxMainTabs = (hasProject: boolean): KnxPageNavigation[] => [
  entitiesTab,
  ...(hasProject ? [projectTab] : []),
  groupMonitorTab,
  infoTab,
];

@customElement("knx-router")
export class KnxRouter extends HassRouterPage {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ attribute: false }) public route!: Route;

  @property({ type: Boolean }) public narrow!: boolean;

  protected routerOptions: RouterOptions = {
    defaultPage: "dashboard",
    beforeRender: (page: string) => (page === "" ? this.routerOptions.defaultPage : undefined),
    routes: {
      dashboard: {
        tag: "knx-dashboard",
        load: () => {
          logger.debug("Importing knx-dashboard");
          return import("./views/dashboard");
        },
      },
      info: {
        tag: "knx-info",
        load: () => {
          logger.debug("Importing knx-info");
          return import("./views/info");
        },
      },
      group_monitor: {
        tag: "knx-group-monitor",
        load: () => import("./features/group-monitor/views/group-monitor-view"),
      },
      project: {
        tag: "knx-project-view",
        load: () => {
          logger.debug("Importing knx-project-view");
          return import("./views/project_view");
        },
      },
      entities: {
        tag: "knx-entities-router",
        load: () => {
          logger.debug("Importing knx-entities-view");
          return import("./views/entities_router");
        },
      },
      error: {
        tag: "knx-error",
        load: () => {
          logger.debug("Importing knx-error");
          return import("./views/error");
        },
      },
    },
  };

  protected updatePageEl(el, changedProps) {
    // skip title setting when sub-router is called - it will set the title itself when calling this method
    // changedProps is undefined when the element was just loaded
    if (!(el instanceof KnxRouter) && changedProps === undefined) {
      const pageNavigation = knxMainTabs(true).find((page) => page.path === this.routeTail.prefix);
      // sub-routers will not have a matching pageNavigation
      // but the parent router will and title will stay at the set value of parent router
      if (pageNavigation) {
        const title = this.hass.localize(pageNavigation.translationKey);
        mainWindow.document.title = !title
          ? "KNX - Home Assistant"
          : `${title} - KNX - Home Assistant`;
      }
    }

    el.hass = this.hass;
    el.knx = this.knx;
    el.route = this.routeTail;
    el.narrow = this.narrow;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-router": KnxRouter;
  }
}
