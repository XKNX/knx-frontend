# Collects check results and prints them as text or JSON. Sourced by doctor.sh.

IDS=()
STATUSES=()
MESSAGES=()
FIXES=()

# report <id> <ok|info|warn|fail> <message> [fix]
report() {
  IDS+=("$1")
  STATUSES+=("$2")
  MESSAGES+=("$3")
  FIXES+=("${4:-}")
}

has_fail() {
  local status
  for status in "${STATUSES[@]}"; do [ "$status" = fail ] && return 0; done
  return 1
}

json_escape() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/\\r}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

# pad <width> <text>: every line of text, indented by width spaces
pad() {
  local line
  while IFS= read -r line; do printf '%*s%s\n' "$1" "" "$line"; done <<<"$2"
}

print_text() {
  local i label first counts_ok=0 counts_info=0 counts_warn=0 counts_fail=0
  for i in "${!IDS[@]}"; do
    label=$(printf '%s' "${STATUSES[$i]}" | tr '[:lower:]' '[:upper:]')
    first=${MESSAGES[$i]%%$'\n'*}
    printf '%-5s %-17s %s\n' "$label" "${IDS[$i]}" "$first"
    if [[ ${MESSAGES[$i]} == *$'\n'* ]]; then pad 24 "${MESSAGES[$i]#*$'\n'}"; fi
    if [ -n "${FIXES[$i]}" ]; then pad 24 "fix: ${FIXES[$i]}"; fi
    case "${STATUSES[$i]}" in
      ok) counts_ok=$((counts_ok + 1)) ;;
      info) counts_info=$((counts_info + 1)) ;;
      warn) counts_warn=$((counts_warn + 1)) ;;
      fail) counts_fail=$((counts_fail + 1)) ;;
    esac
  done
  if [ -n "$1" ]; then
    printf '\nstart: %s\n' "${1%%$'\n'*}"
    if [[ $1 == *$'\n'* ]]; then pad 7 "${1#*$'\n'}"; fi
  fi
  printf '\n%d ok, %d info, %d warn, %d fail\n' "$counts_ok" "$counts_info" "$counts_warn" "$counts_fail"
}

print_json() {
  local i sep=""
  printf '{"checks":['
  for i in "${!IDS[@]}"; do
    printf '%s{"id":"%s","status":"%s","message":"%s","fix":' "$sep" "${IDS[$i]}" \
      "${STATUSES[$i]}" "$(json_escape "${MESSAGES[$i]}")"
    if [ -n "${FIXES[$i]}" ]; then printf '"%s"}' "$(json_escape "${FIXES[$i]}")"; else printf 'null}'; fi
    sep=","
  done
  printf '],"start":'
  if [ -n "$1" ]; then printf '"%s"' "$(json_escape "$1")"; else printf 'null'; fi
  printf '}\n'
}
