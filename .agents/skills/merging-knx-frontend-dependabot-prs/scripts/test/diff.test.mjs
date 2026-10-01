import assert from "node:assert/strict";
import test from "node:test";
import { parseDiff } from "../lib/diff.mjs";

const lockOnly = `diff --git a/yarn.lock b/yarn.lock
index 411be195..13e7aced 100644
--- a/yarn.lock
+++ b/yarn.lock
@@ -1,8 +1,8 @@
-"svgo@npm:^4.0.2":
-  version: 4.0.2
-  resolution: "svgo@npm:4.0.2"
+"svgo@npm:^4.1.0":
+  version: 4.1.0
+  resolution: "svgo@npm:4.1.0"
-  resolution: "sax@npm:1.6.0"
+  resolution: "sax@npm:1.6.1"
`;

const direct = `diff --git a/package.json b/package.json
index 4935a83c..a589c086 100644
--- a/package.json
+++ b/package.json
@@ -115,7 +115,7 @@
     "luxon": "3.7.2",
-    "maplibre-gl": "5.24.0",
+    "maplibre-gl": "6.4.1",
     "marked": "18.0.10",
diff --git a/yarn.lock b/yarn.lock
index 411be195..13e7aced 100644
--- a/yarn.lock
+++ b/yarn.lock
@@ -1,4 +1,4 @@
-  resolution: "maplibre-gl@npm:5.24.0"
+  resolution: "maplibre-gl@npm:6.4.1"
-  resolution: "@mapbox/unitbezier@npm:0.0.1"
`;

test("lists the files and the replaced resolutions of a lock-only bump", () => {
  assert.deepEqual(parseDiff(lockOnly), {
    files: ["yarn.lock"],
    removed: ["svgo@npm:4.0.2", "sax@npm:1.6.0"],
    added: ["svgo@npm:4.1.0", "sax@npm:1.6.1"],
    packageKeys: [],
  });
});

test("collects the package.json keys a direct bump changes", () => {
  const result = parseDiff(direct);
  assert.deepEqual(result.files, ["package.json", "yarn.lock"]);
  assert.deepEqual(result.packageKeys, ["maplibre-gl"]);
  assert.deepEqual(result.removed, ["maplibre-gl@npm:5.24.0", "@mapbox/unitbezier@npm:0.0.1"]);
});

test("a block that only moved is not counted as removed", () => {
  const moved = `diff --git a/yarn.lock b/yarn.lock
-  resolution: "flatted@npm:3.4.2"
+  resolution: "flatted@npm:3.4.2"
-  resolution: "sax@npm:1.6.0"
+  resolution: "sax@npm:1.6.1"
`;
  const result = parseDiff(moved);
  assert.deepEqual(result.removed, ["sax@npm:1.6.0"]);
  assert.deepEqual(result.added, ["sax@npm:1.6.1"]);
});

test("ignores resolution-like lines outside yarn.lock", () => {
  const other = `diff --git a/docs/notes.md b/docs/notes.md
-  resolution: "svgo@npm:4.0.2"
`;
  assert.deepEqual(parseDiff(other).removed, []);
});
