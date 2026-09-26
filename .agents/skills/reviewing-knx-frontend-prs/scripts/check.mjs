#!/usr/bin/env node
// Read-only checks of a knx-frontend change against the rules maintainers enforce in review.
//
// Usage, from a knx-frontend checkout (the submodule must be initialized):
//   node check.mjs --base <ref> [--head <ref>] [--core <home-assistant-core checkout>] [--json]
//
// Compares head with its merge-base with --base and reports findings on added lines only. Reads
// git objects (and Core's websocket.py via --core or gh); writes nothing.
// Exit codes: 0 checks ran (whatever they found), 2 missing setup.

import { parseArgs } from "node:util";
import { codeFindings } from "./lib/code.mjs";
import { importFindings, lockFindings, mergeFindings, staleOverrideFindings } from "./lib/deps.mjs";
import { parseDiff } from "./lib/diff.mjs";
import { bySeverity } from "./lib/findings.mjs";
import * as git from "./lib/git.mjs";
import { l10nFindings, LANG_DIR } from "./lib/l10n.mjs";
import { devtoolFindings, gates, pathFindings, testFindings } from "./lib/repo.mjs";
import { addedCommands, wsFindings } from "./lib/ws.mjs";

const fail = (message) => {
  process.stderr.write(`check: ${message}\n`);
  process.exit(2);
};

let values;
try {
  ({ values } = parseArgs({
    options: {
      base: { type: "string" },
      head: { type: "string", default: "HEAD" },
      core: { type: "string" },
      json: { type: "boolean", default: false },
    },
  }));
} catch (error) {
  fail(error.message);
}
if (!values.base) fail("--base is required, e.g. --base upstream/main");

let top;
try {
  top = git.topLevel();
} catch {
  fail("not inside a git repository");
}
let head;
let base;
try {
  head = git.resolveCommit(values.head);
  base = git.mergeBase(git.resolveCommit(values.base), head);
} catch {
  fail(`cannot resolve ${values.base} and ${values.head} to commits with a common ancestor`);
}

const diffText = git.diff(base, head);
const files = parseDiff(diffText);
if (diffText.trim() !== "" && files.length === 0) {
  fail("could not parse the output of git diff; check diff.* settings in your git config");
}
const changed = new Set(files.map((file) => file.path));
const packageText = git.show(head, "package.json");
if (packageText === null) fail(`${head.slice(0, 7)} has no package.json; is this knx-frontend?`);
const knx = JSON.parse(packageText);
let core;
try {
  core = git.submodulePackage(top, head);
} catch (error) {
  fail(error.message);
}

const findings = [];
const notRun = [];

if (values.head === "HEAD") {
  const dirty = git.uncommitted();
  if (dirty.length > 0) {
    notRun.push(
      `${dirty.length} file(s) with uncommitted changes are not checked; commit them and run again`,
    );
  }
}

if (changed.has("package.json") || changed.has("homeassistant-frontend")) {
  let before = new Set();
  try {
    const baseKnx = JSON.parse(git.show(base, "package.json"));
    const baseCore = git.submodulePackage(top, base);
    before = new Set(mergeFindings(baseKnx, baseCore, "").map((item) => item.key));
  } catch {
    notRun.push(
      "DEP-merge baseline: package.json or the submodule at the merge-base is not readable; all mismatches are reported",
    );
  }
  findings.push(...mergeFindings(knx, core, packageText).filter((item) => !before.has(item.key)));
}

const srcEntries = new Set(git.list(head, "src").map((name) => name.replace(/\.(ts|js)$/, "")));
findings.push(...importFindings(files, knx, core, srcEntries));
let basePkg = null;
try {
  basePkg = JSON.parse(git.show(base, "package.json") ?? "null");
} catch {
  basePkg = null;
}
findings.push(...lockFindings(files, basePkg, knx));
findings.push(
  ...staleOverrideFindings(
    files.find((file) => file.path === "package.json"),
    knx,
    core,
  ),
);

const paths = pathFindings(files);
findings.push(...paths.findings);
findings.push(...devtoolFindings(files, (path) => git.show(head, path)));

const languages = {};
for (const name of git.list(head, LANG_DIR.slice(0, -1))) {
  if (!name.endsWith(".json")) continue;
  try {
    languages[name.slice(0, -".json".length)] = new Set(
      Object.keys(JSON.parse(git.show(head, `${LANG_DIR}${name}`))),
    );
  } catch {
    notRun.push(`L10N: ${LANG_DIR}${name} is not valid JSON`);
  }
}
findings.push(...l10nFindings(files, languages));
findings.push(...codeFindings(files));

const ws = wsFindings(
  files,
  addedCommands(files).length > 0 ? git.coreWebsocket(values.core) : null,
);
findings.push(...ws.findings);
notRun.push(...ws.notRun);
findings.push(...testFindings(files));
findings.sort(bySeverity);

const result = {
  base,
  head,
  files: files.length,
  findings,
  notRun,
  handover: paths.handover,
  gates: gates(files),
};

if (values.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const lines = [
    `check.mjs  base ${base.slice(0, 7)}  head ${head.slice(0, 7)}  ${files.length} files`,
  ];
  if (findings.length === 0) lines.push("No findings.");
  for (const item of findings) {
    const where = item.line ? `${item.file}:${item.line}` : item.file;
    const evidence = item.evidence.length > 0 ? `  (${item.evidence.join(", ")})` : "";
    lines.push(
      `${item.severity.toUpperCase().padEnd(10)}  ${item.rule.padEnd(18)}  ${where}  ${item.message}${evidence}`,
    );
  }
  if (notRun.length > 0) lines.push("Not run:", ...notRun.map((item) => `  ${item}`));
  if (result.handover) lines.push(`Handover: ${result.handover}`);
  lines.push(`Gates: ${result.gates.length > 0 ? result.gates.join(", ") : "none"}`);
  console.log(lines.join("\n"));
}
