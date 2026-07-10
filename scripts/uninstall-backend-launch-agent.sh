#!/usr/bin/env bash
# Remove the eth-l2 backend launchd agent.
set -euo pipefail

LABEL="com.danmagro.eth-l2.backend"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
  echo "Stopped ${LABEL}"
else
  echo "${LABEL} was not loaded"
fi

if [[ -f "$PLIST" ]]; then
  rm -f "$PLIST"
  echo "Removed ${PLIST}"
else
  echo "No plist at ${PLIST}"
fi
