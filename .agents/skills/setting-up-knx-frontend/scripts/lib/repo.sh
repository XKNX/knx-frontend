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

TAG_RE='^[0-9]{8}\.[0-9]+$'

# tag_key <YYYYMMDD.N>: a string that sorts like the release order
tag_key() {
  local date=${1%%.*} n=${1#*.}
  printf '%08d%06d' "$((10#$date))" "$((10#$n))"
}

# newer <a> <b>: true when release tag a is newer than b
newer() { [[ $(tag_key "$1") > $(tag_key "$2") ]]; }

check_submodule() {
  local status reference=""
  if [ $WORKTREE = 1 ] && [ -d "$COMMON_DIR/modules/homeassistant-frontend" ]; then
    reference=" --reference \"$COMMON_DIR/modules/homeassistant-frontend\""
  fi
  status=$(git submodule status homeassistant-frontend 2>/dev/null)
  SUBMODULE=missing
  case "$status" in
    "")
      report submodule fail "homeassistant-frontend is not a submodule of this checkout"
      ;;
    -*)
      report submodule fail \
        "homeassistant-frontend is not initialized; yarn, the build and the tests need it" \
        "git submodule update --init$reference homeassistant-frontend"
      ;;
    +*)
      SUBMODULE=initialized
      report submodule fail \
        "homeassistant-frontend is at a different commit than the pointer ($(git ls-tree HEAD homeassistant-frontend | awk '{ print substr($3, 1, 10) }'))" \
        "git submodule update homeassistant-frontend   (unless you are upgrading it on purpose)"
      ;;
    U*)
      SUBMODULE=initialized
      report submodule fail "the homeassistant-frontend pointer has a merge conflict" \
        "resolve the conflict of the submodule pointer first"
      ;;
    *)
      SUBMODULE=ok
      report submodule ok "homeassistant-frontend at the pointer commit ${status:1:10}"
      ;;
  esac
}

check_submodule_release() {
  local sub=homeassistant-frontend current base label kind="" releases="" pin="" tag pre
  local stable="" beta="" status=info msg fix=""
  if [ "$SUBMODULE" = missing ]; then
    report submodule-release fail "not checked: the submodule is not initialized (see submodule)"
    return
  fi
  current=$(git -C "$sub" describe --tags --exact-match HEAD 2>/dev/null)
  if [[ $current =~ $TAG_RE ]]; then
    base=$current
    label=$current
  else
    base=$(git -C "$sub" describe --tags --abbrev=0 HEAD 2>/dev/null)
    label="$(git -C "$sub" rev-parse --short HEAD) (not a release tag; nearest tag ${base:-none})"
  fi
  if command -v gh >/dev/null 2>&1; then
    releases=$(gh api "repos/home-assistant/frontend/releases?per_page=50" \
      --jq '.[] | "\(.tag_name) \(.prerelease)"' 2>/dev/null)
    pin=$(gh api -H "Accept: application/vnd.github.raw" \
      "repos/home-assistant/core/contents/homeassistant/components/frontend/manifest.json?ref=dev" \
      2>/dev/null | grep -o 'home-assistant-frontend==[0-9.]*' | head -1 | cut -d= -f3)
  fi
  if [ -z "$releases" ]; then
    report submodule-release info "checked out $label
newer releases: not checked (gh unavailable or offline)"
    return
  fi
  while read -r tag pre; do
    [[ $tag =~ $TAG_RE ]] || continue
    if [ "$tag" = "$current" ]; then
      if [ "$pre" = true ]; then kind=beta; else kind=stable; fi
    fi
    if [ "$pre" = true ]; then
      if [ -z "$beta" ] || newer "$tag" "$beta"; then beta=$tag; fi
    else
      if [ -z "$stable" ] || newer "$tag" "$stable"; then stable=$tag; fi
    fi
  done <<<"$releases"
  msg="checked out $label${kind:+ ($kind)}"
  if [[ $base =~ $TAG_RE ]]; then
    if [ -n "$stable" ] && newer "$stable" "$base"; then
      msg+=$'\n'"newer stable: $stable  https://github.com/home-assistant/frontend/compare/$base...$stable"
    fi
    if [ -n "$beta" ] && newer "$beta" "$base" && { [ -z "$stable" ] || newer "$beta" "$stable"; }; then
      msg+=$'\n'"newer beta:   $beta  https://github.com/home-assistant/frontend/compare/$base...$beta"
    fi
  fi
  if [[ $pin =~ $TAG_RE ]]; then
    msg+=$'\n'"HA Core dev pins: $pin"
    if [[ $base =~ $TAG_RE ]] && newer "$pin" "$base"; then status=warn; fi
  fi
  if [[ $msg == *$'\n'newer* ]] || [ $status = warn ]; then
    fix="follow .agents/skills/upgrading-knx-frontend-submodule/SKILL.md (it targets the tag HA Core pins)"
  fi
  report submodule-release "$status" "$msg" "$fix"
}
