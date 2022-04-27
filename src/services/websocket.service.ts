import { KNXInfo, KNXTelegram } from "@typing/websocket";
import { HomeAssistant } from "custom-card-helpers";

export const getKnxInfo = (hass: HomeAssistant): Promise<KNXInfo> =>
  hass.callWS({
    type: "knx_panel/info",
  });

export const subscribeKnxTelegrams = (
  hass: HomeAssistant,
  callback: (telegram: KNXTelegram) => void
) =>
  hass.connection.subscribeMessage<KNXTelegram>(callback, {
    type: "knx_panel/subscribe_telegrams",
  });
