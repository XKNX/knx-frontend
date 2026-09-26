import assert from "node:assert/strict";
import test from "node:test";
import { parseDiff } from "../lib/diff.mjs";
import { devtoolFindings, gates, pathFindings, testFindings } from "../lib/repo.mjs";

const touched = (...paths) =>
  parseDiff(paths.map((path) => `diff --git a/${path} b/${path}\n@@ -1 +1 @@\n+x\n`).join(""));
const bump = parseDiff(
  "diff --git a/homeassistant-frontend b/homeassistant-frontend\n@@ -1 +1 @@\n-Subproject commit aaaa\n+Subproject commit bbbb\n",
);

test("protected paths are blockers", () => {
  const { findings, handover } = pathFindings(
    touched("VERSION", "src/version.ts", "knx_frontend/frontend_latest/x.js", ".nvmrc", "src/a.ts"),
  );
  assert.equal(handover, null);
  assert.deepEqual(
    findings.map((item) => [item.rule, item.severity, item.file]),
    [
      ["PATH-protected", "blocker", "VERSION"],
      ["PATH-protected", "blocker", "src/version.ts"],
      ["PATH-protected", "blocker", "knx_frontend/frontend_latest/x.js"],
      ["PATH-protected", "blocker", ".nvmrc"],
    ],
  );
});

test("a submodule bump is a handover, and its toolchain files are expected", () => {
  const { findings, handover } = pathFindings([...bump, ...touched(".nvmrc", ".yarnrc.yml")]);
  assert.equal(handover, "upgrading-knx-frontend-submodule");
  assert.deepEqual(findings, []);
});

const rspack = (devtool) => `module.exports = {\n  x: 1,\n  ${devtool}\n};\n`;

test("BUILD-devtool requires nosources-source-map in production", () => {
  const files = touched("build-scripts/rspack.cjs");
  const good = rspack(
    'devtool: isProdBuild ? "nosources-source-map" : "eval-cheap-module-source-map",',
  );
  const bad = rspack('devtool: isProdBuild ? "source-map" : "eval-cheap-module-source-map",');
  assert.deepEqual(
    devtoolFindings(files, () => good),
    [],
  );
  const [result] = devtoolFindings(files, () => bad);
  assert.deepEqual([result.rule, result.severity, result.line], ["BUILD-devtool", "blocker", 3]);
  assert.equal(devtoolFindings(files, () => "module.exports = {};")[0].rule, "BUILD-devtool");
  assert.deepEqual(
    devtoolFindings(touched("src/a.ts"), () => bad),
    [],
  );
});

test("TEST-utils flags changed utils without any test change", () => {
  assert.deepEqual(
    testFindings(touched("src/utils/format.ts")).map((item) => [item.rule, item.severity]),
    [["TEST-utils", "nit"]],
  );
  assert.deepEqual(testFindings(touched("src/utils/format.ts", "src/utils/format.test.ts")), []);
  assert.deepEqual(testFindings(touched("src/utils/format.test.ts")), []);
});

test("gates follow the changed files", () => {
  assert.deepEqual(gates(touched("src/views/a.ts")), ["types", "lint-lit"]);
  assert.deepEqual(gates(touched("package.json", "yarn.lock")), ["build", "dedupe"]);
  assert.deepEqual(gates(touched("src/stubs/echarts.ts")), ["build", "types", "lint-lit"]);
  assert.deepEqual(gates(touched("src/a.test.ts")), ["types"]);
  assert.deepEqual(gates(touched("README.md")), []);
});
