// Builds throwaway knx-frontend-like repositories (with a submodule and stub programs) and runs
// doctor.sh against them. Git runs with an empty global config so the user's settings cannot leak
// into the results.

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const DOCTOR = resolve(import.meta.dirname, "../doctor.sh");
const BASH = process.env.DOCTOR_BASH ?? "bash";
const GIT_ENV = {
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

export function git(cwd, ...args) {
  const result = spawnSync("git", ["-c", "protocol.file.allow=always", ...args], {
    cwd,
    env: { ...process.env, ...GIT_ENV },
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

const script = (path, body) => {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
};

export function makeFixture({
  name = "knx-frontend",
  tags = ["20260801.0", "20260826.4", "20260826.7"],
  pointer = "20260826.4",
  afterLastTag = false,
  remotes = { upstream: "https://github.com/XKNX/knx-frontend.git" },
  initSubmodule = true,
  prefix = "doctor-",
} = {}) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const sub = join(root, "sub");
  mkdirSync(sub);
  git(sub, "init", "-q", "-b", "dev");
  for (const tag of tags) {
    git(sub, "commit", "-q", "--allow-empty", "-m", tag);
    git(sub, "tag", tag);
  }
  git(sub, "commit", "-q", "--allow-empty", "-m", "after the last tag");

  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(
    join(repo, "package.json"),
    `${JSON.stringify({ name, packageManager: "yarn@4.18.0" }, null, 2)}\n`,
  );
  writeFileSync(join(repo, ".nvmrc"), "24.19.0\n");
  writeFileSync(
    join(repo, ".yarnrc.yml"),
    "yarnPath: homeassistant-frontend/.yarn/releases/yarn-4.18.0.cjs\n",
  );
  writeFileSync(join(repo, "yarn.lock"), "# lockfile\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "init");
  git(repo, "submodule", "add", "-q", sub, "homeassistant-frontend");
  git(join(repo, "homeassistant-frontend"), "checkout", "-q", afterLastTag ? "dev" : pointer);
  git(repo, "add", "homeassistant-frontend");
  git(repo, "commit", "-q", "-m", "submodule");
  if (!initSubmodule) git(repo, "submodule", "deinit", "-q", "-f", "homeassistant-frontend");
  for (const [remote, url] of Object.entries(remotes)) git(repo, "remote", "add", remote, url);

  const bin = join(root, "bin");
  mkdirSync(bin);
  script(join(bin, "node"), 'echo "v${STUB_NODE:-24.19.0}"');
  script(join(bin, "yarn"), 'echo "${STUB_YARN:-4.18.0}"');
  script(
    join(bin, "gh"),
    [
      '[ -n "$STUB_GH_FAIL" ] && exit 1',
      'case "$*" in',
      '  *frontend/releases*) printf "%s\\n" "$STUB_GH_RELEASES" ;;',
      '  *frontend/manifest.json*) printf "%s\\n" "$STUB_GH_MANIFEST" ;;',
      "  *) exit 1 ;;",
      "esac",
    ].join("\n"),
  );
  const python = join(root, "python");
  script(
    python,
    [
      'if [ "$STUB_PY" = checkout ]; then echo "$PYTHONPATH/knx_frontend/__init__.py";',
      "else echo /venv/lib/python3/site-packages/knx_frontend/__init__.py; fi",
      "echo entrypoint.abc123.js",
      'echo "${STUB_PY_INSTALLED-2026.9.4.1}"',
      'echo "${STUB_PY_PIN-2026.9.4.1}"',
    ].join("\n"),
  );
  const nvm = join(root, "nvm");
  mkdirSync(join(nvm, "versions/node/v24.19.0"), { recursive: true });
  writeFileSync(join(nvm, "nvm.sh"), "# stub\n");
  return { root, repo, bin, nvm, python };
}

// Everything the doctor checks locally in place: dependencies, hook, agent links, build output
// and the inputs for lint:types.
export function makeHealthy(fixture) {
  const repo = fixture.repo;
  const file = (path, content = "") => {
    mkdirSync(join(repo, path, ".."), { recursive: true });
    writeFileSync(join(repo, path), content);
  };
  file("node_modules/.yarn-state.yml", "# state\n");
  const later = new Date(Date.now() + 60_000);
  utimesSync(join(repo, "node_modules/.yarn-state.yml"), later, later);
  file(".husky/_/pre-commit");
  git(repo, "config", "core.hooksPath", ".husky/_");
  file(".github/copilot-instructions.md", "# instructions\n");
  for (const link of ["CLAUDE.md", "AGENTS.md", "GEMINI.md"]) {
    symlinkSync(".github/copilot-instructions.md", join(repo, link));
  }
  mkdirSync(join(repo, ".agents/skills"), { recursive: true });
  mkdirSync(join(repo, ".claude"), { recursive: true });
  symlinkSync("../.agents/skills", join(repo, ".claude/skills"));
  file("knx_frontend/constants.py", 'FILE_HASH = "abc123"\n');
  file("knx_frontend/entrypoint.abc123.js");
  file("homeassistant-frontend/build/mdi/iconList.json", "[]");
  file("homeassistant-frontend/build/translations/translationMetadata.json", "{}");
  return fixture;
}

export function runIn(cwd, args = [], env = {}, fixture = null) {
  const result = spawnSync(BASH, [DOCTOR, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...GIT_ENV,
      PATH: fixture ? `${fixture.bin}:${process.env.PATH}` : process.env.PATH,
      NVM_DIR: fixture ? fixture.nvm : process.env.NVM_DIR,
      STUB_GH_RELEASES: "",
      STUB_GH_MANIFEST: "",
      ...env,
    },
  });
  let json = null;
  if (args.includes("--json")) {
    try {
      json = JSON.parse(result.stdout);
    } catch {
      json = null;
    }
  }
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    json,
    check: (id) => json?.checks.find((item) => item.id === id),
  };
}

export const run = (fixture, args = [], env = {}) => runIn(fixture.repo, args, env, fixture);

export const cleanup = (fixture) => rmSync(fixture.root, { recursive: true, force: true });
