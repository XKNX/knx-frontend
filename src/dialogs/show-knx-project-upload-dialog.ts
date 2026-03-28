import { fireEvent } from "@ha/common/dom/fire_event";
import type { KnxProjectUploadDialogParams } from "./knx-project-upload-dialog";

export const loadKnxProjectUploadDialog = () => import("./knx-project-upload-dialog");

export const showKnxProjectUploadDialog = (
  element: HTMLElement,
  dialogParams: KnxProjectUploadDialogParams,
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "knx-project-upload-dialog",
    dialogImport: loadKnxProjectUploadDialog,
    dialogParams,
  });
};
