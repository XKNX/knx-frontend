---
name: upgrading-knx-frontend-submodule
description: Use when updating, bumping or upgrading the homeassistant-frontend git submodule in knx-frontend, running script/upgrade-frontend, following a new Home Assistant frontend release or beta, or when the build, lint or tests break right after a submodule update.
---

# Upgrading the homeassistant-frontend submodule

## Overview

knx-frontend builds against the full HA frontend source (`@ha/*` → `homeassistant-frontend/src/*`)
and carries **hand-maintained copies** of its build tooling. `script/upgrade-frontend` only moves
the pointer and merges dependencies; tooling, configs and KNX code must be ported by hand. The
bump alone would have broken past updates. The PRs carried the fixes: a failing `yarn build`
(#440), removed components (#305, #376) and changed context APIs (#348, #382).

Phases: **access check → plan → user approval → execute → optional delivery.**

## Hard rules

- Target **only a release tag** `YYYYMMDD.N`. Never `dev`, branch heads, SHAs or other tags.
- **Always** pass the tag: `script/upgrade-frontend <tag>`. Without one, the script takes the most
  recently committed tagged commit, usually the newest beta, not the version HA Core pins.
- Never use `make update-submodule`. It deletes the submodule and re-clones it onto `dev`.
- Do not run `script/upgrade-frontend` before the user has approved the presented plan. Urgency in
  the request is not approval of a plan the user has not seen.
- Approvals do not carry over. Plan approval covers local work; pushing and opening a PR each need
  their own answer in Phase 3.
- Do not edit files inside `homeassistant-frontend/`.
- Never create, move or push tags, never create releases, never push to `main`, never merge.
- Do not switch, stash, rebase or reset anyone's branch. Work in a fresh worktree from the
  canonical `main`; repairing an existing bump branch means redoing the bump there.

## Phase 0: Access check

Set `SKILL` to the absolute path of this skill's directory in the checkout you are reading it
from; the worktree created in Phase 1 comes from the canonical `main` and may not contain the
skill yet. The scripts act on the repository of the current directory, so always call them as
`bash $SKILL/scripts/<name>` from inside the checkout they should inspect.

Run `bash $SKILL/scripts/access.sh` (read-only). It prints `login`, `xknx_write`, `fork`,
`fork_remote` and `upstream_remote`.

- `xknx_write=true`: ask where the branch should go in Phase 3, **their fork (recommended)** or a
  branch on `XKNX/knx-frontend`. Phase 1 can start before they answer.
- Otherwise delivery goes through their fork. A missing fork or remote is set up in Phase 3.
- `login=unknown`: `gh` is missing or not logged in. Plan and execute; delivery stays local until
  the user runs `gh auth login` and you re-run the check.

Phase 1 starts from the canonical `main`, called `START` below. With a reported
`upstream_remote` (any name, e.g. `upstream` or `origin`): `git fetch <upstream_remote>` and
`START=<upstream_remote>/main`. With `upstream_remote=none`:
`git fetch https://github.com/XKNX/knx-frontend.git main` and `START=$(git rev-parse FETCH_HEAD)`.

## Choosing the target tag

The panel runs inside the host HA and uses its `hass` object and WebSocket API. Match the
frontend version that HA Core ships with the knx-frontend release. Read the pins first with
`bash $SKILL/scripts/impact.sh --pins` (Core `dev`, `rc` and `master`; during a beta, `rc`
carries it), pick the tag, then start Phase 1. The full report later confirms the choice and
adds the prerelease flag.

| Situation                                                                    | Target                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| New `YYYYMMDD.0` prerelease published and Core `dev` pins it                 | That prerelease tag                                          |
| User expects a beta, but no new prerelease exists or Core `dev` hasn't moved | The current Core `dev` pin. Never guess a future tag; say so |
| Patch releases within the current line                                       | Newest tag of that line, ≤ Core `dev` pin                    |
| Anything else                                                                | Ask, showing the pins                                        |

## Phase 1: Plan (no changes to tracked files)

1. Fetch as described in Phase 0, then `git worktree add -b update-upstream-<tag> .worktrees/update-upstream-<tag> $START`
   (`.worktrees/` is git-ignored and excluded from vitest).
   In it: `git submodule update --init homeassistant-frontend` (non-recursive; a new worktree
   clones the submodule again, so add `--reference $(git rev-parse --git-common-dir)/modules/homeassistant-frontend`
   if that directory exists), `git -C homeassistant-frontend fetch --tags origin`, `nvm use`,
   `yarn install`.
2. In the worktree: `bash $SKILL/scripts/impact.sh <tag>`. The old ref defaults to the pointer
   in `main` of the remote pointing at XKNX/knx-frontend. Without one it is `HEAD`, so record
   `git ls-tree HEAD homeassistant-frontend` now and pass that commit as old ref after the bump.
3. Record both baselines outside the repo (`BASE=$(mktemp -d)`); the Types and Size gates compare
   against them:
   `yarn gulp gen-icons-json build-translations && yarn lint:types > $BASE/types.txt 2>&1`
   (a non-zero exit is expected here, `main` is already red)
   `yarn build && yarn build:size > $BASE/size.txt`
4. Read the release notes of every tag in the range (`gh release view <tag> -R home-assistant/frontend`)
   for removed or renamed `ha-*` elements and changed contexts or mixins. A number missing from
   the releases was skipped upstream; note it and move on.
5. Present the plan in at most 10 short lines: old → new tag with reasoning, the impact report
   grouped as below, expected KNX adaptations, the `$BASE` path, open questions. Details only on
   request. **Stop and wait for approval.**

| Impact section                                | Required action                                                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toolchain (`.nvmrc`, `.browserslistrc`, Yarn) | The script copies these. Run `nvm install && nvm use` before the next `yarn install`                                                                                                                                                        |
| Dependency changes, `[MAJOR]`                 | Check the changelog of every package KNX imports directly                                                                                                                                                                                   |
| KNX override                                  | Find its reason with `git log -S'"<pkg>"' -- package.json`. Drop it if upstream now provides a version ≥ the override and the reason is gone; otherwise keep it and mention it under "Not adopted". A `KNX-only dependency` needs no action |
| Mirrored build/config files                   | Port the upstream diff (`git -C homeassistant-frontend diff OLD NEW -- <file>`) into the KNX copy, keeping KNX-specific parts                                                                                                               |
| Upstream build-scripts added/removed          | Check whether a KNX copy imports a removed module or needs a new one                                                                                                                                                                        |
| Referenced paths MISSING                      | Fix `stubs.cjs` or the build config. A stale stub matches nothing, silently                                                                                                                                                                 |
| `@ha/*` REMOVED                               | Blocker. Migrate to the replacement before building                                                                                                                                                                                         |
| `@ha/*` changed                               | Read the diff and adjust KNX call sites                                                                                                                                                                                                     |

## Phase 2: Execute (after approval)

1. `script/upgrade-frontend <tag>` (it runs `yarn install` and `yarn dedupe` itself). If `.nvmrc`
   changed: `nvm install && nvm use && yarn install`.
2. Check `git -C homeassistant-frontend describe --tags --exact-match`. It must print `<tag>`.
3. Commit the bump by itself: `Update upstream to <tag>`. It contains the pointer, `package.json`,
   `yarn.lock` and, when they changed, `.nvmrc`, `.browserslistrc` and `.yarnrc.yml`.
4. Make one commit per adaptation (build scripts, API migration, overrides, tests). To drop an
   override, remove it from `*Override` in `package.json`, then
   `node script/merge_requirements.js && yarn install && yarn dedupe`.
5. Commits are authored by the user's own git identity. Write plain, descriptive messages: no
   `Co-Authored-By` trailers and no "Generated with …" lines. The same applies to the PR body.

## Gates (all must pass)

| Gate         | Command                                                   | Pass condition                                                                                                                          |
| ------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Dependencies | `yarn dedupe --check`                                     | exit 0                                                                                                                                  |
| Build        | `yarn build`                                              | succeeds, `.gz` and `.br` files exist                                                                                                   |
| Size         | `yarn build:size`                                         | file count unchanged vs `$BASE/size.txt` and growth explained by the upstream diff. A jump in files or MB means a stub stopped matching |
| Tests        | `yarn test` on the `.nvmrc` Node version                  | green                                                                                                                                   |
| Lint         | `yarn lint:eslint && yarn lint:prettier && yarn lint:lit` | exit 0; lit-analyzer warnings count only in files this branch changed                                                                   |
| Types        | `yarn lint:types` (after `yarn build`)                    | same `error TS` lines as `$BASE/types.txt`; the exit code is not the signal                                                             |
| Smoke        | Run the panel in HA with a matching Core version          | Info, group monitor, project, entities create/edit, expose, error page all work; no console errors                                      |

For each gate, report "run and passed", "failed" (with output) or "not run". Never mark a gate as
passed without running it. The smoke test needs the user's HA instance; if you can't run it, list
it as "not run" and hand the checklist to the user.

## Phase 3: Delivery (optional, after all gates are reported)

Each step needs its own explicit answer from the user, in their language. A failed gate blocks
delivery; a gate "not run" (usually smoke) does not, but say so before the push and list it under
**Verification** in the PR body.

1. **Push.** Set up a missing fork or fork remote first (see `delivery.md`). Ask: "Push
   `update-upstream-<tag>` to `<remote>` (`<repo>`)?" On yes: `git push -u <remote> update-upstream-<tag>`,
   never with `--tags`, `--follow-tags` or `--force`. On anything else the branch stays local.
2. **PR draft.** Write the body to `$BASE/pr.md` in the format from `delivery.md` and show title
   and body in full. Do not bump `VERSION`; maintainers cut releases outside this workflow. If the
   branch was not pushed, skip step 3.
3. **PR.** Ask: "Open this PR on XKNX/knx-frontend now?" Only on an explicit yes:
   `gh pr create -R XKNX/knx-frontend --base main --head <owner>:update-upstream-<tag> --title "<title>" --body-file $BASE/pr.md`
   (`<owner>`: fork owner, or `XKNX` for a direct push). Never enable auto-merge, never merge.
4. **Final summary.** Old → new tag, commits, gate results, delivery state (local, pushed where,
   PR URL, or the compare URL from `delivery.md` that works once the branch is pushed), and the
   worktree path to remove later with `git worktree remove <path>` (the branch stays until
   `git branch -d`).

## Common mistakes

| Mistake                                   | Consequence                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Running the script without a tag          | Lands on the newest beta, not on the version HA Core pins                                        |
| "Tests pass, so it's ready"               | Tests don't touch the gulp/rspack build. #440 still failed `yarn build`                          |
| Re-adding a package upstream dropped      | `merge_requirements.js` removes it again on the next update. Port upstream's replacement instead |
| Ignoring the mirrored `build-scripts/`    | Build breaks or diverges silently (compression, terser targets, polyfills)                       |
| Fixing a stale bump branch in place       | It may predate earlier adaptations (e.g. #440). Redo the bump from the canonical `main`          |
| Trusting `yarn lint:types` exit code      | It is already red on `main`. Compare against the baseline                                        |
| Skipping the size check                   | Stubs stop matching after upstream moves files, and the wheel grows                              |
| Pushing to `XKNX/knx-frontend` by default | Only users with write access who explicitly chose it; everyone else uses their fork              |
