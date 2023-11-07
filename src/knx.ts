import { LitElement } from "lit";
import { property } from "lit/decorators";

import { getConfigEntries } from "@ha/data/config_entries";
import { ProvideHassLitMixin } from "@ha/mixins/provide-hass-lit-mixin";
import { HomeAssistant } from "@ha/types";

import { localize } from "./localize/localize";
import { KNXLogger } from "./tools/knx-logger";
import { KNX } from "./types/knx";

export class knxElement extends ProvideHassLitMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  protected _getKNXConfigEntry() {
    getConfigEntries(this.hass).then((configEntries) => {
      const knxEntry = configEntries.filter((entry) => entry.domain === "knx")[0];
      this.knx = {
        language: this.hass.language,
        config_entry: knxEntry,
        localize: (string: string, replace?: Record<string, any>) =>
          localize(this.knx.language || "en", string, replace),
        log: new KNXLogger(),
      };
    });
  }
}
