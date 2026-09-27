---
name: setting-up-knx-frontend
description: Use when setting up knx-frontend for development (first clone, fork, or a new git worktree), when the environment seems broken (wrong Node version, missing submodule, stale node_modules, tests failing after a Node switch), when testing the panel in a local Home Assistant instance (including Home Assistant showing an old panel), when a server port is already in use, or to see which homeassistant-frontend release is checked out and whether a newer one exists.
---

# Setting up knx-frontend

## Overview

knx-frontend builds a Lit panel from the full Home Assistant frontend source in the
`homeassistant-frontend` submodule and ships it as the Python package `knx_frontend`, which Home
Assistant Core imports to serve the panel. A working checkout needs the submodule at its pointer,
the Node version from `.nvmrc`, Yarn from the submodule, current `node_modules`, a build, and, to
test in Home Assistant, a Python that imports this checkout instead of the PyPI release.

`scripts/doctor.sh` checks all of this without changing anything and names the command that
fixes each problem. Everything below runs through it: **set up**, **doctor**, **worktree**,
**test the panel in Home Assistant**, and **servers and ports**.

## Hard rules

- Never `make update-submodule` (it deletes the submodule and fetches `dev`) and never
  `script/upgrade-frontend` (that belongs to `upgrading-knx-frontend-submodule`).
- Never install anything into Home Assistant's venv; do not set up Home Assistant Core.
- Ask the user before anything outside the checkout: `gh repo fork` (creates a repository on
  GitHub), `nvm install` (downloads Node), `corepack enable` (changes the Node installation).
- Do not switch, stash, rebase or reset the user's branch. Delete `node_modules` only after asking.
- Never stop a process you did not start. Never let two Home Assistant processes share a config
  directory.
- Paths outside the checkout (Home Assistant's venv, its config directory) come from the user.
  There are no default locations.
- A problem counts as fixed only when `doctor.sh` says so.

## Doctor

Set `SKILL` to the absolute path of this skill's directory. From the checkout or a worktree:

```bash
bash "$SKILL/scripts/doctor.sh" [--ha-python <path>] [--ha-config <dir>] [--port <n>] [--json]
```

It prints one line per check (`OK`, `INFO`, `WARN` or `FAIL`), what it found, and `fix:` with the
command, then a summary. Exit 0 means no `FAIL`, 1 at least one, 2 a wrong call or not a
knx-frontend checkout. For a health check, run it and report every open item with its fix; fix
only what the user approves.

`submodule-release` shows the checked-out homeassistant-frontend release, newer stable and beta
releases with compare links, and the tag HA Core `dev` pins; it warns when Core pins a newer tag.
Upgrading is not part of this skill: follow `upgrading-knx-frontend-submodule`, which targets the
tag Core pins.

## Set up

1. Run the doctor.
2. Fix the first `FAIL`, then the first `WARN`, in the order the doctor prints them. Later checks
   depend on earlier ones: Yarn comes from the submodule, the build needs `node_modules`.
3. Run the doctor again. Repeat until no `FAIL` is left and every remaining `WARN` has a reason
   (for example: the user wants no fork, or does not use Gemini).

Say what you run. Commands that only affect the checkout need no extra question: `git remote add`,
`git submodule update --init` (never `--recursive`), `nvm use`, `yarn install`, `yarn agent:*`,
`script/build`, `yarn gulp gen-icons-json build-translations`. Ask first for `gh repo fork`,
`nvm install` and `corepack enable`.

nvm is a shell function: every new shell needs `source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" && nvm use`
before `node` or `yarn`; otherwise tests run on another Node version and fail.

End with the last doctor output and the reason for every open `WARN`.

## Worktree

```bash
git fetch <upstream_remote> <ref>
git worktree add [-b <branch>] .worktrees/<name> <start>
cd .worktrees/<name>
git submodule update --init --reference "$(git rev-parse --git-common-dir)/modules/homeassistant-frontend" homeassistant-frontend
source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" && nvm use
yarn install
bash "$SKILL/scripts/doctor.sh"
```

`<upstream_remote>` is the remote the doctor reports under `upstream`; never assume `origin`.
Drop `--reference …` if that directory does not exist. Add
`yarn gulp gen-icons-json build-translations` when you need `yarn lint:types`.

Remove a worktree from the main checkout with `git worktree remove --force .worktrees/<name>`:
`--force` is needed because the worktree contains the submodule, and it discards uncommitted work.
Use it only for a worktree you created in this task, never for another agent's, and only after
stopping every server started from it.

## Test the panel in Home Assistant

Home Assistant Core imports the Python package `knx_frontend` and serves its build output. With
`PYTHONPATH` pointing at the checkout, Home Assistant imports this checkout instead of the PyPI
release, without any change to its venv.

1. Ask the user for the Python of their Home Assistant development venv
   (`<ha-venv>/bin/python`) and, if they have one, its config directory. Do not guess paths.
2. Build: `script/build` once, or keep `script/develop` running in its own terminal. It rebuilds
   on every change and opens no port.
3. Run `bash "$SKILL/scripts/doctor.sh" --ha-python <path> [--ha-config <dir>]`. `ha` must be
   `OK`: without a build, Python silently falls back to the PyPI release. `port` shows whether
   Home Assistant's port is free.
4. Give the user the `start:` command the doctor prints:

   ```bash
   PYTHONPATH=<checkout> AIOHTTP_NOSENDFILE=1 <ha-venv>/bin/hass -c <config>
   ```

   Always pass `-c`: without it `hass` uses `~/.homeassistant`, which a running instance may
   already use (see "Servers and ports").
   The doctor adds `--skip-pip-packages knx-frontend` when the knx-frontend installed in the
   venv does not match the version HA Core's KNX manifest pins; otherwise Home Assistant would
   reinstall it into its venv at start.
   `AIOHTTP_NOSENDFILE=1` turns off aiohttp's `sendfile`; on macOS the instance was otherwise
   only reachable on localhost, not from other devices. Start Home Assistant only when the user
   asks, and open `http://<host>:<port>/knx` with the actual port.

## Servers and ports

These rules apply to every server an agent starts: Home Assistant, a dev server, a gallery, or
anything else that listens on a port. Several agents and worktrees often run at the same time.

1. Before starting, check the port: `bash "$SKILL/scripts/doctor.sh" --port <n>`. It names the
   process holding it and a free port.
2. Never stop a process that holds a port, even if it looks abandoned.
3. Use a free port the way the tool intends: for Home Assistant `http: server_port` in the
   instance's own config directory (`hass` has no port option); for a dev server its port option
   or environment variable. Tell the user the URL with the actual port.
4. Never share state: two Home Assistant processes never use the same config directory. A new
   instance gets a new directory that the user names or confirms. On first start Home Assistant
   runs onboarding; the user creates the account.
5. A running Home Assistant serves the checkout it was started with (see `that Home Assistant
   serves:` in the doctor's `port` check). To show another checkout it has to be restarted with a
   different `PYTHONPATH`, and only with the user's consent.
6. Start long-running processes only when the user asks, and tell them how to stop them.

## Maintaining this skill

`scripts/doctor.sh` and `scripts/lib/*.sh` must run on Bash 3.2 (macOS `/bin/bash`): no `set -u`,
no associative arrays. Tests:
`node --test ".agents/skills/setting-up-knx-frontend/scripts/test/*.test.mjs"`, and again with
`DOCTOR_BASH=/bin/bash`.
