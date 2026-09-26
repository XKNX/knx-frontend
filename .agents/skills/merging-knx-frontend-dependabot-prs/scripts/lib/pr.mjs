// Facts about one Dependabot PR that come from its title, files and commits, plus the check
// whether main has already moved past the version the PR brings.

import { resolvedVersions } from "./lockfile.mjs";

export function parseTitle(title) {
  const match = title.match(/Bump (\S+) from (\S+) to (\S+)/);
  return match
    ? { name: match[1], from: match[2], to: match[3] }
    : { name: null, from: null, to: null };
}

const splitVersion = (version) => {
  const dash = version.indexOf("-");
  const core = dash < 0 ? version : version.slice(0, dash);
  return [core.replace(/^v/, "").split(".").map(Number), dash < 0 ? "" : version.slice(dash + 1)];
};

export function compareVersions(a, b) {
  const [coreA, preA] = splitVersion(a);
  const [coreB, preB] = splitVersion(b);
  for (let i = 0; i < Math.max(coreA.length, coreB.length); i++) {
    const difference = (coreA[i] ?? 0) - (coreB[i] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  if (preA === preB) return 0;
  if (preA === "") return 1;
  if (preB === "") return -1;
  return preA < preB ? -1 : 1;
}

export function classifyFiles(files) {
  if (files.length > 0 && files.every((file) => file.startsWith(".github/"))) {
    return { ecosystem: "actions", kind: "workflow" };
  }
  if (files.length > 0 && files.every((file) => file === "package.json" || file === "yarn.lock")) {
    return { ecosystem: "npm", kind: files.includes("package.json") ? "direct" : "lock-only" };
  }
  return { ecosystem: "other", kind: "other" };
}

export function isMajorBump(from, to) {
  if (!from || !to) return false;
  return splitVersion(from)[0][0] !== splitVersion(to)[0][0];
}

export function foreignCommits(commits) {
  return commits
    .filter((commit) => !commit.authors.some((author) => author.login === "dependabot[bot]"))
    .map((commit) => commit.oid.slice(0, 7));
}

export function overridePackages(packageKeys, packageJson) {
  const overridden = new Set([
    ...Object.keys(packageJson.dependenciesOverride ?? {}),
    ...Object.keys(packageJson.devDependenciesOverride ?? {}),
    ...Object.keys(packageJson.resolutionsOverride ?? {}),
  ]);
  return packageKeys.filter((key) => overridden.has(key));
}

// The PR is superseded when main no longer resolves the old version and already resolves the
// target or a newer one. Returns that newest version, or null.
export function supersededVersion(lock, name, from, to) {
  if (!name || !from || !to) return null;
  const versions = resolvedVersions(lock, name);
  if (versions.includes(from)) return null;
  const newer = versions.filter((version) => compareVersions(version, to) >= 0);
  return newer.sort(compareVersions).at(-1) ?? null;
}
