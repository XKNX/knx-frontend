import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseLockfile } from "../lib/lockfile.mjs";
import {
  classifyFiles,
  compareVersions,
  foreignCommits,
  isMajorBump,
  overridePackages,
  parseTitle,
  supersededVersion,
} from "../lib/pr.mjs";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("parseTitle reads npm and Actions titles", () => {
  assert.deepEqual(parseTitle("build(deps): Bump svgo from 4.0.2 to 4.1.0"), {
    name: "svgo",
    from: "4.0.2",
    to: "4.1.0",
  });
  assert.deepEqual(parseTitle("build(deps): Bump actions/checkout from 6 to 7"), {
    name: "actions/checkout",
    from: "6",
    to: "7",
  });
  assert.deepEqual(parseTitle("Update upstream to 20260826.4"), {
    name: null,
    from: null,
    to: null,
  });
});

test("compareVersions orders numerically and puts prereleases first", () => {
  assert.equal(compareVersions("1.10.0", "1.8.3"), 1);
  assert.equal(compareVersions("3.3.11", "3.3.17"), -1);
  assert.equal(compareVersions("4.1.0", "4.1.0"), 0);
  assert.equal(compareVersions("3.7.0-ha.0", "3.7.0"), -1);
  assert.equal(compareVersions("7", "6.3.0"), 1);
});

test("classifyFiles tells Actions, direct and lock-only apart", () => {
  assert.deepEqual(classifyFiles([".github/workflows/ci.yml"]), {
    ecosystem: "actions",
    kind: "workflow",
  });
  assert.deepEqual(classifyFiles(["yarn.lock"]), { ecosystem: "npm", kind: "lock-only" });
  assert.deepEqual(classifyFiles(["package.json", "yarn.lock"]), {
    ecosystem: "npm",
    kind: "direct",
  });
  assert.deepEqual(classifyFiles(["yarn.lock", "src/main.ts"]), {
    ecosystem: "other",
    kind: "other",
  });
  assert.deepEqual(classifyFiles([]), { ecosystem: "other", kind: "other" });
});

test("isMajorBump compares the first number, with or without a v prefix", () => {
  assert.equal(isMajorBump("6", "7"), true);
  assert.equal(isMajorBump("6.3.0", "7.0.0"), true);
  assert.equal(isMajorBump("6.2.0", "6.3.0"), false);
  assert.equal(isMajorBump("v4", "v4.1"), false);
  assert.equal(isMajorBump(null, "7"), false);
});

test("foreignCommits lists commits Dependabot did not author", () => {
  const commits = [
    { oid: "e8fa31cf388c373f", authors: [{ login: "dependabot[bot]" }] },
    { oid: "1234567890abcdef", authors: [{ login: "philippwaller" }] },
  ];
  assert.deepEqual(foreignCommits(commits), ["1234567"]);
  assert.deepEqual(foreignCommits([commits[0]]), []);
});

test("overridePackages finds changed keys that KNX overrides", () => {
  const packageJson = {
    dependenciesOverride: { "@lit/task": "1.0.2" },
    devDependenciesOverride: {},
    resolutionsOverride: { tslib: "2.8.1" },
  };
  assert.deepEqual(overridePackages(["@lit/task", "maplibre-gl", "tslib"], packageJson), [
    "@lit/task",
    "tslib",
  ]);
  assert.deepEqual(overridePackages(["maplibre-gl"], {}), []);
});

test("supersededVersion needs the old version gone and the target reached", () => {
  const lock = parseLockfile(fixture("yarn.lock"));
  assert.equal(supersededVersion(lock, "shared", "3.3.11", "3.3.17"), null);
  const moved = parseLockfile(
    fixture("yarn.lock").replaceAll("3.3.11", "3.3.20").replaceAll("^3.3.0", "^3.3.20"),
  );
  assert.equal(supersededVersion(moved, "shared", "3.3.11", "3.3.17"), "5.1.6");
  const lower = parseLockfile(
    fixture("yarn.lock").replaceAll("5.1.6", "3.3.12").replaceAll("3.3.11", "3.3.13"),
  );
  assert.equal(supersededVersion(lower, "shared", "3.3.11", "3.3.17"), null);
  assert.equal(supersededVersion(lock, null, null, null), null);
});
