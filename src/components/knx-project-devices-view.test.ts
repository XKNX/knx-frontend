import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { html, render } from "lit";

import type { KNX } from "../types/knx";
import type { KNXProject } from "../types/websocket";
import type * as RestartDevice from "../utils/restart-device";
import "./knx-project-devices-view";
import type { KNXProjectDevicesView } from "./knx-project-devices-view";

// HA's icon button and alert need browser APIs jsdom lacks; keep them plain elements.
vi.mock("@ha/components/ha-icon-button", () => ({}));
vi.mock("@ha/components/ha-alert", () => ({}));

const flow = vi.hoisted(() => ({ confirmAndRestartDevice: vi.fn() }));
vi.mock("../utils/restart-device", async (importOriginal) => ({
  ...(await importOriginal<typeof RestartDevice>()),
  confirmAndRestartDevice: flow.confirmAndRestartDevice,
}));

const device = (ia: string, name: string) => ({
  name,
  hardware_name: "",
  description: "",
  manufacturer_name: "ACME",
  individual_address: ia,
  application: null,
  project_uid: null,
  communication_object_ids: [`${ia}_co`],
  channels: {},
});

const comObject = (ia: string) => ({
  name: "Switch",
  number: 1,
  text: "Switch",
  function_text: "On/Off",
  description: "",
  device_address: ia,
  device_application: null,
  module: null,
  channel: null,
  dpts: [{ main: 1, sub: 1 }],
  object_size: "1 Bit",
  group_address_links: [],
  flags: {
    read: false,
    write: true,
    communication: true,
    transmit: false,
    update: false,
    readOnInit: false,
  },
});

const project = {
  info: { name: "Test", last_modified: null, tool_version: "6", xknxproject_version: "3" },
  group_addresses: {},
  group_ranges: {},
  devices: {
    "1.1.5": device("1.1.5", "Switch actuator"),
    "1.1.-": device("1.1.-", "Unassigned"),
  },
  communication_objects: {
    "1.1.5_co": comObject("1.1.5"),
    "1.1.-_co": comObject("1.1.-"),
  },
} as unknown as KNXProject;

const knx = { localize: (key: string) => key } as unknown as KNX;

describe("KNXProjectDevicesView restart button", () => {
  let container: HTMLElement;

  beforeAll(() => {
    globalThis.IntersectionObserver ??= class {
      observe = vi.fn();

      unobserve = vi.fn();

      disconnect = vi.fn();
    } as unknown as typeof IntersectionObserver;
  });

  beforeEach(() => {
    flow.confirmAndRestartDevice.mockReset();
    flow.confirmAndRestartDevice.mockResolvedValue(undefined);
  });

  afterEach(() => {
    container?.remove();
  });

  const mount = async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    render(
      html`<knx-project-devices-view
        .hass=${{ localize: (key: string) => key, locale: { language: "en" } } as any}
        .knx=${knx}
        .data=${project}
      ></knx-project-devices-view>`,
      container,
    );
    const element = container.querySelector("knx-project-devices-view") as KNXProjectDevicesView;
    await element.updateComplete;
    return element;
  };

  const panel = (element: KNXProjectDevicesView, ia: string) =>
    element.shadowRoot!.querySelector(
      `knx-sticky-expansion-panel[data-panel-key="${ia}"]`,
    ) as HTMLElement & { expanded: boolean; updateComplete: Promise<boolean> };

  const button = (element: KNXProjectDevicesView, ia: string) =>
    panel(element, ia)?.querySelector("[data-header-action] ha-icon-button") as
      (HTMLElement & { disabled: boolean; label: string }) | null;

  it("shows the restart button only for valid individual addresses", async () => {
    const element = await mount();
    expect(button(element, "1.1.5")?.label).toBe("component.knx.services.restart_device.name");
    expect(button(element, "1.1.-")).toBeNull();
  });

  it("starts the restart flow without toggling the panel", async () => {
    const element = await mount();
    button(element, "1.1.5")!.click();
    await element.updateComplete;

    expect(flow.confirmAndRestartDevice).toHaveBeenCalledWith(element, element.hass, knx, {
      ia: "1.1.5",
      name: "Switch actuator",
    });
    expect(panel(element, "1.1.5").expanded).toBe(false);
  });

  it("does not toggle the panel on Enter or Space on the button", async () => {
    const element = await mount();
    for (const key of ["Enter", " "]) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      button(element, "1.1.5")!.dispatchEvent(event);
      // the button must still be able to turn the key press into a click
      expect(event.defaultPrevented).toBe(false);
    }
    await element.updateComplete;
    expect(panel(element, "1.1.5").expanded).toBe(false);
  });

  it("still toggles the panel from the rest of the header", async () => {
    const element = await mount();
    (panel(element, "1.1.5").querySelector(".description") as HTMLElement).click();
    await element.updateComplete;
    expect(panel(element, "1.1.5").expanded).toBe(true);
  });

  it("disables the button while the restart flow runs", async () => {
    let finish!: () => void;
    flow.confirmAndRestartDevice.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const element = await mount();
    button(element, "1.1.5")!.click();
    await element.updateComplete;
    expect(button(element, "1.1.5")!.disabled).toBe(true);

    button(element, "1.1.5")!.click();
    expect(flow.confirmAndRestartDevice).toHaveBeenCalledTimes(1);

    finish();
    await vi.waitFor(() => expect(button(element, "1.1.5")!.disabled).toBe(false));
  });
});
