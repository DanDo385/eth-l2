#!/usr/bin/env bash
source "$(dirname "$0")/.env.sh"

# Parameters
BLOCKS="${BLOCKS:-10}"
TRADES_PER_BLOCK_MIN="${TRADES_PER_BLOCK_MIN:-2}"
TRADES_PER_BLOCK_MAX="${TRADES_PER_BLOCK_MAX:-5}"
BATCH_EVERY="${BATCH_EVERY:-5}"
BAD_BATCH_ID="${BAD_BATCH_ID:-1}"

# Load contract addresses
OP_ENGINE=$(jq -r '.opL2.tradeEngine' "$OUT_DIR/addresses.json")
PORTAL=$(jq -r '.l1.portal' "$OUT_DIR/addresses.json")
DISPUTE=$(jq -r '.l1.disputeGame' "$OUT_DIR/addresses.json")

echo "=== OP Pipeline (SEED=$SEED, BLOCKS=$BLOCKS, BATCH_EVERY=$BATCH_EVERY) ==="
echo "TradeEngine: $OP_ENGINE | Portal: $PORTAL | DisputeGame: $DISPUTE"

# ============================================================
# Phase 1: Generate trades on OP-L2
# ============================================================
echo "--- Phase 1: Generating trades on OP-L2 ---"

declare -a ALL_TX_HASHES
declare -a ALL_TRADE_IDS
TRADE_GLOBAL_IDX=0
# Track nonces per trader
declare -A TRADER_NONCES
for addr in "${TRADER_ADDRS[@]}"; do
  TRADER_NONCES["$addr"]=0
done

