import { fireEvent } from "@ha/common/dom/fire_event";
import type { ShowToastParams } from "@ha/managers/notification-manager";

/**
 * Shows a toast via Home Assistant's notification manager.
 *
 * The panel runs in an iframe, so a `hass-notification` event fired inside it never reaches
 * the notification manager in the main window. It is fired on the main window's panel element
 * instead, the same way the HA custom panel entrypoint forwards `hass-toggle-menu`. Without an
 * iframe the event is fired on `element`, which then has to be attached.
 */
export const showToast = (element: HTMLElement, params: ShowToastParams) => {
  const mainWindowPanel = (window.parent as Window & { customPanel?: HTMLElement }).customPanel;
  fireEvent(mainWindowPanel ?? element, "hass-notification", params);
};
