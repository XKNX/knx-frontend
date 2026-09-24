import { describe, expect, it } from "vitest";
import { render } from "lit";
import type { TemplateResult } from "lit";

import type { HomeAssistant } from "@ha/types";

import type { KNX } from "../types/knx";
import { localize } from "../localize/localize";

import { getConnectionStatus, KnxDashboard } from "./dashboard";

describe("getConnectionStatus", () => {
  it.each([
    ["loaded", true, undefined, "connected"],
    ["loaded", false, undefined, "disconnected"],
    ["loaded", true, "unavailable", "disconnected"],
    ["loaded", false, "2026-09-24T10:00:00+00:00", "connected"],
    ["not_loaded", true, "2026-09-24T10:00:00+00:00", "unavailable"],
    ["setup_retry", false, undefined, "unavailable"],
  ] as const)("maps %s, %s, and %s to %s", (configState, connected, sensorState, expected) => {
    expect(getConnectionStatus(configState, connected, sensorState)).toBe(expected);
  });
});

describe("dashboard status details", () => {
  it("shows the interface before the address and links only its name", () => {
    const view = new KnxDashboard();
    const interfaceDevice = {
      id: "interface_id",
      identifiers: [["knx", "_entry_interface"]],
      name: "KNX Interface",
      name_by_user: "My KNX gateway",
    };
    view.hass = {
      language: "de",
      config: { version: "2026.9.0" },
      auth: { data: { hassUrl: "http://localhost:8123" } },
      states: {},
      devices: { interface_id: interfaceDevice },
      localize: (key: string) =>
        key === "ui.panel.config.integrations.config_flow.open_documentation"
          ? "Open documentation"
          : key,
    } as unknown as HomeAssistant;
    view.knx = {
      config_entry: { entry_id: "entry", state: "loaded" },
      connectionInfo: { connected: true, current_address: "1.1.250" },
      projectInfo: null,
      localize: (key: string, replace?: Record<string, string>) =>
        localize(view.hass, key, replace),
    } as unknown as KNX;
    const host = document.createElement("div");

    render((view as unknown as { render: () => TemplateResult }).render(), host);

    expect(host.querySelector(".status-heading")?.textContent?.trim()).toBe("Verbunden");
    expect(host.querySelector(".status-detail")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "über My KNX gateway · Adresse: 1.1.250",
    );
    const link = host.querySelector<HTMLAnchorElement>(".status-detail a");
    expect(link?.getAttribute("href")).toBe("/config/devices/device/interface_id");
    expect(link?.textContent).toBe("My KNX gateway");
    expect(host.querySelectorAll(".status-detail a")).toHaveLength(1);
    const docsButton = host.querySelector<HTMLElement & { href: string; target: string }>(
      'ha-icon-button[slot="toolbar-icon"]',
    );
    expect(docsButton?.href).toBe("https://www.home-assistant.io/integrations/knx");
    expect(docsButton?.target).toBe("_blank");
    expect(host.querySelector('ha-md-list-item[type="link"][href="/knx/entities"]')).not.toBeNull();

    interfaceDevice.name_by_user = "";
    render((view as unknown as { render: () => TemplateResult }).render(), host);

    expect(host.querySelector(".status-detail")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "über KNX Interface · Adresse: 1.1.250",
    );
    expect(host.querySelector(".status-detail a")?.textContent).toBe("KNX Interface");

    view.hass.language = "en";
    render((view as unknown as { render: () => TemplateResult }).render(), host);

    expect(host.querySelector(".status-detail")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "via KNX Interface · Address: 1.1.250",
    );
  });
});
