import { mdiNetwork, mdiFolderMultipleOutline, mdiFileTreeOutline } from "@mdi/js";
import { customElement, property, state } from "lit/decorators";

import { HassRouterPage, RouterOptions } from "@ha/layouts/hass-router-page";
import { PageNavigation } from "@ha/layouts/hass-tabs-subpage";
import { HomeAssistant, Route } from "@ha/types";

import { KNX } from "./types/knx";
import { KNXLogger } from "./tools/knx-logger";

const logger = new KNXLogger("router");

export const BASE_URL: string = "/knx";

export const knxMainTabs: PageNavigation[] = [
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
  {
    translationKey: "project_view_title",
    path: `${BASE_URL}/project`,
    iconPath: mdiFileTreeOutline,
  },
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

  // at later point could dynamically add and delete tabs
  @state() private _tabs: PageNavigation[] = knxMainTabs;

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
    },
  };

  protected updatePageEl(el) {
    el.hass = this.hass;
    el.knx = this.knx;
    el.route = this.routeTail;
    el.narrow = this.narrow;
    el.tabs = this._tabs;

    logger.debug(`Current Page: ${this._currentPage} Route: ${this.route.path}`);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-router": KnxRouter;
  }
}
