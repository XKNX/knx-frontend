import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "lit";
import { TelegramRow } from "../types/telegram-row";
import { KNXGroupMonitor, migrateStoredColumns } from "./group-monitor-view";

vi.mock("@lit-labs/virtualizer", () => ({}));

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock("@ha/common/navigate", async (importOriginal) => ({
  ...(await importOriginal()),
  navigate: navigateMock,
}));

describe("KNXGroupMonitor", () => {
  let element: KNXGroupMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    element = new KNXGroupMonitor();
    element.knx = {
      localize: vi.fn((key) => key),
      connectionInfo: { telegram_retention: 10 },
      projectInfo: null,
    } as any;
    element.hass = {
      callWS: vi.fn(),
      connected: true,
      localize: vi.fn((key) => key),
    } as any;
  });

  afterEach(() => {
    delete (window.parent as { customPanel?: HTMLElement }).customPanel;
  });

  it("opens the ETS project upload dialog from the missing-project alert", () => {
    let dialogEvent: CustomEvent | undefined;
    element.addEventListener("show-dialog", (event) => {
      dialogEvent = event as CustomEvent;
    });
    const container = document.createElement("div");
    render((element as any).render(), container, { host: element });

    const uploadButton = container.querySelector("ha-alert ha-button") as HTMLElement | null;
    expect(uploadButton).not.toBeNull();
    uploadButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    expect(dialogEvent?.detail).toMatchObject({
      dialogTag: "knx-project-upload-dialog",
      dialogParams: { hass: element.hass },
    });
  });

  it("dismisses the missing-project alert", () => {
    const container = document.createElement("div");
    render((element as any).render(), container, { host: element });

    const dismissButton = container.querySelector("ha-alert ha-icon-button") as HTMLElement | null;
    expect(dismissButton).not.toBeNull();
    dismissButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    render((element as any).render(), container, { host: element });

    expect(container.querySelector("ha-alert")).toBeNull();
  });

  it("applies a selected time range with the configured retention", () => {
    const mockController = { applyTimeRangeFilter: vi.fn() };
    (element as any).controller = mockController;

    (element as any)._handleTimeRangeChanged({ detail: { startMs: 1000, endMs: 2000 } });

    expect(mockController.applyTimeRangeFilter).toHaveBeenCalledWith(element.hass, 1000, 2000, 10);
  });

  it("releases the time-range filter when cleared", () => {
    const mockController = { clearTimeRangeFilter: vi.fn() };
    (element as any).controller = mockController;

    (element as any)._handleTimeRangeCleared();

    expect(mockController.clearTimeRangeFilter).toHaveBeenCalled();
  });

  it("pause button clears the absolute time range instead of toggling pause", async () => {
    const mockController = {
      hasAbsoluteTimeRange: true,
      clearTimeRangeFilter: vi.fn(),
      togglePause: vi.fn(),
    };
    (element as any).controller = mockController;

    await (element as any)._handlePauseToggle();

    expect(mockController.clearTimeRangeFilter).toHaveBeenCalled();
    expect(mockController.togglePause).not.toHaveBeenCalled();
  });

  it("pause button toggles pause normally without an absolute range", async () => {
    const mockController = {
      hasAbsoluteTimeRange: false,
      clearTimeRangeFilter: vi.fn(),
      togglePause: vi.fn(),
    };
    (element as any).controller = mockController;

    await (element as any)._handlePauseToggle();

    expect(mockController.togglePause).toHaveBeenCalled();
    expect(mockController.clearTimeRangeFilter).not.toHaveBeenCalled();
  });

  it("maps history warning codes to localized text", () => {
    expect((element as any)._historyWarningText("retention_clamped")).toBe(
      "group_monitor_time_range_retention_clamped",
    );
    expect((element as any)._historyWarningText("partial_load")).toBe(
      "group_monitor_time_range_partial",
    );
    expect((element as any)._historyWarningText(null)).toBeUndefined();
  });

  it("should clear telegrams when _handleClearRows is called", () => {
    const mockController = {
      clearTelegrams: vi.fn(),
    };
    (element as any).controller = mockController;

    (element as any)._handleClearRows();

    expect(mockController.clearTelegrams).toHaveBeenCalled();
  });

  describe("migrateStoredColumns", () => {
    it("inserts the offset column right after timestampIso for both layouts", () => {
      const migrated = migrateStoredColumns({
        wide: { columnOrder: ["timestampIso", "sourceAddress", "value"] },
        narrow: { columnOrder: ["sourceAddress", "timestampIso", "type"] },
      });

      expect(migrated?.wide?.columnOrder).toEqual([
        "timestampIso",
        "offset",
        "sourceAddress",
        "value",
      ]);
      expect(migrated?.narrow?.columnOrder).toEqual([
        "sourceAddress",
        "timestampIso",
        "offset",
        "type",
      ]);
    });

    it("preserves hiddenColumns while migrating the order", () => {
      const migrated = migrateStoredColumns({
        wide: { columnOrder: ["timestampIso", "value"], hiddenColumns: ["payload"] },
      });

      expect(migrated?.wide?.hiddenColumns).toEqual(["payload"]);
    });

    it("does not add offset again if it is already present", () => {
      const stored = { wide: { columnOrder: ["timestampIso", "offset", "sourceAddress"] } };

      const migrated = migrateStoredColumns(stored);

      // Unchanged input is returned by reference (no rewrite to storage).
      expect(migrated).toBe(stored);
    });

    it("leaves a column order without timestampIso untouched", () => {
      const stored = { wide: { columnOrder: ["sourceAddress", "value"] } };

      const migrated = migrateStoredColumns(stored);

      expect(migrated).toBe(stored);
    });

    it("is a no-op when nothing is stored", () => {
      expect(migrateStoredColumns(undefined)).toBeUndefined();
    });
  });

  describe("actions column", () => {
    it("keeps the labeled actions column fixed at the end", () => {
      const columns = (element as any)._columns(false, true, "en");
      expect(columns.actions).toMatchObject({
        label: "ui.panel.config.generic.headers.actions",
        lastFixed: true,
        type: "overflow-menu",
      });
    });

    it("opens the automation editor from a row action", () => {
      const row = new TelegramRow({
        timestamp: "2026-09-06T12:00:00Z",
        source: "1.1.1",
        source_name: "",
        destination: "1/2/3",
        destination_name: "Ceiling Light",
        telegramtype: "GroupValueWrite",
        direction: "Incoming",
        payload: [1],
        dpt_main: null,
        dpt_sub: null,
        dpt_name: null,
        value: "On",
        unit: null,
      });
      const customPanel = document.createElement("div");
      let editorEvent: CustomEvent | undefined;
      customPanel.addEventListener("hass-automation-editor", (event) => {
        editorEvent = event as CustomEvent;
      });
      (window.parent as { customPanel?: HTMLElement }).customPanel = customPanel;
      const container = document.createElement("div");
      const columns = (element as any)._columns(false, true, "en");

      render(columns.actions.template(row), container, { host: element });
      const menu = container.querySelector("ha-icon-overflow-menu") as HTMLElement & {
        items: { action: () => void }[];
      };
      menu.items[0].action();

      expect(editorEvent?.detail.data).toMatchObject({
        alias: "KNX: 1/2/3 Ceiling Light",
        triggers: [{ trigger: "knx.telegram", options: { destination: ["1/2/3"] } }],
      });
    });

    it("offers a binary sensor for DPT 1 telegrams", () => {
      const row = new TelegramRow({
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
        value: "On",
        unit: null,
      });

      const items = (element as any)._telegramRowMenuItems(row);

      expect(items.map((item) => item.label)).toEqual([
        "ui.panel.config.automation.picker.add_automation",
        "project_view_menu_create_binary_sensor",
      ]);
      items[1].action();
      expect(navigateMock).toHaveBeenCalledWith(
        "/knx/entities/create/binary_sensor?knx.ga_sensor.state=1/2/3",
      );
    });

    it("offers a sensor for numeric telegrams", () => {
      element.knx.dptMetadata = {
        "9.001": { dpt_class: "numeric" },
      } as any;
      const row = new TelegramRow({
        timestamp: "2026-09-06T12:00:00Z",
        source: "1.1.1",
        source_name: "",
        destination: "1/2/3",
        destination_name: "",
        telegramtype: "GroupValueWrite",
        direction: "Incoming",
        payload: [1],
        dpt_main: 9,
        dpt_sub: 1,
        dpt_name: "Temperature",
        value: "20",
        unit: "°C",
      });

      const items = (element as any)._telegramRowMenuItems(row);

      expect(items.map((item) => item.label)).toEqual([
        "ui.panel.config.automation.picker.add_automation",
        "project_view_menu_create_sensor",
      ]);
      items[1].action();
      expect(navigateMock).toHaveBeenCalledWith(
        "/knx/entities/create/sensor?knx.ga_sensor.state=1/2/3&knx.ga_sensor.dpt=9.001",
      );
    });
  });
});
