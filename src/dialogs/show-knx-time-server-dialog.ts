import { fireEvent } from "@ha/common/dom/fire_event";
import type { KnxTimeServerDialogParams } from "./knx-time-server-dialog";
import type { KNX } from "../types/knx";

export const loadKnxTimeServerDialog = () => import("./knx-time-server-dialog");

export const showKnxTimeServerDialog = (element: HTMLElement & { knx: KNX }): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "knx-time-server-dialog",
    dialogImport: loadKnxTimeServerDialog,
    dialogParams: {
      knx: element.knx,
    } satisfies KnxTimeServerDialogParams,
  });
};
