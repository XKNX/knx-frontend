import { describe, expect, it } from "vitest";
import { render } from "lit";
import type { TemplateResult } from "lit";

import type { HomeAssistant } from "@ha/types";

import { localize } from "../localize/localize";
import type { KNX } from "../types/knx";
import type { KNXProjectInfo } from "../types/websocket";

import { KNXInfo } from "./info";

const PROJECT_INFO: KNXProjectInfo = {
  name: "Einfamilienhaus Musterstraße 12",
  last_modified: "2026-09-14T18:42:12.4132414Z",
  tool_version: "6.1.5686.0",
  xknxproject_version: "3.9.0",
};

const renderInfo = (projectInfo: KNXProjectInfo | null) => {
  const view = new KNXInfo();
  view.hass = { language: "en", localize: () => "" } as unknown as HomeAssistant;
  view.knx = {
    connectionInfo: {
      version: "3.20.0",
      connected: true,
      current_address: "1.1.250",
      telegram_backend: "sqlite",
      telegram_retention: null,
      telegram_max_count: null,
    },
    projectInfo,
    localize: (key: string, replace?: Record<string, string>) => localize(view.hass, key, replace),
  } as unknown as KNX;
  const host = document.createElement("div");
  render((view as unknown as { render: () => TemplateResult }).render(), host, { host: view });
  return host;
};

const projectRows = (host: HTMLElement) =>
  Object.fromEntries(
    [...host.querySelectorAll(".knx-content .knx-content-row:not(.header)")].map((row) => [
      row.children[0]?.textContent?.trim(),
      row.children[1]?.textContent?.trim(),
    ]),
  );

describe("KNXInfo project data card", () => {
  it("shows the project data including the modification date", () => {
    const rows = projectRows(renderInfo(PROJECT_INFO));

    expect(rows).toEqual({
      "Project name": "Einfamilienhaus Musterstraße 12",
      "Last modified": "Mon, 14 Sep 2026 18:42:12 GMT",
      "Tool version": "6.1.5686.0",
      "XKNXProject version": "3.9.0",
    });
  });

  it("omits the modification date when the project has none", () => {
    const host = renderInfo({ ...PROJECT_INFO, last_modified: null });

    expect(Object.keys(projectRows(host))).toEqual([
      "Project name",
      "Tool version",
      "XKNXProject version",
    ]);
    expect(host.textContent).not.toContain("1970");
  });

  it("shows no project data card without a loaded project", () => {
    expect(renderInfo(null).querySelector(".knx-content")).toBeNull();
  });
});
