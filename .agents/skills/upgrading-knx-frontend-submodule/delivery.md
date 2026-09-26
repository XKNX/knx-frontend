# Delivery details

Reference for Phase 3 of `SKILL.md`.

## Fork setup (before the push)

One confirmation covers both steps:

- No fork: `gh repo fork XKNX/knx-frontend --remote=false`
- No fork remote: `git remote add <name> https://github.com/<login>/knx-frontend.git`, using a
  free remote name (`fork`, or ask if it is taken)

## PR format

Title: `Update upstream to <tag>` (passed to `gh pr create --title`, not part of the body file).

Body sections, in this order:

1. One summary paragraph with the
   [upstream diff](https://github.com/home-assistant/frontend/compare/OLD...NEW) and the
   release-notes link (`https://github.com/home-assistant/frontend/releases/tag/NEW`).
2. **What changed**: one paragraph per commit, explaining _why_, not just what.
3. **Verification**: every gate with "run and passed", "failed" or "not run". For a gate that
   was not run, add its checklist so the reviewer can do it.
4. **Not adopted**: upstream changes deliberately skipped, listed as follow-ups.

XKNX/knx-frontend#440 is a good example of this shape.

## Compare URL when no PR was opened

`https://github.com/XKNX/knx-frontend/compare/main...<owner>:update-upstream-<tag>`, which
works once the branch is pushed.
