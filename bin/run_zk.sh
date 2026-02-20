#!/usr/bin/env bash
source "$(dirname "$0")/.env.sh"

echo "=== ZK Pipeline (SEED=$SEED) ==="

# Load contract addresses if available
if [ -f "$OUT_DIR/addresses.json" ]; then
  ZK_ENGINE=$(jq -r '.zkL2.tradeEngine' "$OUT_DIR/addresses.json")
  ZK_ROLLUP=$(jq -r '.l1.zkRollup' "$OUT_DIR/addresses.json")
  echo "TradeEngine (ZK-L2): $ZK_ENGINE | ZkRollup (L1): $ZK_ROLLUP"
fi

# Placeholder: ZK batch submission pipeline not yet implemented
mkdir -p "$OUT_DIR/zk/batches" "$OUT_DIR/zk/receipts" "$OUT_DIR/l1/zk_submissions"
echo '{"message":"ZK pipeline stub — not yet implemented","seed":'"$SEED"'}' > "$OUT_DIR/zk/zk-pipeline-stub.json"
echo "=== ZK pipeline stub complete (no batches submitted) ==="
