import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "lit";
import type { GroupAddress } from "../types/websocket";
import { KNXProjectView } from "./project_view";

afterEach(() => {
  delete (window.parent as { customPanel?: HTMLElement }).customPanel;
});

describe("KNXProjectView", () => {
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