for block in $(seq 1 "$BLOCKS"); do
  # Deterministic number of trades per block
  HASH_SEED=$(cast keccak "$(printf '0x%064x%064x' "$SEED" "$block")")
  BYTE0=$((16#${HASH_SEED:2:2}))
  RANGE=$((TRADES_PER_BLOCK_MAX - TRADES_PER_BLOCK_MIN + 1))
  NUM_TRADES=$(( (BYTE0 % RANGE) + TRADES_PER_BLOCK_MIN ))

  for tx_idx in $(seq 0 $((NUM_TRADES - 1))); do
    # Deterministic trade params from SEED + block + tx_idx
    PARAM_HASH=$(cast keccak "$(printf '0x%064x%064x%064x' "$SEED" "$block" "$tx_idx")")

    TRADER_IDX=$(( 16#${PARAM_HASH:2:2} % ${#TRADER_ADDRS[@]} ))
    TRADER="${TRADER_ADDRS[$TRADER_IDX]}"
    NONCE=${TRADER_NONCES["$TRADER"]}

    # amountIn: 1-100 ether range
    AMT_RAW=$(( 16#${PARAM_HASH:4:4} ))
    AMOUNT_IN=$(( (AMT_RAW % 100 + 1) ))
    AMOUNT_IN_WEI="${AMOUNT_IN}000000000000000000"

    # amountOut: 1000-5000 range
    OUT_RAW=$(( 16#${PARAM_HASH:8:4} ))
    AMOUNT_OUT=$(( (OUT_RAW % 4000 + 1000) ))
    AMOUNT_OUT_WEI="${AMOUNT_OUT}000000000000000000"

    TX_RESULT=$(cast send --rpc-url "$OP_L2_RPC" --private-key "$DEPLOYER_KEY" \
      "$OP_ENGINE" \
      "executeTrade(address,uint256,uint256,uint256)" \
      "$TRADER" "$AMOUNT_IN_WEI" "$AMOUNT_OUT_WEI" "$NONCE" \
      --json 2>/dev/null)

    TX_HASH=$(echo "$TX_RESULT" | jq -r '.transactionHash')
    ALL_TX_HASHES+=("$TX_HASH")
    ALL_TRADE_IDS+=("$TRADE_GLOBAL_IDX")
    TRADER_NONCES["$TRADER"]=$((NONCE + 1))
    TRADE_GLOBAL_IDX=$((TRADE_GLOBAL_IDX + 1))

    echo "  Block $block, Trade $tx_idx: trader=$TRADER nonce=$NONCE tx=$TX_HASH"
  done

  # Mine a block
  cast rpc --rpc-url "$OP_L2_RPC" evm_mine > /dev/null 2>&1
done

TOTAL_TRADES=$TRADE_GLOBAL_IDX
echo "Generated $TOTAL_TRADES trades across $BLOCKS blocks"

# ============================================================
# Phase 2: Build and post batches to L1
# ============================================================
echo "--- Phase 2: Building and posting batches ---"

TRADES_SO_FAR=0
BATCH_IDX=0
STATE_ROOT="0x0000000000000000000000000000000000000000000000000000000000000000"

# Compute how many trades per batch group
# We batch every BATCH_EVERY blocks worth of trades
BATCH_START_BLOCK=1
declare -a BATCH_TX_COUNTS

# Count trades per block for batching
declare -a BLOCK_TRADE_COUNTS
trade_offset=0
for block in $(seq 1 "$BLOCKS"); do
  HASH_SEED=$(cast keccak "$(printf '0x%064x%064x' "$SEED" "$block")")
  BYTE0=$((16#${HASH_SEED:2:2}))
  RANGE=$((TRADES_PER_BLOCK_MAX - TRADES_PER_BLOCK_MIN + 1))
  NUM_TRADES=$(( (BYTE0 % RANGE) + TRADES_PER_BLOCK_MIN ))
  BLOCK_TRADE_COUNTS+=("$NUM_TRADES")
done

trade_offset=0
for block in $(seq 1 "$BLOCKS"); do
  block_idx=$((block - 1))
  num_trades=${BLOCK_TRADE_COUNTS[$block_idx]}
  trade_offset=$((trade_offset + num_trades))

  # Check if we should batch (every BATCH_EVERY blocks or last block)
  if (( block % BATCH_EVERY == 0 )) || (( block == BLOCKS )); then
    BATCH_TRADE_COUNT=$((trade_offset - TRADES_SO_FAR))

    FROM_ID=$TRADES_SO_FAR
    TO_ID=$trade_offset

    echo "  Batch $BATCH_IDX: trades [$FROM_ID, $TO_ID) = $BATCH_TRADE_COUNT trades"

    # Get state root from contract
    NEW_STATE_ROOT=$(cast call --rpc-url "$OP_L2_RPC" "$OP_ENGINE" "stateRoot()(bytes32)")

    # Compute batchDataHash from trade hashes
    if (( BATCH_TRADE_COUNT > 0 )); then
      TRADE_HASHES_RAW=$(cast call --rpc-url "$OP_L2_RPC" "$OP_ENGINE" \
        "getTradeHashes(uint64,uint64)(bytes32[])" "$FROM_ID" "$TO_ID")
      BATCH_DATA_HASH=$(cast keccak "$TRADE_HASHES_RAW")
    else
      BATCH_DATA_HASH="0x0000000000000000000000000000000000000000000000000000000000000000"
    fi

    # Get L2 block numbers from tx receipts
    FIRST_TX="${ALL_TX_HASHES[$FROM_ID]}"
    LAST_TX="${ALL_TX_HASHES[$((TO_ID - 1))]}"
    L2_START_BLOCK=$(cast receipt --rpc-url "$OP_L2_RPC" "$FIRST_TX" blockNumber 2>/dev/null || echo "0")
    L2_END_BLOCK=$(cast receipt --rpc-url "$OP_L2_RPC" "$LAST_TX" blockNumber 2>/dev/null || echo "0")
    TIMESTAMP=$(date +%s)

    # For the BAD_BATCH: corrupt the state root
    POST_ROOT="$NEW_STATE_ROOT"
    IS_BAD="false"
    if (( BATCH_IDX == BAD_BATCH_ID )); then
      # Flip last byte
      POST_ROOT="${NEW_STATE_ROOT:0:64}ff"
      if [ "$POST_ROOT" = "$NEW_STATE_ROOT" ]; then
        POST_ROOT="${NEW_STATE_ROOT:0:64}00"
      fi
      IS_BAD="true"
      echo "  ** BAD BATCH: corrupted state root **"
    fi

    # Build batch JSON artifact
    cat > "$OUT_DIR/op/batches/batch_${BATCH_IDX}.json" <<BEOF
{
  "batchId": $BATCH_IDX,
  "l2BlockStart": $L2_START_BLOCK,
  "l2BlockEnd": $L2_END_BLOCK,
  "txCount": $BATCH_TRADE_COUNT,
  "prevStateRoot": "$STATE_ROOT",
  "postStateRoot": "$POST_ROOT",
  "correctStateRoot": "$NEW_STATE_ROOT",
  "batchDataHash": "$BATCH_DATA_HASH",
  "isBad": $IS_BAD,
  "timestamp": $TIMESTAMP
}
BEOF

    # Post batch to L1
    echo "  Posting batch $BATCH_IDX to L1..."
    L1_TX=$(cast send --rpc-url "$L1_RPC" --private-key "$DEPLOYER_KEY" \
      --value "0.1ether" \
      "$PORTAL" \
      "postBatch((uint64,bytes32,bytes32,bytes32,uint64,uint64,uint32,uint64),bytes)" \
      "($BATCH_IDX,$STATE_ROOT,$POST_ROOT,$BATCH_DATA_HASH,$L2_START_BLOCK,$L2_END_BLOCK,$BATCH_TRADE_COUNT,$TIMESTAMP)" \
      "0x$(echo -n "$TRADE_HASHES_RAW" | xxd -p -c0 2>/dev/null || echo "00")" \
      --json 2>/dev/null)

    L1_TX_HASH=$(echo "$L1_TX" | jq -r '.transactionHash')
    L1_GAS=$(echo "$L1_TX" | jq -r '.gasUsed')

    # Save L1 receipt
    cat > "$OUT_DIR/l1/op_submissions/batch_${BATCH_IDX}.json" <<REOF
{
  "batchId": $BATCH_IDX,
  "l1TxHash": "$L1_TX_HASH",
  "l1GasUsed": "$L1_GAS",
  "type": "op"
}
REOF

    cat > "$OUT_DIR/op/receipts/batch_${BATCH_IDX}.json" <<RCEOF
{
  "batchId": $BATCH_IDX,
  "l1TxHash": "$L1_TX_HASH",
  "l1GasUsed": "$L1_GAS",
  "status": "posted"
}
RCEOF

    echo "  Batch $BATCH_IDX posted: L1 tx=$L1_TX_HASH gas=$L1_GAS"

    STATE_ROOT="$NEW_STATE_ROOT"
    TRADES_SO_FAR=$trade_offset
    BATCH_IDX=$((BATCH_IDX + 1))
  fi
done

TOTAL_BATCHES=$BATCH_IDX
echo "Posted $TOTAL_BATCHES batches to L1"

# ============================================================
# Phase 3: Challenge the bad batch
# ============================================================
echo "--- Phase 3: Challenging bad batch $BAD_BATCH_ID ---"

CHALLENGE_TX=$(cast send --rpc-url "$L1_RPC" --private-key "$CHALLENGER_KEY" \
  --value "0.1ether" \
  "$PORTAL" \
  "challengeBatch(uint64)" "$BAD_BATCH_ID" \
  --json 2>/dev/null)

CHALLENGE_TX_HASH=$(echo "$CHALLENGE_TX" | jq -r '.transactionHash')
echo "Challenge tx: $CHALLENGE_TX_HASH"

# ============================================================
# Phase 4: Bisection dispute
# ============================================================
echo "--- Phase 4: Running bisection dispute ---"

GAME_DATA=$(cast call --rpc-url "$L1_RPC" "$DISPUTE" "getGame(uint64)" "$BAD_BATCH_ID" 2>/dev/null)
# Parse maxDepth from the game struct - it's the 7th field (index 6) in the tuple
MAX_DEPTH=$(cast call --rpc-url "$L1_RPC" "$DISPUTE" \
  "games(uint64)(uint64,address,address,uint256,uint8,uint8,uint8,bytes32,uint64,bool)" \
  "$BAD_BATCH_ID" 2>/dev/null | sed -n '7p' | tr -d '[:space:]')

echo "Max bisection depth: $MAX_DEPTH"

declare -a DISPUTE_ROUNDS

for depth in $(seq 0 $((MAX_DEPTH - 1))); do
  # Deterministic state hash for each round
  MOVE_HASH=$(cast keccak "$(printf '0x%064x%064x%064x' "$SEED" "$BAD_BATCH_ID" "$depth")")
  POSITION=$((depth + 1))

  if (( depth % 2 == 0 )); then
    # Sequencer's turn
    MOVE_TX=$(cast send --rpc-url "$L1_RPC" --private-key "$DEPLOYER_KEY" \
      "$DISPUTE" "bisect(uint64,bytes32,uint64)" "$BAD_BATCH_ID" "$MOVE_HASH" "$POSITION" \
      --json 2>/dev/null)
    ROLE="sequencer"
    SUBMITTER="$DEPLOYER_ADDR"
  else
    # Challenger's turn
    MOVE_TX=$(cast send --rpc-url "$L1_RPC" --private-key "$CHALLENGER_KEY" \
      "$DISPUTE" "bisect(uint64,bytes32,uint64)" "$BAD_BATCH_ID" "$MOVE_HASH" "$POSITION" \
      --json 2>/dev/null)
    ROLE="challenger"
    SUBMITTER="$CHALLENGER_ADDR"
  fi

  MOVE_TX_HASH=$(echo "$MOVE_TX" | jq -r '.transactionHash')
  MOVE_GAS=$(echo "$MOVE_TX" | jq -r '.gasUsed')

  DISPUTE_ROUNDS+=("{\"depth\":$depth,\"submitter\":\"$SUBMITTER\",\"role\":\"$ROLE\",\"claimedStateHash\":\"$MOVE_HASH\",\"position\":$POSITION,\"l1TxHash\":\"$MOVE_TX_HASH\",\"l1GasUsed\":\"$MOVE_GAS\"}")

  echo "  Round $depth ($ROLE): hash=$MOVE_HASH pos=$POSITION tx=$MOVE_TX_HASH"
done

# ============================================================
# Phase 5: Resolve dispute (challenger wins)
# ============================================================
echo "--- Phase 5: Resolving dispute (challenger wins) ---"

RESOLVE_TX=$(cast send --rpc-url "$L1_RPC" --private-key "$CHALLENGER_KEY" \
  "$DISPUTE" "resolve(uint64,bool)" "$BAD_BATCH_ID" "false" \
  --json 2>/dev/null)

RESOLVE_TX_HASH=$(echo "$RESOLVE_TX" | jq -r '.transactionHash')
RESOLVE_GAS=$(echo "$RESOLVE_TX" | jq -r '.gasUsed')
echo "Dispute resolved: tx=$RESOLVE_TX_HASH gas=$RESOLVE_GAS"

# Build dispute JSON
ROUNDS_JSON=$(printf '%s\n' "${DISPUTE_ROUNDS[@]}" | jq -s '.')

cat > "$OUT_DIR/op/disputes/batch_${BAD_BATCH_ID}.json" <<DEOF
{
  "batchId": $BAD_BATCH_ID,
  "challenger": "$CHALLENGER_ADDR",
  "sequencer": "$DEPLOYER_ADDR",
  "maxDepth": $MAX_DEPTH,
  "rounds": $ROUNDS_JSON,
  "challengeTxHash": "$CHALLENGE_TX_HASH",
  "resolutionTxHash": "$RESOLVE_TX_HASH",
  "resolutionGasUsed": "$RESOLVE_GAS",
  "winner": "$CHALLENGER_ADDR",
  "result": "RESOLVED_INVALID"
}
DEOF

# Update receipt for bad batch
cat > "$OUT_DIR/op/receipts/batch_${BAD_BATCH_ID}.json" <<RUEOF
{
  "batchId": $BAD_BATCH_ID,
  "l1TxHash": "$(jq -r '.l1TxHash' "$OUT_DIR/l1/op_submissions/batch_${BAD_BATCH_ID}.json")",
  "l1GasUsed": "$(jq -r '.l1GasUsed' "$OUT_DIR/l1/op_submissions/batch_${BAD_BATCH_ID}.json")",
  "status": "invalidated",
  "challengeTxHash": "$CHALLENGE_TX_HASH",
  "resolutionTxHash": "$RESOLVE_TX_HASH"
}
RUEOF

# ============================================================
# Phase 6: Finalize valid batches
# ============================================================
echo "--- Phase 6: Finalizing valid batches ---"

# Advance time past challenge window
cast rpc --rpc-url "$L1_RPC" evm_increaseTime 200 > /dev/null 2>&1
cast rpc --rpc-url "$L1_RPC" evm_mine > /dev/null 2>&1

for idx in $(seq 0 $((TOTAL_BATCHES - 1))); do
  if (( idx == BAD_BATCH_ID )); then
    echo "  Batch $idx: skipped (invalidated)"
    continue
  fi

  FINALIZE_TX=$(cast send --rpc-url "$L1_RPC" --private-key "$DEPLOYER_KEY" \
    "$PORTAL" "finalizeBatch(uint64,bool)" "$idx" "true" \
    --json 2>/dev/null)

  FINALIZE_HASH=$(echo "$FINALIZE_TX" | jq -r '.transactionHash')
  echo "  Batch $idx: finalized tx=$FINALIZE_HASH"

  # Update receipt
  cat > "$OUT_DIR/op/receipts/batch_${idx}.json" <<FEOF
{
  "batchId": $idx,
  "l1TxHash": "$(jq -r '.l1TxHash' "$OUT_DIR/l1/op_submissions/batch_${idx}.json")",
  "l1GasUsed": "$(jq -r '.l1GasUsed' "$OUT_DIR/l1/op_submissions/batch_${idx}.json")",
  "status": "finalized",
  "finalizeTxHash": "$FINALIZE_HASH"
}
FEOF
done

echo "=== OP Pipeline complete ==="
echo "  Total trades: $TOTAL_TRADES"
echo "  Total batches: $TOTAL_BATCHES"
echo "  Bad batch: $BAD_BATCH_ID (challenged and invalidated)"
echo "  Artifacts in: out/op/ and out/l1/op_submissions/"
