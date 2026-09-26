// The only module that runs git or gh. Everything here reads; nothing writes to the repository or
// to GitHub.

import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

const run = (command, args, cwd) =>
  execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
const git = (...args) => run("git", args);

export const topLevel = () => git("rev-parse", "--show-toplevel").trim();
export const resolveCommit = (ref) =>
  git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`).trim();
export const mergeBase = (a, b) => git("merge-base", a, b).trim();
export const diff = (base, head) =>
  git("diff", "--no-color", "--no-ext-diff", "--no-renames", "-U0", base, head, "--");

export function show(ref, path) {
  try {
    return git("show", `${ref}:${path}`);
  } catch {
    return null;
  }
}

export function list(ref, dir) {
  try {
    return git("ls-tree", "--name-only", `${ref}:${dir}`).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// homeassistant-frontend/package.json at the submodule commit that `ref` points to. Read from the
// submodule's object store, so a historical commit can be checked without checking it out.
export function submodulePackage(top, ref) {
  const pointer = git("ls-tree", ref, "homeassistant-frontend").split(/\s+/)[2];
  if (!pointer) throw new Error(`${ref} has no homeassistant-frontend submodule`);
  const dir = join(top, "homeassistant-frontend");
  let initialized = false;
  try {
    initialized =
      realpathSync(run("git", ["rev-parse", "--show-toplevel"], dir).trim()) === realpathSync(dir);
  } catch {
    initialized = false;
  }
  if (!initialized) {
    throw new Error(
      "homeassistant-frontend is not initialized; run: git submodule update --init homeassistant-frontend",
    );
  }
  try {
    return JSON.parse(run("git", ["show", `${pointer}:package.json`], dir));
  } catch {
    throw new Error(
      `submodule commit ${pointer.slice(0, 10)} is not available locally; run: git -C homeassistant-frontend fetch origin`,
    );
  }
}

const CORE_WS = "homeassistant/components/knx/websocket.py";

export function coreWebsocket(corePath) {
  if (corePath) {
    try {
      return readFileSync(join(corePath, CORE_WS), "utf8");
    } catch {
      return null;
    }
  }
  try {
    return run("gh", [
      "api",
      "-H",
      "Accept: application/vnd.github.raw",
      `repos/home-assistant/core/contents/${CORE_WS}?ref=dev`,
    ]);
  } catch {
    return null;
  }
}
