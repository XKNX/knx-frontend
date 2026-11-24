import { describe, expect, it } from "vitest";

import type { EntitySuggestion, EntitySuggestionsResult } from "../types/websocket";
import { projectReimportSuggested, suggestionProviders } from "./entity-suggestions";

const suggestion = (id: string, source: string): EntitySuggestion => ({
  id,
  source,
  suggested_name: id,
  group_id: "1.1.1",
  group_name: "Device",
  secondary_info: "",
  platform_options: ["switch"],
  suggestions: {} as EntitySuggestion["suggestions"],
  existing_entity_ids: [],
  metadata: {},
});

describe("projectReimportSuggested", () => {
  it.each([
    ["3.8.2", true],
    ["3.10.0", true],
    ["3.11.0", true],
    ["3.11.1", false],
    ["3.12.0", false],
    ["4.0.0", false],
    // project data that doesn't tell its parser version is older than any known
    [undefined, true],
    ["", true],
    ["unknown", false],
  ])("for parser version %s is %s", (version, expected) => {
    expect(projectReimportSuggested(version)).toBe(expected);
  });
});

describe("suggestionProviders", () => {
  it("lists every reported provider in backend order, with or without suggestions", () => {
    const result: EntitySuggestionsResult = {
      suggestions: [suggestion("cfg_1", "cfg"), suggestion("cfg_2", "cfg")],
      providers: { fb: { state: "no_semantics" }, cfg: { state: "ok" } },
    };
    expect(suggestionProviders(result)).toEqual([
      { id: "fb", hints: { state: "no_semantics" }, count: 0 },
      { id: "cfg", hints: { state: "ok" }, count: 2 },
    ]);
  });

  it("keeps providers this panel doesn't know", () => {
    const result: EntitySuggestionsResult = {
      suggestions: [suggestion("new_1", "new")],
      providers: { fb: { state: "ok" }, new: { state: "ok", extra: 1 } },
    };
    expect(suggestionProviders(result)).toEqual([
      { id: "fb", hints: { state: "ok" }, count: 0 },
      { id: "new", hints: { state: "ok", extra: 1 }, count: 1 },
    ]);
  });

  it("includes sources of suggestions that have no hints", () => {
    const result: EntitySuggestionsResult = {
      suggestions: [suggestion("other_1", "other")],
      providers: {},
    };
    expect(suggestionProviders(result)).toEqual([{ id: "other", count: 1 }]);
  });
});
