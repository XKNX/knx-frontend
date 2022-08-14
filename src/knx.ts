import { LitElement } from "lit";
import { property } from "lit/decorators";
import { getConfigEntries } from "../homeassistant-frontend/src/data/config_entries";
import { ProvideHassLitMixin } from "../homeassistant-frontend/src/mixins/provide-hass-lit-mixin";
import { HomeAssistant } from "../homeassistant-frontend/src/types";
import { localize } from "./localize/localize";
import { KNXLogger } from "./tools/knx-logger";
import { KNX } from "./types/knx";

export class knxElement extends ProvideHassLitMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public knx!: KNX;

  public connectedCallback() {
    super.connectedCallback();

    this.addEventListener("update-knx", (e) => this._updateKnx((e as any).detail as Partial<KNX>));
  }

  protected _getKNXConfigEntry() {
    getConfigEntries(this.hass).then((configEntries) => {
      const knxEntry = configEntries.filter((entry) => entry.domain === "knx")[0];
      this.knx = {
        language: "en",
        updates: [],
        resources: [],
        removed: [],
        sections: [],
        config_entry: knxEntry,
        localize: (string: string, replace?: Record<string, any>) =>
          localize(this.knx?.language || "en", string, replace),
        log: new KNXLogger(),
      };
    });
  }

  protected _updateKnx(obj: Partial<KNX>) {
    let shouldUpdate = false;

    Object.keys(obj).forEach((key) => {
      if (JSON.stringify(this.knx[key]) !== JSON.stringify(obj[key])) {
        shouldUpdate = true;
      }
    });

    if (shouldUpdate) {
      this.knx = { ...this.knx, ...obj };
    }
  }
}
