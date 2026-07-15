#!/usr/bin/env bash
# Start eth-l2 Go API + Anvil on the canonical loopback bind (laptop demos).
# Hosted production uses Ubuntu systemd (eth-l2.service + cloudflared-eth-l2.service)
# → https://api-staging-eth-l2.magro.dev
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/ports.sh
source "$REPO_ROOT/scripts/lib/ports.sh"

ENV_FILE="$REPO_ROOT/.env.local"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# Staging always uses ports.json bind unless GOAPI_ADDR is forced.
export GOAPI_ADDR="${GOAPI_ADDR:-$ETH_L2_BACKEND_BIND}"
export REPO_ROOT
# CORS for direct tunnel hits; Vercel same-origin proxy does not need this.
if [[ -n "${ETH_L2_VERCEL_ORIGIN:-}" ]]; then
  export ETH_L2_ALLOWED_ORIGINS="${ETH_L2_ALLOWED_ORIGINS:-$ETH_L2_VERCEL_ORIGIN}"
fi

mkdir -p "$REPO_ROOT/backend/bin"
cd "$REPO_ROOT/backend"
BIN="$REPO_ROOT/backend/bin/eth-l2"
if [[ ! -x "$BIN" ]]; then
  echo "Compiling backend..."
  go build -o "$BIN" ./cmd/server
fi

echo "eth-l2 backend → http://${GOAPI_ADDR}"
echo "health         → ${ETH_L2_BACKEND_URL}/health"
echo "ready          → ${ETH_L2_BACKEND_URL}/health/ready"
echo "tunnel target  → ${ETH_L2_PUBLIC_API_ORIGIN}  (cloudflared → ${ETH_L2_TUNNEL_SERVICE:-$ETH_L2_BACKEND_URL})"
echo

exec env GOAPI_ADDR="$GOAPI_ADDR" REPO_ROOT="$REPO_ROOT" \
  ETH_L2_ALLOWED_ORIGINS="${ETH_L2_ALLOWED_ORIGINS:-}" \
  "$BIN"
