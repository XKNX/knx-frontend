import { describe, expect, it } from "vitest";

import type { KNXProjectInfo } from "../types/websocket";

import { parseProjectLastModified } from "./project-info";

const projectInfo = (lastModified: string | null): KNXProjectInfo => ({
  name: "Project",
  last_modified: lastModified,
  tool_version: "6.1.5686.0",
  xknxproject_version: "3.9.0",
});

describe("parseProjectLastModified", () => {
  it("parses ETS timestamps with seven fractional digits", () => {
    expect(
      parseProjectLastModified(projectInfo("2026-09-14T18:42:12.4132414Z"))?.toISOString(),
    ).toBe("2026-09-14T18:42:12.413Z");
  });

  it.each([
    ["null", null],
    ["an empty string", ""],
    ["an unparsable value", "not a date"],
  ])("returns undefined for %s", (_, value) => {
    expect(parseProjectLastModified(projectInfo(value))).toBeUndefined();
  });
});
