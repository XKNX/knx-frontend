import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";

import "@ha/components/ha-alert";
import "@ha/components/ha-button";
import "@ha/components/ha-dialog-footer";
import "@ha/components/ha-markdown";
import "@ha/components/ha-adaptive-dialog";
import "@ha/layouts/hass-loading-screen";

import { DialogMixin } from "@ha/dialogs/dialog-mixin";
import type { HomeAssistant } from "@ha/types";

import "../components/knx-group-address-selector";
import "../components/knx-payload-selector";
import "../components/knx-selector-row";
import type { PayloadConfigValue } from "../components/knx-payload-selector";
import type { GASchema } from "../types/entity_data";
import type { KNX } from "../types/knx";
import { KNXLogger } from "../tools/knx-logger";
import { setNestedValue } from "../utils/config-helper";

const logger = new KNXLogger("knx-send-dialog");

export interface KnxSendDialogParams {
  hass: HomeAssistant;
  knx: KNX;
}
export interface KnxSendData {
  ga?: GASchema;
  data?: PayloadConfigValue;
  response?: boolean;
}

@customElement("knx-send-dialog")
export class KnxSendDialog extends DialogMixin<KnxSendDialogParams>(LitElement) {
  @property({ attribute: false }) public knx!: KNX;

  @state() private _data: KnxSendData = {};

  public hass!: HomeAssistant; // no need for @property here - save rendering cycles

  private _backendLocalize = (key: string) =>
    this.hass.localize(`component.knx.config_panel.dialogs.send.${key}`);

  public connectedCallback() {
    super.connectedCallback();

    if (this.params) {
      this.hass = this.params.hass;
      this.knx = this.params.knx;
    }
  }

  protected render() {
    if (!this.params) {
      return nothing;
    }

    return html`
      <ha-adaptive-dialog
        open
        @closed=${this.closeDialog}
        .headerTitle=${this._backendLocalize("title")}
      >
        <ha-markdown
          class="description"
          breaks
          .content=${this._backendLocalize("description")}
        ></ha-markdown>
        <knx-group-address-selector
          .knx=${this.knx}
          .label=${this.hass.localize("component.knx.config_panel.common.group_address")}
          .key=${"ga"}
          .options=${{
            write: { required: true },
            passive: false,
            dptClasses: ["numeric", "enum", "string", "complex"],
          }}
          .config=${this._data.ga ?? {}}
          .localizeFunction=${this._backendLocalize}
          @value-changed=${this._selectorChanged}
        ></knx-group-address-selector>
        <knx-payload-selector
          .hass=${this.hass}
          .knx=${this.knx}
          .key=${"data"}
          .dpt=${this._data.ga?.dpt}
          .gaKey=${"ga"}
          .value=${this._data.data}
          .localizeFunction=${this._backendLocalize}
          @value-changed=${this._selectorChanged}
        ></knx-payload-selector>
        <knx-selector-row
          .hass=${this.hass}
          .key=${"response"}
          .selector=${{
            type: "ha_selector",
            name: "response",
            selector: {
              boolean: {},
            },
          } as any}
          .value=${this._data.response}
          .localizeFunction=${this._backendLocalize}
          @value-changed=${this._selectorChanged}
        ></knx-selector-row>
        <ha-dialog-footer slot="footer">
          <ha-button slot="secondaryAction" appearance="plain" @click=${this.closeDialog}>
            ${this.hass.localize("ui.common.cancel")}
          </ha-button>
          <ha-button
            slot="primaryAction"
            appearance="accent"
            @click=${this._read}
            ?disabled=${!this._data.ga?.write}
          >
            ${this._backendLocalize("read_button")}
          </ha-button>
          <ha-button
            slot="primaryAction"
            appearance="accent"
            @click=${this._send}
            ?disabled=${!this._data.ga?.write || !this._data.data}
          >
            ${this._backendLocalize("write_button")}
          </ha-button>
        </ha-dialog-footer>
      </ha-adaptive-dialog>
    `;
  }

  private _selectorChanged(ev: CustomEvent<{ value?: { write?: string } }>) {
    ev.stopPropagation();
    const target = ev.target as HTMLElement & {
      key?: keyof KnxSendData;
    };
    const key = target.key;
    if (!key) {
      return;
    }
    const value = ev.detail.value;
    setNestedValue(this._data, key, value, logger);
    logger.debug(`Config updated: ${key}`, this._data);
    this.requestUpdate();
  }

  private _read(_ev: CustomEvent) {
    logger.debug("Reading value", this._data);
    if (!this._data.ga?.write) {
      logger.warn("No group address to read from", this._data);
      return;
    }
    const serviceData = {};
    serviceData["address"] = this._data.ga.write;
    this.hass.callService("knx", "read", serviceData, undefined, true, false);
    this.closeDialog();
  }

  private _send(_ev: CustomEvent) {
    logger.debug("Sending value", this._data);
    if (!this._data.ga?.write) {
      logger.warn("No group address to send to", this._data);
      return;
    }
    if (!this._data.data) {
      logger.warn("No data to send", this._data);
      return;
    }
    const serviceData = {};
    serviceData["address"] = this._data.ga.write;
    if (this._data.data.value !== undefined && !!this._data.ga.dpt) {
      serviceData["payload"] = this._data.data.value;
      serviceData["type"] = this._data.ga.dpt;
    } else {
      serviceData["payload"] = this._rawPayloadArray(this._data.data);
    }
    if (serviceData["payload"] === undefined) {
      logger.warn("No payload to send", this._data);
      return;
    }
    serviceData["response"] = !!this._data.response;
    this.hass.callService("knx", "send", serviceData, undefined, true, false);
    this.closeDialog();
  }

  private _rawPayloadArray({ payload, payload_length }: PayloadConfigValue): number[] | undefined {
    if (payload === undefined) return undefined;
    if (payload_length === undefined) return undefined;
    if (typeof payload !== "string" || !payload.startsWith("0x")) return undefined;

    const hexString = payload.slice(2); // Remove the "0x" prefix
    const byteArray: number[] = [];
    for (let i = 0; i < hexString.length; i += 2) {
      byteArray.push(parseInt(hexString.slice(i, i + 2), 16));
    }
    return byteArray;
  }

  static styles = css`
    .description {
      margin: 0 0 8px 0;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-send-dialog": KnxSendDialog;
  }
}
