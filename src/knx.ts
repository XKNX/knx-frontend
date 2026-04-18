import { property } from "lit/decorators";

import { getConfigEntries } from "@ha/data/config_entries";
import type { HomeAssistant } from "@ha/types";
import { HassBaseEl } from "@ha/state/hass-base-mixin";

import { KnxProjectContextProvider } from "./data/knx-project-context";
import { localize } from "./localize/localize";
import { KNXLogger } from "./tools/knx-logger";
import { getKnxBaseData, getSchema } from "./services/websocket.service";
import type { KNX } from "./types/knx";

export class KnxElement extends HassBaseEl {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  protected _projectContextProvider = new KnxProjectContextProvider(this, {
    onLoad: (project) => {
      if (this.knx) {
        this.knx.projectData = project;
      }
    },
  });

  protected async _initKnx() {
    try {
      const knxConfigEntries = await getConfigEntries(this.hass, { domain: "knx" });
      const knxBase = await getKnxBaseData(this.hass);
      this.knx = {
        language: this.hass.language,
        config_entry: knxConfigEntries[0], // single instance allowed for knx config
        localize: (string, replace) => localize(this.hass, string, replace),
        log: new KNXLogger(),
        connectionInfo: knxBase.connection_info,
        dptMetadata: knxBase.dpt_metadata,
        projectInfo: knxBase.project_info, // can  be used to check if project is available
        supportedPlatforms: knxBase.supported_platforms,
        projectData: null,
        schema: {},
        loadSchema: (platform: string) => this._loadSchema(platform),
      };
      this._projectContextProvider.update(this.hass, !!knxBase.project_info);
    } catch (err) {
      new KNXLogger().error("Failed to initialize KNX", err);
    }
  }

  private async _loadSchema(platform: string): Promise<void> {
    // load schema only once per platform
    if (platform in this.knx.schema) {
      return Promise.resolve();
    }
    return getSchema(this.hass, platform).then((schema) => {
      this.knx.schema[platform] = schema;
    });
  }
}
