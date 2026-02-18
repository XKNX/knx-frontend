import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant } from "@ha/types";
import type { TelegramInfoDialogParams } from "./telegram-info-dialog";
import type { KNX } from "../../../types/knx";

export const loadTelegramInfoDialog = () => import("./telegram-info-dialog");

export const showTelegramInfoDialog = (
  element: HTMLElement & { hass: HomeAssistant; knx: KNX },
  params: TelegramInfoDialogParams,
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "knx-group-monitor-telegram-info-dialog",
    dialogImport: loadTelegramInfoDialog,
    dialogParams: params,
  });
};
