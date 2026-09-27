# Checks on the checkout itself: which repository it is and its remotes. Sourced by doctor.sh.

UPSTREAM_RE='github\.com[:/]xknx/knx-frontend(\.git)?$'

# remote_for <regex on the lowercased fetch URL>: name of the first matching remote
remote_for() {
  git remote -v | awk -v re="$1" '$3 == "(fetch)" && tolower($2) ~ re { print $1; exit }'
}

check_repo() {
  TOP=$(git rev-parse --show-toplevel 2>/dev/null) || die "not inside a git repository"
  grep -Eq '"name"[[:space:]]*:[[:space:]]*"knx-frontend"' "$TOP/package.json" 2>/dev/null ||
    die "$TOP is not a knx-frontend checkout"
  cd "$TOP" || die "cannot enter $TOP"
  COMMON_DIR=$(git rev-parse --path-format=absolute --git-common-dir)
  WORKTREE=0
  if [ "$COMMON_DIR" != "$(git rev-parse --path-format=absolute --git-dir)" ]; then WORKTREE=1; fi
  if [ $WORKTREE = 1 ]; then
    report repo ok "knx-frontend worktree at $TOP (main checkout: $(dirname "$COMMON_DIR"))"
  else
    report repo ok "knx-frontend checkout at $TOP"
  fi
}

check_upstream() {
  UPSTREAM=$(remote_for "$UPSTREAM_RE")
  if [ -n "$UPSTREAM" ]; then
    report upstream ok "remote \"$UPSTREAM\" is XKNX/knx-frontend"
  else
    report upstream fail \
      "no remote points at XKNX/knx-frontend; the knx-frontend skills fetch main from it" \
      "git remote add upstream https://github.com/XKNX/knx-frontend.git"
  fi
}

check_fork() {
  local fork
  fork=$(git remote -v | awk -v up="$UPSTREAM_RE" '$3 == "(fetch)" &&
    tolower($2) ~ "github\\.com[:/][^/]+/knx-frontend(\\.git)?$" && tolower($2) !~ up { print $1; exit }')
  if [ -n "$fork" ]; then
    report fork ok "remote \"$fork\" is a fork of knx-frontend"
  else
    report fork warn "no remote points at your fork; pull requests need one" \
      "gh repo fork XKNX/knx-frontend --remote=false   (creates a repository on GitHub: ask the user first)
git remote add fork https://github.com/<your-login>/knx-frontend.git"
  fi
}
