#!/usr/bin/env bash
# Back-compat alias for MacBook staging (same as start-staging-backend.sh).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/start-staging-backend.sh" "$@"
