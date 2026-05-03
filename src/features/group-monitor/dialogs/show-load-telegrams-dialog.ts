import { fireEvent } from "@ha/common/dom/fire_event";
import type { HomeAssistant } from "@ha/types";
import type { LoadTelegramsDialogParams } from "./load-telegrams-dialog";
import type { KNX } from "../../../types/knx";

export const loadLoadTelegramsDialog = () => import("./load-telegrams-dialog");

export const showLoadTelegramsDialog = (
  element: HTMLElement & { hass: HomeAssistant; knx: KNX },
  params: LoadTelegramsDialogParams,
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "knx-load-telegrams-dialog",
    dialogImport: loadLoadTelegramsDialog,
    dialogParams: params,
  });
};
