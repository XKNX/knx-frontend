import { HomeAssistant } from "@ha/types";
import { KNXInfo, KNXTelegram, GroupMonitorInfo } from "../types/websocket";

export const getKnxInfo = (hass: HomeAssistant): Promise<KNXInfo> =>
  hass.callWS({
    type: "knx/info",
  });

export const processProjectFile = (
  hass: HomeAssistant,
  file_id: string,
  password: string
): Promise<void> =>
  hass.callWS({
    type: "knx/process_project_file",
    file_id: file_id,
    password: password,
  });

export const getGroupMonitorInfo = (hass: HomeAssistant): Promise<GroupMonitorInfo> =>
  hass.callWS({
    type: "knx/group_monitor_info",
  });

export const subscribeKnxTelegrams = (
  hass: HomeAssistant,
  callback: (telegram: KNXTelegram) => void
) =>
  hass.connection.subscribeMessage<KNXTelegram>(callback, {
    type: "knx/subscribe_telegrams",
  });
