#!/usr/bin/env node
// Read-only triage of the open Dependabot PRs on XKNX/knx-frontend.
//
// Usage, from a knx-frontend checkout with a git remote pointing at XKNX/knx-frontend:
//   node triage.mjs [--json] [<pr>...]       classify all open Dependabot PRs, or only these
//   node triage.mjs --reach <pkg>@<version>  reach of one resolved version on main
//   node triage.mjs --types-baseline         the `error TS` lines of main's latest CI run
//
// Reads main's yarn.lock and package.json with `git show`, PRs and CI results with `gh`. Writes
// nothing. Exit codes: 0 all classified, 1 at least one PR could not be read, 2 missing setup.

import { parseArgs } from "node:util";
import { ciState, summarizeChecks, tsErrors } from "./lib/ci.mjs";
import { decide } from "./lib/decide.mjs";
import { parseDiff } from "./lib/diff.mjs";
import * as github from "./lib/github.mjs";
import { npmResolution, parseLockfile, reach, reachOf } from "./lib/lockfile.mjs";
import {
  classifyFiles,
  foreignCommits,
  isMajorBump,
  overridePackages,
  parseTitle,
  supersededVersion,
} from "./lib/pr.mjs";

const fail = (message) => {
  process.stderr.write(`triage: ${message}\n`);
  process.exit(2);
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    json: { type: "boolean", default: false },
    reach: { type: "string" },
    "types-baseline": { type: "boolean", default: false },
  },
});
const numbers = positionals.map(Number);
if (numbers.some((number) => !Number.isInteger(number) || number <= 0)) {
  fail(`PR numbers must be positive integers, got: ${positionals.join(" ")}`);
}

if (!github.ghReady()) fail("gh is missing or not logged in; run `gh auth login`");
const remote = github.upstreamRemote();
if (!remote) {
  fail(
    "no git remote points at XKNX/knx-frontend; run `git remote add upstream https://github.com/XKNX/knx-frontend.git`",
  );
}
const main = github.mainFiles(remote);
const lock = parseLockfile(main.lockText);

if (values.reach) {
  const at = values.reach.lastIndexOf("@");
  if (at <= 0) fail("--reach expects <pkg>@<version>, e.g. nanoid@5.1.6");
  const resolution = npmResolution(values.reach.slice(0, at), values.reach.slice(at + 1));
  const result = reach(lock, main.packageJson, resolution);
  const roots = result.reach === "runtime" ? result.runtimeRoots : result.devRoots;
  console.log(`${values.reach}  ${result.reach}${roots.length ? `  via ${roots.join(", ")}` : ""}`);
  process.exit(0);
}

let baseline;
const baselineErrors = () => {
  if (baseline === undefined) {
    const job = github.mainTypesJob();
    baseline = !job || job.conclusion === "success" ? new Set() : tsErrors(github.jobLog(job.id));
  }
  return baseline;
};

if (values["types-baseline"]) {
  const errors = [...baselineErrors()].sort();
  if (errors.length > 0) console.log(errors.join("\n"));
  process.exit(0);
}

function triage(number) {
  const pr = github.prView(number);
  const files = pr.files.map((file) => file.path);
  const { ecosystem, kind } = classifyFiles(files);
  const { name, from, to } = parseTitle(pr.title);
  const diff = parseDiff(github.prDiff(number));
  const reachResult =
    ecosystem === "npm"
      ? reachOf(lock, main.packageJson, diff.removed)
      : { reach: "-", runtimeRoots: [], devRoots: [] };
  const supersededBy = ecosystem === "npm" ? supersededVersion(lock, name, from, to) : null;

  let state;
  let behindBy = 0;
  if (supersededBy) state = "superseded";
  else if (pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY") state = "conflict";
  else if (pr.mergeable === "UNKNOWN") state = "unknown";
  else {
    behindBy = github.behindBy(pr.headRefOid);
    state = behindBy > 0 ? "behind" : "clean";
  }

  const checks = summarizeChecks(pr.statusCheckRollup ?? []);
  const lint = checks.failing.find((check) => check.name === "Lint");
  const types = checks.failing.find((check) => check.name === "Types");
  const { ci, detail } = ciState({
    ...checks,
    lintFailedSteps: lint?.jobId ? github.failedSteps(lint.jobId) : [],
    typesErrors: types?.jobId ? tsErrors(github.jobLog(types.jobId)) : null,
    baselineErrors: types ? baselineErrors() : null,
  });

  const features = {
    number,
    title: pr.title,
    url: pr.url,
    headSha: pr.headRefOid,
    headRefName: pr.headRefName,
    fromDependabot: pr.author?.login === "app/dependabot",
    files,
    ecosystem,
    kind,
    package: name,
    from,
    to,
    major: ecosystem === "actions" && isMajorBump(from, to),
    ...reachResult,
    state,
    behindBy,
    supersededBy,
    ci,
    ciDetail: detail,
    foreignCommits: foreignCommits(pr.commits ?? []),
    overrides: overridePackages(diff.packageKeys, main.packageJson),
  };
  return { ...features, ...decide(features) };
}

const COLUMNS = [
  ["PR", (row) => `#${row.number}`],
  ["package", (row) => row.package ?? "?"],
  ["versions", (row) => (row.from ? `${row.from} -> ${row.to}` : "")],
  ["eco", (row) => row.ecosystem ?? ""],
  ["kind", (row) => row.kind ?? ""],
  ["reach", (row) => row.reach ?? ""],
  ["state", (row) => row.state ?? ""],
  ["ci", (row) => row.ci ?? ""],
  ["action", (row) => row.action],
  ["head", (row) => row.headSha?.slice(0, 7) ?? ""],
  ["reason", (row) => row.reason ?? ""],
];

function formatTable(rows) {
  const lines = [
    COLUMNS.map(([title]) => title),
    ...rows.map((row) => COLUMNS.map(([, cell]) => cell(row))),
  ];
  const widths = COLUMNS.map((_, i) => Math.max(...lines.map((line) => line[i].length)));
  return lines
    .map((line) =>
      line.map((cell, i) => (i === line.length - 1 ? cell : cell.padEnd(widths[i]))).join("  "),
    )
    .join("\n");
}

const rows = (numbers.length > 0 ? numbers : github.openDependabotPrs()).map((number) => {
  try {
    return triage(number);
  } catch (error) {
    const message = String(error?.stderr || error?.message || error)
      .trim()
      .split("\n")[0];
    return { number, action: "error", reason: message };
  }
});
console.log(values.json ? JSON.stringify(rows, null, 2) : formatTable(rows));
process.exit(rows.some((row) => row.action === "error") ? 1 : 0);
