import { customElement, property, state } from "lit/decorators";
import { HassRouterPage, RouterOptions } from "@ha/layouts/hass-router-page";
import { HomeAssistant, Route } from "@ha/types";
import { KNX } from "./types/knx";

@customElement("knx-router")
class KnxRouter extends HassRouterPage {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  @property({ attribute: false }) public route!: Route;

  @property({ type: Boolean }) public narrow!: boolean;

  @state() private _wideSidebar = false;

  @state() private _wide = false;

  protected routerOptions: RouterOptions = {
    defaultPage: "overview",
    routes: {
      overview: {
        tag: "knx-overview",
        load: () => {
          // eslint-disable-next-line no-console
          console.info("Importing knx-overview");
          return import("./views/overview");
        },
      },
      monitor: {
        tag: "knx-bus-monitor",
        load: () => {
          // eslint-disable-next-line no-console
          console.info("Importing knx-bus-monitor");
          return import("./views/bus_monitor");
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

    // eslint-disable-next-line no-console
    console.info("Current Page: " + this._currentPage + " in knx-router");

    // eslint-disable-next-line no-console
    console.info("Route " + this.route.path + " in knx-router");

    if (this._currentPage !== "devices") {
      const routeSplit = this.routeTail.path.split("/");
      el.deviceId = routeSplit[routeSplit.length - 1];

      // eslint-disable-next-line no-console
      console.info("Device ID: " + el.deviceId + " in knx-router");
    }
    el.knx = this.knx;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-router": KnxRouter;
  }
}
