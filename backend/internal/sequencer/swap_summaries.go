package sequencer

import (
	"context"
	"fmt"
	"math/big"
	"strings"

	"github.com/dando385/eth-l2/backend/internal/chain"
	"github.com/dando385/eth-l2/backend/internal/store"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

const swapDecodeABI = `[
  {"type":"function","name":"swap","inputs":[
    {"name":"trader","type":"address"},
    {"name":"amountIn","type":"uint256"},
    {"name":"nonce","type":"uint256"}
  ],"outputs":[],"stateMutability":"nonpayable"}
]`

const (
	swapRate         = 100
	swapFeeBPS       = 30
	bpsDenominator   = 10000
	traderAddrIndex0 = 3
	traderAddrIndex1 = 4
)

var traderAddrs = []common.Address{
	chain.AnvilAddress(traderAddrIndex0),
	chain.AnvilAddress(traderAddrIndex1),
}

func buildSwapSummaries(
	ctx context.Context,
	l2Client *chain.Client,
	pending []pendingSwap,
	engineType string,
) ([]store.SwapSummary, error) {
	if len(pending) == 0 {
		return nil, nil
	}
	parsed, err := abi.JSON(strings.NewReader(swapDecodeABI))
	if err != nil {
		return nil, err
	}
	swapMethod := parsed.Methods["swap"]

	out := make([]store.SwapSummary, 0, len(pending))
	for i, ps := range pending {
		tx, _, err := l2Client.EC.TransactionByHash(ctx, ps.Hash)
		if err != nil {
			return nil, fmt.Errorf("tx %s: %w", ps.Hash.Hex(), err)
		}
		data := tx.Data()
		if len(data) < 4 {
			return nil, fmt.Errorf("tx %s: short calldata", ps.Hash.Hex())
		}
		args, err := swapMethod.Inputs.Unpack(data[4:])
		if err != nil {
			return nil, fmt.Errorf("decode swap %s: %w", ps.Hash.Hex(), err)
		}
		trader, ok := args[0].(common.Address)
		if !ok {
			return nil, fmt.Errorf("bad trader arg in %s", ps.Hash.Hex())
		}
		amountIn, ok := args[1].(*big.Int)
		if !ok {
			return nil, fmt.Errorf("bad amountIn arg in %s", ps.Hash.Hex())
		}

		amt := amountIn.Uint64()
		honest := honestAmountOut(amt)
		claimed := claimedAmountOut(amt, engineType)

		var gasUsed uint64
		if receipt, err := l2Client.EC.TransactionReceipt(ctx, ps.Hash); err == nil && receipt != nil {
			gasUsed = receipt.GasUsed
		}

		out = append(out, store.SwapSummary{
			L2Block:     ps.Block,
			TxHash:      ps.Hash.Hex(),
			TraderIndex: traderIndex(trader),
			AmountIn:    amt,
			HonestOut:   honest,
			ClaimedOut:  claimed,
			GasUsed:     gasUsed,
			IsDivergent: i == 0 && engineType != "honest",
		})
	}
	return out, nil
}

func honestAmountOut(amountIn uint64) uint64 {
	gross := amountIn * swapRate
	return (gross * (bpsDenominator - swapFeeBPS)) / bpsDenominator
}

func claimedAmountOut(amountIn uint64, engineType string) uint64 {
	gross := amountIn * swapRate
	honest := (gross * (bpsDenominator - swapFeeBPS)) / bpsDenominator
	switch engineType {
	case "obvious":
		return honest * 2
	case "subtle":
		return gross
	default:
		return honest
	}
}

func traderIndex(addr common.Address) int {
	for i, t := range traderAddrs {
		if t == addr {
			return i
		}
	}
	return 0
}
