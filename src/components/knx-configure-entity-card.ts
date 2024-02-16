import { html } from "lit";

import "@ha/components/ha-card";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-selector/ha-selector-select";
import "@ha/components/ha-selector/ha-selector-text";
import "@ha/components/ha-settings-row";
import type { HomeAssistant } from "@ha/types";

import "./knx-sync-state-selector-row";
import "./knx-device-picker";

import { BaseEntityData } from "../types/entity_data";
import { deviceFromIdentifier } from "../utils/device";

export const renderConfigureEntityCard = (
  hass: HomeAssistant,
  config: Partial<BaseEntityData>,
  updateConfig: (ev: CustomEvent) => void,
) => {
  const device = config.device_info ? deviceFromIdentifier(hass, config.device_info) : undefined;
  const deviceName = device ? device.name_by_user ?? device.name : "";

  return html`
    <ha-card outlined>
      <h1 class="card-header">Entity configuration</h1>
      <p class="card-content">Home Assistant specific settings.</p>
      <ha-settings-row narrow>
        <div slot="heading">Device</div>
        <div slot="description">A device allows to group multiple entities.</div>
        <knx-device-picker
          .hass=${hass}
          .key=${"device_info"}
          .value=${config.device_info ?? undefined}
          @value-changed=${updateConfig}
        ></knx-device-picker>
      </ha-settings-row>
      <ha-settings-row narrow>
        <div slot="heading">Name</div>
        <div slot="description">Name of the entity.</div>
        <ha-selector-text
          .hass=${hass}
          .label=${"Name"}
          .required=${!device}
          .selector=${{
            text: { type: "text", prefix: deviceName },
          }}
          .key=${"name"}
          .value=${config.name}
          @value-changed=${updateConfig}
        ></ha-selector-text>
      </ha-settings-row>
      <ha-expansion-panel .header=${"Advanced"} outlined>
        <ha-settings-row narrow>
          <div slot="heading">Entity settings</div>
          <div slot="description">Description</div>
          <ha-selector-select
            .hass=${hass}
            .label=${"Entity category"}
            .helper=${"Leave empty for standard behaviour."}
            .required=${false}
            .selector=${{
              select: {
                multiple: false,
                custom_value: false,
                mode: "dropdown",
                options: [
                  { value: "config", label: "Config" },
                  { value: "diagnostic", label: "Diagnostic" },
                ],
              },
            }}
            .key=${"entity_category"}
            .value=${config.entity_category}
            @value-changed=${updateConfig}
          ></ha-selector-select>
        </ha-settings-row>
      </ha-expansion-panel>
    </ha-card>
  `;
};
