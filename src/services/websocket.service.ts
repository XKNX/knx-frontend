import { HomeAssistant } from "@ha/types";
import {
  SettingsInfoData,
  KNXInfoData,
  TelegramDict,
  GatewayDescriptor,
  GroupMonitorInfoData,
  ConfigEntryData,
} from "../types/websocket";

// INFO

export const getKnxInfoData = (hass: HomeAssistant): Promise<KNXInfoData> =>
  hass.callWS({
    type: "knx/info",
  });

export const processProjectFile = (
  hass: HomeAssistant,
  file_id: string,
  password: string,
): Promise<void> =>
  hass.callWS({
    type: "knx/project_file_process",
    file_id: file_id,
    password: password,
  });

export const removeProjectFile = (hass: HomeAssistant): Promise<void> =>
  hass.callWS({
    type: "knx/project_file_remove",
  });

// SETTINGS

export const getSettingsInfoData = (hass: HomeAssistant): Promise<SettingsInfoData> =>
  hass.callWS({
    type: "knx/settings/info",
  });

export const subscribeGatewayScanner = (
  hass: HomeAssistant,
  local_interface: string | null,
  callback: (gateway: GatewayDescriptor) => void,
) =>
  hass.connection.subscribeMessage<GatewayDescriptor>(callback, {
    type: "knx/settings/subscribe_gateway_scanner",
    local_interface: local_interface,
  });

export const processKeyringFile = (
  hass: HomeAssistant,
  file_id: string,
  password: string,
): Promise<void> =>
  hass.callWS({
    type: "knx/settings/keyring_file_process",
    file_id: file_id,
    password: password,
  });

export const removeKeyringFile = (hass: HomeAssistant): Promise<void> =>
  hass.callWS({
    type: "knx/settings/keyring_file_remove",
  });

export const writeConnectionData = (
  hass: HomeAssistant,
  changeset: Partial<ConfigEntryData>,
): Promise<void> =>
  hass.callWS({
    type: "knx/settings/write_config_entry_data",
    changeset: changeset,
  });

// GROUP MONITOR

export const getGroupMonitorInfo = (hass: HomeAssistant): Promise<GroupMonitorInfoData> =>
  hass.callWS({
    type: "knx/group_monitor_info",
  });

export const subscribeKnxTelegrams = (
  hass: HomeAssistant,
  callback: (telegram: TelegramDict) => void,
) =>
  hass.connection.subscribeMessage<TelegramDict>(callback, {
    type: "knx/subscribe_telegrams",
  });
