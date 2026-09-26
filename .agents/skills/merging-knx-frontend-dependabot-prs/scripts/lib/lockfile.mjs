// Reads a Yarn Berry lockfile and walks its dependency graph backwards to the workspace, to tell
// whether a resolved version can end up in the shipped panel (reached through `dependencies` in
// package.json) or only in tooling (`devDependencies`). Works per resolved version: the same
// package often appears in several versions with different dependents.

export const WORKSPACE = "knx-frontend@workspace:.";

const unquote = (value) => value.trim().replace(/^"(.*)"$/, "$1");

export const npmResolution = (name, version) => `${name}@npm:${version}`;

export function parseLockfile(text) {
  const blocks = [];
  let block = null;
  let section = null;
  for (const line of text.split("\n")) {
    if (line.trim() === "" || line.startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      const key = unquote(line.replace(/:\s*$/, ""));
      block = key === "__metadata" ? null : { descriptors: key.split(", "), dependencies: [] };
      if (block) blocks.push(block);
      section = null;
      continue;
    }
    if (!block) continue;
    if (indent === 2) {
      const match = line.match(/^ {2}([^:]+):\s*(.*)$/);
      if (!match) continue;
      const [, field, value] = match;
      section = value === "" ? field : null;
      if (field === "version") block.version = unquote(value);
      if (field === "resolution") block.resolution = unquote(value);
      continue;
    }
    if (indent === 4 && section === "dependencies") {
      const match = line.match(/^ {4}("[^"]+"|[^:]+):\s*(.+)$/);
      if (!match) continue;
      const name = unquote(match[1]);
      block.dependencies.push({ name, descriptor: `${name}@${unquote(match[2])}` });
    }
  }

  const entries = new Map();
  const byDescriptor = new Map();
  for (const { resolution, version, descriptors, dependencies } of blocks) {
    const entry = entries.get(resolution) ?? { resolution, version, descriptors: [], dependencies: [] };
    entry.descriptors.push(...descriptors);
    entry.dependencies.push(...dependencies);
    entries.set(resolution, entry);
    for (const descriptor of descriptors) byDescriptor.set(descriptor, entry);
  }

  const parents = new Map();
  for (const entry of entries.values()) {
    for (const { name, descriptor } of entry.dependencies) {
      const child = byDescriptor.get(descriptor);
      if (!child) continue;
      if (!parents.has(child.resolution)) parents.set(child.resolution, []);
      parents.get(child.resolution).push({ parent: entry, name });
    }
  }
  return { entries, byDescriptor, parents };
}

export function reach(lock, packageJson, resolution) {
  if (!lock.entries.has(resolution)) return { reach: "absent", runtimeRoots: [], devRoots: [] };
  const runtimeNames = new Set(Object.keys(packageJson.dependencies ?? {}));
  const runtimeRoots = new Set();
  const devRoots = new Set();
  const seen = new Set([resolution]);
  const queue = [resolution];
  while (queue.length > 0) {
    for (const { parent, name } of lock.parents.get(queue.shift()) ?? []) {
      if (parent.resolution === WORKSPACE) {
        (runtimeNames.has(name) ? runtimeRoots : devRoots).add(name);
      } else if (!seen.has(parent.resolution)) {
        seen.add(parent.resolution);
        queue.push(parent.resolution);
      }
    }
  }
  const result = { runtimeRoots: [...runtimeRoots].sort(), devRoots: [...devRoots].sort() };
  if (runtimeRoots.size > 0) return { reach: "runtime", ...result };
  if (devRoots.size > 0) return { reach: "dev", ...result };
  return { reach: "unknown", ...result };
}

export function reachOf(lock, packageJson, resolutions) {
  const results = resolutions.map((resolution) => reach(lock, packageJson, resolution));
  const runtimeRoots = [...new Set(results.flatMap((result) => result.runtimeRoots))].sort();
  const devRoots = [...new Set(results.flatMap((result) => result.devRoots))].sort();
  if (runtimeRoots.length > 0) return { reach: "runtime", runtimeRoots, devRoots };
  if (results.length === 0 || results.some((result) => result.reach !== "dev")) {
    return { reach: "unknown", runtimeRoots, devRoots };
  }
  return { reach: "dev", runtimeRoots, devRoots };
}

export function resolvedVersions(lock, name) {
  const prefix = `${name}@npm:`;
  return [...lock.entries.values()]
    .filter((entry) => entry.resolution.startsWith(prefix))
    .map((entry) => entry.version);
}
