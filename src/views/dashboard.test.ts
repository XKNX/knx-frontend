import { describe, expect, it } from "vitest";
import { render } from "lit";
import type { TemplateResult } from "lit";

import type { HomeAssistant } from "@ha/types";

import type { KNX } from "../types/knx";
import { localize } from "../localize/localize";

import { getConnectionStatus, KnxDashboard } from "./dashboard";

describe("getConnectionStatus", () => {
  it.each([
    ["loaded", undefined, "unavailable"],
    ["loaded", "unknown", "unavailable"],
    ["loaded", "unavailable", "disconnected"],
    ["loaded", "2026-09-24T10:00:00+00:00", "connected"],
    ["not_loaded", "2026-09-24T10:00:00+00:00", "unavailable"],
    ["setup_retry", undefined, "unavailable"],
  ] as const)("maps %s and %s to %s", (configState, sensorState, expected) => {
    expect(getConnectionStatus(configState, sensorState)).toBe(expected);
  });
});

const createDashboard = (language = "de", nameByUser = "My KNX gateway") => {
  const view = new KnxDashboard();
  view.hass = {
    language,
    config: { version: "2026.9.0" },
    auth: { data: { hassUrl: "http://localhost:8123" } },
    states: {
      "sensor.connected_since": { state: "2026-09-24T10:00:00+00:00" },
      "sensor.individual_address": { state: "1.1.250" },
    },
    entities: {
      "sensor.connected_since": {
        entity_id: "sensor.connected_since",
        device_id: "interface_id",
        platform: "knx",
        translation_key: "connected_since",
      },
      "sensor.individual_address": {
        entity_id: "sensor.individual_address",
        device_id: "interface_id",
        platform: "knx",
        translation_key: "individual_address",
      },
    },
    devices: {
      interface_id: {
        id: "interface_id",
        identifiers: [["knx", "_entry_interface"]],
        name: "KNX Interface",
        name_by_user: nameByUser,
      },
    },
    localize: (key: string) =>
      key === "ui.panel.config.integrations.config_flow.open_documentation"
        ? "Open documentation"
        : key === "state.default.unavailable"
          ? "Shared unavailable"
          : key.startsWith("component.knx.config_panel.dashboard.status.")
            ? ""
            : key,
  } as unknown as HomeAssistant;
  view.knx = {
    config_entry: { entry_id: "entry", state: "loaded" },
    connectionInfo: { connected: true, current_address: "1.1.250" },
    projectInfo: null,
    localize: (key: string, replace?: Record<string, string>) => localize(view.hass, key, replace),
  } as unknown as KNX;
  return view;
};

const renderDashboard = (view: KnxDashboard) => {
  const host = document.createElement("div");
  render((view as unknown as { render: () => TemplateResult }).render(), host);
  return host;
};

const statusDetail = (host: HTMLElement) =>
  host.querySelector(".status-detail")?.textContent?.replace(/\s+/g, " ").trim();

describe("dashboard status details", () => {
  it.each([
    ["de", "My KNX gateway", "über My KNX gateway · Adresse: 1.1.250"],
    ["de", "", "über KNX Interface · Adresse: 1.1.250"],
    ["en", "", "via KNX Interface · Address: 1.1.250"],
  ])("renders %s with interface name %s", (language, nameByUser, expected) => {
    const host = renderDashboard(createDashboard(language, nameByUser));
    expect(statusDetail(host)).toBe(expected);
    const link = host.querySelector<HTMLAnchorElement>(".status-detail a");
    expect(link?.getAttribute("href")).toBe("/config/devices/device/interface_id");
    expect(link?.textContent).toBe(nameByUser || "KNX Interface");
    expect(host.querySelectorAll(".status-detail a")).toHaveLength(1);
  });

  it("keeps translated words after the linked interface name", () => {
    const view = createDashboard("en", "");
    view.knx.localize = (key: string, replace?: Record<string, string>) =>
      key === "dashboard_status_via"
        ? `${replace?.interface} via`
        : localize(view.hass, key, replace);
    expect(statusDetail(renderDashboard(view))).toBe("KNX Interface via · Address: 1.1.250");
  });

  it("prefers backend dashboard translations when available", () => {
    const view = createDashboard("en");
    const fallback = view.hass.localize;
    view.hass.localize = (key, replace) => {
      if (key === "component.knx.config_panel.dashboard.status.connected") {
        return "Backend connected";
      }
      if (key === "component.knx.config_panel.dashboard.status.via") {
        return `through ${replace?.interface}`;
      }
      if (key === "component.knx.config_panel.dashboard.status.address") {
        return `IA ${replace?.address}`;
      }
      return fallback(key, replace);
    };
    const host = renderDashboard(view);
    expect(host.querySelector(".status-heading")?.textContent?.trim()).toBe("Backend connected");
    expect(statusDetail(host)).toBe("through My KNX gateway · IA 1.1.250");
  });

  it("hides the address when the live sensor disconnects", () => {
    const view = createDashboard("en");
    view.hass.states["sensor.connected_since"].state = "unavailable";
    const host = renderDashboard(view);
    expect(host.querySelector(".status-heading")?.textContent?.trim()).toBe("Disconnected");
    expect(host.querySelector(".address")).toBeNull();

    view.hass.states["sensor.connected_since"].state = "unknown";
    expect(renderDashboard(view).querySelector(".status-heading")?.textContent?.trim()).toBe(
      "Shared unavailable",
    );
  });

  it("hides an unavailable individual-address sensor", () => {
    const view = createDashboard("en");
    view.hass.states["sensor.individual_address"].state = "unavailable";
    expect(renderDashboard(view).querySelector(".address")).toBeNull();
  });

  it("shows the documentation and native navigation links", () => {
    const host = renderDashboard(createDashboard());
    const docsButton = host.querySelector<HTMLElement & { href: string; target: string }>(
      'ha-icon-button[slot="toolbar-icon"]',
    );
    expect(docsButton?.href).toBe("https://www.home-assistant.io/integrations/knx");
    expect(docsButton?.target).toBe("_blank");
    expect(host.querySelector('ha-md-list-item[type="link"][href="/knx/entities"]')).not.toBeNull();
  });
});
