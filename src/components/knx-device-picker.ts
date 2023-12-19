/** This is a mix of ha-device-picker and ha-area-picker to allow for
 * creation of new devices and include (KNX) devices without entities.
 * Unlike the ha-device-picker or selector, its value is the device identifier
 * (second tuple item), not the device id.
 * */
import { ComboBoxLitRenderer } from "@vaadin/combo-box/lit";
import { LitElement, PropertyValues, html, nothing, TemplateResult } from "lit";
import { customElement, query, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";

import memoizeOne from "memoize-one";

import "@ha/components/ha-combo-box";
import "@ha/components/ha-list-item";

import "../dialogs/knx-device-create-dialog";

import { fireEvent } from "@ha/common/dom/fire_event";
import { ScorableTextItem, fuzzyFilterSort } from "@ha/common/string/filter/sequence-matching";
import { stringCompare } from "@ha/common/string/compare";

import { HomeAssistant, ValueChangedEvent } from "@ha/types";
import { AreaRegistryEntry } from "@ha/data/area_registry";
import type { DeviceRegistryEntry } from "@ha/data/device_registry";
import type { HaComboBox } from "@ha/components/ha-combo-box";

import { knxDevices, getKnxDeviceIdentifier } from "../utils/device";

interface Device {
  name: string;
  area: string;
  id: string;
  identifier?: string;
}

type ScorableDevice = ScorableTextItem & Device;

const rowRenderer: ComboBoxLitRenderer<Device> = (item) =>
  html`<ha-list-item
    class=${classMap({ "add-new": item.id === "add_new" })}
    .twoline=${!!item.area}
  >
    <span>${item.name}</span>
    <span slot="secondary">${item.area}</span>
  </ha-list-item>`;

@customElement("knx-device-picker")
class KnxDevicePicker extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public label?: string;

  @property() public value?: string;

  @state() private _opened?: boolean;

  @query("ha-combo-box", true) public comboBox!: HaComboBox;

  @state() private _showCreateDeviceDialog = false;

  // value is the knx identifier, not the device id
  private _deviceId?: string;

  private _suggestion?: string;

  private _init = false;

  private _getDevices = memoizeOne(
    (
      devices: DeviceRegistryEntry[],
      areas: { [id: string]: AreaRegistryEntry },
    ): ScorableDevice[] => {
      const outputDevices = devices.map((device) => {
        const name = device.name_by_user ?? device.name ?? "";
        return {
          id: device.id,
          identifier: getKnxDeviceIdentifier(device),
          name: name,
          area:
            device.area_id && areas[device.area_id]
              ? areas[device.area_id].name
              : this.hass.localize("ui.components.device-picker.no_area"),
          strings: [name || ""],
        };
      });
      return [
        {
          id: "add_new",
          name: "Add new device…",
          area: "",
          strings: [],
        },
        ...outputDevices.sort((a, b) =>
          stringCompare(a.name || "", b.name || "", this.hass.locale.language),
        ),
      ];
    },
  );

  private async _addDevice(device: DeviceRegistryEntry) {
    const deviceEntries = [...knxDevices(this.hass), device];
    const devices = this._getDevices(deviceEntries, this.hass.areas);
    this.comboBox.items = devices;
    this.comboBox.filteredItems = devices;
    await this.updateComplete;
    await this.comboBox.updateComplete;
  }

  public async open() {
    await this.updateComplete;
    await this.comboBox?.open();
  }

  public async focus() {
    await this.updateComplete;
    await this.comboBox?.focus();
  }

  protected updated(changedProps: PropertyValues) {
    if ((!this._init && this.hass) || (this._init && changedProps.has("_opened") && this._opened)) {
      this._init = true;
      const devices = this._getDevices(knxDevices(this.hass), this.hass.areas);
      const deviceId = this.value
        ? devices.find((d) => d.identifier === this.value)?.id
        : undefined;
      this.comboBox.value = deviceId;
      this._deviceId = deviceId;
      this.comboBox.items = devices;
      this.comboBox.filteredItems = devices;
    }
  }

  render(): TemplateResult {
    return html`
      <ha-combo-box
        .hass=${this.hass}
        .label=${this.label === undefined && this.hass
          ? this.hass.localize("ui.components.device-picker.device")
          : this.label}
        .value=${this._deviceId}
        .renderer=${rowRenderer}
        item-id-path="id"
        item-value-path="id"
        item-label-path="name"
        @filter-changed=${this._filterChanged}
        @opened-changed=${this._openedChanged}
        @value-changed=${this._deviceChanged}
      ></ha-combo-box>
      ${this._showCreateDeviceDialog ? this._renderCreateDeviceDialog() : nothing}
    `;
  }

  private _filterChanged(ev: CustomEvent): void {
    const target = ev.target as HaComboBox;
    const filterString = ev.detail.value;
    if (!filterString) {
      this.comboBox.filteredItems = this.comboBox.items;
      return;
    }

    const filteredItems = fuzzyFilterSort<ScorableDevice>(filterString, target.items || []);
    this._suggestion = filterString;
    this.comboBox.filteredItems = [
      ...filteredItems,
      {
        id: "add_new_suggestion",
        name: `Add new device '${this._suggestion}'`,
      },
    ];
  }

  private _openedChanged(ev: ValueChangedEvent<boolean>) {
    this._opened = ev.detail.value;
  }

  private _deviceChanged(ev: ValueChangedEvent<string>) {
    ev.stopPropagation();
    let newValue = ev.detail.value;

    if (newValue === "no_devices") {
      newValue = "";
    }

    if (!["add_new_suggestion", "add_new"].includes(newValue)) {
      if (newValue !== this._deviceId) {
        this._setValue(newValue);
      }
      return;
    }

    (ev.target as any).value = this._deviceId;
    this._openCreateDeviceDialog();
  }

  private _setValue(deviceId: string | undefined) {
    const device: Device | undefined = this.comboBox.items!.find((d) => d.id === deviceId);
    const identifier = device?.identifier;
    this.value = identifier;
    this._deviceId = device?.id;
    setTimeout(() => {
      fireEvent(this, "value-changed", { value: identifier });
      fireEvent(this, "change");
    }, 0);
  }

  private _renderCreateDeviceDialog() {
    return html`
      <knx-device-create-dialog
        .hass=${this.hass}
        @create-device-dialog-closed=${this._closeCreateDeviceDialog}
        .deviceName=${this._suggestion}
      ></knx-device-create-dialog>
    `;
  }

  private _openCreateDeviceDialog() {
    this._showCreateDeviceDialog = true;
  }

  private async _closeCreateDeviceDialog(ev: CustomEvent) {
    const newDevice: DeviceRegistryEntry | undefined = ev.detail.newDevice;
    if (newDevice) {
      await this._addDevice(newDevice);
    } else {
      this.comboBox.setInputValue("");
    }
    this._setValue(newDevice?.id);
    this._suggestion = undefined;
    this._showCreateDeviceDialog = false;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-device-picker": KnxDevicePicker;
  }
}
