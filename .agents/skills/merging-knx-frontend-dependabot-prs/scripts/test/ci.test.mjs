import assert from "node:assert/strict";
import test from "node:test";
import { ciState, summarizeChecks, tsErrors } from "../lib/ci.mjs";

const run = (name, conclusion, startedAt = "2026-09-09T08:37:15Z", status = "COMPLETED") => ({
  __typename: "CheckRun",
  name,
  status,
  conclusion,
  startedAt,
  detailsUrl: `https://github.com/XKNX/knx-frontend/actions/runs/1/job/${name.length}00`,
});

test("all successful or skipped checks are green", () => {
  assert.deepEqual(summarizeChecks([run("Lint", "SUCCESS"), run("codecov", "SKIPPED")]), {
    pending: false,
    failing: [],
  });
});

test("a failing check reports its job id", () => {
  assert.deepEqual(summarizeChecks([run("Types", "FAILURE")]).failing, [
    { name: "Types", jobId: "500" },
  ]);
});

test("only the newest run of a check counts", () => {
  const rollup = [
    run("Build", "FAILURE", "2026-09-09T08:00:00Z"),
    run("Build", "SUCCESS", "2026-09-09T09:00:00Z"),
  ];
  assert.deepEqual(summarizeChecks(rollup).failing, []);
});

test("a check still running or no checks at all is pending", () => {
  assert.equal(summarizeChecks([run("Test", null, undefined, "IN_PROGRESS")]).pending, true);
  assert.equal(summarizeChecks([]).pending, true);
});

test("a failing status context counts like a failing check", () => {
  const context = { __typename: "StatusContext", context: "codecov/patch", state: "FAILURE" };
  assert.deepEqual(summarizeChecks([context]).failing, [{ name: "codecov/patch", jobId: null }]);
});

test("tsErrors strips timestamps, colors and annotations and keeps each error once", () => {
  const log = [
    "2026-09-25T21:31:08.4993512Z ##[error]homeassistant-frontend/src/a.ts(168,50): error TS2551: Property '_config' does not exist.",
    "2026-09-25T21:31:08.4993999Z \u001b[96mhomeassistant-frontend/src/a.ts(168,50): error TS2551: Property '_config' does not exist.\u001b[0m",
    "2026-09-25T21:31:08.5000000Z Found 1 error.",
  ].join("\n");
  assert.deepEqual(
    [...tsErrors(log)],
    ["homeassistant-frontend/src/a.ts(168,50): error TS2551: Property '_config' does not exist."],
  );
});

const known = new Set(["a.ts(1,1): error TS1: known"]);

test("pending wins over everything", () => {
  assert.equal(ciState({ pending: true, failing: [{ name: "Build", jobId: "1" }] }).ci, "pending");
});

test("no failing checks is green", () => {
  assert.deepEqual(ciState({ pending: false, failing: [] }), { ci: "green", detail: "" });
});

test("Types with exactly the known errors is types-baseline", () => {
  const state = ciState({
    pending: false,
    failing: [{ name: "Types", jobId: "1" }],
    typesErrors: new Set(known),
    baselineErrors: known,
  });
  assert.equal(state.ci, "types-baseline");
});

test("Types with an additional error is red", () => {
  const state = ciState({
    pending: false,
    failing: [{ name: "Types", jobId: "1" }],
    typesErrors: new Set([...known, "b.ts(2,2): error TS2: new"]),
    baselineErrors: known,
  });
  assert.deepEqual(state, { ci: "red", detail: "Types" });
});

test("Types failing without any TS error is red", () => {
  const state = ciState({
    pending: false,
    failing: [{ name: "Types", jobId: "1" }],
    typesErrors: new Set(),
    baselineErrors: known,
  });
  assert.equal(state.ci, "red");
});

test("Types failing while main is green (empty baseline) is red", () => {
  const state = ciState({
    pending: false,
    failing: [{ name: "Types", jobId: "1" }],
    typesErrors: new Set(known),
    baselineErrors: new Set(),
  });
  assert.equal(state.ci, "red");
});

test("Lint failing only on the dedupe step is dedupe", () => {
  const state = ciState({
    pending: false,
    failing: [{ name: "Lint", jobId: "1" }],
    lintFailedSteps: ["Check for duplicate dependencies"],
  });
  assert.equal(state.ci, "dedupe");
});

test("Lint failing on eslint is red", () => {
  const state = ciState({
    pending: false,
    failing: [{ name: "Lint", jobId: "1" }],
    lintFailedSteps: ["Run eslint"],
  });
  assert.deepEqual(state, { ci: "red", detail: "Lint" });
});

test("dedupe together with known Types errors is dedupe", () => {
  const state = ciState({
    pending: false,
    failing: [
      { name: "Lint", jobId: "1" },
      { name: "Types", jobId: "2" },
    ],
    lintFailedSteps: ["Check for duplicate dependencies"],
    typesErrors: new Set(known),
    baselineErrors: known,
  });
  assert.equal(state.ci, "dedupe");
});

test("any other failing check is red and named", () => {
  const state = ciState({
    pending: false,
    failing: [
      { name: "Build", jobId: "1" },
      { name: "Test", jobId: "2" },
    ],
  });
  assert.deepEqual(state, { ci: "red", detail: "Build, Test" });
});
