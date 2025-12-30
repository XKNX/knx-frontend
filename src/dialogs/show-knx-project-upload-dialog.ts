import { fireEvent } from "@ha/common/dom/fire_event";

export const loadKnxProjectUploadDialog = () => import("./knx-project-upload-dialog");

export const showKnxProjectUploadDialog = (element: HTMLElement): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "knx-project-upload-dialog",
    dialogImport: loadKnxProjectUploadDialog,
    dialogParams: {},
  });
};
