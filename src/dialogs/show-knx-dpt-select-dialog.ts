import { fireEvent } from "@ha/common/dom/fire_event";
import type { KnxDptSelectDialogParams } from "./knx-dpt-select-dialog";

export const loadKnxDptSelectDialog = () => import("./knx-dpt-select-dialog");

export const showKnxDptSelectDialog = (
  element: HTMLElement,
  dialogParams: KnxDptSelectDialogParams,
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "knx-dpt-select-dialog",
    dialogImport: loadKnxDptSelectDialog,
    dialogParams,
  });
};
