import assert from "node:assert/strict";
import test from "node:test";
import { decide } from "../lib/decide.mjs";

const pr = (overrides = {}) => ({
  number: 463,
  fromDependabot: true,
  files: ["yarn.lock"],
  ecosystem: "npm",
  kind: "lock-only",
  package: "svgo",
  from: "4.0.2",
  to: "4.1.0",
  major: false,
  reach: "dev",
  runtimeRoots: [],
  devRoots: ["minify-literals"],
  state: "clean",
  behindBy: 0,
  supersededBy: null,
  ci: "green",
  ciDetail: "",
  foreignCommits: [],
  overrides: [],
  ...overrides,
});
const action = (overrides) => decide(pr(overrides)).action;

test("a PR not opened by Dependabot is skipped, whatever else holds", () => {
  assert.equal(action({ fromDependabot: false, kind: "direct" }), "skip");
});

test("unexpected files stop the triage", () => {
  const result = decide(pr({ ecosystem: "other", kind: "other", files: ["src/a.ts"] }));
  assert.deepEqual(result, { action: "stop", reason: "unexpected files: src/a.ts" });
});

test("superseded wins over direct", () => {
  assert.equal(
    action({ state: "superseded", supersededBy: "4.2.0", kind: "direct" }),
    "close-superseded",
  );
});

test("a direct npm bump is closed, even when behind or red, and flags overrides", () => {
  assert.equal(action({ kind: "direct", state: "behind", ci: "red" }), "close-direct");
  assert.match(
    decide(pr({ kind: "direct", overrides: ["@lit/task"] })).reason,
    /overrides: @lit\/task/,
  );
});

test("behind or conflicting asks Dependabot to rebase", () => {
  assert.deepEqual(decide(pr({ state: "behind", behindBy: 4 })), {
    action: "rebase",
    reason: "4 commits behind main",
  });
  assert.equal(action({ state: "conflict", ci: "red" }), "rebase");
});

test("a branch with our own commit is recreated instead", () => {
  assert.equal(action({ state: "conflict", foreignCommits: ["1234567"] }), "recreate");
});

test("unknown mergeability or pending checks wait", () => {
  assert.equal(action({ state: "unknown" }), "wait");
  assert.equal(action({ ci: "pending" }), "wait");
});

test("a dedupe-only failure is repaired", () => {
  assert.equal(action({ ci: "dedupe" }), "dedupe-fix");
});

test("any other red check stops", () => {
  assert.deepEqual(decide(pr({ ci: "red", ciDetail: "Build" })), {
    action: "stop",
    reason: "failing: Build",
  });
});

test("a green Actions PR merges and flags a major bump", () => {
  const result = decide(
    pr({ ecosystem: "actions", kind: "workflow", reach: "-", major: true, ci: "types-baseline" }),
  );
  assert.equal(result.action, "merge");
  assert.match(result.reason, /major bump/);
  assert.match(result.reason, /known main errors/);
});

test("a green tooling-only lock bump merges", () => {
  assert.equal(action({ ci: "types-baseline" }), "merge");
});

test("a lock bump that ships, or whose reach is unknown, needs local gates", () => {
  assert.equal(
    action({ reach: "runtime", runtimeRoots: ["@home-assistant/webawesome"] }),
    "local-gates",
  );
  assert.equal(action({ reach: "unknown" }), "local-gates");
});
