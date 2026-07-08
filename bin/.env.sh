#!/usr/bin/env bash
set -euo pipefail

export PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export SEED="${SEED:-42}"

# Chain RPCs + dev ports (config/ports.json)
eval "$(node "$PROJECT_ROOT/scripts/ports-shell-exports.mjs")"

# Anvil default mnemonic: test test test test test test test test test test test junk
# Account 0: deployer / sequencer
export DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
export DEPLOYER_ADDR="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
export SEQUENCER_ADDR="$DEPLOYER_ADDR"

# Account 1: challenger
export CHALLENGER_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
export CHALLENGER_ADDR="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

# Accounts 2-7: traders
export TRADER_KEYS=(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e"
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356"
)
export TRADER_ADDRS=(
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"
  "0x976EA74026E726554dB657fA54763abd0C3a0aa9"
  "0x14dC79964da2C08dA15Fd353d30d9CBa20A5FEe5"
)

# Output directory
export OUT_DIR="$PROJECT_ROOT/out"
mkdir -p "$OUT_DIR/pids" "$OUT_DIR/op/batches" "$OUT_DIR/op/receipts" "$OUT_DIR/op/disputes"
mkdir -p "$OUT_DIR/zk/batches" "$OUT_DIR/zk/receipts" "$OUT_DIR/l1/op_submissions" "$OUT_DIR/l1/zk_submissions"
