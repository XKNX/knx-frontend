import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "lit";

import type { ShowToastParams } from "@ha/managers/notification-manager";

import { createMockHass } from "../../test/helpers/mock-hass";
import type { GASchema } from "../types/entity_data";
import type { KNX } from "../types/knx";
import type { KnxReadResponse } from "../types/websocket";
import type { PayloadConfigValue } from "../components/knx-payload-selector";

import { KnxSendDialog } from "./knx-send-dialog";

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
  const callService = vi.fn<
    (...args: unknown[]) => Promise<{ context: { id: string }; response?: KnxReadResponse }>
  >(() => Promise.resolve({ context: { id: "" } }));
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
  const rerender = () => {
    render((dialog as any).render(), container, { host: dialog });
    return container;
  };
  rerender();
  return { dialog, hass, callService, toasts, container, rerender };
};

type Rendered = ReturnType<typeof createDialog>;

const gaSelector = (container: HTMLElement) =>
  container.querySelector("knx-group-address-selector") as HTMLElement & { config: GASchema };

const payloadSelector = (container: HTMLElement) =>
  container.querySelector("knx-payload-selector") as HTMLElement & {
    value?: PayloadConfigValue;
  };

const responseRow = (container: HTMLElement) =>
  container.querySelector("knx-selector-row") as HTMLElement & { value?: boolean };

const buttons = (container: HTMLElement) =>
  [...container.querySelectorAll("ha-button")] as (HTMLElement & { disabled: boolean })[];

// Footer order: cancel, read, write.
const cancelButton = (container: HTMLElement) => buttons(container)[0];
const readButton = (container: HTMLElement) => buttons(container)[1];
const writeButton = (container: HTMLElement) => buttons(container)[2];

// ha-button.click() forwards to an inner button that is not rendered while detached.
const click = (element: HTMLElement) =>
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

// Lets the awaited read service call settle before inspecting the toasts.
const read = async (rendered: Rendered) => {
  click(readButton(rendered.container));
  await vi.waitFor(() => expect(rendered.callService).toHaveBeenCalled());
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

const change = ({ rerender }: Rendered, element: HTMLElement, value: unknown) => {
  element.dispatchEvent(new CustomEvent("value-changed", { detail: { value } }));
  rerender();
};

const fillIn = (
  rendered: Rendered,
  { ga, data, response }: { ga?: GASchema; data?: PayloadConfigValue; response?: boolean },
) => {
  const { container } = rendered;
  if (ga !== undefined) change(rendered, gaSelector(container), ga);
  if (data !== undefined) change(rendered, payloadSelector(container), data);
  if (response !== undefined) change(rendered, responseRow(container), response);
};

const prefilled = ({ container }: Rendered) => ({
  ga: gaSelector(container).config,
  data: payloadSelector(container).value,
  response: responseRow(container).value,
});

const LIGHT = { ga: { write: "1/2/3", dpt: "1.001" }, data: { value: true }, response: true };
const DIMMER = { ga: { write: "4/5/6", dpt: "5.001" }, data: { value: 42 }, response: false };

describe("knx-send-dialog", () => {
  // Each test starts from a known state - the memory is module-wide.
  beforeEach(() => {
    const rendered = createDialog();
    fillIn(rendered, LIGHT);
    click(writeButton(rendered.container));
  });

  it("sends the entered values", () => {
    const rendered = createDialog();
    fillIn(rendered, DIMMER);
    click(writeButton(rendered.container));

    expect(rendered.hass.callService).toHaveBeenCalledWith(
      "knx",
      "send",
      { address: "4/5/6", payload: 42, type: "5.001", response: false },
      undefined,
      true,
      false,
    );
  });

  it("reopens prefilled with the values of the last write", () => {
    const rendered = createDialog();

    expect(prefilled(rendered)).toEqual(LIGHT);
    expect(readButton(rendered.container).disabled).toBe(false);
    expect(writeButton(rendered.container).disabled).toBe(false);
  });

  it("writes the prefilled values again without further input", () => {
    const rendered = createDialog();
    click(writeButton(rendered.container));

    expect(rendered.hass.callService).toHaveBeenCalledWith(
      "knx",
      "send",
      { address: "1/2/3", payload: true, type: "1.001", response: true },
      undefined,
      true,
      false,
    );
  });

  it("remembers the address of the last read", async () => {
    const reading = createDialog();
    reading.callService.mockResolvedValue({
      context: { id: "" },
      response: readResponse({ value: 42, unit: "%" }),
    });
    fillIn(reading, { ga: DIMMER.ga });
    await read(reading);
    expect(reading.hass.callService).toHaveBeenCalledWith(
      "knx",
      "read",
      { address: "4/5/6" },
      undefined,
      true,
      true,
    );

    expect(prefilled(createDialog()).ga).toEqual(DIMMER.ga);
  });

  it("keeps the last used values when a dialog is cancelled", () => {
    const cancelled = createDialog();
    fillIn(cancelled, DIMMER);
    click(cancelButton(cancelled.container));
    expect(cancelled.hass.callService).not.toHaveBeenCalled();

    expect(prefilled(createDialog())).toEqual(LIGHT);
  });

  it("does not share its values with the next dialog until they are used", () => {
    const edited = createDialog();
    fillIn(edited, { ga: DIMMER.ga });

    expect(prefilled(createDialog()).ga).toEqual(LIGHT.ga);
  });
});

describe("knx-send-dialog read", () => {
  it("shows the received response in a toast", async () => {
    const rendered = createDialog();
    rendered.callService.mockResolvedValue({
      context: { id: "" },
      response: readResponse({ value: 21.5, unit: "°C", source_name: "Thermostat" }),
    });
    fillIn(rendered, { ga: { write: "1/2/3", dpt: "9.001" } });

    await read(rendered);

    expect(rendered.toasts).toEqual([
      { message: "Response from 1.1.5 (Thermostat) for 1/2/3: 21.5 °C" },
    ]);
  });

  it("falls back to the raw payload when the response can't be decoded", async () => {
    const rendered = createDialog();
    rendered.callService.mockResolvedValue({
      context: { id: "" },
      response: readResponse({ payload: [0x0c, 0x1a] }),
    });
    fillIn(rendered, { ga: { write: "1/2/3" } });

    await read(rendered);

    expect(rendered.toasts).toEqual([{ message: "Response from 1.1.5 for 1/2/3: 0x0c1a" }]);
  });

  it("shows nothing itself when the call fails, since HA already shows the error", async () => {
    const rendered = createDialog();
    rendered.callService.mockRejectedValue(new Error("No response received"));
    fillIn(rendered, { ga: { write: "1/2/3" } });

    await read(rendered);

    expect(rendered.toasts).toEqual([]);
  });
});
