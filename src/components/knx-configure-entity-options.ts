import { html, nothing } from "lit";

import "@ha/components/ha-alert";
import "@ha/components/ha-card";
import "@ha/components/ha-expansion-panel";
import "@ha/components/ha-selector/ha-selector-select";
import "@ha/components/ha-selector/ha-selector-text";
import type { HomeAssistant } from "@ha/types";

import "./knx-device-picker";

import { deviceFromIdentifier } from "../utils/device";
import { getValidationError } from "../utils/validation";
import type { BaseEntityData, ErrorDescription } from "../types/entity_data";

export const renderConfigureEntityCard = (
  hass: HomeAssistant,
  entityConfig: Partial<BaseEntityData>,
  updateConfig: (ev: CustomEvent) => void,
  errors?: ErrorDescription[],
  localizeFunction: (key: string) => string = (key: string) => key,
) => {
  const device = entityConfig.device_info
    ? deviceFromIdentifier(hass, entityConfig.device_info)
    : undefined;
  const deviceName = device ? (device.name_by_user ?? device.name) : "";
  // currently only baseError is possible, others shouldn't be possible due to selectors / optional
  const entityBaseError = getValidationError(errors);

  return html`
    <ha-card outlined>
      <h1 class="card-header">${localizeFunction("entity.title")}</h1>
      <p class="card-content">${localizeFunction("entity.description")}</p>
      ${errors
        ? entityBaseError
          ? html`<ha-alert
              .alertType=${"error"}
              .title=${entityBaseError.error_message}
            ></ha-alert>`
          : nothing
        : nothing}
      <ha-expansion-panel
        header=${localizeFunction("entity.name_title")}
        secondary=${localizeFunction("entity.name_description")}
        expanded
        .noCollapse=${true}
      >
        <knx-device-picker
          .hass=${hass}
          .key=${"entity.device_info"}
          .helper=${localizeFunction("entity.device_description")}
          .value=${entityConfig.device_info ?? undefined}
          @value-changed=${updateConfig}
        ></knx-device-picker>
        <ha-selector-text
          .hass=${hass}
          label=${localizeFunction("entity.entity_label")}
          helper=${localizeFunction("entity.entity_description")}
          .required=${!device}
          .selector=${{
            text: { type: "text", prefix: deviceName },
          }}
          .key=${"entity.name"}
          .value=${entityConfig.name}
          @value-changed=${updateConfig}
        ></ha-selector-text>
      </ha-expansion-panel>
      <ha-expansion-panel .header=${localizeFunction("entity.entity_category_title")} outlined>
        <ha-selector-select
          .hass=${hass}
          .label=${localizeFunction("entity.entity_category_title")}
          .helper=${localizeFunction("entity.entity_category_description")}
          .required=${false}
          .selector=${{
            select: {
              multiple: false,
              custom_value: false,
              mode: "dropdown",
              options: [
                {
                  value: "config",
                  label: hass.localize("ui.panel.config.devices.entities.config"),
                },
                {
                  value: "diagnostic",
                  label: hass.localize("ui.panel.config.devices.entities.diagnostic"),
                },
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
