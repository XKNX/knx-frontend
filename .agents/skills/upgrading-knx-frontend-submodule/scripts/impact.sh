#!/usr/bin/env bash
# Read-only impact report for a homeassistant-frontend submodule upgrade.
#
# Usage (from the knx-frontend checkout to inspect; the script may live in another checkout):
#   bash <skill-dir>/scripts/impact.sh <new-tag> [old-ref]
#   bash <skill-dir>/scripts/impact.sh --pins
#
# --pins     Only print the home-assistant-frontend pins of HA Core dev, rc and master, to pick
#            the target tag before the worktree exists. Needs gh.
# <new-tag>  Upstream release tag, e.g. 20260826.7
# [old-ref]  Defaults to the submodule commit recorded in <remote>/main of the remote pointing at
#            XKNX/knx-frontend (whatever its name), so the report stays correct after the bump is
#            already committed. Without such a remote it falls back to HEAD; pass old-ref
#            explicitly once the bump is committed.
#
# Changes nothing. Requires the tags to be present in the submodule; fetch them first with
#   git -C homeassistant-frontend fetch --tags origin
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
SUB=homeassistant-frontend
NEW=${1:?usage: impact.sh <new-tag> [old-ref] | impact.sh --pins}

core_pins() {
  for ref in dev rc master; do
    pin=$(gh api "repos/home-assistant/core/contents/homeassistant/components/frontend/manifest.json?ref=$ref" \
      -q .content 2>/dev/null | base64 --decode 2>/dev/null |
      grep -o 'home-assistant-frontend==[0-9.]*' || true)
    echo "HA core $ref pins: ${pin:-unknown}"
  done
}

if [ "$NEW" = --pins ]; then
  command -v gh >/dev/null || { echo "BLOCKER: gh is required for --pins" >&2; exit 2; }
  core_pins
  exit 0
fi
# The canonical remote may be named upstream, origin or anything else; match it by URL.
canonical=$(git remote -v |
  awk '$3 == "(fetch)" && tolower($2) ~ "github.com[:/]xknx/knx-frontend(\\.git)?$" {print $1; exit}')
base=HEAD
if [ -n "$canonical" ] && git rev-parse -q --verify "$canonical/main" >/dev/null; then
  base=$canonical/main
fi
OLD=${2:-$(git ls-tree "$base" "$SUB" | awk '{print $3}')}

if [ ! -e "$SUB/.git" ]; then
  # Without this, `git -C homeassistant-frontend` silently falls back to the knx-frontend repo.
  echo "BLOCKER: submodule not initialized. Run: git submodule update --init $SUB" >&2
  exit 2
fi

sub() { git -C "$SUB" "$@"; }
exists_at() { sub cat-file -e "$1:$2" 2>/dev/null; }
section() { printf '\n## %s\n' "$1"; }

if ! [[ $NEW =~ ^[0-9]{8}\.[0-9]+$ ]]; then
  echo "BLOCKER: '$NEW' is not a release tag (YYYYMMDD.N). Never target dev, branches or other tags." >&2
  exit 2
fi
if ! sub rev-parse -q --verify "refs/tags/$NEW" >/dev/null; then
  echo "BLOCKER: tag $NEW not found. Run: git -C $SUB fetch --tags origin" >&2
  exit 2
fi
if [ -z "${2:-}" ] && [ "$(sub rev-parse "$OLD^{commit}")" = "$(sub rev-parse "$NEW^{commit}")" ]; then
  echo "BLOCKER: the pointer in $base is already $NEW, so the report would be empty." >&2
  echo "Pass the pre-bump submodule commit as old-ref." >&2
  exit 2
fi

old_tag=$(sub describe --tags --exact-match "$OLD" 2>/dev/null || echo "NOT A TAG: $(sub describe --tags --match '20[0-9]*' "$OLD" 2>/dev/null || echo "$OLD")")
# Compare against the exact tag when there is one, otherwise against the full commit SHA.
old_compare=$(sub describe --tags --exact-match "$OLD" 2>/dev/null || sub rev-parse "$OLD^{commit}")
echo "# homeassistant-frontend upgrade impact"
echo "old: ${OLD:0:10} ($old_tag)"
echo "new: $(sub rev-parse --short=10 "$NEW^{commit}") ($NEW)"
echo "upstream diff: https://github.com/home-assistant/frontend/compare/$old_compare...$NEW"
if ! sub merge-base --is-ancestor "$OLD" "$NEW"; then
  echo "WARNING: old is not an ancestor of $NEW (downgrade or parallel release line)."
fi

section "Release status"
if command -v gh >/dev/null; then
  gh release view "$NEW" -R home-assistant/frontend --json isPrerelease,publishedAt \
    -q '"prerelease: \(.isPrerelease)  published: \(.publishedAt[:10])"' 2>/dev/null ||
    echo "(gh release view failed)"
  core_pins
else
  echo "(gh not available; check release and HA core pin manually)"
fi

