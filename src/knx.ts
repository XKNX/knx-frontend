import { LitElement } from "lit";
import { property } from "lit/decorators";

import { navigate } from "@ha/common/navigate";
import { getConfigEntries } from "@ha/data/config_entries";
import { ProvideHassLitMixin } from "@ha/mixins/provide-hass-lit-mixin";
import type { HomeAssistant } from "@ha/types";

import { localize } from "./localize/localize";
import { KNXLogger } from "./tools/knx-logger";
import { getKnxInfoData, getKnxProject } from "./services/websocket.service";
import type { KNX } from "./types/knx";

export class KnxElement extends ProvideHassLitMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  protected async _initKnx() {
    try {
      const knxConfigEntries = await getConfigEntries(this.hass, { domain: "knx" });
      const knxInfo = await getKnxInfoData(this.hass);
      this.knx = {
        language: this.hass.language,
        config_entry: knxConfigEntries[0], // single instance allowed for knx config
        localize: (string, replace) => localize(this.hass, string, replace),
        log: new KNXLogger(),
        info: knxInfo,
        project: null,
        loadProject: () => this._loadProjectPromise(),
      };
    } catch (err) {
      new KNXLogger().error("Failed to initialize KNX", err);
    }
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
        navigate("/knx/error", { replace: true, data: err });
      });
  }
}
