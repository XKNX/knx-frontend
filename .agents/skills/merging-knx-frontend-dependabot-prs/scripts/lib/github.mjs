// The only module that talks to git and GitHub. Every call here reads; nothing comments, pushes,
// closes or merges.

import { execFileSync } from "node:child_process";

export const REPO = "XKNX/knx-frontend";

const run = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
const gh = (...args) => run("gh", args);
const ghJson = (...args) => JSON.parse(gh(...args));
const git = (...args) => run("git", args);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function ghReady() {
  try {
    gh("auth", "status");
    return true;
  } catch {
    return false;
  }
}

export function upstreamRemote() {
  for (const line of git("remote", "-v").split("\n")) {
    const [name, url, kind] = line.split(/\s+/);
    if (kind === "(fetch)" && /github\.com[:/]xknx\/knx-frontend(\.git)?$/i.test(url)) return name;
  }
  return null;
}

export function mainFiles(remote) {
  git("fetch", "--quiet", remote, "main");
  return {
    lockText: git("show", `${remote}/main:yarn.lock`),
    packageJson: JSON.parse(git("show", `${remote}/main:package.json`)),
  };
}

export const openDependabotPrs = () =>
  ghJson("pr", "list", "-R", REPO, "--author", "app/dependabot", "--state", "open", "--limit", "100", "--json", "number")
    .map((pr) => pr.number)
    .sort((a, b) => a - b);

const FIELDS =
  "number,title,url,author,files,headRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup,commits";

// GitHub computes mergeability lazily and answers UNKNOWN at first.
export function prView(number) {
  for (let attempt = 1; ; attempt++) {
    const pr = ghJson("pr", "view", String(number), "-R", REPO, "--json", FIELDS);
    if (pr.mergeable !== "UNKNOWN" || attempt === 5) return pr;
    sleep(3000);
  }
}

export const prDiff = (number) => gh("pr", "diff", String(number), "-R", REPO);

export const behindBy = (sha) => ghJson("api", `repos/${REPO}/compare/main...${sha}`).behind_by;

export const failedSteps = (jobId) =>
  ghJson("api", `repos/${REPO}/actions/jobs/${jobId}`)
    .steps.filter((step) => step.conclusion === "failure")
    .map((step) => step.name);

export const jobLog = (jobId) =>
  gh("api", "--allow-escape-sequences", `repos/${REPO}/actions/jobs/${jobId}/logs`);

export function mainTypesJob() {
  const [latest] = ghJson(
    "run", "list", "-R", REPO, "--branch", "main", "--workflow", "CI",
    "--status", "completed", "--limit", "1", "--json", "databaseId",
  );
  if (!latest) return null;
  const { jobs } = ghJson("api", `repos/${REPO}/actions/runs/${latest.databaseId}/jobs`);
  return jobs.find((job) => job.name === "Types") ?? null;
}
