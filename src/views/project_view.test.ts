import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "lit";
import type { HomeAssistant } from "@ha/types";
import { fireEvent } from "@ha/common/dom/fire_event";
import type { KnxTabsSubpageData } from "../layouts/knx-tabs-subpage-data";
import type { KNX } from "../types/knx";
import type { GroupAddress, KNXProject } from "../types/websocket";
import { KNXProjectView } from "./project_view";

/** Renders a disconnected project page to exercise consumer event wiring without backend startup. */
const drawDevices = () => {
  const project: KNXProject = {
    info: { name: "Test", last_modified: "", tool_version: "", xknxproject_version: "3.9.0" },
    group_addresses: {},
    group_ranges: {},
    devices: {},
    communication_objects: {},
  };
  const view = new KNXProjectView();
  view.hass = { localize: (key: string) => key, language: "en" } as HomeAssistant;
  view.knx = { projectInfo: project.info, localize: (key: string) => key, dptMetadata: {} } as KNX;
  view.route = { prefix: "/knx", path: "/project" };
  view.narrow = false;
  Reflect.set(view, "_projectData", project);
  // Direct rendering skips the lifecycle that enables HA's storage setter; keep mode local here.
  Object.defineProperty(view, "_viewMode", { value: "devices", writable: true });
  const host = view.attachShadow({ mode: "open" });
  const update = () => render(view["render"](), host, { host: view });
  update();
  return { view, host, update };
};

afterEach(() => {
  delete (window.parent as { customPanel?: HTMLElement }).customPanel;
});

describe("KNXProjectView", () => {
  it("keeps the shell's filter visibility synchronized across project rerenders", () => {
    const { host, update } = drawDevices();
    const shell = host.querySelector<KnxTabsSubpageData>("knx-tabs-subpage-data");
    expect(shell).not.toBeNull();
    for (const value of [true, false, true]) {
      fireEvent(shell!, "show-filters-changed", { value });
      update();
      expect(shell!.showFilters).toBe(value);
    }
  });

  it("clears device filters through the shell without clearing search or closing filters", () => {
    const { view, host, update } = drawDevices();
    Reflect.set(view, "_devicesSearchText", "Kitchen");
    Reflect.set(view, "_devicesFilterDpt", ["1.001"]);
    Reflect.set(view, "_devicesFilterLine", ["1.1"]);
    Reflect.set(view, "_devicesShowFilters", true);
    update();
    const shell = host.querySelector<KnxTabsSubpageData>("knx-tabs-subpage-data");
    expect(shell).not.toBeNull();
    expect(shell!.activeFilterCount).toBe(2);
    fireEvent(shell!, "clear-filter");
    update();
    const devices = host.querySelector("knx-project-devices-view")!;
    expect(devices.filterDpt).toEqual([]);
    expect(devices.filterLocation).toEqual([]);
    expect(devices.filterLine).toEqual([]);
    expect(devices.searchText).toBe("Kitchen");
    expect(shell!.activeFilterCount).toBe(0);
    expect(shell!.showFilters).toBe(true);
  });

  it("retains device search and filter state when switching to the table and back", () => {
    const { view, host, update } = drawDevices();
    Reflect.set(view, "_devicesSearchText", "Kitchen");
    Reflect.set(view, "_devicesFilterLine", ["1.1"]);
    Reflect.set(view, "_devicesShowFilters", true);
    update();
    host
      .querySelector("ha-button-toggle-group")!
      .dispatchEvent(new CustomEvent("value-changed", { detail: { value: "group_addresses" } }));
    update();
    expect(host.querySelector("hass-tabs-subpage-data-table")).not.toBeNull();
    host
      .querySelector("ha-button-toggle-group")!
      .dispatchEvent(new CustomEvent("value-changed", { detail: { value: "devices" } }));
    update();
    const shell = host.querySelector<KnxTabsSubpageData>("knx-tabs-subpage-data");
    expect(shell).not.toBeNull();
    expect(shell!.showFilters).toBe(true);
    const devices = host.querySelector("knx-project-devices-view")!;
    expect(devices.searchText).toBe("Kitchen");
    expect(devices.filterLine).toEqual(["1.1"]);
  });

  it("uses the same search label for devices and group addresses", () => {
    const { host, update } = drawDevices();
    const devicesSearch = host.querySelector<HTMLElement & { placeholder: string }>(
      "ha-input-search",
    )!.placeholder;
    host
      .querySelector("ha-button-toggle-group")!
      .dispatchEvent(new CustomEvent("value-changed", { detail: { value: "group_addresses" } }));
    update();
    const tableSearch = host.querySelector<HTMLElement & { searchLabel: string }>(
      "hass-tabs-subpage-data-table",
    )!.searchLabel;

    expect(devicesSearch).toBe("ui.components.data-table.search");
    expect(tableSearch).toBe(devicesSearch);
  });

  it("opens the automation editor from a group-address action", () => {
    const element = new KNXProjectView();
    element.hass = { localize: vi.fn((key) => key) } as any;
    element.knx = { localize: vi.fn((key) => key) } as any;
    const groupAddress: GroupAddress = {
      name: "Ceiling Light",
      identifier: "ga-1",
      raw_address: 2563,
      address: "1/2/3",
      project_uid: 1,
      dpt: null,
      communication_object_ids: [],
      description: "",
      comment: "",
    };
    const customPanel = document.createElement("div");
    let editorEvent: CustomEvent | undefined;
    customPanel.addEventListener("hass-automation-editor", (event) => {
      editorEvent = event as CustomEvent;
    });
    (window.parent as { customPanel?: HTMLElement }).customPanel = customPanel;
    const container = document.createElement("div");

    const columns = (element as any)._columns(false, "en");
    render(columns.actions.template(groupAddress), container, { host: element });
    const menu = container.querySelector("ha-icon-overflow-menu") as HTMLElement & {
      items: { action: () => void }[];
    };
    menu.items[1].action();

    expect(editorEvent?.detail.data).toMatchObject({
      alias: "KNX: 1/2/3 Ceiling Light",
      triggers: [{ trigger: "knx.telegram", options: { destination: ["1/2/3"] } }],
    });
  });
});
