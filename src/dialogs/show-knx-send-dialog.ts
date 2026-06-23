import { fireEvent } from "@ha/common/dom/fire_event";
import type { KnxTimeServerDialogParams } from "./knx-time-server-dialog";

export const loadKnxSendDialog = () => import("./knx-send-dialog");

export const showKnxSendDialog = (
  element: HTMLElement,
  dialogParams: KnxTimeServerDialogParams,
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "knx-send-dialog",
    dialogImport: loadKnxSendDialog,
    dialogParams,
  });
};
