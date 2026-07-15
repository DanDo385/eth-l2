#!/usr/bin/env bash
# Back-compat alias for local staging (same as start-staging-backend.sh).
# Hosted production uses Ubuntu systemd (eth-l2.service), not this script.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/start-staging-backend.sh" "$@"
