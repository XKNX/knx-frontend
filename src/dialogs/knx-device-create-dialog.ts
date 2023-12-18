import "@material/mwc-button/mwc-button";
import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators";

import "@ha/components/ha-area-picker";
import "@ha/components/ha-dialog";
import "@ha/components/ha-selector/ha-selector";

import { fireEvent } from "@ha/common/dom/fire_event";
import type { DeviceRegistryEntry } from "@ha/data/device_registry";
import { haStyleDialog } from "@ha/resources/styles";
import { HomeAssistant } from "@ha/types";

import { createDevice } from "../services/websocket.service";

declare global {
  // for fire event
  interface HASSDomEvents {
    "create-device-dialog-closed": { newDevice: DeviceRegistryEntry | undefined };
  }
}

@customElement("knx-device-create-dialog")
class DeviceCreateDialog extends LitElement {
  @property({ type: Object }) public hass!: HomeAssistant;

  @property() public deviceName?: string;

  @state() private area?: string;

  public closeDialog(device: DeviceRegistryEntry | undefined = undefined) {
    fireEvent(this, "create-device-dialog-closed", { newDevice: device }, { bubbles: false });
  }

  private _createDevice() {
    let device: DeviceRegistryEntry | undefined;
    createDevice(this.hass, { name: this.deviceName!, area_id: this.area })
      .then((resultDevice) => {
        device = resultDevice;
      })
      .finally(() => {
        this.closeDialog(device);
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
      <ha-selector
        .hass=${this.hass}
        .label=${"Name"}
        .required=${true}
        .selector=${{
          text: { type: "text" },
        }}
        .key=${"deviceName"}
        .value=${this.deviceName}
        @value-changed=${this._valueChanged}
      ></ha-selector>
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
