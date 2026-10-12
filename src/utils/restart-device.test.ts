import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeAssistant } from "@ha/types";

import type { KNX } from "../types/knx";
import { confirmAndRestartDevice, isRestartableAddress } from "./restart-device";

const mocks = vi.hoisted(() => ({
  showConfirmationDialog: vi.fn(),
  showToast: vi.fn(),
}));
vi.mock("@ha/dialogs/generic/show-dialog-box", () => ({
  showConfirmationDialog: mocks.showConfirmationDialog,
}));
vi.mock("@ha/util/toast", () => ({ showToast: mocks.showToast }));

const localize = (key: string, replace?: Record<string, unknown>) =>
  replace ? `${key} ${JSON.stringify(replace)}` : key;
const knx = { localize } as unknown as KNX;

describe("isRestartableAddress", () => {
  it.each([
    ["1.1.5", true],
    ["1.1.0", true],
    ["15.15.255", true],
    ["0.0.1", true],
    ["", false],
    ["1.1", false],
    ["1.1.256", false],
    ["16.0.1", false],
    ["1/1/5", false],
    ["1.1.-", false],
    [" 1.1.5", false],
  ])("%j -> %s", (ia, expected) => {
    expect(isRestartableAddress(ia)).toBe(expected);
  });
});

describe("confirmAndRestartDevice", () => {
  let element: HTMLElement;
  let callService: ReturnType<typeof vi.fn>;
  let hass: HomeAssistant;

  beforeEach(() => {
    mocks.showConfirmationDialog.mockReset();
    mocks.showToast.mockReset();
    element = document.createElement("div");
    callService = vi.fn(() => Promise.resolve({ context: {} }));
    hass = { callService } as unknown as HomeAssistant;
  });

  it("does nothing when the dialog is dismissed", async () => {
    mocks.showConfirmationDialog.mockResolvedValue(false);

    await confirmAndRestartDevice(element, hass, knx, { ia: "1.1.5", name: "Switch" });

    expect(callService).not.toHaveBeenCalled();
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it("asks with name and address, restarts and confirms with a toast", async () => {
    mocks.showConfirmationDialog.mockResolvedValue(true);

    await confirmAndRestartDevice(element, hass, knx, { ia: "1.1.5", name: "Switch" });

    expect(mocks.showConfirmationDialog).toHaveBeenCalledWith(element, {
      title: "component.knx.config_panel.project.devices.restart.title",
      text: 'component.knx.config_panel.project.devices.restart.text {"name":"Switch","address":"1.1.5"}',
      confirmText: "component.knx.config_panel.project.devices.restart.confirm",
      dismissText: "ui.common.cancel",
      destructive: true,
    });
    expect(callService).toHaveBeenCalledWith(
      "knx",
      "restart_device",
      { individual_address: "1.1.5" },
      undefined,
      true,
    );
    expect(mocks.showToast).toHaveBeenCalledWith(element, {
      message: 'component.knx.config_panel.project.devices.restart.sent {"address":"1.1.5"}',
    });
  });

  it("falls back to the address when the device has no name", async () => {
    mocks.showConfirmationDialog.mockResolvedValue(false);

    await confirmAndRestartDevice(element, hass, knx, { ia: "1.1.5", name: "" });

    expect(mocks.showConfirmationDialog.mock.calls[0][1].text).toBe(
      'component.knx.config_panel.project.devices.restart.text {"name":"1.1.5","address":"1.1.5"}',
    );
  });

  it("leaves reporting a failed action call to Home Assistant", async () => {
    mocks.showConfirmationDialog.mockResolvedValue(true);
    // HA rejects service calls with a plain object, not an Error
    callService.mockRejectedValue({
      code: "home_assistant_error",
      message: "KNX device 1.1.5 did not respond.",
    });

    await expect(
      confirmAndRestartDevice(element, hass, knx, { ia: "1.1.5", name: "Switch" }),
    ).resolves.toBeUndefined();

    expect(mocks.showToast).not.toHaveBeenCalled();
  });
});
