import { LitElement } from "lit";
import { property } from "lit/decorators";

import { navigate } from "@ha/common/navigate";
import { getConfigEntries } from "@ha/data/config_entries";
import { ProvideHassLitMixin } from "@ha/mixins/provide-hass-lit-mixin";
import type { HomeAssistant } from "@ha/types";

import { localize } from "./localize/localize";
import { KNXLogger } from "./tools/knx-logger";
import { getExposeSchema, getKnxBaseData, getKnxProject, getSchema } from "./services";
import type { KNX } from "./types/knx";
import type { ExposeType } from "./types/expose_data";

export class KnxElement extends ProvideHassLitMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

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
        projectInfo: knxBase.project_info, // can be used to check if project is available
        supportedPlatforms: knxBase.supported_platforms,
        supportedExposeTypes: knxBase.supported_expose_types,
        projectData: null,
        loadProject: () => this._loadProjectPromise(),
        schema: {},
        loadSchema: (platform: string) => this._loadSchema(platform),
        exposeSchema: {},
        loadExposeSchema: (type: ExposeType) => this._loadExposeSchema(type),
      };
    } catch (err) {
      new KNXLogger().error("Failed to initialize KNX", err);
    }
  }

  private _loadProjectPromise(): Promise<void> {
    // load project only when needed since it can be quite big
    // check if this.knx.projectData is available before using in component
    return getKnxProject(this.hass)
      .then((knxProject) => {
        this.knx.projectData = knxProject;
      })
      .catch((err) => {
        this.knx.log.error("getKnxProject", err);
        navigate("/knx/error", { replace: true, data: err });
      });
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

  private async _loadExposeSchema(type: ExposeType): Promise<void> {
    // load schema only once per type
    if (type in this.knx.exposeSchema) {
      return Promise.resolve();
    }
    return getExposeSchema(this.hass, type).then((schema) => {
      this.knx.exposeSchema[type] = schema;
    });
  }
}
