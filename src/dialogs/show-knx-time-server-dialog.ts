import { fireEvent } from "@ha/common/dom/fire_event";
import type { KnxTimeServerDialogParams } from "./knx-time-server-dialog";

export const loadKnxTimeServerDialog = () => import("./knx-time-server-dialog");

export const showKnxTimeServerDialog = (
  element: HTMLElement,
  dialogParams: KnxTimeServerDialogParams,
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "knx-time-server-dialog",
    dialogImport: loadKnxTimeServerDialog,
    dialogParams,
  });
};
