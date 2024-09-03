import { LitElement } from "lit";
import { property } from "lit/decorators";

import { navigate } from "@ha/common/navigate";
import { getConfigEntries } from "@ha/data/config_entries";
import { ProvideHassLitMixin } from "@ha/mixins/provide-hass-lit-mixin";
import { HomeAssistant } from "@ha/types";

import { localize } from "./localize/localize";
import { KNXLogger } from "./tools/knx-logger";
import { getKnxInfoData, getKnxProject } from "./services/websocket.service";
import { KNX } from "./types/knx";

export class knxElement extends ProvideHassLitMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  protected async _initKnx() {
    const knxConfigEntry = await getConfigEntries(this.hass, { domain: "knx" })[0]; // single instance allowed for knx config
    const hasProject = !!(await getKnxInfoData(this.hass)).project;
    this.knx = {
      language: this.hass.language,
      config_entry: knxConfigEntry,
      localize: (string, replace) => localize(this.hass, string, replace),
      log: new KNXLogger(),
      hasProject: hasProject,
      project: null,
      loadProject: () => this._loadProjectPromise(),
    };
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
