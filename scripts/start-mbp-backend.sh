#!/usr/bin/env bash
# Start the eth-l2 Go API + Anvil chains on this MacBook (localhost only).
# Pair with Cloudflare Tunnel → https://api-staging-eth-l2.magro.dev
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="$(node -p "require('./config/ports.json').backend.port")"
export GOAPI_ADDR="127.0.0.1:${PORT}"
export REPO_ROOT="$ROOT"

echo "eth-l2 backend → http://${GOAPI_ADDR}"
echo "health         → http://${GOAPI_ADDR}/health"
echo "tunnel target  → https://api-staging-eth-l2.magro.dev  (cloudflared → ${GOAPI_ADDR})"
echo

cd "$ROOT/backend"
exec go run ./cmd/server
