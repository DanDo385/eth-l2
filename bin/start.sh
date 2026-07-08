#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="${OUT_DIR:-$PROJECT_ROOT/out}"

source "$SCRIPT_DIR/.env.sh" 2>/dev/null || true

# Fallbacks when .env.sh fails or times out (defaults match config/ports.json)
L1_CHAIN_ID="${L1_CHAIN_ID:-31337}"
OP_L2_CHAIN_ID="${OP_L2_CHAIN_ID:-31338}"
ZK_L2_CHAIN_ID="${ZK_L2_CHAIN_ID:-31339}"
L1_RPC="${L1_RPC:-http://127.0.0.1:8545}"
OP_L2_RPC="${OP_L2_RPC:-http://127.0.0.1:9545}"
ZK_L2_RPC="${ZK_L2_RPC:-http://127.0.0.1:10545}"
L1_PORT="${ETH_L2_L1_ANVIL_PORT:-8545}"
OP_PORT="${ETH_L2_OP_ANVIL_PORT:-9545}"
ZK_PORT="${ETH_L2_ZK_ANVIL_PORT:-10545}"
SEED="${SEED:-42}"
DEPLOYER_ADDR="${DEPLOYER_ADDR:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}"
SEQUENCER_ADDR="${SEQUENCER_ADDR:-$DEPLOYER_ADDR}"
CHALLENGER_ADDR="${CHALLENGER_ADDR:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}"

# Safety: never write to root (OUT_DIR empty or "/" causes /pids/, /env.json)
if [ -z "$OUT_DIR" ] || [ "$OUT_DIR" = "/" ]; then
  OUT_DIR="$PROJECT_ROOT/out"
fi

# Ensure Foundry is on PATH
if ! command -v anvil &>/dev/null; then
  export PATH="$HOME/.foundry/bin:$PATH"
fi
if ! command -v anvil &>/dev/null; then
  echo "Error: anvil not found. Install Foundry: curl -L https://foundry.paradigm.xyz | bash"
  exit 1
fi

mkdir -p "$OUT_DIR/pids"
echo "=== Starting 3 Anvil chains ==="

# Kill any existing instances
for pidfile in "$OUT_DIR"/pids/*.pid; do
  [ -f "$pidfile" ] && kill "$(cat "$pidfile")" 2>/dev/null || true
done

echo "Starting L1 (port $L1_PORT, chainId $L1_CHAIN_ID)..."
anvil --port "$L1_PORT" --chain-id "$L1_CHAIN_ID" --block-time 1 --silent &
echo $! > "$OUT_DIR/pids/l1.pid"

echo "Starting OP-L2 (port $OP_PORT, chainId $OP_L2_CHAIN_ID)..."
anvil --port "$OP_PORT" --chain-id "$OP_L2_CHAIN_ID" --block-time 1 --silent &
echo $! > "$OUT_DIR/pids/op-l2.pid"

echo "Starting ZK-L2 (port $ZK_PORT, chainId $ZK_L2_CHAIN_ID)..."
anvil --port "$ZK_PORT" --chain-id "$ZK_L2_CHAIN_ID" --block-time 1 --silent &
echo $! > "$OUT_DIR/pids/zk-l2.pid"

# Wait for chains to be ready
for port in "$L1_PORT" "$OP_PORT" "$ZK_PORT"; do
  printf "Waiting for chain on port %s..." "$port"
  for i in $(seq 1 30); do
    if cast chain-id --rpc-url "http://127.0.0.1:$port" 2>/dev/null >/dev/null; then
      echo " ready."
      break
    fi
    sleep 0.5
  done
done

# Write env.json (best-effort; may timeout on synced/network filesystems)
if ! cat > "$OUT_DIR/env.json" <<EOF
{
  "seed": $SEED,
  "chains": {
    "l1": { "rpc": "$L1_RPC", "chainId": $L1_CHAIN_ID, "port": $L1_PORT },
    "opL2": { "rpc": "$OP_L2_RPC", "chainId": $OP_L2_CHAIN_ID, "port": $OP_PORT },
    "zkL2": { "rpc": "$ZK_L2_RPC", "chainId": $ZK_L2_CHAIN_ID, "port": $ZK_PORT }
  },
  "accounts": {
    "deployer": "$DEPLOYER_ADDR",
    "sequencer": "$SEQUENCER_ADDR",
    "challenger": "$CHALLENGER_ADDR"
  }
}
EOF
then
  echo "Warning: could not write env.json (chains are still running)"
fi

echo "=== All 3 chains running ==="
