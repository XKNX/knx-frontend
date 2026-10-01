import assert from "node:assert/strict";
import test from "node:test";
import { addedBlocks, matchAdded, parseDiff } from "../lib/diff.mjs";
import { bySeverity, finding } from "../lib/findings.mjs";

const sample = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -3,0 +4,3 @@ export class A {
+  const x = 1;
+++i;
+  this.knx.localize(
@@ -10 +13,2 @@ export class A {
-    old
+      "some_key"
+    );
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1 @@
+export const y = 2;
diff --git a/src/gone.ts b/src/gone.ts
deleted file mode 100644
index 4444444..0000000
--- a/src/gone.ts
+++ /dev/null
@@ -1 +0,0 @@
-export const z = 3;
diff --git a/homeassistant-frontend b/homeassistant-frontend
index 5555555..6666666 160000
--- a/homeassistant-frontend
+++ b/homeassistant-frontend
@@ -1 +1 @@
-Subproject commit 5555555555555555555555555555555555555555
+Subproject commit 6666666666666666666666666666666666666666
`;

test("parses files, statuses and added lines with new-side line numbers", () => {
  const files = parseDiff(sample);
  assert.deepEqual(
    files.map((file) => [file.path, file.status, file.gitlink]),
    [
      ["src/a.ts", "modified", false],
      ["src/new.ts", "added", false],
      ["src/gone.ts", "deleted", false],
      ["homeassistant-frontend", "modified", true],
    ],
  );
  assert.deepEqual(files[0].added, [
    { line: 4, text: "  const x = 1;" },
    { line: 5, text: "++i;" },
    { line: 6, text: "  this.knx.localize(" },
    { line: 13, text: '      "some_key"' },
    { line: 14, text: "    );" },
  ]);
  assert.deepEqual(files[1].added, [{ line: 1, text: "export const y = 2;" }]);
  assert.deepEqual(files[2].added, []);
  assert.deepEqual(files[3].added, []);
});

test("groups consecutive added lines into blocks", () => {
  const [file] = parseDiff(sample);
  assert.deepEqual(addedBlocks(file), [
    { start: 4, lines: ["  const x = 1;", "++i;", "  this.knx.localize("] },
    { start: 13, lines: ['      "some_key"', "    );"] },
  ]);
});

test("matchAdded reports the line a match starts on, across lines of a block", () => {
  const file = parseDiff(`diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,0 +20,3 @@
+const a = 1;
+this.knx.localize(
+  "multi_line_key"
`)[0];
  const found = matchAdded(file, /knx\.localize\(\s*"([^"]+)"/g);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 21);
  assert.equal(found[0].match[1], "multi_line_key");
});

test("an empty diff has no files", () => {
  assert.deepEqual(parseDiff(""), []);
});

test("findings default evidence and sort by severity, file, line", () => {
  const list = [
    finding({ rule: "N", severity: "nit", file: "a", line: 1, message: "n" }),
    finding({ rule: "B2", severity: "blocker", file: "b", line: 2, message: "b" }),
    finding({ rule: "B1", severity: "blocker", file: "b", line: 1, message: "b" }),
    finding({ rule: "Q", severity: "question", file: "a", line: null, message: "q" }),
  ];
  assert.deepEqual(list[0].evidence, []);
  assert.deepEqual(
    [...list].sort(bySeverity).map((item) => item.rule),
    ["B1", "B2", "Q", "N"],
  );
});
