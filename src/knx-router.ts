import { mdiNetwork, mdiFolderMultipleOutline, mdiFileTreeOutline } from "@mdi/js";
import { customElement, property } from "lit/decorators";

import type { RouterOptions } from "@ha/layouts/hass-router-page";
import { HassRouterPage } from "@ha/layouts/hass-router-page";
import type { PageNavigation } from "@ha/layouts/hass-tabs-subpage";
import type { HomeAssistant, Route } from "@ha/types";

import type { KNX } from "./types/knx";
import { KNXLogger } from "./tools/knx-logger";

const logger = new KNXLogger("router");

export const BASE_URL: string = "/knx";

const knxMainTabs = (hasProject: boolean): PageNavigation[] => [
  {
    translationKey: "info_title",
    path: `${BASE_URL}/info`,
    iconPath: mdiFolderMultipleOutline,
  },
  {
    translationKey: "group_monitor_title",
    path: `${BASE_URL}/group_monitor`,
    iconPath: mdiNetwork,
  },
  ...(hasProject
    ? [
        {
          translationKey: "project_view_title",
          path: `${BASE_URL}/project`,
          iconPath: mdiFileTreeOutline,
        },
      ]
    : []),
  {
    translationKey: "entities_view_title",
    path: `${BASE_URL}/entities`,
    iconPath: mdiFileTreeOutline,
  },
];

@customElement("knx-router")
export class KnxRouter extends HassRouterPage {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ attribute: false }) public route!: Route;

  @property({ type: Boolean }) public narrow!: boolean;

  protected routerOptions: RouterOptions = {
    defaultPage: "info",
    beforeRender: (page: string) => (page === "" ? this.routerOptions.defaultPage : undefined),
    routes: {
      info: {
        tag: "knx-info",
        load: () => {
          logger.debug("Importing knx-info");
          return import("./views/info");
        },
      },
      group_monitor: {
        tag: "knx-group-monitor",
        load: () => {
          logger.debug("Importing knx-group-monitor");
          return import("./views/group_monitor");
        },
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

  protected updatePageEl(el) {
    logger.debug(`Current Page: ${this._currentPage} Route: ${this.route.path}`);

    el.hass = this.hass;
    el.knx = this.knx;
    el.route = this.routeTail;
    el.narrow = this.narrow;
    el.tabs = knxMainTabs(!!this.knx.info.project);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-router": KnxRouter;
  }
}
