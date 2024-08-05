import "@material/mwc-button/mwc-button";
import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";

import { navigate } from "@ha/common/navigate";
import "@ha/components/ha-area-picker";
import "@ha/components/ha-dialog";
import "@ha/components/ha-selector/ha-selector-text";

import { fireEvent } from "@ha/common/dom/fire_event";
import { haStyleDialog } from "@ha/resources/styles";
import type { DeviceRegistryEntry } from "@ha/data/device_registry";
import type { HomeAssistant } from "@ha/types";

import { createDevice } from "../services/websocket.service";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("create_device_dialog");

declare global {
  // for fire event
  interface HASSDomEvents {
    "create-device-dialog-closed": { newDevice: DeviceRegistryEntry | undefined };
  }
}

@customElement("knx-device-create-dialog")
class DeviceCreateDialog extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public deviceName?: string;

  @state() private area?: string;

  _deviceEntry?: DeviceRegistryEntry;

  public closeDialog(_ev) {
    fireEvent(
      this,
      "create-device-dialog-closed",
      { newDevice: this._deviceEntry },
      { bubbles: false },
    );
  }

  private _createDevice() {
    createDevice(this.hass, { name: this.deviceName!, area_id: this.area })
      .then((resultDevice) => {
        this._deviceEntry = resultDevice;
      })
      .catch((err) => {
        logger.error("getGroupMonitorInfo", err);
        navigate("/knx/error", { replace: true, data: err });
      })
      .finally(() => {
        this.closeDialog(undefined);
      });
  }

  protected render() {
    return html`<ha-dialog
      open
      .heading=${"Create new device"}
      scrimClickAction
      escapeKeyAction
      defaultAction="ignore"
    >
      <ha-selector-text
        .hass=${this.hass}
        .label=${"Name"}
        .required=${true}
        .selector=${{
          text: { type: "text" },
        }}
        .key=${"deviceName"}
        .value=${this.deviceName}
        @value-changed=${this._valueChanged}
      ></ha-selector-text>
      <ha-area-picker
        .hass=${this.hass}
        .label=${"Area"}
        .key=${"area"}
        .value=${this.area}
        @value-changed=${this._valueChanged}
      >
      </ha-area-picker>
      <mwc-button slot="secondaryAction" @click=${this.closeDialog}>
        ${this.hass.localize("ui.common.cancel")}
      </mwc-button>
      <mwc-button slot="primaryAction" @click=${this._createDevice}>
        ${this.hass.localize("ui.common.add")}
      </mwc-button>
    </ha-dialog>`;
  }

  protected _valueChanged(ev: CustomEvent) {
    ev.stopPropagation();
    this[ev.target.key] = ev.detail.value;
  }

  static get styles() {
    return [
      haStyleDialog,
      css`
        @media all and (min-width: 600px) {
          ha-dialog {
            --mdc-dialog-min-width: 480px;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-device-create-dialog": DeviceCreateDialog;
  }
}
