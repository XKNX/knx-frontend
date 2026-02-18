/** This is a mix of ha-device-picker and ha-area-picker to allow for
 * creation of new devices and include (KNX) devices without entities.
 * Unlike the ha-device-picker or selector, its value is the device identifier
 * (second tuple item), not the device id.
 * */
import type { RenderItemFunction } from "@lit-labs/virtualizer/virtualize";
import type { PropertyValues, TemplateResult } from "lit";
import { LitElement, html } from "lit";
import { customElement, query, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";

import "@ha/components/ha-generic-picker";
import type { HaGenericPicker } from "@ha/components/ha-generic-picker";
import "@ha/components/ha-list-item";

import { fireEvent } from "@ha/common/dom/fire_event";
import type { ScorableTextItem } from "@ha/common/string/filter/sequence-matching";
import { stringCompare } from "@ha/common/string/compare";

import type { HomeAssistant, ValueChangedEvent } from "@ha/types";
import type { AreaRegistryEntry } from "@ha/data/area/area_registry";
import type { DeviceRegistryEntry } from "@ha/data/device/device_registry";

import type { PickerComboBoxItem } from "@ha/components/ha-picker-combo-box";
import { showKnxDeviceCreateDialog } from "../dialogs/show-knx-device-create-dialog";
import { knxDevices, getKnxDeviceIdentifier } from "../utils/device";

const SEARCH_KEYS = [
  { name: "primary", weight: 2 },
  { name: "secondary", weight: 1 },
];

interface Device extends PickerComboBoxItem {
  identifier?: string;
}

type ScorableDevice = ScorableTextItem & Device;

const rowRenderer: RenderItemFunction<Device> = (item) =>
  html`<ha-list-item .twoline=${!!item.secondary} style="width: 100%">
    <span>${item.primary}</span>
    <span slot="secondary">${item.secondary}</span>
  </ha-list-item>`;

@customElement("knx-device-picker")
class KnxDevicePicker extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public label?: string;

  @property() public helper?: string;

  @property() public value?: string;

  @state() private _opened?: boolean;

  @query("ha-generic-picker", true) public picker!: HaGenericPicker;

  // value is the knx identifier (device_info), not the device id
  private _deviceId?: string;

  private _init = false;

  private _allDevices: ScorableDevice[] = [];

  private _getDevices = memoizeOne(
    (
      devices: DeviceRegistryEntry[],
      areas: Record<string, AreaRegistryEntry>,
    ): ScorableDevice[] => {
      const outputDevices = devices.map((device) => {
        const name =
          device.name_by_user ??
          device.name ??
          this.hass.localize("ui.components.device-picker.unnamed_device");
        const areaName =
          device.area_id && areas[device.area_id]
            ? areas[device.area_id].name
            : this.hass.localize("ui.components.device-picker.no_area");
        return {
          id: device.id,
          identifier: getKnxDeviceIdentifier(device),
          primary: name,
          secondary: areaName,
          strings: [name, areaName],
        };
      });

      const sortedDevices = outputDevices.sort((a, b) =>
        stringCompare(a.primary || "", b.primary || "", this.hass.locale.language),
      );

      return [
        {
          id: "add_new",
          primary: "Add new device…",
          secondary: "",
          strings: [],
        },
        ...sortedDevices,
      ];
    },
  );

  private async _addDevice(device: DeviceRegistryEntry) {
    const knxDevicesList = knxDevices(this.hass);
    const deviceEntries = [...knxDevicesList, device];
    this._allDevices = this._getDevices(deviceEntries, this.hass.areas);
    await this.updateComplete;
    await this.picker.updateComplete;
  }

  public async open() {
    await this.updateComplete;
    await this.picker?.open();
  }

  public async focus() {
    await this.updateComplete;
    await this.picker?.focus();
  }

  protected updated(changedProps: PropertyValues) {
    if ((!this._init && this.hass) || (this._init && changedProps.has("_opened") && this._opened)) {
      this._init = true;
      this._allDevices = this._getDevices(knxDevices(this.hass), this.hass.areas);
      const deviceId = this.value
        ? this._allDevices.find((d) => d.identifier === this.value)?.id
        : undefined;
      this.picker.value = deviceId;
      this._deviceId = deviceId;
    }
  }

  render(): TemplateResult {
    return html`
      <ha-generic-picker
        .hass=${this.hass}
        .label=${this.label === undefined && this.hass
          ? this.hass.localize("ui.components.device-picker.device")
          : this.label}
        .emptyLabel=${this.hass.localize("ui.components.device-picker.no_devices")}
        .notFoundLabel=${this._notFoundLabel}
        .helper=${this.helper}
        .value=${this._deviceId}
        .rowRenderer=${rowRenderer}
        .valueRenderer=${this._valueRenderer}
        .getItems=${this._getPickerItems}
        .searchKeys=${SEARCH_KEYS}
        @opened-changed=${this._openedChanged}
        @value-changed=${this._deviceChanged}
      ></ha-generic-picker>
    `;
  }

  private _notFoundLabel = (term: string) =>
    this.hass.localize("ui.components.device-picker.no_match", { term });

  private _getPickerItems = () => this._allDevices;

  private _valueRenderer = (deviceId: string) => {
    const device = this._allDevices.find((d) => d.id === deviceId);
    return html`${device?.primary || this.hass.localize("ui.components.device-picker.unknown")}`;
  };

  private _openedChanged(ev: ValueChangedEvent<boolean>) {
    this._opened = ev.detail.value;
  }

  private _deviceChanged(ev: ValueChangedEvent<string>) {
    ev.stopPropagation();
    const newValue = ev.detail.value;

    if (newValue !== "add_new") {
      if (newValue !== this._deviceId) {
        this._setValue(newValue);
      }
      return;
    }

    this.picker.value = this._deviceId;
    this._openCreateDeviceDialog();
  }

  private _setValue(deviceId: string | undefined) {
    const device = this._allDevices.find((d) => d.id === deviceId);
    const identifier = device?.identifier;
    this.value = identifier;
    this._deviceId = device?.id;
    fireEvent(this, "value-changed", { value: identifier });
  }

  private _openCreateDeviceDialog() {
    showKnxDeviceCreateDialog(this, {
      onClose: (device) => {
        if (device) {
          this._addDevice(device).then(() => {
            this._setValue(device.id);
          });
        }
      },
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "knx-device-picker": KnxDevicePicker;
  }
}