section "Toolchain files copied or merged by script/upgrade-frontend"
for f in .nvmrc .browserslistrc .yarnrc.yml; do
  if [ -n "$(sub diff --name-only "$OLD" "$NEW" -- "$f")" ]; then
    echo "CHANGED $f"
    sub diff "$OLD" "$NEW" -- "$f" | grep -E '^[-+][^-+]' | sed 's/^/    /' |
      awk 'NR<=12 {print} END {if (NR>12) print "    ... (" NR-12 " more lines)"}'
  fi
done
pm_old=$(sub show "$OLD:package.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).packageManager))')
pm_new=$(sub show "$NEW:package.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).packageManager))')
[ "$pm_old" != "$pm_new" ] && echo "CHANGED packageManager: $pm_old -> $pm_new"

section "Dependency changes (upstream package.json)"
OLD_PKG=$(sub show "$OLD:package.json") NEW_PKG=$(sub show "$NEW:package.json") \
  KNX_PKG=$(cat package.json) node <<'EOF'
const o = JSON.parse(process.env.OLD_PKG), n = JSON.parse(process.env.NEW_PKG);
const knx = JSON.parse(process.env.KNX_PKG);
const overrides = { ...knx.dependenciesOverride, ...knx.devDependenciesOverride, ...knx.resolutionsOverride };
let any = false;
for (const field of ["dependencies", "devDependencies", "resolutions"]) {
  const a = o[field] || {}, b = n[field] || {};
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    if (a[k] === b[k]) continue;
    any = true;
    const kind = !(k in a) ? "ADDED  " : !(k in b) ? "REMOVED" : "CHANGED";
    const major = a[k] && b[k] && a[k].replace(/^\D*/, "").split(".")[0] !== b[k].replace(/^\D*/, "").split(".")[0];
    console.log(`${kind} ${field}: ${k} ${a[k] ?? ""} -> ${b[k] ?? ""}${major ? "  [MAJOR]" : ""}${k in overrides ? "  [KNX OVERRIDE]" : ""}`);
  }
}
if (!any) console.log("none");
for (const k of Object.keys(overrides)) {
  const up = (n.dependencies || {})[k] ?? (n.devDependencies || {})[k] ?? (n.resolutions || {})[k];
  if (up === undefined) console.log(`KNX-only dependency ${k}=${overrides[k]} (not in upstream; keep)`);
  else console.log(`KNX override ${k}=${overrides[k]} (upstream: ${up}) - still needed?`);
}
EOF

section "Mirrored build/config files changed upstream (port the changes by hand)"
mirrored=0
while IFS= read -r f; do
  rel=${f#./}
  if exists_at "$OLD" "$rel" || exists_at "$NEW" "$rel"; then
    stat=$(sub diff --shortstat "$OLD" "$NEW" -- "$rel")
    if [ -n "$stat" ]; then
      exists_at "$NEW" "$rel" || stat="REMOVED upstream"
      echo "$rel:$stat"
      mirrored=1
    fi
  fi
done < <(find build-scripts -type f ! -name .DS_Store; printf '%s\n' tsconfig.json eslint.config.mjs gulpfile.js rspack.config.cjs)
[ $mirrored = 0 ] && echo "none"
echo "Upstream build-scripts files added or removed:"
sub diff --name-status "$OLD" "$NEW" -- build-scripts | grep -E '^[ADR]' | sed 's/^/    /' || echo "    none"

section "Upstream paths referenced by KNX build config and stubs"
{
  grep -rhoE 'homeassistant-frontend/[A-Za-z0-9_./-]+\.[a-z]+' build-scripts gulpfile.js rspack.config.cjs vitest.config.ts tsconfig.json 2>/dev/null |
    sed 's#^homeassistant-frontend/##'
  # ha("…") / haDirectory("…") entries in stubs.cjs are relative to src/
  sed -n '/^const stubs/,$p' build-scripts/stubs.cjs | grep -oE '"[A-Za-z0-9_./-]+(\.ts)?"' |
    tr -d '"' | grep -vE '\.(mjs|js)$' | grep -E '/' | sed 's#^#src/#'
} | sort -u | while IFS= read -r p; do
  if ! exists_at "$NEW" "$p"; then
    echo "MISSING at $NEW: $p"
  fi
done
echo "(no output above = all referenced paths exist)"

section "Directly imported @ha/* modules changed or removed"
grep -rhoE '"@ha/[^"]+"' src test 2>/dev/null | tr -d '"' | sed 's#^@ha/##' | sort -u |
  while IFS= read -r m; do
    for cand in "src/$m.ts" "src/$m/index.ts" "src/$m"; do
      if exists_at "$OLD" "$cand"; then
        if ! exists_at "$NEW" "$cand"; then
          echo "REMOVED  @ha/$m"
        else
          s=$(sub diff --shortstat "$OLD" "$NEW" -- "$cand" | sed 's/ 1 file changed, //')
          [ -n "$s" ] && echo "changed  @ha/$m: $s"
        fi
        break
      fi
    done
  done
echo
echo "Total upstream: $(sub diff --shortstat "$OLD" "$NEW")"
echo "Direct imports catch renames; type/behavior changes further down only show up in tsc, tests and the smoke test."
