import { describe, expect, it, vi } from "vitest";
import { render } from "lit";

import type { ShowToastParams } from "@ha/managers/notification-manager";

import { createMockHass } from "../../test/helpers/mock-hass";
import type { KNX } from "../types/knx";
import type { KnxReadResponse } from "../types/websocket";

import { KnxSendDialog } from "./knx-send-dialog";

const ADDRESS = "1/2/3";

const translations: Record<string, string> = {
  "component.knx.config_panel.dialogs.send.read_response":
    "Response from {source} for {address}: {value}",
};

const localize = (key: string, replace?: Record<string, string>) =>
  (translations[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => replace?.[name] ?? "");

const readResponse = (overrides: Partial<KnxReadResponse>): KnxReadResponse => ({
  dpt_main: null,
  dpt_sub: null,
  dpt_name: null,
  payload: 1,
  source: "1.1.5",
  source_name: "",
  unit: null,
  value: null,
  ...overrides,
});

const createDialog = () => {
  const hass = createMockHass();
  const callService = vi.fn();
  (hass as any).callService = callService;
  const knx = { localize } as unknown as KNX;
  const dialog = new KnxSendDialog();
  dialog.params = { hass, knx };
  dialog.hass = hass;
  dialog.knx = knx;

  const toasts: ShowToastParams[] = [];
  dialog.addEventListener("hass-notification", (ev) => {
    toasts.push((ev as CustomEvent<ShowToastParams>).detail);
  });

  const container = document.createElement("div");
  render((dialog as any).render(), container, { host: dialog });
  container
    .querySelector("knx-group-address-selector")!
    .dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: { write: ADDRESS, dpt: "9.001" } } }),
    );
  render((dialog as any).render(), container, { host: dialog });
  // Footer order: cancel, read, write.
  const readButton = container.querySelectorAll("ha-button")[1];

  const read = async () => {
    readButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(callService).toHaveBeenCalled());
    // Let the awaited service call settle before inspecting the toasts.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  };

  return { dialog, callService, toasts, read };
};

describe("knx-send-dialog read", () => {
  it("requests the response and shows it in a toast", async () => {
    const { callService, toasts, read } = createDialog();
    callService.mockResolvedValue({
      context: { id: "" },
      response: readResponse({ value: 21.5, unit: "°C", source_name: "Thermostat" }),
    });

    await read();

    expect(callService).toHaveBeenCalledWith(
      "knx",
      "read",
      { address: ADDRESS },
      undefined,
      true,
      true,
    );
    expect(toasts).toEqual([{ message: "Response from 1.1.5 (Thermostat) for 1/2/3: 21.5 °C" }]);
  });

  it("falls back to the raw payload when the response can't be decoded", async () => {
    const { callService, toasts, read } = createDialog();
    callService.mockResolvedValue({
      context: { id: "" },
      response: readResponse({ payload: [0x0c, 0x1a] }),
    });

    await read();

    expect(toasts).toEqual([{ message: "Response from 1.1.5 for 1/2/3: 0x0c1a" }]);
  });

  it("shows nothing itself when the call fails, since HA already shows the error", async () => {
    const { callService, toasts, read } = createDialog();
    callService.mockRejectedValue(new Error("No response received"));

    await read();

    expect(toasts).toEqual([]);
  });

  it("fires the toast on the element hosting the dialog, which outlives it", async () => {
    const { dialog, callService, read } = createDialog();
    callService.mockResolvedValue({
      context: { id: "" },
      response: readResponse({ value: true }),
    });
    const host = document.createElement("div");
    const toasts: ShowToastParams[] = [];
    host.addEventListener("hass-notification", (ev) => {
      toasts.push((ev as CustomEvent<ShowToastParams>).detail);
    });
    // Dialogs are appended to the panel's shadow root; attaching for real would render HA components.
    vi.spyOn(dialog, "getRootNode").mockReturnValue(host.attachShadow({ mode: "open" }));

    await read();

    expect(toasts).toEqual([{ message: "Response from 1.1.5 for 1/2/3: true" }]);
  });
});
