import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant } from "@ha/types";
import type { KnxDeviceCreateDialogParams } from "./knx-device-create-dialog";

export const loadKnxDeviceCreateDialog = () => import("./knx-device-create-dialog");

export const showKnxDeviceCreateDialog = (
  element: HTMLElement & { hass: HomeAssistant },
  params?: KnxDeviceCreateDialogParams,
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "knx-device-create-dialog",
    dialogImport: loadKnxDeviceCreateDialog,
    dialogParams: params || {},
  });
};
