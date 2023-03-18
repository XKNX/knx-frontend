import { HomeAssistant } from "@ha/types";
import { KNXInfo, KNXTelegram } from "../types/websocket";

export const getKnxInfo = (hass: HomeAssistant): Promise<KNXInfo> =>
  hass.callWS({
    type: "knx/info",
  });

export const subscribeKnxTelegrams = (
  hass: HomeAssistant,
  callback: (telegram: KNXTelegram) => void
) =>
  hass.connection.subscribeMessage<KNXTelegram>(callback, {
    type: "knx/subscribe_telegrams",
  });
