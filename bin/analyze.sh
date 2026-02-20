#!/usr/bin/env bash
source "$(dirname "$0")/.env.sh"

echo "=== Analyzing run artifacts ==="

REPORT="$OUT_DIR/report.json"
mkdir -p "$OUT_DIR"

# Build a minimal report from addresses + OP/ZK artifacts if present
if [ -f "$OUT_DIR/addresses.json" ]; then
  jq -n \
    --slurpfile addr "$OUT_DIR/addresses.json" \
    --arg seed "${SEED:-42}" \
    '{
      seed: ($seed | tonumber),
      addresses: ($addr[0] // {}),
      op: { batchesPath: "out/op/batches", receiptsPath: "out/op/receipts", disputesPath: "out/op/disputes" },
      zk: { batchesPath: "out/zk/batches", receiptsPath: "out/zk/receipts" },
      generatedAt: (now | todate)
    }' > "$REPORT"
else
  jq -n \
    --arg seed "${SEED:-42}" \
    '{ seed: ($seed | tonumber), addresses: {}, op: {}, zk: {}, generatedAt: (now | todate) }' > "$REPORT"
fi

echo "Report written to $REPORT"
cat "$REPORT"
