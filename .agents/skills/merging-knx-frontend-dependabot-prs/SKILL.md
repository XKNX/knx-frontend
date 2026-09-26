---
name: merging-knx-frontend-dependabot-prs
description: Use when merging, triaging or cleaning up Dependabot pull requests in knx-frontend, including npm security updates, GitHub Actions bumps, yarn.lock conflicts on dependabot/* branches, a failing `yarn dedupe --check` on a Dependabot PR, or the backlog of open PRs from app/dependabot.
---

# Merging Dependabot PRs in knx-frontend

## Overview

Two kinds of Dependabot PRs reach XKNX/knx-frontend: GitHub Actions bumps (configured in
`.github/dependabot.yml`) and npm security updates (enabled in the repository settings). Merging
them blindly goes wrong here:

- `dependencies`, `devDependencies` and `resolutions` in `package.json` are generated from
  `homeassistant-frontend/package.json` by `script/merge_requirements.js`. A Dependabot bump of a
  direct dependency is reverted by the next `script/upgrade-frontend` and diverges from the HA
  frontend source the panel is compiled from. Those PRs are closed, never merged; the version
  arrives with the next upstream update (see the `upgrading-knx-frontend-submodule` skill).
- A bump that only touches `yarn.lock` survives upstream updates and is worth merging. Most only
  reach tooling (eslint, vitest, jsdom, license checkers), not the shipped wheel.
- `Types` is red on `main`. A red `Types` check on a PR means nothing unless it adds errors.
- `Lint` runs `yarn dedupe --check`, which Dependabot does not satisfy on its own.
- Every merge moves `yarn.lock` on `main`, so the next PR may conflict or fall behind.

`scripts/triage.mjs` works all of this out per PR, read-only. Phases: **access check → triage →
user approval → one PR at a time → summary.**

## Hard rules

- Only PRs opened by `app/dependabot` on XKNX/knx-frontend.
- Every outward action (merge, close, comment, push) needs the user's yes for that PR. Approving
  the triage plan approves none of them. "Merge all" covers only the PRs listed in that answer.
- Merge only a head SHA that `triage.mjs` classified in this session, and always with
  `--match-head-commit`.
- Never: `--admin`, auto-merge, force-push, push to `main`, edit files inside
  `homeassistant-frontend/`, change `.github/dependabot.yml` or repository settings, add
  `*Override` entries to `package.json`, dismiss or change Dependabot security alerts, create
  tags or releases, bump `VERSION`.
- Do not switch, stash, rebase or reset anyone's branch. Work only in worktrees under
  `.worktrees/`.
- Commits: plain message, no `Co-Authored-By` trailer, no "Generated with" line. GitHub comments:
  English and short; the close texts below verbatim.
- Report every gate as "run and passed", "failed" (with output) or "not run". Never mark a gate as
  passed without running it.

## Phase 0: Access check

Set `SKILL` to the absolute path of this skill's directory. From the knx-frontend checkout run
`bash $SKILL/../upgrading-knx-frontend-submodule/scripts/access.sh` (read-only).

- `login=unknown`: stop and ask the user to run `gh auth login`.
- `upstream_remote=none`: ask the user to add one
  (`git remote add upstream https://github.com/XKNX/knx-frontend.git`); `triage.mjs` needs it.
- `xknx_write` is not `true`: triage only. Present the table as a report and stop after Phase 1.

`<upstream_remote>` below is the remote `access.sh` reports. Never assume `origin`: in a fork
checkout it is the fork, and its `main` is stale.

## Phase 1: Triage (read-only)

1. Run `node $SKILL/scripts/triage.mjs` from the checkout. It fetches `<upstream_remote>/main` and
   prints one row per open Dependabot PR. `--json` adds the details (reach roots, foreign
   commits, overrides, head ref; `major` is only computed for Actions PRs). Exit code 1 means
   some PR could not be read (row `error`); 2 means missing setup.
2. Present the table: PR, package and versions, `reach`, `state`, `ci`, the proposed action and
   its reason, then open questions (an Actions major bump, an override flagged on a
   `close-direct`, an `error` row).
3. **Stop and wait for the user's approval of the plan.**

## Phase 2: One PR at a time

Order: `close-superseded` and `close-direct` first (they do not touch `main`), then Actions PRs,
then lock-only PRs, oldest first. Before each PR run `node $SKILL/scripts/triage.mjs <nr>` again:
every merge changes `main`. Ask at most twice per PR, once for the repair (rebase or recreate
comment, dedupe push) and once for the outcome (merge or close). Each question names the PR,
package, action and reason.

| Action             | Meaning                                                                               | What to do after the user's yes for this PR                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `skip`             | not opened by Dependabot                                                              | Leave it alone.                                                                                                                                                                                                                            |
| `close-superseded` | `main` already resolves the package to the target version or newer                    | See "Close texts".                                                                                                                                                                                                                         |
| `close-direct`     | npm PR changes `package.json`                                                         | See "Close texts". If the reason names `overrides`, tell the user that override needs a look in the next upstream update.                                                                                                                  |
| `rebase`           | behind `main` or conflicting                                                          | `gh pr comment <nr> -R XKNX/knx-frontend --body "@dependabot rebase"`, then see "Waiting".                                                                                                                                                 |
| `recreate`         | behind or conflicting, and the branch has a non-Dependabot commit (an earlier dedupe) | `gh pr comment <nr> -R XKNX/knx-frontend --body "@dependabot recreate"`, then see "Waiting". Dedupe again if triage says so.                                                                                                               |
| `wait`             | mergeability unknown or checks pending                                                | `gh pr checks <nr> -R XKNX/knx-frontend --watch`, then triage this PR again.                                                                                                                                                               |
| `dedupe-fix`       | only `yarn dedupe --check` fails                                                      | See "Worktree" and "Dedupe fix".                                                                                                                                                                                                           |
| `stop`             | another check fails, or the PR touches unexpected files                               | Do not merge. Report the failing check with a log excerpt (`gh run view --job <id> --log-failed -R XKNX/knx-frontend`, job id from `gh pr checks <nr>`) and leave the decision to the user.                                                |
| `local-gates`      | lock-only bump that reaches the shipped panel, or whose reach is unknown              | See "Worktree" and "Local gates"; merge only if every gate passed.                                                                                                                                                                         |
| `merge`            | CI green, or `Types` fails with exactly the errors `main` has                         | For an Actions PR whose reason says `major bump`: first read the action's release notes and check our usage (`with:` inputs, outputs, Node runtime) in `.github/workflows/*.yml` and `.github/actions/setup/action.yml`. Then see "Merge". |

### Close texts

Fill in `<pkg>` and `<version>`, keep the rest verbatim. Write the text to a file and pass it
with `"$(cat …)"`: inline backticks in a double-quoted `--comment` would run as shell commands.

close-direct:

```markdown
Closing: `<pkg>` is a direct dependency whose version is taken from the `homeassistant-frontend` submodule by `script/merge_requirements.js`. A bump here would be reverted by the next upstream update and would diverge from the frontend source the panel is built from. It will arrive with the next "Update upstream" PR.
```

close-superseded:

```markdown
Closing: `main` already resolves `<pkg>` to `<version>`, which includes this update.
```

```bash
gh pr close <nr> -R XKNX/knx-frontend --comment "$(cat "$TMPDIR/close-<nr>.md")"
```

### Waiting

After a rebase or recreate comment, Dependabot pushes within minutes. Check
`gh pr view <nr> -R XKNX/knx-frontend --json headRefOid -q .headRefOid` until the SHA changes, then
`gh pr checks <nr> -R XKNX/knx-frontend --watch` and triage again. If the SHA has not changed after
15 minutes, report it and move on to the next PR.

### Worktree (dedupe-fix, local-gates)

```bash
git fetch <upstream_remote> <headRefName>
git worktree add --detach .worktrees/dependabot-<nr> <upstream_remote>/<headRefName>
cd .worktrees/dependabot-<nr>
git submodule update --init --reference "$(git rev-parse --git-common-dir)/modules/homeassistant-frontend" homeassistant-frontend
nvm use
yarn install
```

`headRefName` comes from `triage.mjs --json <nr>`. Drop `--reference …` if that directory does not
exist. If `yarn install` fails on `npmMinimalAgeGate` (3 days, `.yarnrc.yml`), the action is `wait`
until the version is three days old. When done: `git worktree remove .worktrees/dependabot-<nr>`.

### Dedupe fix

```bash
yarn dedupe
git add yarn.lock
git commit -m "Deduplicate dependencies"
git push <upstream_remote> HEAD:<headRefName>
```

Never `--force`. A rejected push means Dependabot pushed in between: remove the worktree and
triage again. After the push, wait for the checks and triage again.

### Local gates

Baselines from the latest completed CI run on `main`:

```bash
node $SKILL/scripts/triage.mjs --types-baseline | sort -u > "$TMPDIR/types-main.txt"
RUN=$(gh run list -R XKNX/knx-frontend --branch main --workflow CI --status completed -L 1 --json databaseId -q '.[0].databaseId')
BUILD=$(gh api repos/XKNX/knx-frontend/actions/runs/$RUN/jobs --jq '.jobs[] | select(.name=="Build") | .id')
gh api --allow-escape-sequences repos/XKNX/knx-frontend/actions/jobs/$BUILD/logs | grep 'Build output:'
```

Then, in the worktree, in this order:

| Gate   | Command                 | Pass condition                                                                           |
| ------ | ----------------------- | ---------------------------------------------------------------------------------------- |
| Dedupe | `yarn dedupe --check`   | exit 0                                                                                   |
| Build  | `yarn build`            | succeeds; `.gz` and `.br` files exist under `knx_frontend/`                              |
| Size   | `yarn build:size`       | same file count as `Build output:` on `main`; any growth explained by the bumped package |
| Tests  | `yarn test`             | green                                                                                    |
| Types  | see below (after Build) | prints nothing: no error that `main` does not have                                       |

```bash
yarn lint:types 2>&1 | grep 'error TS' | sed 's/^ *//' | sort -u | comm -23 - "$TMPDIR/types-main.txt"
```

The exit code of `lint:types` is not the signal; `main` is already red.

### Merge

```bash
gh pr merge <nr> -R XKNX/knx-frontend --squash --match-head-commit <head sha from the last triage>
```

Keep GitHub's default title and body. If the merge is refused because the head moved, triage the
PR again.

## Phase 3: Summary

Per PR: merged (with the merge commit), closed (with reason), repaired and still open (with what it
waits for), or stopped (with the failing check). Add the gate results for every `local-gates` PR
and anything the user should look at, such as flagged overrides or Actions major bumps.

## Maintaining this skill

The triage logic lives in `scripts/lib/` and is unit-tested:
`node --test ".agents/skills/merging-knx-frontend-dependabot-prs/scripts/test/*.test.mjs"`.
If CI job or step names change in `.github/workflows/ci.yml` (`Lint`, `Types`, `Build`,
`Check for duplicate dependencies`), update `scripts/lib/ci.mjs` and this file.
