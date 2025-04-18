import { html, nothing } from "lit";

import "@ha/components/ha-alert";
import "@ha/components/ha-card";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-selector/ha-selector-select";
import "@ha/components/ha-selector/ha-selector-text";
import type { HomeAssistant } from "@ha/types";

import "./knx-sync-state-selector-row";
import "./knx-device-picker";

import { deviceFromIdentifier } from "../utils/device";
import type { BaseEntityData, ErrorDescription } from "../types/entity_data";

export const renderConfigureEntityCard = (
  hass: HomeAssistant,
  entityConfig: Partial<BaseEntityData>,
  updateConfig: (ev: CustomEvent) => void,
  errors?: ErrorDescription[],
) => {
  const device = entityConfig.device_info
    ? deviceFromIdentifier(hass, entityConfig.device_info)
    : undefined;
  const deviceName = device ? (device.name_by_user ?? device.name) : "";
  // currently only baseError is possible, others shouldn't be possible due to selectors / optional
  const entityBaseError = errors?.find((err) => (err.path ? err.path.length === 0 : true));

  return html`
    <ha-card outlined>
      <h1 class="card-header">Entity configuration</h1>
      <p class="card-content">Home Assistant specific settings.</p>
      ${errors
        ? entityBaseError
          ? html`<ha-alert
              .alertType=${"error"}
              .title=${entityBaseError.error_message}
            ></ha-alert>`
          : nothing
        : nothing}
      <ha-expansion-panel
        header="Device and entity name"
        secondary="Define how the entity should be named in Home Assistant."
        expanded
        .noCollapse=${true}
      >
        <knx-device-picker
          .hass=${hass}
          .key=${"entity.device_info"}
          .helper=${"A device allows to group multiple entities. Select the device this entity belongs to or create a new one."}
          .value=${entityConfig.device_info ?? undefined}
          @value-changed=${updateConfig}
        ></knx-device-picker>
        <ha-selector-text
          .hass=${hass}
          label="Entity name"
          helper="Optional if a device is selected, otherwise required. If the entity is assigned to a device, the device name is used as prefix."
          .required=${!device}
          .selector=${{
            text: { type: "text", prefix: deviceName },
          }}
          .key=${"entity.name"}
          .value=${entityConfig.name}
          @value-changed=${updateConfig}
        ></ha-selector-text>
      </ha-expansion-panel>
      <ha-expansion-panel .header=${"Entity category"} outlined>
        <ha-selector-select
          .hass=${hass}
          .label=${"Entity category"}
          .helper=${"Classification of a non-primary entity. Leave empty for standard behaviour."}
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
          .key=${"entity.entity_category"}
          .value=${entityConfig.entity_category}
          @value-changed=${updateConfig}
        ></ha-selector-select>
      </ha-expansion-panel>
    </ha-card>
  `;
};
