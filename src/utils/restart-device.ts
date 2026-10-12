import { showConfirmationDialog } from "@ha/dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "@ha/types";
import { showToast } from "@ha/util/toast";

import { restartDevice } from "../services/websocket.service";
import type { KNX } from "../types/knx";

export interface RestartableDevice {
  ia: string;
  name: string;
}

// area.line.device: 0-15, 0-15, 0-255 (device 0 is a coupler)
const INDIVIDUAL_ADDRESS =
  /^(?:1[0-5]|[0-9])\.(?:1[0-5]|[0-9])\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/;

/** Whether `ia` is an individual address a restart can be sent to. */
export const isRestartableAddress = (ia: string): boolean => INDIVIDUAL_ADDRESS.test(ia);

const errorMessage = (err: unknown): string => {
  // HA rejects service calls with `{ code, message }`, not with an Error
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : String(err);
};

/**
 * Asks for confirmation, then sends a basic restart to the device through the
 * `knx.restart_device` action and reports the result in a toast. A basic
 * restart is not confirmed by the device, so success means "sent".
 * Never rejects; failures are shown in the toast.
 */
export const confirmAndRestartDevice = async (
  element: HTMLElement,
  hass: HomeAssistant,
  knx: KNX,
  device: RestartableDevice,
): Promise<void> => {
  const confirmed = await showConfirmationDialog(element, {
    title: knx.localize("component.knx.config_panel.project.devices.restart.title"),
    text: knx.localize("component.knx.config_panel.project.devices.restart.text", {
      name: device.name || device.ia,
      address: device.ia,
    }),
    confirmText: knx.localize("component.knx.config_panel.project.devices.restart.confirm"),
    dismissText: knx.localize("ui.common.cancel"),
    destructive: true,
  });
  if (!confirmed) {
    return;
  }
  try {
    await restartDevice(hass, device.ia);
  } catch (err) {
    showToast(element, { message: errorMessage(err) });
    return;
  }
  showToast(element, {
    message: knx.localize("component.knx.config_panel.project.devices.restart.sent", {
      address: device.ia,
    }),
  });
};
