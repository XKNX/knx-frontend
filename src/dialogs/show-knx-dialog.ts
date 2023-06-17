import { fireEvent } from "@ha/common/dom/fire_event";
import { KNXLogger } from "../tools/knx-logger";

const logger = new KNXLogger("show-knx-dialog");

export interface TelegramInfoDialogParams {
  rowId: number | null;
}
export const loadKnxTelegramInfoDialog = () => import("./knx-telegram-info-dialog");

export const showTelegramInfoDialog = (
  element: HTMLElement,
  dialogParams: TelegramInfoDialogParams
): void => {
  logger.debug("showTelegramInfoDialog", dialogParams);
  fireEvent(element, "show-dialog", {
    dialogTag: "knx-telegram-info-dialog",
    dialogImport: loadKnxTelegramInfoDialog,
    dialogParams: {
      ...dialogParams,
      dialogParentElement: element,
    },
  });
};
