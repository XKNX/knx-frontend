import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "lit";

import { createMockHass } from "../../test/helpers/mock-hass";
import type { GASchema } from "../types/entity_data";
import type { KNX } from "../types/knx";
import type { PayloadConfigValue } from "../components/knx-payload-selector";

import { KnxSendDialog } from "./knx-send-dialog";

const createDialog = () => {
  const hass = createMockHass();
  (hass as any).callService = vi.fn();
  const knx = { localize: (key: string) => key } as unknown as KNX;
  const dialog = new KnxSendDialog();
  dialog.params = { hass, knx };
  dialog.hass = hass;
  dialog.knx = knx;
  const container = document.createElement("div");
  const rerender = () => {
    render((dialog as any).render(), container, { host: dialog });
    return container;
  };
  rerender();
  return { dialog, hass, container, rerender };
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

  it("remembers the address of the last read", () => {
    const reading = createDialog();
    fillIn(reading, { ga: DIMMER.ga });
    click(readButton(reading.container));
    expect(reading.hass.callService).toHaveBeenCalledWith(
      "knx",
      "read",
      { address: "4/5/6" },
      undefined,
      true,
      false,
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
