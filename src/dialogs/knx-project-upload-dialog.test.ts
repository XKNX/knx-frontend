import { describe, expect, it, vi } from "vitest";
import { render } from "lit";

import type { HaExpansionPanel } from "@ha/components/ha-expansion-panel";
import type { HomeAssistant } from "@ha/types";

import { localize } from "../localize/localize";
import type { KNX } from "../types/knx";
import type { KNXProjectInfo } from "../types/websocket";

import { KnxProjectUploadDialog } from "./knx-project-upload-dialog";

const PROJECT_INFO: KNXProjectInfo = {
  name: "Einfamilienhaus Musterstraße 12",
  last_modified: "2026-09-14T18:42:12.4132414Z",
  tool_version: "6.1.5686.0",
  xknxproject_version: "3.9.0",
};

const createHass = () =>
  ({
    language: "en",
    locale: {
      language: "en",
      number_format: "language",
      time_format: "24",
      date_format: "language",
      time_zone: "server",
      first_weekday: "language",
    },
    config: { time_zone: "Etc/UTC" },
    localize: vi.fn((key: string) => key),
  }) as unknown as HomeAssistant;

const renderDialog = (projectInfo: KNXProjectInfo | null) => {
  const hass = createHass();
  const knx = {
    localize: (key: string, replace?: Record<string, any>) => localize(hass, key, replace),
    projectInfo,
  } as unknown as KNX;
  const dialog = new KnxProjectUploadDialog();
  dialog.params = { hass, knx };
  dialog.hass = hass;
  const container = document.createElement("div");
  render((dialog as any).render(), container, { host: dialog });
  return container;
};

const valueRows = (container: HTMLElement) =>
  Object.fromEntries(
    [...container.querySelectorAll("ha-list-item-value")].map((row) => [
      (row as HTMLElement & { label?: string }).label,
      row.textContent?.trim(),
    ]),
  );

describe("KnxProjectUploadDialog", () => {
  it("summarizes the currently loaded project in a collapsed panel", () => {
    const container = renderDialog(PROJECT_INFO);

    expect(container.textContent).toContain("Currently loaded");
    const panel = container.querySelector<HaExpansionPanel>("ha-expansion-panel")!;
    expect(panel).not.toBeNull();
    expect(panel.expanded).toBe(false);
    expect(panel.header).toBe("Einfamilienhaus Musterstraße 12");
    expect(panel.secondary).toMatch(/^ETS 6\.1 · Modified .+/);

    const rows = valueRows(container);
    expect(rows["Last modified"]).toMatch(/2026/);
    expect(rows["ETS version"]).toBe("6.1.5686.0");
    expect(rows["Imported with"]).toBe("xknxproject 3.9.0");
  });

  it("keeps the dialog unchanged when no project is loaded", () => {
    const container = renderDialog(null);

    expect(container.querySelector("ha-expansion-panel")).toBeNull();
    expect(container.textContent).not.toContain("Currently loaded");
    expect(container.querySelector("ha-file-upload")).not.toBeNull();
  });

  it("omits missing modification date and ETS version", () => {
    const container = renderDialog({ ...PROJECT_INFO, last_modified: "", tool_version: "" });

    const panel = container.querySelector<HaExpansionPanel>("ha-expansion-panel")!;
    expect(panel.header).toBe("Einfamilienhaus Musterstraße 12");
    expect(panel.secondary).toBe("");

    const rows = valueRows(container);
    expect(Object.keys(rows)).toEqual(["Imported with"]);
    expect(container.textContent).not.toContain("Invalid");
  });
});
