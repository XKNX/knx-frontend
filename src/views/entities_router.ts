import { customElement } from "lit/decorators";

import type { RouterOptions } from "@ha/layouts/hass-router-page";

import { KnxRouter } from "../knx-router";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("router");

@customElement("knx-entities-router")
class KnxEntitiesRouter extends KnxRouter {
  protected routerOptions: RouterOptions = {
    defaultPage: "view",
    beforeRender: (page: string) => (page === "" ? this.routerOptions.defaultPage : undefined),
    routes: {
      view: {
        tag: "knx-entities-view",
        load: () => {
          logger.debug("Importing knx-entities-view");
          return import("./entities_view");
        },
      },
      create: {
        tag: "knx-create-entity",
        load: () => {
          logger.debug("Importing knx-create-entity");
          return import("./entities_create");
        },
      },
      edit: {
        tag: "knx-create-entity",
        load: () => {
          logger.debug("Importing knx-create-entity");
          return import("./entities_create");
        },
      },
    },
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-entities-router": KnxEntitiesRouter;
  }
}
