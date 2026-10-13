import { fireEvent } from "@ha/common/dom/fire_event";
import type { KnxReadResponseDialogParams } from "./knx-read-response-dialog";

export const loadKnxReadResponseDialog = () => import("./knx-read-response-dialog");

export const showKnxReadResponseDialog = (
  element: HTMLElement,
  dialogParams: KnxReadResponseDialogParams,
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "knx-read-response-dialog",
    dialogImport: loadKnxReadResponseDialog,
    dialogParams,
  });
};
