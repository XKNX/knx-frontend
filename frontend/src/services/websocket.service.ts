import { KnxInfo } from "@typing/websocket";
import { HomeAssistant } from "custom-card-helpers";

export const getKnxInfo = (hass: HomeAssistant): Promise<KnxInfo> =>
  hass.callWS({
    type: "knx_panel/info",
  });
