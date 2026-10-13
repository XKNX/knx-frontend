import { describe, expect, it } from "vitest";
import { render } from "lit";

import { createMockHass } from "../../test/helpers/mock-hass";
import type { KNX } from "../types/knx";
import type { KnxReadResponse } from "../types/websocket";

import { KnxReadResponseDialog } from "./knx-read-response-dialog";

const translations: Record<string, string> = {
  "component.knx.config_panel.dialogs.read_response.title": "Read response",
  "component.knx.config_panel.dialogs.telegram_info.value": "Value",
  "component.knx.config_panel.dialogs.telegram_info.source": "Source",
  "component.knx.config_panel.dialogs.telegram_info.payload": "Payload",
  "component.knx.config_panel.common.dpt": "DPT",
};

const readResponse = (overrides: Partial<KnxReadResponse>): KnxReadResponse => ({
  dpt_main: null,
  dpt_sub: null,
  dpt_name: null,
  payload: [0x0c, 0x33],
  source: "1.1.5",
  source_name: "",
  unit: null,
  value: null,
  ...overrides,
});

const renderDialog = (response: KnxReadResponse) => {
  const dialog = new KnxReadResponseDialog();
  dialog.params = {
    hass: createMockHass(),
    knx: { localize: (key: string) => translations[key] ?? key } as unknown as KNX,
    address: "1/2/3",
    response,
  };
  const container = document.createElement("div");
  render((dialog as any).render(), container, { host: dialog });
  return container;
};

const text = (container: HTMLElement, selector: string) =>
  container.querySelector(selector)!.textContent!.replace(/\s+/g, " ").trim();

describe("knx-read-response-dialog", () => {
  it("shows the decoded value with its source, DPT and payload", () => {
    const container = renderDialog(
      readResponse({
        value: 21.5,
        unit: "°C",
        dpt_main: 9,
        dpt_sub: 1,
        dpt_name: "temperature",
        source_name: "MDT Thermostat",
      }),
    );

    expect(text(container, "ha-dialog-header")).toBe("Read response 1/2/3");
    expect(text(container, ".value")).toBe("Value 21.5 °C");
    expect(text(container, ".details")).toBe(
      "Source 1.1.5 MDT Thermostat DPT DPT 9.001 temperature Payload 0x0c33",
    );
  });

  it("shows a placeholder value and no DPT when the payload can't be decoded", () => {
    const container = renderDialog(readResponse({}));

    expect(text(container, ".value")).toBe("Value —");
    expect(text(container, ".details")).toBe("Source 1.1.5 Payload 0x0c33");
  });
});
