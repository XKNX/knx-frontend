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

  it("lists the entities and exposes using the destination address", async () => {
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
    const dialog = new GroupMonitorTelegramInfoDialog();
    dialog.hass = { localize: vi.fn((key) => key) } as any;
    const entity = { entity_id: "light.ceiling", ui: true, disabled: false };
    (dialog as any)._entitiesByGroupCtx = { groups: { "1/2/3": [entity] } };
    // the backend maps expose entity ids to their group addresses
    (dialog as any)._exposeGroupsCtx = {
      groups: {
        "sensor.outdoor": [
          { ga: "1/2/3", ui: true },
          { ga: "1/2/3", ui: false },
        ],
        "sensor.other": [{ ga: "9/9/9", ui: true }],
      },
    };

    await dialog.showDialog({
      knx: { localize: vi.fn((key) => key) } as any,
      telegram,
      narrow: false,
      filteredTelegrams: [telegram],
    });
    const container = document.createElement("div");
    render((dialog as any).render(), container, { host: dialog });
    const related = container.querySelector("knx-data-table-related-label") as any;

    expect(related.entities).toEqual([entity]);
    expect(related.exposes).toEqual([
      { entity_id: "sensor.outdoor", ui: true },
      { entity_id: "sensor.outdoor", ui: false },
    ]);
  });
});
