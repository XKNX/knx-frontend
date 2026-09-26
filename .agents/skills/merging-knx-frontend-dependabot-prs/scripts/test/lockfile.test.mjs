import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  npmResolution,
  parseLockfile,
  reach,
  reachOf,
  resolvedVersions,
} from "../lib/lockfile.mjs";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const lock = parseLockfile(fixture("yarn.lock"));
const packageJson = JSON.parse(fixture("package.json"));

test("parses every entry and maps each descriptor of a multi-descriptor header", () => {
  assert.equal(lock.entries.size, 8);
  assert.equal(
    lock.byDescriptor.get("@scope/helper@npm:^1.0.0").resolution,
    "@scope/helper@npm:1.0.2",
  );
  assert.equal(
    lock.byDescriptor.get("@scope/helper@npm:^1.0.2").resolution,
    "@scope/helper@npm:1.0.2",
  );
  assert.equal(
    lock.byDescriptor.get("alias-name@npm:real-name@4.0.0").resolution,
    "real-name@npm:4.0.0",
  );
});

test("reads only the dependencies block, not peers or meta", () => {
  const devTool = lock.entries.get("dev-tool@npm:2.0.0");
  assert.deepEqual(
    devTool.dependencies.map((dependency) => dependency.name),
    ["@scope/helper", "shared"],
  );
});

test("a version reached through `dependencies` is runtime", () => {
  assert.deepEqual(reach(lock, packageJson, "shared@npm:5.1.6"), {
    reach: "runtime",
    runtimeRoots: ["@scope/runtime-lib"],
    devRoots: [],
  });
});

test("another version of the same package reached only through tooling is dev", () => {
  assert.deepEqual(reach(lock, packageJson, "shared@npm:3.3.11"), {
    reach: "dev",
    runtimeRoots: [],
    devRoots: ["dev-tool"],
  });
});

test("a direct dependency is its own root", () => {
  assert.equal(reach(lock, packageJson, "@scope/runtime-lib@npm:1.0.0").reach, "runtime");
});

test("an alias is reached under its alias name", () => {
  assert.deepEqual(reach(lock, packageJson, "real-name@npm:4.0.0").devRoots, ["alias-name"]);
});

test("an entry without a path to the workspace is unknown", () => {
  assert.equal(reach(lock, packageJson, "orphan@npm:1.0.0").reach, "unknown");
});

test("a resolution missing from the lockfile is absent", () => {
  assert.equal(reach(lock, packageJson, "shared@npm:9.9.9").reach, "absent");
});

test("reachOf is runtime if any resolution is runtime", () => {
  const result = reachOf(lock, packageJson, ["shared@npm:3.3.11", "shared@npm:5.1.6"]);
  assert.equal(result.reach, "runtime");
  assert.deepEqual(result.devRoots, ["dev-tool"]);
});

test("reachOf is dev only if every resolution is dev", () => {
  assert.equal(
    reachOf(lock, packageJson, ["shared@npm:3.3.11", "real-name@npm:4.0.0"]).reach,
    "dev",
  );
});

test("reachOf is unknown when a resolution is absent or nothing was removed", () => {
  assert.equal(
    reachOf(lock, packageJson, ["shared@npm:3.3.11", "shared@npm:9.9.9"]).reach,
    "unknown",
  );
  assert.equal(reachOf(lock, packageJson, []).reach, "unknown");
});

test("resolvedVersions lists every npm version of a package", () => {
  assert.deepEqual(resolvedVersions(lock, "shared"), ["3.3.11", "5.1.6"]);
  assert.deepEqual(resolvedVersions(lock, "@scope/helper"), ["1.0.2"]);
  assert.deepEqual(resolvedVersions(lock, "missing"), []);
});

test("npmResolution builds the resolution string", () => {
  assert.equal(npmResolution("@scope/helper", "1.0.2"), "@scope/helper@npm:1.0.2");
});
