#!/usr/bin/env bash
# Read-only check of the current GitHub user's access to XKNX/knx-frontend and their fork.
#
# Usage (from the knx-frontend repository root):
#   bash .agents/skills/upgrading-knx-frontend-submodule/scripts/access.sh
#
# Prints key=value lines:
#   login            GitHub login, or "unknown" if gh is missing or not authenticated
#   xknx_write       true | false | unknown (push access to XKNX/knx-frontend)
#   fork             <login>/knx-frontend if it exists as a fork of XKNX/knx-frontend, else "none"
#   fork_remote      local git remote pointing at that fork, else "none"
#   upstream_remote  local git remote pointing at XKNX/knx-frontend, else "none"
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 1
ORG=XKNX
UPSTREAM=$ORG/knx-frontend

remote_for() {
  git remote -v | awk -v repo="$1" '$3 == "(push)" && tolower($2) ~ "github.com[:/]" tolower(repo) "(\\.git)?$" {print $1; exit}'
}
upstream_remote=$(remote_for "$UPSTREAM" | grep . || echo none)

login=$(gh api user -q .login 2>/dev/null) || login=""
if [ -z "$login" ]; then
  printf '%s\n' login=unknown xknx_write=unknown fork=unknown fork_remote=none \
    "upstream_remote=$upstream_remote"
  exit 0
fi

write=$(gh api "repos/$UPSTREAM" -q '.permissions | (.admin or .maintain or .push)' 2>/dev/null) || write=unknown

fork=none
parent=$(gh api "repos/$login/knx-frontend" -q 'select(.fork) | .parent.full_name' 2>/dev/null) || parent=""
[ "$parent" = "$UPSTREAM" ] && fork="$login/knx-frontend"

fork_remote=none
[ "$fork" != none ] && fork_remote=$(remote_for "$fork" | grep . || echo none)

echo "login=$login"
echo "xknx_write=$write"
echo "fork=$fork"
echo "fork_remote=$fork_remote"
echo "upstream_remote=$upstream_remote"
