#!/usr/bin/env bash
# Read-only health check of a knx-frontend checkout: remotes, the homeassistant-frontend submodule
# and its release, Node, Yarn, dependencies, hooks, agent links and build output; optionally
# whether a Home Assistant Python loads this checkout and whether a server port is free.
#
# Usage, from a knx-frontend checkout or one of its worktrees:
#   bash doctor.sh [--ha-python <path>] [--ha-config <dir>] [--port <n>] [--json]
#
# Changes nothing: no installs, no git writes, no processes started. Network only through
# read-only `gh api` calls. Exit codes: 0 no FAIL, 1 at least one FAIL, 2 usage or not a checkout.
set -o pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
. "$HERE/lib/report.sh"
. "$HERE/lib/repo.sh"

die() {
  printf 'doctor: %s\n' "$1" >&2
  exit 2
}

usage() {
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
  exit 0
}

HA_PYTHON="" HA_CONFIG="" PORT="" JSON=0
while [ $# -gt 0 ]; do
  case "$1" in
    --ha-python | --ha-config | --port)
      [ $# -ge 2 ] || die "$1 needs a value"
      case "$1" in
        --ha-python) HA_PYTHON=$2 ;;
        --ha-config) HA_CONFIG=$2 ;;
        --port) PORT=$2 ;;
      esac
      shift 2
      ;;
    --json) JSON=1 && shift ;;
    -h | --help) usage ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done
if [ -n "$PORT" ] && ! [[ $PORT =~ ^[0-9]+$ ]]; then die "--port needs a number"; fi

# --- checks ---
check_repo
check_upstream
check_fork
check_submodule
check_submodule_release
# --- end checks ---

START=""
if [ $JSON = 1 ]; then print_json "$START"; else print_text "$START"; fi
if has_fail; then exit 1; fi
exit 0
