# Home Assistant and server ports: whether a Home Assistant Python imports this checkout, whether a
# port is free (and who holds it), and the command that starts Home Assistant on this checkout.

HA_PORT=""

check_ha() {
  local out file entry
  if [ ! -x "$HA_PYTHON" ]; then
    report ha fail "$HA_PYTHON is not an executable Python" \
      "pass the python of your Home Assistant venv: --ha-python <ha-venv>/bin/python"
    return
  fi
  out=$(PYTHONPATH="$TOP" "$HA_PYTHON" -c \
    'import knx_frontend as k; print(k.__file__); print(k.entrypoint_js)' 2>&1)
  file=$(printf '%s\n' "$out" | sed -n 1p)
  entry=$(printf '%s\n' "$out" | sed -n 2p)
  if [[ $file == "$TOP/knx_frontend/"* ]] && [ -n "$entry" ] && [ -f "$TOP/knx_frontend/$entry" ]; then
    report ha ok "Home Assistant's Python loads this checkout: knx_frontend/$entry"
  else
    report ha fail \
      "with PYTHONPATH=$TOP, Home Assistant's Python loads ${file:-nothing}, not this checkout's built panel" \
      "script/build   (knx_frontend/constants.py and the entrypoint must exist)"
  fi
}

# config_port <config dir>: http.server_port from configuration.yaml, if set directly there
config_port() {
  awk '/^http:/ { h = 1; next } /^[^[:space:]#]/ { h = 0 }
    h && /^[[:space:]]+server_port:/ { gsub(/[^0-9]/, "", $2); print $2; exit }' \
    "$1/configuration.yaml" 2>/dev/null
}

# port_holder <port>: "<pid> <command>" or "unknown" when in use, nothing when free
port_holder() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$1" -sTCP:LISTEN -Fpc 2>/dev/null |
      awk '/^p/ { pid = substr($0, 2) } /^c/ { print pid, substr($0, 2); exit }'
  elif (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; then
    echo unknown
  fi
}

# served_checkout <pid>: PYTHONPATH of a running process, where the system lets us read it
served_checkout() {
  if [ -r "/proc/$1/environ" ]; then
    tr '\0' '\n' <"/proc/$1/environ" | sed -n 's/^PYTHONPATH=//p' | head -1
  else
    ps eww -o command= -p "$1" 2>/dev/null | tr ' ' '\n' | sed -n 's/^PYTHONPATH=//p' | head -1
  fi
}

check_port() {
  local port holder pid cmd served free="" p msg fix
  port=$PORT
  if [ -z "$port" ] && [ -n "$HA_CONFIG" ]; then port=$(config_port "$HA_CONFIG"); fi
  port=${port:-8123}
  HA_PORT=$port
  holder=$(port_holder "$port")
  if [ -z "$holder" ]; then
    report port ok "port $port is free"
    return
  fi
  for p in $(seq $((port + 1)) $((port + 20))); do
    if [ -z "$(port_holder "$p")" ]; then
      free=$p
      break
    fi
  done
  if [ "$holder" = unknown ]; then
    msg="port $port is in use (lsof is not available to tell by whom)"
  else
    pid=${holder%% *}
    cmd=$(ps -o command= -p "$pid" 2>/dev/null)
    cmd=${cmd:-${holder#* }}
    msg="port $port is in use by PID $pid: $cmd"
    case "$cmd" in
      *hass*)
        served=$(served_checkout "$pid")
        msg+=$'\n'"that Home Assistant serves: ${served:-its installed knx_frontend (no PYTHONPATH visible)}"
        ;;
    esac
  fi
  msg+=$'\n'"free port: ${free:-none in $((port + 1))-$((port + 20))}"
  if [ -n "$HA_PYTHON" ] || [ -n "$HA_CONFIG" ]; then
    fix="run your own Home Assistant with its own config directory (never share one) containing:
http:
  server_port: ${free:-<free port>}
never stop the process holding port $port"
  else
    fix="start the server on port ${free:-<free port>} (its port option or environment variable); never stop the process holding port $port"
  fi
  HA_PORT=${free:-$port}
  report port warn "$msg" "$fix"
}

start_command() {
  local hass
  hass="$(dirname "$HA_PYTHON")/hass"
  printf 'PYTHONPATH=%s AIOHTTP_NOSENDFILE=1 %s%s\n' "$TOP" "$hass" "${HA_CONFIG:+ -c $HA_CONFIG}"
  printf 'open http://<host>:%s/knx\n' "${HA_PORT:-8123}"
  printf '%s\n' "PYTHONPATH makes Home Assistant import this checkout's knx_frontend instead of the PyPI one;"
  printf '%s' "AIOHTTP_NOSENDFILE=1 was needed on macOS to reach the instance from other devices."
}
