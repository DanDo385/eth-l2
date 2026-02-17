#!/usr/bin/env bash
source "$(dirname "$0")/.env.sh"

echo "=== Starting 3 Anvil chains ==="

# Kill any existing instances
for pidfile in "$OUT_DIR"/pids/*.pid; do
  [ -f "$pidfile" ] && kill "$(cat "$pidfile")" 2>/dev/null || true
done

echo "Starting L1 (port 8545, chainId $L1_CHAIN_ID)..."
anvil --port 8545 --chain-id "$L1_CHAIN_ID" --block-time 1 --silent &
echo $! > "$OUT_DIR/pids/l1.pid"

echo "Starting OP-L2 (port 9545, chainId $OP_L2_CHAIN_ID)..."
anvil --port 9545 --chain-id "$OP_L2_CHAIN_ID" --block-time 1 --silent &
echo $! > "$OUT_DIR/pids/op-l2.pid"

echo "Starting ZK-L2 (port 10545, chainId $ZK_L2_CHAIN_ID)..."
anvil --port 10545 --chain-id "$ZK_L2_CHAIN_ID" --block-time 1 --silent &
echo $! > "$OUT_DIR/pids/zk-l2.pid"

# Wait for chains to be ready
for port in 8545 9545 10545; do
  printf "Waiting for chain on port %s..." "$port"
  for i in $(seq 1 30); do
    if cast chain-id --rpc-url "http://127.0.0.1:$port" 2>/dev/null >/dev/null; then
      echo " ready."
      break
    fi
    sleep 0.5
  done
done

# Write env.json
cat > "$OUT_DIR/env.json" <<EOF
{
  "seed": $SEED,
  "chains": {
    "l1": { "rpc": "$L1_RPC", "chainId": $L1_CHAIN_ID, "port": 8545 },
    "opL2": { "rpc": "$OP_L2_RPC", "chainId": $OP_L2_CHAIN_ID, "port": 9545 },
    "zkL2": { "rpc": "$ZK_L2_RPC", "chainId": $ZK_L2_CHAIN_ID, "port": 10545 }
  },
  "accounts": {
    "deployer": "$DEPLOYER_ADDR",
    "sequencer": "$SEQUENCER_ADDR",
    "challenger": "$CHALLENGER_ADDR"
  }
}
EOF

echo "=== All 3 chains running ==="
