import { LitElement } from "lit";
import { property } from "lit/decorators";

import { getConfigEntries } from "@ha/data/config_entries";
import { ProvideHassLitMixin } from "@ha/mixins/provide-hass-lit-mixin";
import { HomeAssistant } from "@ha/types";

import { localize } from "./localize/localize";
import { KNXLogger } from "./tools/knx-logger";
import { getKnxProject } from "./services/websocket.service";
import { KNX } from "./types/knx";

export class knxElement extends ProvideHassLitMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  protected _initKnx() {
    getConfigEntries(this.hass, { domain: "knx" }).then((configEntries) => {
      this.knx = {
        language: this.hass.language,
        config_entry: configEntries[0], // single instance allowed for knx config
        localize: (string, replace) => localize(this.hass.language || "en", string, replace),
        log: new KNXLogger(),
        project: null,
        loadProject: () => this._loadProjectPromise(),
      };
    });
  }

  private _loadProjectPromise(): Promise<void> {
    // load project only when needed since it can be quite big
    // check this.knx.project if it is available in using component
    return getKnxProject(this.hass)
      .then((knxProjectResp) => {
        this.knx.project = knxProjectResp;
      })
      .catch((err) => {
        this.knx.log.error("getKnxProject", err);
      });
  }
}
