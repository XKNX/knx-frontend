import assert from "node:assert/strict";
import test from "node:test";
import { parseDiff } from "../lib/diff.mjs";
import { addedKeys, l10nFindings } from "../lib/l10n.mjs";

const added = (path, start, lines) =>
  parseDiff(
    `diff --git a/${path} b/${path}\n@@ -1,0 +${start},${lines.length} @@\n` +
      lines.map((line) => `+${line}`).join("\n") +
      "\n",
  );
const languages = {
  en: new Set(["title", "entities_view_title", "project_view_add_switch"]),
  de: new Set(["title"]),
};
const rules = (files) =>
  l10nFindings(files, languages).map((item) => [item.rule, item.severity, item.file, item.line]);

test("addedKeys reads key, value and line", () => {
  const [file] = added("src/localize/languages/en.json", 5, [
    '  "a_key": "A value",',
    '  "b": "B"',
  ]);
  assert.deepEqual(addedKeys(file), [
    { key: "a_key", value: "A value", line: 5 },
    { key: "b", value: "B", line: 6 },
  ]);
});

test("a new en key missing in de is a parity finding plus a new-key question", () => {
  const files = added("src/localize/languages/en.json", 10, [
    '  "entities_view_title": "Entities",',
    '  "project_view_add_switch": "Add switch"',
  ]);
  assert.deepEqual(rules(files), [
    ["L10N-parity", "should-fix", "src/localize/languages/en.json", 10],
    ["L10N-new-key", "question", "src/localize/languages/en.json", 10],
    ["L10N-parity", "should-fix", "src/localize/languages/en.json", 11],
    ["L10N-new-key", "question", "src/localize/languages/en.json", 11],
  ]);
});

test("GA as a word in a new text is jargon", () => {
  const files = added("src/localize/languages/de.json", 3, ['  "title": "GA Monitor"']);
  assert.deepEqual(rules(files), [["L10N-jargon", "nit", "src/localize/languages/de.json", 3]]);
});

test("a literal key missing from en.json is a blocker, dotted keys belong to HA", () => {
  const files = added("src/views/a.ts", 20, [
    'this.knx.localize("title");',
    'this.knx.localize("does_not_exist");',
    'this.knx.localize("ui.common.cancel");',
    "this.knx.localize(",
    '  "also_missing",',
    ");",
  ]);
  assert.deepEqual(rules(files), [
    ["L10N-missing", "blocker", "src/views/a.ts", 21],
    ["L10N-missing", "blocker", "src/views/a.ts", 23],
  ]);
});

test("keys built at runtime are questions, not missing keys", () => {
  const files = added("src/views/a.ts", 1, [
    "this.knx.localize(`${page}_title`);",
    "this.knx.localize(labelKey);",
    "this.knx.localize(`title`);",
  ]);
  assert.deepEqual(rules(files), [
    ["L10N-dynamic", "question", "src/views/a.ts", 1],
    ["L10N-dynamic", "question", "src/views/a.ts", 2],
  ]);
});

test("test files are ignored for localize calls", () => {
  assert.deepEqual(rules(added("src/views/a.test.ts", 1, ['knx.localize("nope");'])), []);
});
