package trace

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/ethclient"
)

// StructLog is one EVM execution step from Anvil's debug_trace* output.
type StructLog struct {
	PC      uint64            `json:"pc"`
	Op      string            `json:"op"`
	Gas     uint64            `json:"gas"`
	GasCost uint64            `json:"gasCost"`
	Depth   int               `json:"depth"`
	Stack   []string          `json:"stack"`   // index 0 = bottom, last = top
	Storage map[string]string `json:"storage"` // slot → value (hex)
}

// TraceResult is the top-level response from debug_trace* calls.
type TraceResult struct {
	Gas         uint64      `json:"gas"`
	Failed      bool        `json:"failed"`
	ReturnValue string      `json:"returnValue"`
	StructLogs  []StructLog `json:"structLogs"`
}

var tracerConfig = map[string]interface{}{
	"disableMemory":  true,
	"disableStack":   false,
	"disableStorage": false,
}

// Transaction returns the full EVM trace for a confirmed L2 transaction.
func Transaction(ctx context.Context, ec *ethclient.Client, txHash common.Hash) (*TraceResult, error) {
	var raw json.RawMessage
	if err := ec.Client().CallContext(ctx, &raw, "debug_traceTransaction", txHash, tracerConfig); err != nil {
		return nil, fmt.Errorf("debug_traceTransaction: %w", err)
	}
	var result TraceResult
	return &result, json.Unmarshal(raw, &result)
}

// HonestReplay traces what would happen if the SwapRouter used HonestSwapEngine for the
// given calldata. It overrides the router's implementation storage slot so Anvil replays
// the call through the honest engine without mutating chain state.
//
// Implementation slot (slot 7) layout:
//
//	SwapEngineStorage: _balanceA(0) _balanceB(1) _nonces(2) _nextSwapId+_swapCount(3) _stateRoot(4) _swapHashes(5)
//	SwapRouter:        sequencer(6)  implementation(7)
func HonestReplay(
	ctx context.Context,
	ec *ethclient.Client,
	from common.Address,
	routerAddr common.Address,
	honestEngineAddr common.Address,
	calldata []byte,
	blockTag string,
) (*TraceResult, error) {
	if blockTag == "" {
		blockTag = "latest"
	}

	call := map[string]string{
		"from": from.Hex(),
		"to":   routerAddr.Hex(),
		"data": hexutil.Encode(calldata),
		"gas":  "0x200000",
	}

	// Override slot 7 of the router to point to HonestSwapEngine.
	implSlot := "0x0000000000000000000000000000000000000000000000000000000000000007"
	implValue := "0x000000000000000000000000" + honestEngineAddr.Hex()[2:]
	stateOverride := map[string]interface{}{
		routerAddr.Hex(): map[string]interface{}{
			"stateDiff": map[string]string{
				implSlot: implValue,
			},
		},
	}

	traceCfg := map[string]interface{}{
		"disableMemory":  true,
		"disableStack":   false,
		"disableStorage": false,
		// Anvil 1.5.x rejects a 4th RPC param; embed overrides in the trace config.
		"stateOverrides": stateOverride,
	}

	var raw json.RawMessage
	err := ec.Client().CallContext(ctx, &raw, "debug_traceCall", call, blockTag, traceCfg)
	if err != nil {
		return nil, fmt.Errorf("debug_traceCall (honest replay): %w", err)
	}
	var result TraceResult
	return &result, json.Unmarshal(raw, &result)
}
