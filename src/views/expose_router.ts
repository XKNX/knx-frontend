import { customElement } from "lit/decorators";

import type { RouterOptions } from "@ha/layouts/hass-router-page";

import { KnxRouter } from "../knx-router";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("router");

@customElement("knx-expose-router")
class KnxExposeRouter extends KnxRouter {
  protected routerOptions: RouterOptions = {
    defaultPage: "view",
    beforeRender: (page: string) => (page === "" ? this.routerOptions.defaultPage : undefined),
    routes: {
      view: {
        tag: "knx-expose-view",
        load: () => {
          logger.debug("Importing knx-expose-view");
          return import("./expose_view");
        },
      },
      create: {
        tag: "knx-create-expose",
        load: () => {
          logger.debug("Importing knx-create-expose");
          return import("./expose_create");
        },
      },
      edit: {
        tag: "knx-create-expose",
        load: () => {
          logger.debug("Importing knx-create-expose");
          return import("./expose_create");
        },
      },
    },
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-expose-router": KnxExposeRouter;
  }
}
