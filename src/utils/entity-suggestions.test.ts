import { describe, expect, it } from "vitest";

import type { EntitySuggestion, EntitySuggestionsResult } from "../types/websocket";
import {
  projectReimportSuggested,
  suggestionProviders,
  suggestionsByProvider,
} from "./entity-suggestions";

const suggestion = (
  id: string,
  source: string,
  groupId = "1.1.1",
  groupName = "Device",
): EntitySuggestion => ({
  id,
  source,
  suggested_name: id,
  group_id: groupId,
  group_name: groupName,
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

describe("suggestionsByProvider", () => {
  it("groups by provider first, then by group, keeping the backend order", () => {
    const fb1 = suggestion("fb_1", "fb", "1.1.2", "Actuator");
    const fb2 = suggestion("fb_2", "fb", "1.1.1", "Dimmer");
    const fb3 = suggestion("fb_3", "fb", "1.1.2", "Actuator");
    const fn1 = suggestion("fn_1", "fn", "P-2", "Kitchen");
    const fn2 = suggestion("fn_2", "fn", "P-3", "Living room");
    const fn3 = suggestion("fn_3", "fn", "P-2", "Kitchen");
    expect(suggestionsByProvider([fb1, fb2, fb3, fn1, fn2, fn3])).toEqual([
      {
        providerId: "fb",
        groups: [
          { providerId: "fb", groupId: "1.1.2", groupName: "Actuator", suggestions: [fb1, fb3] },
          { providerId: "fb", groupId: "1.1.1", groupName: "Dimmer", suggestions: [fb2] },
        ],
      },
      {
        providerId: "fn",
        groups: [
          { providerId: "fn", groupId: "P-2", groupName: "Kitchen", suggestions: [fn1, fn3] },
          { providerId: "fn", groupId: "P-3", groupName: "Living room", suggestions: [fn2] },
        ],
      },
    ]);
  });

  it("keeps a group of the same id apart for each provider", () => {
    const fb = suggestion("fb_1", "fb");
    const cfg = suggestion("cfg_1", "cfg");
    expect(suggestionsByProvider([fb, cfg]).map((provider) => provider.groups)).toEqual([
      [{ providerId: "fb", groupId: "1.1.1", groupName: "Device", suggestions: [fb] }],
      [{ providerId: "cfg", groupId: "1.1.1", groupName: "Device", suggestions: [cfg] }],
    ]);
  });

  it("returns nothing without suggestions", () => {
    expect(suggestionsByProvider([])).toEqual([]);
  });
});
