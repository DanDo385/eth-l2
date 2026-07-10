# shellcheck shell=bash
# Source from other scripts:  source "$REPO_ROOT/scripts/lib/ports.sh"
# Exports canonical ports from config/ports.json (override with env if already set).

_ports_json="${REPO_ROOT:?REPO_ROOT must be set}/config/ports.json"

if [[ ! -f "$_ports_json" ]]; then
  echo "ERROR: missing $_ports_json" >&2
  return 1 2>/dev/null || exit 1
fi

_ports_eval="$(
  python3 - "$_ports_json" <<'PY'
import json, sys
p = json.load(open(sys.argv[1]))
b, f, s = p["backend"], p["frontend"], p.get("staging") or {}
bind = b.get("bind") or f'{b["host"]}:{b["port"]}'
print(f'export ETH_L2_BACKEND_HOST={b["host"]!r}')
print(f'export ETH_L2_BACKEND_PORT={b["port"]}')
print(f'export ETH_L2_BACKEND_URL={b["url"]!r}')
print(f'export ETH_L2_BACKEND_BIND={bind!r}')
print(f'export ETH_L2_BACKEND_WS_PATH={b.get("wsPath", "/stream")!r}')
print(f'export ETH_L2_FRONTEND_HOST={f["host"]!r}')
print(f'export ETH_L2_FRONTEND_PORT={f["port"]}')
print(f'export ETH_L2_FRONTEND_URL={f["url"]!r}')
print(f'export ETH_L2_PUBLIC_API_ORIGIN={s.get("publicApiOrigin", "")!r}')
print(f'export ETH_L2_VERCEL_ORIGIN={s.get("vercelOrigin", "")!r}')
print(f'export ETH_L2_TUNNEL_SERVICE={s.get("tunnelService", "")!r}')
PY
)"
eval "$_ports_eval"
unset _ports_json _ports_eval
