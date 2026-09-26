import assert from "node:assert/strict";
import test from "node:test";
import {
  importFindings,
  keyLine,
  lockFindings,
  mergeFindings,
  mergeRequirements,
  packageOf,
  staleOverrideFindings,
} from "../lib/deps.mjs";
import { parseDiff } from "../lib/diff.mjs";

const core = {
  dependencies: {
    lit: "3.3.3",
    "@lit/task": "1.0.3",
    tinykeys: "patch:tinykeys@npm%3A4.0.0#~/.yarn/patches/t.patch",
  },
  devDependencies: { vitest: "4.1.11" },
  resolutions: { tslib: "2.8.1" },
  packageManager: "yarn@4.18.0",
};
const knx = (overrides = {}) => ({
  dependenciesOverride: { "compare-versions": "6.1.0", "@lit/task": "1.0.2" },
  devDependenciesOverride: {},
  resolutionsOverride: {},
  dependencies: {
    lit: "3.3.3",
    "@lit/task": "1.0.2",
    tinykeys: "patch:tinykeys@npm%3A4.0.0#~/homeassistant-frontend/.yarn/patches/t.patch",
    "compare-versions": "6.1.0",
  },
  devDependencies: { vitest: "4.1.11" },
  resolutions: { tslib: "2.8.1" },
  packageManager: "yarn@4.18.0",
  ...overrides,
});
const text = (pkg) => JSON.stringify(pkg, null, 2);

test("mergeRequirements mirrors script/merge_requirements.js", () => {
  const merged = mergeRequirements(knx(), core);
  assert.equal(merged.dependencies["@lit/task"], "1.0.2");
  assert.equal(merged.dependencies["compare-versions"], "6.1.0");
  assert.equal(
    merged.dependencies.tinykeys,
    "patch:tinykeys@npm%3A4.0.0#~/homeassistant-frontend/.yarn/patches/t.patch",
  );
  assert.equal(merged.packageManager, "yarn@4.18.0");
});

test("a package.json the merge reproduces has no findings, whatever the key order", () => {
  const pkg = knx();
  const reordered = {
    ...pkg,
    dependencies: Object.fromEntries(Object.entries(pkg.dependencies).reverse()),
  };
  assert.deepEqual(mergeFindings(reordered, core, text(reordered)), []);
});

test("a dependency outside upstream without override is a blocker on its line", () => {
  const pkg = knx();
  pkg.dependencies.typedfastbitset = "0.8.0";
  const [result, ...rest] = mergeFindings(pkg, core, text(pkg));
  assert.equal(rest.length, 0);
  assert.equal(result.rule, "DEP-merge");
  assert.equal(result.severity, "blocker");
  assert.equal(result.key, "dependencies.typedfastbitset");
  assert.equal(result.line, keyLine(text(pkg), "dependencies", "typedfastbitset"));
  assert.match(result.message, /dependenciesOverride/);
});

test("the same package in dependencies and in the override is fine", () => {
  const pkg = knx();
  pkg.dependencies.typedfastbitset = "0.8.0";
  pkg.dependenciesOverride.typedfastbitset = "0.8.0";
  assert.deepEqual(mergeFindings(pkg, core, text(pkg)), []);
});

test("changing an upstream version without override is a blocker", () => {
  const pkg = knx();
  pkg.dependencies.lit = "3.4.0";
  const [result] = mergeFindings(pkg, core, text(pkg));
  assert.equal(result.key, "dependencies.lit");
  assert.match(result.message, /3\.4\.0/);
});

test("removing an upstream package is a blocker", () => {
  const pkg = knx();
  delete pkg.devDependencies.vitest;
  assert.equal(mergeFindings(pkg, core, text(pkg))[0].key, "devDependencies.vitest");
});

test("packageOf keeps the package name only", () => {
  assert.equal(packageOf("lit/decorators"), "lit");
  assert.equal(packageOf("@lit/task"), "@lit/task");
  assert.equal(packageOf("@mdi/js/foo"), "@mdi/js");
});

const importDiff = (lines, path = "src/views/x.ts") =>
  parseDiff(
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,0 +10,${lines.length} @@\n` +
      lines.map((line) => `+${line}`).join("\n") +
      "\n",
  );

test("DEP-import flags an unknown package and skips known, aliased and builtin imports", () => {
  const files = importDiff([
    'import { SparseTypedFastBitSet } from "typedfastbitset";',
    'import { html } from "lit";',
    'import { fireEvent } from "@ha/common/dom/fire_event";',
    'import type { KNX } from "types/knx";',
    'import { readFileSync } from "node:fs";',
    'import path from "path";',
    'import { foo } from "../foo";',
    'import { compare } from "compare-versions";',
    'const lazy = import("@lit/task");',
  ]);
  const found = importFindings(files, knx(), core, new Set(["types", "services", "utils"]));
  assert.deepEqual(
    found.map((item) => [item.rule, item.severity, item.line]),
    [["DEP-import", "blocker", 10]],
  );
  assert.match(found[0].message, /typedfastbitset/);
});

test("DEP-import ignores files outside src and build-scripts", () => {
  const files = importDiff(['import x from "typedfastbitset";'], "test/x.ts");
  assert.deepEqual(importFindings(files, knx(), core, new Set()), []);
});

test("DEP-lock flags package.json without yarn.lock", () => {
  const only = parseDiff("diff --git a/package.json b/package.json\n@@ -1 +1 @@\n+{}\n");
  assert.equal(lockFindings(only)[0].rule, "DEP-lock");
  const both = parseDiff(
    "diff --git a/package.json b/package.json\n@@ -1 +1 @@\n+{}\ndiff --git a/yarn.lock b/yarn.lock\n@@ -1 +1 @@\n+x\n",
  );
  assert.deepEqual(lockFindings(both), []);
});

test("DEP-stale-override flags a touched override that upstream has caught up with", () => {
  const [file] = parseDiff(
    'diff --git a/package.json b/package.json\n@@ -34,0 +35,2 @@\n+    "@lit/task": "1.0.2",\n+    "compare-versions": "6.1.0"\n',
  );
  const found = staleOverrideFindings(file, knx(), core);
  assert.deepEqual(
    found.map((item) => [item.rule, item.severity, item.line]),
    [["DEP-stale-override", "nit", 35]],
  );
  assert.deepEqual(staleOverrideFindings(undefined, knx(), core), []);
});
