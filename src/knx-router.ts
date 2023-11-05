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
];

@customElement("knx-router")
class KnxRouter extends HassRouterPage {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ attribute: false }) public route!: Route;

  @property({ type: Boolean }) public narrow!: boolean;

  // at later point could dynamically add and delete tabs
  @state() private _tabs: PageNavigation[] = knxMainTabs;

  @state() private _wideSidebar = false;

  @state() private _wide = false;

  protected routerOptions: RouterOptions = {
    defaultPage: "info",
    routes: {
      info: {
        tag: "knx-info",
        load: () => {
          logger.info("Importing knx-info");
          return import("./views/info");
        },
      },
      group_monitor: {
        tag: "knx-group-monitor",
        load: () => {
          logger.info("Importing knx-group-monitor");
          return import("./views/group_monitor");
        },
      },
      project: {
        tag: "knx-project-view",
        load: () => {
          logger.info("Importing knx-project-view");
          return import("./views/project_view");
        },
      },
    },
  };

  protected updatePageEl(el) {
    const section = this.route.path.replace("/", "");
    const isWide = this.hass.dockedSidebar === "docked" ? this._wideSidebar : this._wide;
    el.hass = this.hass;
    el.route = this.routeTail;
    el.narrow = this.narrow;
    el.isWide = isWide;
    el.section = section;
    el.tabs = this._tabs;

    logger.info("Current Page: " + this._currentPage + " in knx-router");

    logger.info("Route " + this.route.path + " in knx-router");

    if (this._currentPage !== "devices") {
      const routeSplit = this.routeTail.path.split("/");
      el.deviceId = routeSplit[routeSplit.length - 1];

      logger.info("Device ID: " + el.deviceId + " in knx-router");
    }
    el.knx = this.knx;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-router": KnxRouter;
  }
}
