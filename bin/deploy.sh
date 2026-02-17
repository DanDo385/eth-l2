#!/usr/bin/env bash
source "$(dirname "$0")/.env.sh"

echo "=== Deploying contracts ==="

echo "--- L1 contracts ---"
DEPLOYER_KEY="$DEPLOYER_KEY" \
SEQUENCER_ADDR="$SEQUENCER_ADDR" \
forge script script/DeployL1.s.sol:DeployL1 \
  --rpc-url "$L1_RPC" \
  --broadcast \
  --root "$PROJECT_ROOT" \
  -vvv

echo "--- TradeEngine on OP-L2 ---"
DEPLOYER_KEY="$DEPLOYER_KEY" \
DEPLOY_OUT_PATH="$OUT_DIR/op-l2-deploy.json" \
forge script script/DeployL2.s.sol:DeployL2 \
  --rpc-url "$OP_L2_RPC" \
  --broadcast \
  --root "$PROJECT_ROOT" \
  -vvv

echo "--- TradeEngine on ZK-L2 ---"
DEPLOYER_KEY="$DEPLOYER_KEY" \
DEPLOY_OUT_PATH="$OUT_DIR/zk-l2-deploy.json" \
forge script script/DeployL2.s.sol:DeployL2 \
  --rpc-url "$ZK_L2_RPC" \
  --broadcast \
  --root "$PROJECT_ROOT" \
  -vvv

# Merge all addresses into addresses.json
echo "--- Building addresses.json ---"
L1=$(cat "$OUT_DIR/l1-deploy.json")
OP_L2=$(cat "$OUT_DIR/op-l2-deploy.json")
ZK_L2=$(cat "$OUT_DIR/zk-l2-deploy.json")

jq -n \
  --argjson l1 "$L1" \
  --argjson opL2 "$OP_L2" \
  --argjson zkL2 "$ZK_L2" \
  '{ l1: $l1, opL2: $opL2, zkL2: $zkL2 }' > "$OUT_DIR/addresses.json"

echo "=== Deployment complete. Addresses written to out/addresses.json ==="
cat "$OUT_DIR/addresses.json"
