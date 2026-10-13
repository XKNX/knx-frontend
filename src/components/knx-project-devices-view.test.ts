import { describe, expect, it, vi } from "vitest";
import { render } from "lit";

import type { HomeAssistant } from "@ha/types";
import type { KNX } from "../types/knx";
import type { CommunicationObject, GroupAddress, KNXProject } from "../types/websocket";
import { KNXProjectDevicesView } from "./knx-project-devices-view";

// HA's icon button needs browser APIs jsdom lacks; keep it a plain element.
vi.mock("@ha/components/ha-icon-button", () => ({}));

const flags = {
  read: false,
  write: true,
  communication: true,
  transmit: false,
  update: false,
  readOnInit: false,
};

const comObject = (read: boolean): CommunicationObject => ({
  name: "CO",
  number: 1,
  text: "Switch",
  function_text: "",
  description: "",
  device_address: "1.1.1",
  device_application: null,
  module: null,
  channel: null,
  dpts: [],
  object_size: "1 Bit",
  group_address_links: ["ga-1"],
  flags: { ...flags, read },
});

const groupAddress: GroupAddress = {
  name: "Ceiling Light",
  identifier: "ga-1",
  raw_address: 2563,
  address: "1/2/3",
  project_uid: 1,
  dpt: { main: 1, sub: 1 },
  communication_object_ids: ["co-1", "co-2"],
  description: "",
  comment: "",
};

/** Renders a single group-address row the way the devices tree lists it under a com object. */
const drawGroupAddress = (communicationObjects: Record<string, CommunicationObject>) => {
  const view = new KNXProjectDevicesView();
  const callService = vi.fn();
  view.hass = { localize: (key: string) => key, callService } as unknown as HomeAssistant;
  view.knx = { localize: (key: string) => key } as unknown as KNX;
  view.data = {
    info: { name: "Test", last_modified: "", tool_version: "", xknxproject_version: "3.9.0" },
    group_addresses: { "ga-1": groupAddress },
    group_ranges: {},
    devices: {},
    communication_objects: communicationObjects,
  } satisfies KNXProject;
  const container = document.createElement("div");
  render(view["_renderGroupAddresses"]([groupAddress], undefined), container, { host: view });
  return {
    button: container.querySelector<HTMLElement>("ha-icon-button.read-button"),
    placeholder: container.querySelector<HTMLElement>(".read-button.placeholder"),
    callService,
  };
};

describe("KNXProjectDevicesView read button", () => {
  it("sends a read request when any linked object has the read flag set", () => {
    const { button, callService } = drawGroupAddress({
      "co-1": comObject(false),
      "co-2": comObject(true),
    });
    expect(button).not.toBeNull();
    button!.click();
    expect(callService).toHaveBeenCalledWith("knx", "read", { address: "1/2/3" });
  });

  it("leaves a placeholder when no linked object has the read flag set", () => {
    const { button, placeholder } = drawGroupAddress({
      "co-1": comObject(false),
      "co-2": comObject(false),
    });
    expect(button).toBeNull();
    expect(placeholder).not.toBeNull();
  });
});
