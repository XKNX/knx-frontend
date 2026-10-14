import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "lit";
import { TelegramRow } from "../types/telegram-row";
import { GroupMonitorTelegramInfoDialog } from "./telegram-info-dialog";

afterEach(() => {
  delete (window.parent as { customPanel?: HTMLElement }).customPanel;
});

describe("GroupMonitorTelegramInfoDialog", () => {
  it("opens the automation editor for the shown telegram and closes", async () => {
    const telegram = new TelegramRow({
      timestamp: "2026-09-06T12:00:00Z",
      source: "1.1.1",
      source_name: "Wall switch",
      destination: "1/2/3",
      destination_name: "Ceiling Light",
      telegramtype: "GroupValueWrite",
      direction: "Incoming",
      payload: [1],
      dpt_main: 1,
      dpt_sub: 1,
      dpt_name: "Switch",
      value: "On",
      unit: null,
    });
    const customPanel = document.createElement("div");
    let editorEvent: CustomEvent | undefined;
    customPanel.addEventListener("hass-automation-editor", (event) => {
      editorEvent = event as CustomEvent;
    });
    (window.parent as { customPanel?: HTMLElement }).customPanel = customPanel;
    const dialog = new GroupMonitorTelegramInfoDialog();
    dialog.hass = { localize: vi.fn((key) => key) } as any;
    let closed = false;
    dialog.addEventListener("dialog-closed", () => {
      closed = true;
    });

    await dialog.showDialog({
      knx: { localize: vi.fn((key) => key) } as any,
      telegram,
      narrow: false,
      filteredTelegrams: [telegram],
    });
    const container = document.createElement("div");
    render((dialog as any).render(), container, { host: dialog });
    const automationButton = container.querySelector('ha-button[appearance="filled"]')!;
    automationButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    expect(editorEvent?.detail.data).toMatchObject({
      alias: "KNX: 1/2/3 Ceiling Light",
      triggers: [{ trigger: "knx.telegram", options: { destination: ["1/2/3"] } }],
    });
    expect(closed).toBe(true);

    editorEvent = undefined;
    automationButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(editorEvent).toBeUndefined();
  });

  it.each([
    { name: "a warning instead of the value for an undecoded telegram", value: null, alert: true },
    { name: "the value for a decoded telegram", value: "On", alert: false },
  ])("shows $name", async ({ value, alert }) => {
    const telegram = new TelegramRow({
      timestamp: "2026-09-06T12:00:00Z",
      source: "1.1.1",
      source_name: "",
      destination: "1/2/3",
      destination_name: "",
      telegramtype: "GroupValueWrite",
      direction: "Incoming",
      payload: [1],
      dpt_main: 1,
      dpt_sub: 1,
      dpt_name: "Switch",
      value,
      unit: null,
    });
    const dialog = new GroupMonitorTelegramInfoDialog();
    dialog.hass = { localize: vi.fn((key) => key) } as any;

    await dialog.showDialog({
      knx: { localize: vi.fn((key) => key) } as any,
      telegram,
      narrow: false,
      filteredTelegrams: [telegram],
    });
    const container = document.createElement("div");
    render((dialog as any).render(), container, { host: dialog });

    expect(container.querySelector('ha-alert[alert-type="warning"]') !== null).toBe(alert);
    expect(container.querySelector(".value-section") !== null).toBe(!alert);
    expect(container.querySelector(".direction-badge")!.textContent!.includes("⚠️")).toBe(alert);
  });
});
